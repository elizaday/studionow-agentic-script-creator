import { parseThreeColumnScriptTable } from "./runtime-gate.mjs";

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function isNonEmptyString(v) {
  return typeof v === "string" && v.trim().length > 0;
}

function isFiniteNumber(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function isStringArray(v) {
  return Array.isArray(v) && v.every((x) => typeof x === "string");
}

export function validateVisualInventory(data) {
  const label = "visual_intake contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  assert(Array.isArray(data.inventory), `${label}: inventory must be an array`);
  for (const entry of data.inventory) {
    assert(entry && typeof entry === "object", `${label}: inventory entry must be an object`);
    assert(isNonEmptyString(entry.id), `${label}: inventory entry "id" required`);
    assert(isNonEmptyString(entry.description), `${label}: inventory entry "description" required`);
  }
}

export function validateDiagnosis(data) {
  const label = "diagnoser contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  for (const key of [
    "format",
    "placement",
    "audience",
    "understand",
    "feel",
    "do",
    "tone",
    "approvalReality",
    "existingAssets",
    "openingTension",
    "closingMove",
    "endFeeling"
  ]) {
    assert(isNonEmptyString(data[key]), `${label}: "${key}" must be a non-empty string`);
  }
  assert(isFiniteNumber(data.runtimeSeconds) && data.runtimeSeconds > 0, `${label}: runtimeSeconds must be a positive number`);
  assert(Array.isArray(data.assumptions), `${label}: assumptions must be an array`);
  assert(Array.isArray(data.risks), `${label}: risks must be an array`);
}

export function validateMined(data) {
  const label = "miner contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  assert(isNonEmptyString(data.humanTension), `${label}: humanTension required`);
  assert(Array.isArray(data.metrics), `${label}: metrics must be an array`);
  assert(Array.isArray(data.strategicFrameworks), `${label}: strategicFrameworks must be an array`);
  assert(Array.isArray(data.brandLanguage), `${label}: brandLanguage must be an array`);
  assert(Array.isArray(data.clearanceFlags), `${label}: clearanceFlags must be an array`);
  assert(Array.isArray(data.usableAmmunition), `${label}: usableAmmunition must be an array`);
  assert(data.assetNotes && typeof data.assetNotes === "object", `${label}: assetNotes must be an object`);
  assert(isNonEmptyString(data.assetNotes.existing), `${label}: assetNotes.existing required`);
  assert(isNonEmptyString(data.assetNotes.missing), `${label}: assetNotes.missing required`);
}

export function validateStrategy(data) {
  const label = "strategist contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  assert(typeof data.needsDirectionChoice === "boolean", `${label}: needsDirectionChoice must be boolean`);
  assert(Array.isArray(data.directions) && data.directions.length > 0, `${label}: directions must be a non-empty array`);

  for (const d of data.directions) {
    assert(d && typeof d === "object", `${label}: each direction must be an object`);
    for (const key of ["id", "name", "coreEngine", "whatMakesItWork", "mainRisk", "whyItFits"]) {
      assert(isNonEmptyString(d[key]), `${label}: direction.${key} required`);
    }
  }

  assert(data.storyArc && typeof data.storyArc === "object", `${label}: storyArc must be an object`);
  for (const act of ["act1", "act2", "act3"]) {
    assert(isNonEmptyString(data.storyArc[act]), `${label}: storyArc.${act} required`);
  }

  if (!data.needsDirectionChoice) {
    assert(isNonEmptyString(data.recommendedDirectionId), `${label}: recommendedDirectionId required when not waiting for direction`);
    const ids = new Set(data.directions.map((d) => d.id));
    assert(ids.has(data.recommendedDirectionId), `${label}: recommendedDirectionId must match a direction id`);
  } else {
    assert(
      data.directions.length >= 3,
      `${label}: when needsDirectionChoice is true, provide at least three distinct directions`
    );
  }
}

export function validateBlueprint(data) {
  const label = "producer contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  for (const key of ["title", "client", "tone", "conceptEngine", "visualMotif", "openingMove", "closingMove"]) {
    assert(isNonEmptyString(data[key]), `${label}: "${key}" required`);
  }
  assert(isFiniteNumber(data.runtimeSeconds) && data.runtimeSeconds > 0, `${label}: runtimeSeconds must be positive`);
  assert(isFiniteNumber(data.wordBudget) && data.wordBudget >= 0, `${label}: wordBudget must be a non-negative number`);
  assert(Array.isArray(data.structure) && data.structure.length > 0, `${label}: structure must be a non-empty array`);
  for (const row of data.structure) {
    assert(row && typeof row === "object", `${label}: structure row must be an object`);
    assert(isNonEmptyString(row.tc), `${label}: structure.tc required`);
    assert(isNonEmptyString(row.job), `${label}: structure.job required`);
    assert(isNonEmptyString(row.transition), `${label}: structure.transition required`);
  }
  assert(Array.isArray(data.productionNotes), `${label}: productionNotes must be an array`);
}

export function validateDraft(data) {
  const label = "writer contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  assert(data.metadata && typeof data.metadata === "object", `${label}: metadata object required`);
  assert(isNonEmptyString(data.metadata.title), `${label}: metadata.title required`);
  assert(isNonEmptyString(data.metadata.client), `${label}: metadata.client required`);
  assert(isNonEmptyString(data.metadata.writer), `${label}: metadata.writer required`);
  assert(isFiniteNumber(data.metadata.version), `${label}: metadata.version must be a number`);
  assert(isFiniteNumber(data.voWordCount) && data.voWordCount >= 0, `${label}: voWordCount must be a non-negative number`);
  assert(isNonEmptyString(data.markdown), `${label}: markdown required`);
  assert(parseThreeColumnScriptTable(data.markdown).ok, `${label}: markdown must include a three-column script table`);
  assert(!/^\s*#{0,3}\s*producer notes\b/im.test(data.markdown), `${label}: markdown must not include producer notes`);
}

export function validateRuntimeEdit(data) {
  const label = "runtime_editor contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  const allowed = new Set(["within_budget", "cut_required", "underwritten"]);
  assert(allowed.has(data.status), `${label}: status must be within_budget, cut_required, or underwritten`);
  assert(isFiniteNumber(data.originalVoWords) && data.originalVoWords >= 0, `${label}: originalVoWords required`);
  assert(isFiniteNumber(data.revisedVoWords) && data.revisedVoWords >= 0, `${label}: revisedVoWords required`);
  assert(Array.isArray(data.notes), `${label}: notes must be an array`);
  assert(isNonEmptyString(data.markdown), `${label}: markdown required`);
  assert(parseThreeColumnScriptTable(data.markdown).ok, `${label}: markdown must include a three-column script table`);
}

export function validateCritique(data) {
  const label = "critic contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  assert(typeof data.passes === "boolean", `${label}: passes must be boolean`);
  assert(isFiniteNumber(data.score), `${label}: score must be a number`);
  assert(Array.isArray(data.findings), `${label}: findings must be an array`);
  assert(Array.isArray(data.requiredRevisions), `${label}: requiredRevisions must be an array`);
  if (!data.passes) {
    assert(data.requiredRevisions.length > 0, `${label}: when passes is false, requiredRevisions must be non-empty`);
  }
}

export function validateFormatted(data) {
  const label = "formatter contract";
  assert(data && typeof data === "object" && !Array.isArray(data), `${label}: root must be an object`);
  assert(isNonEmptyString(data.clientScriptMarkdown), `${label}: clientScriptMarkdown required`);
  assert(isNonEmptyString(data.producerNotesMarkdown), `${label}: producerNotesMarkdown required`);
  assert(typeof data.finalMarkdown === "string", `${label}: finalMarkdown must be a string`);
  assert(Array.isArray(data.deliveryChecklist), `${label}: deliveryChecklist must be an array`);
  assert(parseThreeColumnScriptTable(data.clientScriptMarkdown).ok, `${label}: clientScriptMarkdown must include a three-column script table`);
  assert(!/^\s*#{0,3}\s*producer notes\b/im.test(data.clientScriptMarkdown), `${label}: clientScriptMarkdown must not include producer notes`);
}
