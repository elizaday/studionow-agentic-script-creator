/**
 * Deterministic checks for three-column script tables, VO volume, and timecode coverage.
 * Complements the LLM runtime editor; does not replace creative critique.
 */

export function resolveRuntimeTargets({ brief, diagnosis, blueprint }) {
  const targetSeconds = firstPositiveNumber(
    blueprint?.runtimeSeconds,
    diagnosis?.runtimeSeconds,
    brief?.runtimeSeconds,
    typeof brief === "object" && brief?.brief?.runtimeSeconds
  );
  const fallbackSeconds = targetSeconds ?? 90;
  const wordBudget = firstPositiveNumber(blueprint?.wordBudget) ?? Math.round(fallbackSeconds * 1.45);
  return {
    targetSeconds: fallbackSeconds,
    wordBudget
  };
}

export function parseThreeColumnScriptTable(markdown) {
  const text = normalizeNewlines(markdown);
  const lines = text.split("\n");
  let headerIndex = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/\|\s*AUDIO\s*\/\s*VO\s*\|\s*TC\s*\|\s*VISUALS\s*\|/i.test(lines[i])) {
      headerIndex = i;
      break;
    }
  }
  if (headerIndex === -1) {
    return { ok: false, code: "missing_table_header", rows: [] };
  }

  const rows = [];
  for (let i = headerIndex + 1; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line.startsWith("|")) break;
    const cells = line
      .split("|")
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
    if (cells.length < 3) break;
    const [vo, tc, ...rest] = cells;
    const vis = rest.join(" | ");
    if (/^[-:\s]+$/.test(vo) && /^[-:\s]+$/.test(tc)) continue;
    rows.push({ vo, tc, vis });
  }

  if (rows.length === 0) {
    return { ok: false, code: "empty_table_body", rows: [] };
  }
  return { ok: true, code: null, rows };
}

export function countVoWordsInTable(rows) {
  let total = 0;
  for (const { vo } of rows) {
    total += countWords(extractSpokenVo(vo));
  }
  return total;
}

export function maxTimecodeEndSeconds(rows) {
  let maxEnd = 0;
  for (const { tc } of rows) {
    for (const range of extractTimeRanges(tc)) {
      if (range.end > maxEnd) maxEnd = range.end;
    }
  }
  return maxEnd;
}

/**
 * @returns {{ errors: string[], warnings: string[], metrics: Record<string, number|boolean|string> }}
 */
export function evaluateRuntimeHonesty(markdown, { targetSeconds, wordBudget, modelStatus = null, modelRevisedVoWords = null }) {
  const parsed = parseThreeColumnScriptTable(markdown);
  const errors = [];
  const warnings = [];
  const metrics = {
    target_seconds: targetSeconds,
    word_budget: wordBudget,
    table_ok: parsed.ok,
    vo_row_count: parsed.rows?.length ?? 0
  };

  if (!parsed.ok) {
    errors.push(parsed.code === "missing_table_header"
      ? "Client script must include a three-column table with header AUDIO/VO | TC | VISUALS."
      : "Script table has a header but no body rows.");
    return { errors, warnings, metrics };
  }

  const voWords = countVoWordsInTable(parsed.rows);
  metrics.vo_words_measured = voWords;
  metrics.max_tc_end_seconds = maxTimecodeEndSeconds(parsed.rows);

  if (voWords === 0) {
    warnings.push("No VO words detected in the AUDIO/VO column (may be intentional for supers-only scripts).");
  }

  const hardCeiling = Math.ceil(Math.max(wordBudget * 1.4, targetSeconds * 2.5));
  if (voWords > hardCeiling) {
    errors.push(
      `VO word count ${voWords} exceeds hard ceiling (${hardCeiling} words, budget ${wordBudget}).`
    );
  } else if (voWords > Math.ceil(wordBudget * 1.15)) {
    warnings.push(`VO word count ${voWords} is above ~115% of word budget (${wordBudget}).`);
  }

  if (voWords > 0 && voWords < Math.floor(wordBudget * 0.55)) {
    warnings.push(`VO word count ${voWords} is well below word budget ${wordBudget} (possible underwritten read).`);
  }

  const maxEnd = metrics.max_tc_end_seconds;
  if (maxEnd > 0) {
    if (maxEnd > targetSeconds * 1.25) {
      warnings.push(
        `Last timecode ends around ${formatSeconds(maxEnd)}s; target runtime is ~${targetSeconds}s.`
      );
    }
    if (maxEnd < targetSeconds * 0.65) {
      warnings.push(
        `Timecode coverage ends around ${formatSeconds(maxEnd)}s; target is ~${targetSeconds}s (possible short script).`
      );
    }
    metrics.tc_covers_target = maxEnd >= targetSeconds * 0.65 && maxEnd <= targetSeconds * 1.25;
  } else if (voWords > 0) {
    warnings.push("Could not parse TC ranges; verify timecode formatting (e.g. 0:00-0:08).");
  }

  if (modelStatus === "within_budget" && voWords > Math.ceil(wordBudget * 1.15)) {
    warnings.push("Runtime editor reported within_budget but deterministic VO count disagrees.");
  }
  if (
    modelRevisedVoWords != null &&
    Number.isFinite(modelRevisedVoWords) &&
    voWords > 0 &&
    Math.abs(modelRevisedVoWords - voWords) / voWords > 0.2
  ) {
    warnings.push(
      `Runtime editor revisedVoWords (${modelRevisedVoWords}) differs from measured VO words (${voWords}) by >20%.`
    );
  }

  return { errors, warnings, metrics };
}

function firstPositiveNumber(...candidates) {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

function normalizeNewlines(s) {
  return String(s || "").replace(/\r\n/g, "\n");
}

function stripInlineMarkdown(s) {
  return String(s || "")
    .replace(/\*\*([^*]+)\*\*/g, "$1")
    .replace(/\*([^*]+)\*/g, "$1")
    .replace(/`([^`]+)`/g, "$1");
}

function extractSpokenVo(s) {
  const text = stripInlineMarkdown(String(s || "").replace(/\\n/g, "\n").replace(/<br\s*\/?>/gi, "\n"));
  const matches = [...text.matchAll(/\bVO:\s*([\s\S]*?)(?=\n\s*(?:VO:|SFX:|Music|MUSIC|SUPER:)\b|$)/gim)]
    .map((match) => match[1].trim())
    .filter(Boolean);

  if (matches.length > 0) {
    return matches.join(" ");
  }

  if (isCueOnlyAudio(text)) {
    return "";
  }

  return text
    .split("\n")
    .filter((line) => !/^\s*(SFX|Music|MUSIC|SUPER):?\b/i.test(line))
    .join(" ");
}

function isCueOnlyAudio(text) {
  const normalized = String(text || "").trim();
  if (!normalized) return true;
  const cueTerms = /\b(SFX|music|track|beat|beats|bpm|pulse|synth|bass|percussion|riser|whoosh|fizz|sound|audio|score)\b/i;
  const quotedSpokenLine = /["“][^"”]{3,}["”]/.test(normalized);
  return cueTerms.test(normalized) && !quotedSpokenLine;
}

function countWords(s) {
  return String(s || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function extractTimeRanges(tcCell) {
  const cell = String(tcCell || "").replace(/–|—/g, "-");
  const out = [];
  const re = /(\d{1,3}:\d{2})\s*-\s*(\d{1,3}:\d{2})/g;
  let m;
  while ((m = re.exec(cell)) !== null) {
    const start = parseTcToSeconds(m[1]);
    const end = parseTcToSeconds(m[2]);
    if (start != null && end != null && end >= start) {
      out.push({ start, end });
    }
  }
  return out;
}

function parseTcToSeconds(tc) {
  const parts = String(tc).trim().split(":");
  if (parts.length !== 2) return null;
  const a = Number(parts[0]);
  const b = Number(parts[1]);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return a * 60 + b;
}

function formatSeconds(sec) {
  return Math.round(sec);
}
