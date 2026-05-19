#!/usr/bin/env node
// One-off importer for a single brief + final-script pair into example_memory.json.
// Tags the pair as quality="gold" so the retrieval scorer boosts it 1.5x.
//
// Usage:
//   node scripts/import-gold-pair.mjs \
//     --name "KOPIM Platform Explainer" \
//     --client "Coca-Cola" \
//     --brief /path/to/intake.docx \
//     --script /path/to/final-script.docx \
//     --tags "platform explainer,internal,text-on-screen,coca-cola,kopim" \
//     --notes "Internal platform explainer with reverse-narrative structure."
//     [--teaching "point one|point two|point three"]
//     [--id custom-stable-id]
//     [--dry-run]
//
// Supports .docx, .pdf, .txt for both brief and script.
// Idempotent: if an entry with the same id already exists, it is replaced.

import "dotenv/config";
import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const MEMORY_PATH = resolve(ROOT, "training", "processed", "example_memory.json");

const args = parseArgs(process.argv.slice(2));

const name = required(args, "name");
const client = required(args, "client");
const briefPath = required(args, "brief");
const scriptPath = required(args, "script");
const tagList = (args.tags || "").split(",").map((t) => t.trim()).filter(Boolean);
const notes = args.notes || "";
const teachingPoints = (args.teaching || "")
  .split("|")
  .map((t) => t.trim())
  .filter(Boolean);
const dryRun = args["dry-run"] === true;

if (!existsSync(briefPath)) throw new Error(`Brief file not found: ${briefPath}`);
if (!existsSync(scriptPath)) throw new Error(`Script file not found: ${scriptPath}`);

const briefText = extractText(briefPath);
const scriptText = extractText(scriptPath);

if (!briefText.trim()) throw new Error(`Brief extracted empty text. Check ${briefPath}`);
if (!scriptText.trim()) throw new Error(`Script extracted empty text. Check ${scriptPath}`);

const id = args.id || `gold-${slug(name)}-${shortHash(briefText + scriptText)}`;

const entry = {
  id,
  projectName: name,
  client,
  quality: "gold",
  pairingConfidence: "high",
  pairingType: "human-approved-pair",
  briefFiles: [basenameOf(briefPath)],
  scriptFiles: [basenameOf(scriptPath)],
  briefText,
  scriptText,
  scriptExcerpt: scriptText.slice(0, 4000),
  notes: notes || `Gold pair imported via import-gold-pair.mjs from ${basenameOf(briefPath)} + ${basenameOf(scriptPath)}.`,
  tags: dedupeLower(["gold", ...tagList]),
  teachingPoints: teachingPoints.length > 0 ? teachingPoints : defaultTeachingPoints(name),
  promotedAt: new Date().toISOString()
};

const memory = JSON.parse(await readFile(MEMORY_PATH, "utf-8"));
const existingIndex = memory.findIndex((e) => e.id === id);
const action = existingIndex >= 0 ? "REPLACED" : "ADDED";
const next = [...memory];
if (existingIndex >= 0) {
  next[existingIndex] = entry;
} else {
  next.push(entry);
}

console.log("");
console.log(`Project:          ${name}`);
console.log(`Client:           ${client}`);
console.log(`ID:               ${id}`);
console.log(`Quality:          gold`);
console.log(`Brief text:       ${briefText.length.toLocaleString()} chars`);
console.log(`Script text:      ${scriptText.length.toLocaleString()} chars`);
console.log(`Tags:             ${entry.tags.join(", ")}`);
console.log(`Teaching points:  ${entry.teachingPoints.length}`);
console.log("");
console.log(`Action:           ${action}`);

if (dryRun) {
  console.log(`\n[dry-run] Not writing. Re-run without --dry-run to apply.`);
  process.exit(0);
}

await writeFile(MEMORY_PATH, JSON.stringify(next, null, 2));
console.log(`\nWrote ${MEMORY_PATH}`);
console.log(`Total entries in library: ${next.length}`);
console.log("Next: commit example_memory.json and redeploy the worker so retrieval picks it up.");

// ---------------------------------------------------------------------------

function parseArgs(rawArgs) {
  const out = {};
  for (let i = 0; i < rawArgs.length; i += 1) {
    const arg = rawArgs[i];
    if (!arg.startsWith("--")) continue;
    const key = arg.slice(2);
    const next = rawArgs[i + 1];
    if (next == null || next.startsWith("--")) {
      out[key] = true;
    } else {
      out[key] = next;
      i += 1;
    }
  }
  return out;
}

function required(args, key) {
  const value = args[key];
  if (!value || value === true) {
    console.error(`Missing required flag: --${key}`);
    process.exit(2);
  }
  return value;
}

function extractText(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".pdf") {
    return execFileSync("pdftotext", ["-layout", filePath, "-"], {
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024
    });
  }
  if (ext === ".docx" || ext === ".doc") {
    return execFileSync("textutil", ["-convert", "txt", "-stdout", filePath], {
      encoding: "utf-8",
      maxBuffer: 20 * 1024 * 1024
    });
  }
  if (ext === ".txt" || ext === ".md") {
    return execFileSync("cat", [filePath], { encoding: "utf-8" });
  }
  throw new Error(`Unsupported file type: ${ext}`);
}

function slug(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60) || "untitled";
}

function shortHash(text) {
  return createHash("sha256").update(text).digest("hex").slice(0, 8);
}

function basenameOf(path) {
  return path.split("/").pop();
}

function dedupeLower(list) {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const key = String(item).toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

function defaultTeachingPoints(name) {
  return [
    `Real shipped pair from StudioNow: ${name}. Treat as a taste anchor for tone, structure, and runtime density — do not copy phrasing or brand-specific claims.`
  ];
}
