import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "are", "our", "your",
  "you", "all", "will", "but", "not", "one", "two", "three", "video", "script",
  "brief", "client", "format", "tone", "runtime", "visual", "visuals", "super",
  "studio", "studionow", "usable", "example", "examples"
]);

export function loadExampleMemory(rootDir) {
  const path = resolve(rootDir, "training", "processed", "example_memory.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

export function selectRelevantExamples({
  rootDir,
  brief,
  diagnosis,
  mined,
  strategy,
  limit = 3
}) {
  const examples = loadExampleMemory(rootDir);
  if (examples.length === 0) return [];

  const query = tokenize([
    brief?.name,
    brief?.brief,
    diagnosis?.format,
    diagnosis?.placement,
    diagnosis?.audience,
    diagnosis?.tone,
    mined?.humanTension,
    mined?.brandLanguage?.join(" "),
    mined?.strategicFrameworks?.join(" "),
    strategy?.directions?.map((direction) => `${direction.name} ${direction.coreEngine}`).join(" ")
  ].filter(Boolean).join("\n"));

  return examples
    .map((example) => ({ ...example, relevanceScore: scoreExample(example, query) }))
    .sort((a, b) => b.relevanceScore - a.relevanceScore)
    .slice(0, limit)
    .filter((example) => example.relevanceScore > 0);
}

export function formatExamplesForAgent(examples, agentName) {
  if (!examples?.length) return "";

  const sections = examples.map((example, index) => {
    const scriptSample = truncate(example.scriptExcerpt || example.scriptText || "", agentName === "critic" ? 1200 : 1800);
    return `### Example ${index + 1}: ${example.projectName}

ID: ${example.id}
Quality: ${example.quality}
Pairing confidence: ${example.pairingConfidence}
Tags: ${(example.tags || []).join(", ")}

What this example teaches:
${(example.teachingPoints || []).map((point) => `- ${point}`).join("\n")}

Script sample:
${scriptSample}`;
  });

  return `\n\n## Relevant StudioNow Usable Examples

Use these as taste references, not templates to copy. Borrow structural moves, specificity, rhythm, and production logic. Do not reuse client-specific claims unless they appear in the current brief.

${sections.join("\n\n")}`;
}

function scoreExample(example, queryTokens) {
  let relevance = 0;
  const fields = {
    tags: tokenize(example.tags?.join(" ")),
    identity: tokenize([example.projectName, example.notes].filter(Boolean).join("\n")),
    teaching: tokenize(example.teachingPoints?.join("\n")),
    script: tokenize(example.scriptExcerpt || example.scriptText || "")
  };

  for (const token of queryTokens) {
    if (fields.tags.has(token)) relevance += 6;
    if (fields.identity.has(token)) relevance += 4;
    if (fields.teaching.has(token)) relevance += 2;
    if (fields.script.has(token)) relevance += 1;
  }

  if (example.pairingConfidence === "high") relevance += 2;
  if (example.pairingType?.includes("orphan")) relevance -= 1;

  const qualityMultiplier = QUALITY_MULTIPLIERS[example.quality] ?? 1.0;
  const qualityFloor = QUALITY_FLOOR[example.quality] ?? 0;

  return Math.round((relevance + qualityFloor) * qualityMultiplier * 100) / 100;
}

const QUALITY_MULTIPLIERS = {
  gold: 1.5,
  usable: 1.0,
  low_confidence: 0.7,
  reject: 0
};

const QUALITY_FLOOR = {
  gold: 6,
  usable: 2,
  low_confidence: 0,
  reject: 0
};

function tokenize(value) {
  const tokens = new Set();
  for (const token of String(value || "").toLowerCase().match(/[a-z0-9]+/g) || []) {
    if (token.length < 3 || STOPWORDS.has(token)) continue;
    tokens.add(token);
  }
  return tokens;
}

function truncate(value, maxChars) {
  const text = String(value || "").trim();
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars).trim()}\n[example truncated]`;
}
