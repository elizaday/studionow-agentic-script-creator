#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const sourceDir = resolve(
  ROOT,
  readArg("--source") || process.env.EXAMPLE_LIBRARY_DIR || "../Script Auto/examples"
);
const outDir = resolve(ROOT, "training", "processed");
const memoryPath = resolve(outDir, "example_memory.json");
const memoryJsonlPath = resolve(outDir, "example_memory.jsonl");
const reportPath = resolve(outDir, "example_library_report.md");

if (!existsSync(sourceDir)) {
  throw new Error(`Example source folder not found: ${sourceDir}`);
}

mkdirSync(outDir, { recursive: true });

const existing = existsSync(memoryPath)
  ? JSON.parse(readFileSync(memoryPath, "utf-8"))
  : [];

const libraryExamples = readdirSync(sourceDir)
  .filter((file) => [".docx", ".pdf", ".md", ".txt"].includes(extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b))
  .map((file) => {
    const sourcePath = resolve(sourceDir, file);
    const text = extractFile(sourcePath);
    const tags = inferTags({ file, text });
    return {
      id: `script-auto-${slugify(file.replace(/\.[^.]+$/, ""))}`,
      projectName: cleanTitle(file),
      quality: "usable",
      sourceKind: "script-only",
      pairingConfidence: "none",
      pairingType: "script-library",
      briefFiles: [],
      scriptFiles: [sourcePath],
      notes: "Imported from the original Script Auto examples folder. Treat as a script-only taste reference unless a matching brief is added.",
      tags,
      teachingPoints: inferTeachingPoints({ tags, file, text }),
      briefText: "",
      scriptText: text,
      scriptExcerpt: createScriptExcerpt(text),
      retrievalText: normalize(`${file}\n${tags.join(" ")}\n${text}`)
    };
  });

const merged = mergeById(existing, libraryExamples);

writeFileSync(memoryPath, JSON.stringify(merged, null, 2) + "\n");
writeFileSync(memoryJsonlPath, merged.map((example) => JSON.stringify(example)).join("\n") + "\n");
writeFileSync(reportPath, renderReport({ sourceDir, examples: libraryExamples, total: merged.length }));

console.log(`Imported ${libraryExamples.length} script library example(s)`);
console.log(`Total memory records: ${merged.length}`);
console.log(reportPath);

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

function inferTags({ file, text }) {
  const normalized = normalize(`${file}\n${text}`).toLowerCase();
  const tags = new Set(["usable", "script-only"]);

  const tagRules = [
    ["ai heritage", /america250|ai animated|memory in motion|painterly|heritage/],
    ["cinematic teaser", /teaser|cinematic|visual thesis|memory in motion/],
    ["ai-assisted", /\bai\b|diffusion|style frames|ai-generated|generated keyframes/],
    ["sizzle", /sizzle|reel|high-energy|anthem/],
    ["partnership", / x |×|publix|disney|america250|partnership/],
    ["platform explainer", /platform|capabilities|system|tool|dashboard|day in the life/],
    ["case study", /case study|results|proof|award|nma|effie/],
    ["spec", /spec|credentials optional|mr\.?\s?pibb/],
    ["brand film", /brand film|good food|cold coke|still here/],
    ["localization", /locali[sz]ation|market|city|global imx/],
    ["internal", /internal|confidential|leadership|team/],
    ["external", /broadcast|social|consumer|external/],
    ["text-on-screen", /super:|tos|text-only|on-screen text/],
    ["coca-cola", /coca-cola|coke\b/],
    ["america250", /america250|together for 250/],
    ["minute maid", /minute maid|bring the juice/],
    ["simply", /simply pop|simply/],
    ["mr pibb", /mr\.?\s?pibb|pibb/],
    ["publix", /publix/],
    ["disney", /disney|droid/],
    ["studio capabilities", /capabilities|studionow/]
  ];

  for (const [tag, rule] of tagRules) {
    if (rule.test(normalized)) tags.add(tag);
  }

  return [...tags];
}

function inferTeachingPoints({ tags, file, text }) {
  const points = [];
  const normalized = normalize(text);

  if (tags.includes("ai heritage")) {
    points.push("AI heritage scripts need restraint, a clear visual thesis, style-lock discipline, and careful historical-claim boundaries.");
  }
  if (tags.includes("cinematic teaser")) {
    points.push("Cinematic teasers should create a felt thesis through visual transformation, not explain the assignment in deck language.");
  }
  if (tags.includes("partnership")) {
    points.push("Partnership scripts need both sides to feel intentional, with the shared audience or cultural reason made visible.");
  }
  if (tags.includes("platform explainer")) {
    points.push("Platform explainers need a human friction first, then a clean system reveal and proof of usefulness.");
  }
  if (tags.includes("case study")) {
    points.push("Case-study scripts should treat metrics as story turns, not footnotes.");
  }
  if (tags.includes("sizzle")) {
    points.push("Sizzles depend on sharp supers, escalation, and visual momentum more than heavy VO.");
  }
  if (/SUPER:|On-Screen Text|TOS/i.test(normalized)) {
    points.push("Supers should carry argument beats, not label the obvious.");
  }

  points.push(`Source note: ${file} from original Script Auto examples library.`);
  return points;
}

function mergeById(existing, incoming) {
  const map = new Map();
  for (const example of existing) map.set(example.id, example);
  for (const example of incoming) map.set(example.id, example);
  return [...map.values()];
}

function createScriptExcerpt(scriptText) {
  return normalize(scriptText)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 100)
    .join("\n");
}

function renderReport({ sourceDir, examples, total }) {
  return `# Script Auto Example Library Import

Source folder: \`${sourceDir}\`

Imported ${examples.length} script-only example(s).
Total memory records after merge: ${total}.

${examples.map((example) => `## ${example.projectName}

- ID: \`${example.id}\`
- Tags: ${example.tags.map((tag) => `\`${tag}\``).join(", ")}
- Source: \`${example.scriptFiles[0]}\`

Teaching points:
${example.teachingPoints.map((point) => `- ${point}`).join("\n")}
`).join("\n")}`;
}

function cleanTitle(file) {
  return file
    .replace(/\.[^.]+$/, "")
    .replace(/[_]+/g, " ")
    .replace(/\s+\(\d+\)$/g, "")
    .trim();
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 90);
}

function normalize(value) {
  return String(value || "").replace(/\r\n/g, "\n").replace(/[ \t]+/g, " ").trim();
}
