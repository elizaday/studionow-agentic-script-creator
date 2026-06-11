import { parseThreeColumnScriptTable } from "./runtime-gate.mjs";

// Taste cards make example retrieval safe by construction instead of by
// prompt instruction. A card contains only structural facts derived from an
// example — beat maps, VO density, super cadence, source-tag mix, abstract
// opening/closing types — plus noun-scrubbed lessons. No brand names, no
// metrics, no taglines, no campaign language can survive compilation, so a
// card cannot contaminate a script for a different client.
//
// The leak gate (findExampleLeaks) is the regression net behind the cards:
// it flags any distinctive token from a retrieved example's RAW text that
// appears in the output but not in the current brief.

// Tags that describe structure/format rather than clients or campaigns.
const ALLOWED_TAGS = new Set([
  "gold", "usable", "sizzle", "explainer", "case-study", "case study",
  "rts", "ready to sell", "text-on-screen", "voice-over", "vo",
  "internal", "external", "partnership", "platform explainer",
  "localization", "spec", "opener", "anthem", "teaser", "capabilities",
  "umbrella brief", "product data", "tech-forward",
  "15s", "30s", "45s", "60s", "90s", "120s"
]);

// Terms that are legitimately capitalized in production writing and must not
// be treated as client nouns by the scrubber or the leak gate. The second
// block is ordinary script/production-document vocabulary that shows up
// capitalized in headers and table cells ("Producer:", "VISUALS", "Date:") —
// any script contains these words, so they cannot be distinctive client
// content. Brand names that collide with common words (Simply, Sprite) are
// deliberately NOT here.
const STRUCTURAL_WHITELIST = new Set([
  "studionow", "super", "supers", "sfx", "vo", "tc", "music", "ai",
  "tos", "rts", "led", "pos", "cta", "ui", "ooh", "ltos", "lto",
  "audio", "visuals", "visual", "logo", "endcard", "end-card", "b-roll", "broll",
  "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
  "january", "february", "march", "april", "may", "june", "july",
  "august", "september", "october", "november", "december",
  // production-document vocabulary
  "producer", "notes", "note", "timeline", "date", "version", "client",
  "writer", "format", "tone", "label", "internal", "external", "draft",
  "script", "scripts", "scene", "shot", "frame", "title", "opening",
  "closing", "open", "close", "clean", "forward", "product", "products",
  "brand", "table", "runtime", "budget", "section", "checklist", "delivery",
  "deliverables", "hero", "montage", "transition", "transitions", "beat",
  "beats", "camera", "footage", "stock", "graphics", "motion", "talent",
  "sound", "voiceover", "voice", "story", "page", "slide", "deck", "final",
  "confidential", "only", "spec", "commercial", "film", "video", "cut"
]);

const SOURCE_TAG_PATTERNS = [
  ["existing", /\(existing[^)]*\)/gi],
  ["toShoot", /\(to[- ]shoot[^)]*\)/gi],
  ["stock", /\(stock[^)]*\)/gi],
  ["motionGraphics", /\(motion graphics?[^)]*\)/gi],
  ["ai", /\(ai[- ][^)]*\)/gi]
];

const OPENING_CLOSING_TYPES = [
  ["macro-detail", /\b(macro|extreme close|close[- ]?up|tight on|detail)\b/i],
  ["wide-establishing", /\b(wide|establishing|aerial|drone|skyline|landscape)\b/i],
  ["product-hero", /\b(product|can|bottle|pack|lockup|hero shot)\b/i],
  ["human-moment", /\b(hand|face|talent|person|people|smile|eyes|worker|athlete|consumer)\b/i],
  ["graphic-title", /\b(title|card|logo|super|lockup|graphic|type|end ?card)\b/i],
  ["environment", /\b(store|shelf|stadium|office|kitchen|street|factory|laundromat|room)\b/i]
];

// ---------------------------------------------------------------------------
// Noun scrubbing
// ---------------------------------------------------------------------------

export function scrubProperNouns(text) {
  if (!text) return "";
  let out = String(text);

  // Filenames and snake_case identifiers carry project/brand names that the
  // word-boundary pass below cannot see (underscores join them into one token).
  out = out.replace(/\b[\w-]+\.(docx?|pdf|pptx?|txt|md|xlsx?)\b/gi, "[file]");
  out = out.replace(/\b\w+_[\w_]+\b/g, "[name]");

  // Quoted spans are taglines/supers/campaign lines — never safe.
  out = out.replace(/["“][^"”]{2,}["”]/g, "[tagline]");
  out = out.replace(/['‘][A-Z][^'’]{2,}['’]/g, "[tagline]");

  // Client-style metrics: currency, percents, unit sizes, "vs YA" comparisons.
  out = out.replace(/[$€£]\s?\d[\d,.]*\s?(?:[MBK]|million|billion)?/gi, "[metric]");
  out = out.replace(/[+-]?\d[\d,.]*\s?%/g, "[metric]");
  out = out.replace(/\b\d[\d,.]*\s?(?:oz|ml|l)\b/gi, "[metric]");
  out = out.replace(/\bvs\.?\s?YA\b/gi, "[metric]");

  // Proper-noun runs. A capitalized token mid-sentence (or an ALL-CAPS token
  // anywhere) that isn't structural vocabulary is treated as a name; adjacent
  // marked tokens collapse into one placeholder.
  const sentences = out.split(/(?<=[.!?:;\n])\s+/);
  const scrubbedSentences = sentences.map((sentence) => {
    const tokens = sentence.split(/(\s+)/); // keep whitespace tokens
    const isWord = (t) => /\S/.test(t);
    const wordIdxs = tokens.map((t, i) => (isWord(t) ? i : -1)).filter((i) => i >= 0);

    const marked = new Set();
    for (let w = 0; w < wordIdxs.length; w += 1) {
      const i = wordIdxs[w];
      const raw = tokens[i];
      const core = raw.replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "");
      if (!core) continue;
      const lower = core.toLowerCase();
      if (STRUCTURAL_WHITELIST.has(lower)) continue;

      const isAllCaps = /^[A-Z][A-Z0-9'&-]+$/.test(core) && core.length >= 2;
      const isCapitalized = /^[A-Z][a-z]/.test(core);
      if (!isAllCaps && !isCapitalized) continue;

      if (w === 0 && !isAllCaps) {
        // Sentence-initial Capitalized word is normal English unless it begins
        // a run of capitalized tokens (e.g. "Savannah Bananas brought...").
        const nextI = wordIdxs[w + 1];
        const nextCore = nextI != null ? tokens[nextI].replace(/^[^A-Za-z0-9]+|[^A-Za-z0-9]+$/g, "") : "";
        if (!/^[A-Z]/.test(nextCore)) continue;
      }
      marked.add(i);
    }

    if (marked.size === 0) return sentence;

    const outTokens = [];
    let inRun = false;
    for (let i = 0; i < tokens.length; i += 1) {
      if (marked.has(i)) {
        if (!inRun) {
          // Preserve trailing punctuation of the run's last token crudely by
          // appending the placeholder bare; punctuation loss is acceptable here.
          outTokens.push("[name]");
          inRun = true;
        }
        continue;
      }
      if (isWord(tokens[i])) inRun = false;
      if (inRun && !isWord(tokens[i])) continue; // swallow whitespace inside a run
      outTokens.push(tokens[i]);
    }
    return outTokens.join("");
  });

  return scrubbedSentences.join(" ").replace(/\s{2,}/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Card compilation
// ---------------------------------------------------------------------------

export function compileTasteCard(example) {
  const scriptText = String(example.scriptText || example.scriptExcerpt || "");
  const parsed = parseThreeColumnScriptTable(scriptText);

  const card = {
    quality: example.quality || "usable",
    tags: (example.tags || []).map((t) => String(t).toLowerCase()).filter((t) => ALLOWED_TAGS.has(t)),
    audioMode: "unknown",
    runtimeSeconds: null,
    beats: null,
    density: null,
    supers: null,
    sourceMix: null,
    opens: "unknown",
    closes: "unknown",
    lessons: compileSafeLessons(example)
  };

  const superMatches = scriptText.match(/\*\*\s*SUPER:?\s*\*\*|^SUPER:/gim) || [];
  const superTexts = [...scriptText.matchAll(/SUPER:?\*{0,2}\s*["“]([^"”]+)["”]/gi)].map((m) => m[1]);

  if (parsed.ok) {
    const beats = parsed.rows.map((row) => ({
      durationSec: tcToSeconds(row.tc),
      voWords: countVoWords(row.vo),
      hasSuper: /SUPER/i.test(row.vo) || /SUPER/i.test(row.vis)
    }));
    const durations = beats.map((b) => b.durationSec).filter((d) => d != null);
    const voTotal = beats.reduce((s, b) => s + b.voWords, 0);
    const runtime = durations.length === beats.length && durations.length > 0
      ? Math.round(durations.reduce((s, d) => s + d, 0))
      : inferRuntimeFromTags(card.tags);

    card.beats = {
      count: beats.length,
      avgDurationSec: durations.length ? round1(durations.reduce((s, d) => s + d, 0) / durations.length) : null
    };
    card.runtimeSeconds = runtime;
    card.density = {
      voWordsTotal: voTotal,
      wordsPerSecond: runtime ? round1(voTotal / runtime) : null
    };
    card.sourceMix = countSourceTags(scriptText);
    card.opens = classifyShot(parsed.rows[0]?.vis || "");
    card.closes = classifyShot(parsed.rows[parsed.rows.length - 1]?.vis || "");
  } else {
    // Non-table script (numbered VO, SUPER/VISUALS lines). Degraded card.
    const voTotal = countVoWords(
      scriptText
        .split("\n")
        .filter((l) => !/^\s*(SUPER|SFX|MUSIC|VISUALS?|#)/i.test(l.trim()))
        .join(" ")
    );
    card.runtimeSeconds = inferRuntimeFromTags(card.tags);
    card.density = { voWordsTotal: voTotal, wordsPerSecond: card.runtimeSeconds ? round1(voTotal / card.runtimeSeconds) : null };
    card.sourceMix = countSourceTags(scriptText);
  }

  const superCount = Math.max(superMatches.length, superTexts.length);
  card.supers = {
    count: superCount,
    avgWords: superTexts.length ? round1(superTexts.reduce((s, t) => s + wordCount(t), 0) / superTexts.length) : null,
    maxWords: superTexts.length ? Math.max(...superTexts.map(wordCount)) : null
  };

  const voTotal = card.density?.voWordsTotal ?? 0;
  if (voTotal < 12 && superCount >= 3) card.audioMode = "text-on-screen";
  else if (voTotal >= 12 && superCount >= 1) card.audioMode = "mixed";
  else if (voTotal >= 12) card.audioMode = "voice-over";

  return card;
}

// Lessons go through three layers before they can reach a prompt:
// 1. provenance notes (source/pairing metadata from old ingest scripts) are
//    dropped — they are filenames and bookkeeping, not craft;
// 2. the general noun scrubber runs;
// 3. an example-specific blocklist (every distinctive token from the
//    example's own raw text, client, project name, and non-structural tags)
//    redacts anything that survived — this catches lowercase brand names and
//    sentence-initial names the general heuristics cannot.
function compileSafeLessons(example) {
  const blocklist = buildExampleBlocklist(example);
  const lessons = [];
  for (const point of example.teachingPoints || []) {
    const text = String(point).trim();
    if (!text) continue;
    if (/^(source note|pairing note|promoted|imported|gold pair imported)/i.test(text)) continue;
    if (/\.(docx?|pdf|pptx?)\b/i.test(text)) continue;

    let safe = scrubProperNouns(text);
    for (const token of blocklist) {
      safe = safe.replace(new RegExp(`\\b${escapeRegExp(token)}\\b`, "gi"), "[name]");
    }
    safe = safe.replace(/(\[name\][\s/,&+-]*){2,}/g, "[name] ").replace(/\s{2,}/g, " ").trim();

    // A lesson that is mostly placeholders teaches nothing — drop it.
    const realWords = (safe.match(/\b[a-z]{3,}\b/gi) || []).filter((w) => !/^(name|tagline|metric|file)$/i.test(w));
    if (realWords.length < 4) continue;
    lessons.push(safe);
  }
  return lessons;
}

function buildExampleBlocklist(example) {
  const blocklist = new Set(distinctiveTokens(
    [example.briefText, example.scriptText, example.scriptExcerpt, example.notes].filter(Boolean).join("\n")
  ));
  const identity = [example.client, example.projectName, ...(example.tags || [])].filter(Boolean).join(" ");
  for (const token of identity.toLowerCase().match(/[a-z][a-z0-9'&-]{2,}/g) || []) {
    if (STRUCTURAL_WHITELIST.has(token) || ALLOWED_TAGS.has(token)) continue;
    if (GENERIC_IDENTITY_WORDS.has(token)) continue;
    blocklist.add(token);
  }
  return blocklist;
}

// Words that appear in client/project names but are ordinary production
// vocabulary — redacting these would destroy the lessons' meaning.
const GENERIC_IDENTITY_WORDS = new Set([
  "the", "company", "script", "video", "sizzle", "intro", "draft", "final",
  "compact", "extended", "outline", "portfolio", "advanced", "hydration",
  "water", "tea", "coffee", "platform", "explainer", "capabilities",
  "master", "global", "brand", "creative", "production", "plans", "launch"
]);

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

export function formatTasteCardsForPrompt(cards) {
  if (!cards?.length) return "";
  const hasGold = cards.some((c) => c.quality === "gold");

  const sections = cards.map((card, index) => {
    const lines = [`### Taste Card ${index + 1}${card.quality === "gold" ? " — GOLD (human-approved standard)" : ""}`];
    const fmt = [];
    if (card.runtimeSeconds) fmt.push(`runtime ~${card.runtimeSeconds}s`);
    if (card.audioMode !== "unknown") fmt.push(card.audioMode);
    if (card.tags.length) fmt.push(card.tags.join(", "));
    if (fmt.length) lines.push(`Format: ${fmt.join(" | ")}`);
    if (card.beats?.count) lines.push(`Beats: ${card.beats.count}${card.beats.avgDurationSec ? ` (avg ${card.beats.avgDurationSec}s each)` : ""}`);
    if (card.density) lines.push(`VO density: ${card.density.voWordsTotal} words${card.density.wordsPerSecond != null ? ` (~${card.density.wordsPerSecond}/sec)` : ""}`);
    if (card.supers?.count) lines.push(`Supers: ${card.supers.count}${card.supers.avgWords ? `, avg ${card.supers.avgWords} words, max ${card.supers.maxWords}` : ""}`);
    if (card.sourceMix && Object.values(card.sourceMix).some((n) => n > 0)) {
      lines.push(`Source mix: ${Object.entries(card.sourceMix).filter(([, n]) => n > 0).map(([k, n]) => `${k} ×${n}`).join(", ")}`);
    }
    if (card.opens !== "unknown" || card.closes !== "unknown") {
      lines.push(`Opens on ${card.opens} → closes on ${card.closes}`);
    }
    if (card.lessons.length) {
      lines.push(`Structural lessons:`);
      for (const lesson of card.lessons) lines.push(`- ${lesson}`);
    }
    return lines.join("\n");
  });

  const goldInstruction = hasGold
    ? `\n\nGOLD CARDS ARE HARD STANDARDS. Match or exceed their structural discipline: beat economy, VO density, super brevity, and source-tag honesty. If your script is looser than a gold card on any of those dimensions, tighten it before returning.`
    : "";

  return `\n\n## StudioNow Taste Cards (structural patterns from past approved work)

These cards describe HOW strong StudioNow scripts are built — pacing, density, structure. They contain no client content by construction. Match their structural discipline. Every word of your script must come from the current brief and its attachments.${goldInstruction}

${sections.join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// Leak gate
// ---------------------------------------------------------------------------

export function findExampleLeaks({ outputText, briefText, examples }) {
  const output = String(outputText || "");
  if (!output || !examples?.length) return [];

  const allow = tokenSet(`${briefText || ""}`);
  const outputLower = ` ${output.toLowerCase()} `;
  const leaks = [];
  const seen = new Set();

  for (const example of examples) {
    const sourceText = [example.projectName, example.client, example.notes, example.briefText, example.scriptText, example.scriptExcerpt, (example.tags || []).join(" ")]
      .filter(Boolean)
      .join("\n");

    for (const candidate of distinctiveTokens(sourceText)) {
      if (allow.has(candidate)) continue;
      if (seen.has(candidate)) continue;
      const re = new RegExp(`\\b${escapeRegExp(candidate)}\\b`, "i");
      if (re.test(output)) {
        seen.add(candidate);
        leaks.push({ token: candidate, exampleId: example.id || example.projectName || "unknown" });
      }
    }

    // Quoted phrases (taglines) leak as phrases even if individual words are common.
    for (const phrase of quotedPhrases(sourceText)) {
      const key = phrase.toLowerCase();
      if (seen.has(key)) continue;
      if (allowPhrase(allow, phrase)) continue;
      if (outputLower.includes(` ${key} `) || output.toLowerCase().includes(key)) {
        seen.add(key);
        leaks.push({ token: phrase, exampleId: example.id || example.projectName || "unknown" });
      }
    }
  }

  return leaks;
}

function distinctiveTokens(text) {
  const source = String(text);
  const candidates = new Set();
  for (const match of source.matchAll(/\b[A-Z][A-Za-z0-9'&-]{3,}\b/g)) {
    const lower = match[0].toLowerCase();
    if (!STRUCTURAL_WHITELIST.has(lower)) candidates.add(lower);
  }

  const tokens = new Set();
  for (const lower of candidates) {
    // Count every occurrence regardless of casing, then split by whether the
    // first letter is lowercase. A word that mostly appears lowercase is
    // ordinary English that happened to start a sentence — not a name.
    const all = source.match(new RegExp(`\\b${escapeRegExp(lower)}\\b`, "gi")) || [];
    const bare = all.filter((occurrence) => /^[a-z]/.test(occurrence)).length;
    const named = all.length - bare;
    if (bare >= named) continue;
    tokens.add(lower);
  }
  return tokens;
}

function quotedPhrases(text) {
  const phrases = [];
  for (const match of String(text).matchAll(/["“]([^"”]{6,80})["”]/g)) {
    const phrase = match[1].trim();
    if (wordCount(phrase) >= 2) phrases.push(phrase);
  }
  return phrases;
}

function allowPhrase(allowTokens, phrase) {
  // A phrase is allowed if every distinctive word in it is in the brief.
  const words = phrase.toLowerCase().match(/[a-z0-9'-]{4,}/g) || [];
  return words.every((w) => allowTokens.has(w));
}

function tokenSet(text) {
  const set = new Set();
  for (const token of String(text).toLowerCase().match(/[a-z0-9'&-]{2,}/g) || []) set.add(token);
  for (const w of STRUCTURAL_WHITELIST) set.add(w);
  return set;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function tcToSeconds(tc) {
  const match = String(tc || "").match(/(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const start = Number(match[1]) * 60 + Number(match[2]);
  const end = Number(match[3]) * 60 + Number(match[4]);
  const dur = end - start;
  return dur > 0 && dur < 600 ? dur : null;
}

function countVoWords(voCell) {
  const cleaned = String(voCell || "")
    .replace(/\*\*\s*SUPER:?\s*\*\*[^|]*/gi, " ")
    .replace(/\*SFX:[^*]*\*/gi, " ")
    .replace(/\bMUSIC:[^|.]*[.|]?/gi, " ")
    .replace(/\bVO:\s*/gi, " ");
  return wordCount(cleaned);
}

function wordCount(text) {
  return (String(text).match(/[A-Za-z0-9'’-]+/g) || []).length;
}

function countSourceTags(text) {
  const mix = {};
  for (const [key, pattern] of SOURCE_TAG_PATTERNS) {
    mix[key] = (String(text).match(pattern) || []).length;
  }
  return mix;
}

function classifyShot(visText) {
  for (const [label, pattern] of OPENING_CLOSING_TYPES) {
    if (pattern.test(visText)) return label;
  }
  return "unknown";
}

function inferRuntimeFromTags(tags) {
  for (const tag of tags || []) {
    const match = String(tag).match(/^(\d{2,3})s$/);
    if (match) return Number(match[1]);
  }
  return null;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
