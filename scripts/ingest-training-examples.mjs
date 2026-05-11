#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = resolve(ROOT, "training", "processed", "pairing_manifest.json");
const outDir = resolve(ROOT, "training", "processed");
const outJson = resolve(outDir, "example_memory.json");
const outJsonl = resolve(outDir, "example_memory.jsonl");
const outMd = resolve(outDir, "example_memory_report.md");

if (!existsSync(manifestPath)) {
  throw new Error(`Pairing manifest not found: ${manifestPath}`);
}

mkdirSync(outDir, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestPath, "utf-8"));
const examples = manifest.map((entry) => {
  const briefFiles = splitFiles(entry.brief_files);
  const scriptFiles = splitFiles(entry.script_files);
  const briefText = briefFiles.map(extractFile).filter(Boolean).join("\n\n---\n\n");
  const scriptText = scriptFiles.map(extractFile).filter(Boolean).join("\n\n---\n\n");
  const tags = inferTags({ entry, briefText, scriptText });

  return {
    id: entry.id,
    projectName: entry.project_name,
    quality: entry.quality || "usable",
    pairingConfidence: entry.confidence || "unknown",
    pairingType: entry.pairing_type,
    briefFiles,
    scriptFiles,
    notes: entry.notes,
    tags,
    teachingPoints: inferTeachingPoints({ entry, briefText, scriptText, tags }),
    briefText,
    scriptText,
    scriptExcerpt: createScriptExcerpt(scriptText),
    retrievalText: normalize(`${entry.project_name}\n${entry.notes}\n${tags.join(" ")}\n${briefText}\n${scriptText}`)
  };
});

writeFileSync(outJson, JSON.stringify(examples, null, 2) + "\n");
writeFileSync(outJsonl, examples.map((example) => JSON.stringify(example)).join("\n") + "\n");
writeFileSync(outMd, renderReport(examples));

console.log(`Wrote ${examples.length} example records`);
console.log(outJson);
console.log(outJsonl);
console.log(outMd);

function splitFiles(value) {
  return String(value || "")
    .split(";")
    .map((item) => item.trim())
    .filter(Boolean);
}

function extractFile(relativePath) {
  const path = resolve(ROOT, relativePath);
  if (!existsSync(path)) return "";

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

function inferTags({ entry, briefText, scriptText }) {
  const allText = normalize(`${entry.project_name} ${entry.notes} ${briefText} ${scriptText}`).toLowerCase();
  const ownedText = normalize(`${entry.project_name} ${entry.notes} ${scriptText}`).toLowerCase();
  const tags = new Set(["usable"]);

  for (const tag of [
    "rts",
    "sizzle",
    "portfolio",
    "text-on-screen",
    "internal",
    "external",
    "ready to sell"
  ]) {
    if (allText.includes(tag)) tags.add(tag);
  }

  for (const tag of [
    "advanced hydration",
    "smartwater",
    "vitaminwater",
    "powerade",
    "bodyarmor",
    "minute maid",
    "water tea coffee",
    "dunkin",
    "wwe",
    "fifa"
  ]) {
    if (ownedText.includes(tag)) tags.add(tag);
  }

  if (allText.includes("tos") || allText.includes("text on screen")) tags.add("text-on-screen");
  if (allText.includes("no vo") || allText.includes("text-only")) tags.add("no-vo");
  if (ownedText.includes("60 seconds") || ownedText.includes("60-75")) tags.add("60s");
  if (ownedText.includes(":30") || ownedText.includes("30 seconds")) tags.add("30s");

  return [...tags];
}

function inferTeachingPoints({ entry, scriptText, tags }) {
  const points = [];
  const normalizedScript = normalize(scriptText);

  if (tags.includes("sizzle")) {
    points.push("Usable RTS sizzles lean on sharp supers, fast visual escalation, and brand-specific proof rather than VO-heavy explanation.");
  }
  if (tags.includes("portfolio")) {
    points.push("Portfolio scripts need a clean organizing device so multiple brands feel like one film instead of a list.");
  }
  if (tags.includes("text-on-screen") || tags.includes("no-vo")) {
    points.push("Text-on-screen scripts need punchy copy, precise time beats, and visuals that do the connective work.");
  }
  if (/\+\d+|#1|2x|category|households|share|volume/i.test(normalizedScript)) {
    points.push("Data works best when it lands as swagger or proof at a beat change, not as a spreadsheet recitation.");
  }
  if (/WWE|FIFA|Jesser|Dunkin|Topo|Costa|Gold Peak|Peace Tea/i.test(normalizedScript)) {
    points.push("Specific assets, partnerships, and cultural references should drive visual choices and prevent generic brand-film language.");
  }

  points.push(`Pairing note: ${entry.notes}`);
  return points;
}

function createScriptExcerpt(scriptText) {
  const lines = normalize(scriptText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.slice(0, 80).join("\n");
}

function renderReport(examples) {
  return `# Example Memory Report

Generated from \`training/processed/pairing_manifest.json\`.

${examples.map((example) => `## ${example.projectName}

- ID: \`${example.id}\`
- Quality: \`${example.quality}\`
- Pairing confidence: \`${example.pairingConfidence}\`
- Tags: ${example.tags.map((tag) => `\`${tag}\``).join(", ")}
- Brief files: ${example.briefFiles.length ? example.briefFiles.map((file) => `\`${file}\``).join(", ") : "_None_"}
- Script files: ${example.scriptFiles.map((file) => `\`${file}\``).join(", ")}

Teaching points:
${example.teachingPoints.map((point) => `- ${point}`).join("\n")}
`).join("\n")}`;
}

function normalize(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}
