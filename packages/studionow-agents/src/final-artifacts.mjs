export function prepareFinalArtifacts({
  formatted,
  runtimeEdit,
  draft,
  critique
}) {
  const draftFallback = runtimeEdit?.markdown || draft?.markdown || "";
  const rawClient = formatted?.clientScriptMarkdown || formatted?.finalMarkdown || draftFallback;
  const rawNotes = formatted?.producerNotesMarkdown || "";

  const extracted = splitCombinedMarkdown(rawClient);
  const clientScriptMarkdown = cleanClientScript(extracted.script || rawClient);
  const producerNotesMarkdown = cleanProducerNotes(
    rawNotes || extracted.producerNotes || buildProducerNotesFallback({ formatted, critique })
  );

  return {
    ...formatted,
    clientScriptMarkdown,
    producerNotesMarkdown,
    finalMarkdown: clientScriptMarkdown,
    combinedMarkdown: `${clientScriptMarkdown}\n\n---\n\n${producerNotesMarkdown}`.trim(),
    deliveryChecklist: formatted?.deliveryChecklist || []
  };
}

function splitCombinedMarkdown(markdown) {
  if (!markdown) return { script: "", producerNotes: "" };

  const normalized = normalize(markdown);
  const notesHeading = normalized.search(/\n##\s+PRODUCER NOTES\b/i);
  if (notesHeading === -1) {
    return { script: normalized, producerNotes: "" };
  }

  const script = normalized.slice(0, notesHeading).replace(/\n---\s*$/m, "").trim();
  const producerNotes = normalized.slice(notesHeading).trim();
  return { script, producerNotes };
}

function cleanClientScript(markdown) {
  return sanitizeClientMarkdown(markdown)
    .replace(/\n---[\s\S]*$/m, "")
    .replace(/\n##\s+PRODUCER NOTES[\s\S]*$/im, "")
    .replace(/\n<!--[\s\S]*?-->/g, "")
    .trim();
}

function cleanProducerNotes(markdown) {
  const normalized = sanitizeProducerNotesMarkdown(markdown)
    .replace(/\n<!--[\s\S]*?-->/g, "")
    .trim();

  if (!normalized) return "# PRODUCER NOTES\n\n## Notes\n- No producer notes were generated.";
  if (/^#\s+PRODUCER NOTES\b/i.test(normalized)) return normalized;
  if (/^##\s+PRODUCER NOTES\b/i.test(normalized)) return `# PRODUCER NOTES\n\n${normalized}`;
  return `# PRODUCER NOTES\n\n${normalized}`;
}

function buildProducerNotesFallback({ formatted, critique }) {
  const findingLines = critique?.findings?.length
    ? critique.findings.map((finding) => `- ${finding}`).join("\n")
    : "- No critique findings captured.";

  return `# PRODUCER NOTES

## Delivery Notes
- Formatter did not return a dedicated producer notes document, so this fallback was generated from the critique pass.

## Critique Findings
${findingLines}

## Checklist
${(formatted?.deliveryChecklist || []).map((item) => `- ${item}`).join("\n") || "- No checklist captured."}`;
}

function normalize(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

export function sanitizeClientMarkdown(markdown) {
  return normalize(markdown)
    .replace(/\\n/g, "<br>")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}

export function sanitizeProducerNotesMarkdown(markdown) {
  return normalize(markdown)
    .replace(/\\n/g, "\n")
    .replace(/[—–]/g, "-")
    .replace(/[“”]/g, "\"")
    .replace(/[‘’]/g, "'")
    .trim();
}
