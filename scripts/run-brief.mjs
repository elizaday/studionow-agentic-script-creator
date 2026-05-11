#!/usr/bin/env node
import "dotenv/config";
import { execFileSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runStudioNowWorkflow } from "../packages/studionow-agents/src/workflow.mjs";
import { createMockModelClient } from "../packages/studionow-agents/src/model/mock-client.mjs";
import { createOpenAIModelClient } from "../packages/studionow-agents/src/model/openai-client.mjs";
import { createLocalRepository } from "./local-repository.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);

const filePath = readArg("--file");
if (!filePath) {
  throw new Error("Usage: node scripts/run-brief.mjs --file /path/to/brief.pdf [--name Name] [--id id] [--direction id] [--mock]");
}

const briefPath = resolve(process.cwd(), filePath);
if (!existsSync(briefPath)) {
  throw new Error(`Brief file not found: ${briefPath}`);
}

const id = readArg("--id") || slugify(readArg("--name") || briefPath);
const name = readArg("--name") || titleFromPath(briefPath);
const briefText = extractFile(briefPath);
const outputDir = resolve(ROOT, "outputs", "local-runs", timestamp());
const modelClient = args.includes("--mock") ? createMockModelClient() : createOpenAIModelClient();

await mkdir(outputDir, { recursive: true });
await writeFile(resolve(outputDir, `${id}-input.txt`), briefText);

console.log(`Running ${modelClient.name} for ${name}`);
console.log(`Output: ${outputDir}`);

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
      brief: briefText
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
  unpricedStages: result.totals?.unpricedStages ?? 0
};

await writeFile(resolve(outputDir, id, "summary.json"), JSON.stringify(summary, null, 2));
console.log(`Summary: ${JSON.stringify(summary)}`);

function readArg(name) {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args[index + 1];
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
