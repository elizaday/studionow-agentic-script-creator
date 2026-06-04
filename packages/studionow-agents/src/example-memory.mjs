import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const STOPWORDS = new Set([
  "the", "and", "for", "with", "that", "this", "from", "into", "are", "our", "your",
  "you", "all", "will", "but", "not", "one", "two", "three", "video", "script",
  "brief", "client", "format", "tone", "runtime", "visual", "visuals", "super",
  "studio", "studionow", "usable", "example", "examples"
]);

// ---------------------------------------------------------------------------
// Load examples: Supabase first, JSON file fallback
// ---------------------------------------------------------------------------

/**
 * Load examples from Supabase via repository, falling back to the static
 * JSON file if the repository method is not available or fails.
 */
export async function loadExamples({ rootDir, repository }) {
  // Try Supabase first
  if (repository && typeof repository.loadExamplesFromDb === "function") {
    try {
      const dbExamples = await repository.loadExamplesFromDb();
      if (dbExamples.length > 0) return dbExamples;
    } catch (err) {
      console.warn("Failed to load examples from Supabase, falling back to JSON:", err.message);
    }
  }

  // Fallback to static file
  return loadExampleMemoryFromFile(rootDir);
}

export function loadExampleMemoryFromFile(rootDir) {
  const path = resolve(rootDir, "training", "processed", "example_memory.json");
  if (!existsSync(path)) return [];
  return JSON.parse(readFileSync(path, "utf-8"));
}

// Keep the old name as an alias for backward compatibility
export const loadExampleMemory = loadExampleMemoryFromFile;

// ---------------------------------------------------------------------------
// Select relevant examples (keyword scoring)
// ---------------------------------------------------------------------------

export function selectRelevantExamples({
  rootDir,
  repository,
  examples: preloaded,
  brief,
  diagnosis,
  mined,
  strategy,
  limit = 3
}) {
  // Use preloaded examples if provided, otherwise load from file
  const examples = preloaded || loadExampleMemoryFromFile(rootDir);
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

// ---------------------------------------------------------------------------
// Format examples for agent prompts
// ---------------------------------------------------------------------------

export function formatExamplesForAgent(examples, agentName) {
  if (!examples?.length) return "";

  const hasGold = examples.some(e => e.quality === "gold");

  const sections = examples.map((example, index) => {
    const qualityLabel = example.quality === "gold" ? "GOLD (human-approved standard)" : example.quality;

    // CRITICAL: Do NOT inject raw script text. It causes the model to copy
    // brand names, metrics, taglines, and campaign lines from unrelated projects
    // into the current brief. Teaching points capture the structural lessons
    // without leaking client-specific content.
    return `### Example ${index + 1}: ${example.projectName}

Quality: ${qualityLabel}
Tags: ${(example.tags || []).join(", ")}

What this example teaches:
${(example.teachingPoints || []).map((point) => `- ${point}`).join("\n")}`;
  });

  const goldInstruction = hasGold
    ? `\n\nGOLD EXAMPLES ARE HARD STANDARDS. When a gold example is retrieved, your output must match or exceed its structural quality, specificity, production-readiness, and voice discipline. If your script is weaker than the gold example on any of those dimensions, revise before returning. Gold examples represent what the StudioNow team considers production-ready work.`
    : "";

  return `\n\n## Relevant StudioNow Examples (STRUCTURAL LESSONS ONLY)

These examples teach structural patterns, not content. Learn from how they are built, not what they say. NEVER copy, adapt, or reference any brand name, metric, tagline, product claim, campaign name, or visual detail from these examples. Every word in your script must come from the current brief and its attachments. If a detail is not in the current brief, it does not exist.${goldInstruction}

${sections.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Scoring
// ---------------------------------------------------------------------------

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
