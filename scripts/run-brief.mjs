#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStudioNowWorkflow } from "../packages/studionow-agents/src/workflow.mjs";
import { createMockModelClient } from "../packages/studionow-agents/src/model/mock-client.mjs";
import { createOpenAIModelClient } from "../packages/studionow-agents/src/model/openai-client.mjs";
import { pdfToImageAttachments } from "../packages/studionow-agents/src/pdf-extract.mjs";
import { buildScriptDocx, buildProducerNotesDocx } from "../packages/studionow-agents/src/docx.mjs";
import { createLocalRepository } from "./local-repository.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const IMAGE_EXTS = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".gif": "image/gif",
  ".webp": "image/webp"
};

const filePath = readArg("--file");
if (!filePath) {
  throw new Error("Usage: node scripts/run-brief.mjs --file /path/to/brief.pdf [--attach path]... [--name Name] [--id id] [--direction id] [--mock] [--no-deck-visuals]");
}

const briefPath = resolve(process.cwd(), filePath);
if (!existsSync(briefPath)) {
  throw new Error(`Brief file not found: ${briefPath}`);
}

const id = readArg("--id") || slugify(readArg("--name") || briefPath);
const name = readArg("--name") || titleFromPath(briefPath);
const noDeckVisuals = args.includes("--no-deck-visuals");
const briefText = extractFile(briefPath);
const outputDir = resolve(ROOT, "outputs", "local-runs", timestamp());
const modelClient = args.includes("--mock") ? createMockModelClient() : createOpenAIModelClient();

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, `${id}-input.txt`), briefText);

const attachments = [];
let assetCounter = 1;

if (extname(briefPath).toLowerCase() === ".pdf" && !noDeckVisuals) {
  console.log(`Extracting PDF pages from ${basename(briefPath)} for visual intake...`);
  const pages = await pdfToImageAttachments({
    pdfPath: briefPath,
    source: `brief deck (${basename(briefPath)})`,
    filename: basename(briefPath),
    startAssetIndex: assetCounter
  });
  attachments.push(...pages);
  assetCounter += pages.length;
  console.log(`  ${pages.length} page(s) added as image assets.`);
}

const attachArgs = collectRepeated("--attach");
for (const attachPath of attachArgs) {
  const resolvedAttach = resolve(process.cwd(), attachPath);
  if (!existsSync(resolvedAttach)) {
    throw new Error(`Attachment not found: ${resolvedAttach}`);
  }
  const ext = extname(resolvedAttach).toLowerCase();
  if (ext === ".pdf") {
    const pages = await pdfToImageAttachments({
      pdfPath: resolvedAttach,
      source: basename(resolvedAttach),
      filename: basename(resolvedAttach),
      startAssetIndex: assetCounter
    });
    attachments.push(...pages);
    assetCounter += pages.length;
    console.log(`Attached ${basename(resolvedAttach)}: ${pages.length} page(s) as image assets.`);
  } else if (IMAGE_EXTS[ext]) {
    const buf = await readFile(resolvedAttach);
    attachments.push({
      id: `Asset ${assetCounter}`,
      source: basename(resolvedAttach),
      filename: basename(resolvedAttach),
      mediaType: IMAGE_EXTS[ext],
      base64: buf.toString("base64")
    });
    assetCounter += 1;
    console.log(`Attached image: ${basename(resolvedAttach)}`);
  } else {
    console.warn(`Skipping ${basename(resolvedAttach)}: unsupported attachment type ${ext}`);
  }
}

console.log(`Running ${modelClient.name} for ${name}`);
console.log(`Output: ${outputDir}`);
console.log(`Image attachments queued for visual intake: ${attachments.length}`);

const repository = createLocalRepository({ outputDir });
const result = await runStudioNowWorkflow({
  rootDir: ROOT,
  modelClient,
  job: {
    id,
    selected_direction_id: readArg("--direction"),
    brief: {
      id,
      name,
      brief: briefText,
      attachments
    }
  },
  repository,
  maxRevisionLoops: Number(readArg("--revision-loops") || 1)
});

const summary = {
  id,
  name,
  status: result.status,
  model: modelClient.name,
  conceptEngine: result.blueprint?.conceptEngine,
  visualMotif: result.blueprint?.visualMotif,
  critiqueScore: result.critique?.score,
  passes: result.critique?.passes,
  finalWordCount: countWords(result.final?.clientScriptMarkdown || result.final?.finalMarkdown || ""),
  totalInputTokens: result.totals?.inputTokens ?? 0,
  totalOutputTokens: result.totals?.outputTokens ?? 0,
  totalCostUsd: result.totals ? Number(result.totals.costUsd.toFixed(6)) : 0,
  unpricedStages: result.totals?.unpricedStages ?? 0,
  attachmentCount: attachments.length,
  visualInventoryEntries: Array.isArray(result.visualInventory?.inventory) ? result.visualInventory.inventory.length : 0
};

await writeFile(resolve(outputDir, id, "summary.json"), JSON.stringify(summary, null, 2));

const clientMd = result.final?.clientScriptMarkdown || result.final?.finalMarkdown || "";
const notesMd = result.final?.producerNotesMarkdown || "";
if (clientMd) {
  const clientDocx = await buildScriptDocx({ title: `${name} — Script`, markdown: clientMd, assets: attachments });
  await writeFile(resolve(outputDir, id, "client_script.docx"), clientDocx);
}
if (notesMd) {
  const notesDocx = await buildProducerNotesDocx({ title: `${name} — Producer Notes`, markdown: notesMd });
  await writeFile(resolve(outputDir, id, "producer_notes.docx"), notesDocx);
}

console.log(`Summary: ${JSON.stringify(summary)}`);
console.log(`\nReadable deliverables in: ${resolve(outputDir, id)}`);
console.log(`  - client_script.docx  (open with Word, Pages, or Google Docs)`);
console.log(`  - producer_notes.docx`);

function readArg(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
}

function collectRepeated(name) {
  const out = [];
  for (let i = 0; i < args.length - 1; i += 1) {
    if (args[i] === name) out.push(args[i + 1]);
  }
  return out;
}

function extractFile(path) {
  const ext = extname(path).toLowerCase();
  if (ext === ".pdf") {
    return execFileSync("pdftotext", ["-layout", path, "-"], {
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024
    });
  }

  if (ext === ".docx") {
    return execFileSync("textutil", ["-convert", "txt", "-stdout", path], {
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024
    });
  }

  return readFileSync(path, "utf-8");
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80) || "brief-run";
}

function titleFromPath(path) {
  return path
    .split("/")
    .pop()
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ");
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
  return String(text)
    .replace(/\|/g, " ")
    .split(/\s+/)
    .filter(Boolean).length;
}
