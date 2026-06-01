const MAX_SCRIPT_EXCERPT = 2000;
const MAX_BRIEF_EXCERPT = 900;
const MAX_RULES = 8;

const CATEGORY_PATTERNS = [
  {
    category: "structure",
    appliesTo: ["planner", "writer_producer", "writer"],
    patterns: [/rts\b/i, /ready to sell/i],
    rule: "For RTS or Ready to Sell scripts, organize the story around momentum: recent proof, current swagger, then future pipeline. Do not turn the script into a flat portfolio list."
  },
  {
    category: "format",
    appliesTo: ["writer_producer", "writer", "formatter"],
    patterns: [/text on screen/i, /\bTOS\b/i, /no vo/i, /no voice[\s-]?over/i],
    rule: "For text-on-screen scripts, keep supers short, punchy, and sequential. Let visuals and motion carry the connective tissue instead of adding faux VO."
  },
  {
    category: "data",
    appliesTo: ["planner", "writer_producer", "writer"],
    patterns: [/\$[\d,.]+/i, /\b\d+%/i, /\b#\s?\d+\b/i, /\bvs\.?\s*YA\b/i],
    rule: "When the brief provides metrics, use them as story turns at beat changes. Do not bury numbers in a list or omit them from the script."
  },
  {
    category: "production",
    appliesTo: ["planner", "writer_producer", "writer"],
    patterns: [/existing assets/i, /footage/i, /deck/i, /toolkit/i, /asset/i, /slide/i],
    rule: "When the brief includes existing assets or a deck, write toward the available material first and clearly flag any new footage, stock, motion graphics, or clearance needs."
  },
  {
    category: "runtime",
    appliesTo: ["planner", "writer_producer", "writer"],
    patterns: [/\b:15\b/i, /\b15 seconds\b/i, /\b:30\b/i, /\b30 seconds\b/i],
    rule: "For very short scripts, cut scope before compressing ideas. A short runtime needs fewer beats, not faster narration."
  },
  {
    category: "voice",
    appliesTo: ["writer_producer", "writer"],
    patterns: [/generic/i, /too broad/i, /more specific/i, /specificity/i],
    rule: "Replace generic emotional language with specific behaviors, proof points, or visual actions from the brief."
  },
  {
    category: "structure",
    appliesTo: ["planner", "writer_producer", "writer"],
    patterns: [/opening/i, /open/i, /first.+seconds/i],
    rule: "Open with the core tension or contradiction before explaining the solution. Avoid setup lines that could belong to any brand."
  },
  {
    category: "structure",
    appliesTo: ["planner", "writer_producer", "writer"],
    patterns: [/close/i, /closing/i, /ending/i, /land/i],
    rule: "Make the closing line resolve the exact story the script has built. Do not end with a generic brand-film flourish."
  }
];

const TAG_PATTERNS = [
  ["rts", /\brts\b|ready to sell/i],
  ["sizzle", /sizzle/i],
  ["explainer", /explainer|platform|dashboard|tool/i],
  ["case-study", /case study|award|submission/i],
  ["event", /event|opener|summit|meeting/i],
  ["commercial", /commercial|brand film|\bspec\b/i],
  ["internal", /internal/i],
  ["external", /external/i],
  ["text-on-screen", /text on screen|\bTOS\b|no vo|no voice[\s-]?over/i],
  ["voice-over", /voice over|voiceover|\bVO\b/i],
  ["coca-cola", /coca-?cola|tccc/i],
  ["dunkin", /dunkin/i],
  ["data-led", /\$[\d,.]+|\b\d+%|#\s?\d+\b/i],
  ["asset-led", /existing assets|footage|deck|toolkit|asset|slide/i]
];

export function buildGoldImprovement(candidate) {
  const projectName = clean(candidate.project_name) || "Gold Example";
  const client = clean(candidate.client);
  const briefText = clean(candidate.brief_text);
  const scriptText = clean(candidate.final_script_text);
  const whyGold = clean(candidate.why_gold);
  const whatChanged = clean(candidate.what_changed);
  const baseTags = Array.isArray(candidate.tags) ? candidate.tags : [];
  const textForSignals = [projectName, client, briefText, scriptText, whyGold, whatChanged].join("\n");

  const tags = unique([
    ...baseTags.map(slugTag),
    "gold",
    "human-edited",
    ...inferTags(textForSignals)
  ]).filter(Boolean);

  const inferredPoints = inferTeachingPoints({ textForSignals, whyGold, whatChanged, briefText, scriptText });
  const existingPoints = Array.isArray(candidate.teaching_points) ? candidate.teaching_points.map(clean).filter(Boolean) : [];
  const teachingPoints = unique([...existingPoints, ...inferredPoints]).slice(0, 10);
  const memoryCard = buildMemoryCard({ projectName, client, tags, teachingPoints, whyGold, whatChanged, briefText });
  const scriptExcerpt = scriptText.slice(0, MAX_SCRIPT_EXCERPT);
  const briefExcerpt = briefText.slice(0, MAX_BRIEF_EXCERPT);
  const retrievalText = [
    projectName,
    client,
    `Tags: ${tags.join(", ")}`,
    memoryCard,
    `Teaching points:\n${teachingPoints.map((p) => `- ${p}`).join("\n")}`,
    `Brief excerpt:\n${briefExcerpt}`,
    `Script excerpt:\n${scriptExcerpt.slice(0, 800)}`
  ].filter(Boolean).join("\n\n");

  const proposedRules = inferLearningRules({ textForSignals, whyGold, whatChanged, teachingPoints });

  return {
    tags,
    teachingPoints: teachingPoints.length > 0 ? teachingPoints : ["Human-approved gold standard."],
    scriptExcerpt,
    retrievalText,
    memoryCard,
    proposedRules
  };
}

export async function insertDraftLearningRules({ supabase, rules, candidateId, exampleId }) {
  if (!Array.isArray(rules) || rules.length === 0) return [];

  const inserted = [];
  for (const item of rules.slice(0, MAX_RULES)) {
    const { data: existing, error: existingErr } = await supabase
      .from("learning_rules")
      .select("id")
      .ilike("rule", item.rule)
      .limit(1);
    if (existingErr) throw existingErr;
    if (existing && existing.length > 0) continue;

    const { data, error } = await supabase
      .from("learning_rules")
      .insert({
        rule: item.rule,
        category: item.category || "general",
        source: "gold_review",
        applies_to: item.appliesTo || ["planner", "writer_producer", "writer"],
        status: "draft"
      })
      .select("id,rule,category,status")
      .single();
    if (error) throw error;
    inserted.push({ ...data, candidateId, exampleId });
  }

  return inserted;
}

function inferTags(text) {
  const found = [];
  for (const [tag, pattern] of TAG_PATTERNS) {
    if (pattern.test(text)) found.push(tag);
  }
  if (/text on screen|\bTOS\b|no vo|no voice[\s-]?over/i.test(text)) {
    return found.filter((tag) => tag !== "voice-over");
  }
  return found;
}

function inferTeachingPoints({ textForSignals, whyGold, whatChanged, briefText, scriptText }) {
  const points = [];
  if (whyGold) points.push(`Why this is gold: ${sentence(whyGold)}`);
  if (whatChanged) points.push(`Human edit signal: ${sentence(whatChanged)}`);
  if (/\bTOS\b|text on screen|no vo|no voice[\s-]?over/i.test(textForSignals)) {
    points.push("Text-on-screen scripts should use short supers, visual escalation, and clear beat progression instead of VO-style explanation.");
  }
  if (/\$[\d,.]+|\b\d+%|#\s?\d+\b/i.test(textForSignals)) {
    points.push("Metrics are strongest when they land as proof at a pivot point, not as a spreadsheet-style list.");
  }
  if (/existing assets|footage|deck|toolkit|asset|slide/i.test(textForSignals)) {
    points.push("Asset-led scripts should write toward available footage and deck visuals before inventing new production.");
  }
  if (/\brts\b|ready to sell/i.test(textForSignals)) {
    points.push("RTS scripts should build confidence through proof, momentum, and future-facing specificity.");
  }
  if (hasThreeColumnScript(scriptText)) {
    points.push("Keep the client script in clean three-column format with production-useful visuals.");
  }
  if (briefText && scriptText) {
    points.push("Use this pair as a brief-to-final transformation reference, not just as a style sample.");
  }
  return points;
}

function inferLearningRules({ textForSignals, whyGold, whatChanged, teachingPoints }) {
  const signalText = [textForSignals, whyGold, whatChanged, teachingPoints.join("\n")].join("\n");
  const rules = [];
  for (const item of CATEGORY_PATTERNS) {
    if (item.patterns.some((pattern) => pattern.test(signalText))) {
      rules.push({
        rule: item.rule,
        category: item.category,
        appliesTo: item.appliesTo
      });
    }
  }
  return uniqueByRule(rules).slice(0, MAX_RULES);
}

function buildMemoryCard({ projectName, client, tags, teachingPoints, whyGold, whatChanged, briefText }) {
  const useWhen = [
    tags.includes("rts") ? "RTS or Ready to Sell work" : null,
    tags.includes("sizzle") ? "sizzle films" : null,
    tags.includes("explainer") ? "platform or product explainers" : null,
    tags.includes("case-study") ? "award or case-study scripts" : null,
    tags.includes("event") ? "event openers or meeting films" : null,
    tags.includes("asset-led") ? "asset-led assignments with decks or footage" : null
  ].filter(Boolean);

  return [
    `Memory card: ${projectName}${client ? ` (${client})` : ""}`,
    `Use when: ${useWhen.length > 0 ? useWhen.join(", ") : "a future brief matches the project, client, format, tone, or tags"}.`,
    `Do not copy: client-specific claims, taglines, stats, or campaign language unless they also appear in the current brief.`,
    whyGold ? `Why it matters: ${sentence(whyGold)}` : null,
    whatChanged ? `Human edit signal: ${sentence(whatChanged)}` : null,
    teachingPoints.length > 0 ? `Teaches: ${teachingPoints.slice(0, 5).join(" ")}` : null,
    briefText ? `Brief signal: ${sentence(briefText.slice(0, 280))}` : null
  ].filter(Boolean).join("\n");
}

function hasThreeColumnScript(text) {
  return /\|\s*AUDIO\/VO\s*\|\s*TC\s*\|\s*VISUALS\s*\|/i.test(text);
}

function slugTag(value) {
  return clean(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function sentence(value) {
  const text = clean(value).replace(/\s+/g, " ");
  return text.length > 240 ? `${text.slice(0, 237).trim()}...` : text;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function uniqueByRule(rules) {
  const seen = new Set();
  return rules.filter((item) => {
    const key = item.rule.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
