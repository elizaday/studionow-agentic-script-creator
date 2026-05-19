#!/usr/bin/env node
import "dotenv/config";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStudioNowWorkflow } from "../packages/studionow-agents/src/workflow.mjs";
import { createMockModelClient } from "../packages/studionow-agents/src/model/mock-client.mjs";
import { createOpenAIModelClient } from "../packages/studionow-agents/src/model/openai-client.mjs";
import { createLocalRepository } from "./local-repository.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const useRealModel = args.includes("--real") || args.includes("--openai");
const workflowMode = getArgValue("--mode") || process.env.WORKFLOW_MODE || "full_producer";
const buildModelClient = () => (useRealModel ? createOpenAIModelClient() : createMockModelClient());

const outputDir = resolve(ROOT, "outputs", "local-runs", timestamp());
await mkdir(outputDir, { recursive: true });

const briefs = await loadBriefs();
const selected = selectBriefs(briefs);

let failed = false;
for (const brief of selected) {
  console.log(`\n=== ${brief.id}: ${brief.name} ===`);
  const job = {
    id: brief.id,
    brief: {
      id: brief.id,
      name: brief.name,
      workflowMode,
      brief: brief.brief,
      expectedGenre: brief.expected_genre,
      runtimeSeconds: brief.runtime_seconds,
      tone: brief.tone
    }
  };

  const repository = createLocalRepository({ outputDir });
  const modelClient = buildModelClient();
  const result = await runStudioNowWorkflow({
    rootDir: ROOT,
    modelClient,
    job,
    repository,
    maxRevisionLoops: 1
  });

  const summary = {
    id: brief.id,
    status: result.status,
    model: modelClient.name,
    conceptEngine: result.blueprint?.conceptEngine,
    visualMotif: result.blueprint?.visualMotif,
    critiqueScore: result.critique?.score,
    passes: result.critique?.passes,
    finalWordCount: countWords(result.final?.finalMarkdown || ""),
    totalInputTokens: result.totals?.inputTokens ?? 0,
    totalOutputTokens: result.totals?.outputTokens ?? 0,
    totalCostUsd: result.totals ? Number(result.totals.costUsd.toFixed(6)) : 0,
    unpricedStages: result.totals?.unpricedStages ?? 0
  };

  await writeFile(resolve(outputDir, brief.id, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(`Summary: ${JSON.stringify(summary)}`);

  if (args.includes("--assert")) {
    const ok = result.status === "complete"
      && Boolean(result.final?.finalMarkdown)
      && result.final.finalMarkdown.includes("| AUDIO/VO | TC | VISUALS |")
      && result.critique?.passes === true;
    if (!ok) {
      failed = true;
      console.error(`Smoke assertion failed for ${brief.id}`);
    }
  }
}

console.log(`\nLocal run artifacts: ${outputDir}`);
if (failed) process.exit(1);

async function loadBriefs() {
  const briefArgIndex = args.indexOf("--brief");
  const briefPath = briefArgIndex === -1 ? resolve(ROOT, "evals", "briefs.json") : resolve(process.cwd(), args[briefArgIndex + 1]);
  if (!existsSync(briefPath)) {
    throw new Error(`Brief file not found: ${briefPath}`);
  }
  return JSON.parse(await readFile(briefPath, "utf-8"));
}

function selectBriefs(briefs) {
  if (args.includes("--quick")) {
    const ids = ["reg-pulse-explainer", "reg-still-here", "reg-sustainability"];
    return ids.map((id) => briefs.find((brief) => brief.id === id)).filter(Boolean);
  }

  const idIndex = args.indexOf("--id");
  if (idIndex !== -1) {
    const id = args[idIndex + 1];
    const match = briefs.find((brief) => brief.id === id);
    if (!match) throw new Error(`Brief id not found: ${id}`);
    return [match];
  }

  return [briefs[0]];
}

function getArgValue(flag) {
  const index = args.indexOf(flag);
  if (index === -1) return null;
  return args[index + 1] || null;
}

function timestamp() {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0")
  ].join("-") + "_" + [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
    String(now.getSeconds()).padStart(2, "0")
  ].join("-");
}

function countWords(text) {
  return text
    .replace(/\|/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .length;
}
