#!/usr/bin/env node
// Blind bakeoff harness. Runs each brief in the manifest through the three
// agentic arms (quick_draft, production, full_producer) with the real model,
// writes ANONYMIZED outputs plus a hidden answer key so producers can score
// without knowing which arm produced what. Legacy is run manually by the user.
//
//   node scripts/bakeoff.mjs --mock        # dry run, free, proves wiring
//   node scripts/bakeoff.mjs --real        # the real thing (~30 gpt-5 jobs)
//   node scripts/bakeoff.mjs --real --only spec-pibb,explainer-pulse
//
// Resumable: skips any (brief, arm) whose output folder already exists.

import "dotenv/config";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createHash, randomUUID } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStudioNowWorkflow } from "../packages/studionow-agents/src/workflow.mjs";
import { createMockModelClient } from "../packages/studionow-agents/src/model/mock-client.mjs";
import { createOpenAIModelClient } from "../packages/studionow-agents/src/model/openai-client.mjs";
import { createLocalRepository } from "./local-repository.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const OUT = resolve(ROOT, "evals", "bakeoff", "outputs");
const args = process.argv.slice(2);
const useReal = args.includes("--real");
const onlyArg = readArg("--only");
const ARMS = ["quick_draft", "production", "full_producer"];
const MODE_FOR_ARM = { quick_draft: "first_draft", production: "production", full_producer: "full_producer" };

const manifest = JSON.parse(await readFile(resolve(ROOT, "evals", "bakeoff", "manifest.json"), "utf-8"));
const allBriefs = JSON.parse(await readFile(resolve(ROOT, "evals", "briefs.json"), "utf-8"));
const briefIndex = new Map(allBriefs.map((b) => [b.id, b]));

let briefIds = manifest.briefs.map((b) => b.id);
if (onlyArg) {
  const wanted = new Set(onlyArg.split(",").map((s) => s.trim()));
  briefIds = briefIds.filter((id) => wanted.has(id));
}

await mkdir(OUT, { recursive: true });
const answerKeyPath = resolve(OUT, "answer-key.json");
const answerKey = existsSync(answerKeyPath) ? JSON.parse(await readFile(answerKeyPath, "utf-8")) : {};
const runLog = [];

console.log(`Bakeoff — ${useReal ? "REAL gpt-5" : "MOCK"} — ${briefIds.length} briefs x ${ARMS.length} agentic arms = ${briefIds.length * ARMS.length} runs`);
console.log(`Outputs: ${OUT}\n`);

for (const briefId of briefIds) {
  const briefDef = briefIndex.get(briefId);
  if (!briefDef) { console.warn(`  ! brief not found: ${briefId}, skipping`); continue; }

  for (const arm of ARMS) {
    const code = codeFor(briefId, arm);
    const dir = resolve(OUT, code);
    if (existsSync(resolve(dir, "script.md"))) {
      console.log(`  = ${code}  (${briefId} / ${arm}) already done, skipping`);
      continue;
    }
    await mkdir(dir, { recursive: true });

    const job = {
      id: `bakeoff-${briefId}-${arm}-${randomUUID().slice(0, 6)}`,
      brief: {
        id: briefId,
        name: briefDef.name,
        brief: briefDef.brief,
        expectedGenre: briefDef.expected_genre,
        runtimeSeconds: briefDef.runtime_seconds,
        workflowMode: MODE_FOR_ARM[arm]
      }
    };

    const repository = createLocalRepository({ outputDir: resolve(dir, "_artifacts") });
    const modelClient = useReal ? createOpenAIModelClient() : createMockModelClient();
    const started = Date.now();
    let status = "complete";
    let result;
    try {
      result = await runStudioNowWorkflow({ rootDir: ROOT, modelClient, job, repository, maxRevisionLoops: 1 });
    } catch (err) {
      status = "failed";
      result = { error: err.message };
    }
    const elapsed = Math.round((Date.now() - started) / 1000);

    const script = result?.final?.clientScriptMarkdown || result?.final?.finalMarkdown || `(${status}: ${result?.error || "no output"})`;
    const notes = result?.final?.producerNotesMarkdown || "";
    await writeFile(resolve(dir, "script.md"), script);
    if (notes) await writeFile(resolve(dir, "producer-notes.md"), notes);

    answerKey[code] = {
      briefId,
      briefName: briefDef.name,
      arm,
      status,
      elapsedSeconds: elapsed,
      costUsd: result?.totals ? Number(result.totals.costUsd.toFixed(4)) : 0,
      hasProducerNotes: Boolean(notes)
    };
    await writeFile(answerKeyPath, JSON.stringify(answerKey, null, 2));

    runLog.push({ code, briefId, arm, status, elapsed, cost: answerKey[code].costUsd });
    console.log(`  + ${code}  ${briefId} / ${arm}  -> ${status} in ${elapsed}s, $${answerKey[code].costUsd}`);
  }
}

// Legacy slots + scoresheet scaffolding (created once).
await writeLegacySlots(briefIds);
await writeScoresheet();

console.log(`\nDone. ${runLog.length} new runs this pass.`);
console.log(`Anonymized outputs in ${OUT}`);
console.log(`Answer key (do not peek until scored): ${answerKeyPath}`);
console.log(`Next: run the 10 briefs through Legacy, fill legacy slots, then score blind in scoresheet.csv.`);

function codeFor(briefId, arm) {
  // Deterministic but opaque 3-char code so the same (brief, arm) maps to the
  // same folder across resumes, while the scorer can't read the arm from it.
  return "v" + createHash("sha256").update(`${briefId}:${arm}`).digest("hex").slice(0, 4);
}

async function writeLegacySlots(ids) {
  const path = resolve(OUT, "legacy-slots.md");
  if (existsSync(path)) return;
  const lines = ["# Legacy slots", "", "Run each brief through https://studionow.netlify.app/ and save the script into the matching folder as script.md.", ""];
  for (const id of ids) {
    const code = "v" + createHash("sha256").update(`${id}:legacy`).digest("hex").slice(0, 4);
    lines.push(`- ${id}: paste into evals/bakeoff/outputs/${code}/script.md`);
  }
  await writeFile(path, lines.join("\n"));
}

async function writeScoresheet() {
  const path = resolve(OUT, "scoresheet.csv");
  if (existsSync(path)) return;
  const folders = (await readdir(OUT, { withFileTypes: true }))
    .filter((d) => d.isDirectory() && d.name.startsWith("v"))
    .map((d) => d.name)
    .sort();
  const header = "code,brief_alignment,studionow_voice,produceability,runtime_realism,distinctiveness,producer_notes,verdict_edit_or_rewrite,scorer";
  const rows = folders.map((c) => `${c},,,,,,,,`);
  await writeFile(path, [header, ...rows].join("\n"));
}

function readArg(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}
