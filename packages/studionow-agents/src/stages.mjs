export const STAGES = Object.freeze({
  DIAGNOSIS: "diagnosis",
  MINING: "source_mining",
  VISUAL_INTAKE: "visual_intake",
  STRATEGY: "strategy",
  BLUEPRINT: "blueprint",
  DRAFT: "draft",
  RUNTIME: "runtime_edit",
  CRITIQUE: "critique",
  REVISION: "revision",
  FINAL: "final"
});

export const STATUS = Object.freeze({
  QUEUED: "queued",
  CLAIMED: "claimed",
  RUNNING: "running",
  WAITING_FOR_DIRECTION: "waiting_for_direction",
  COMPLETE: "complete",
  FAILED: "failed",
  CANCELED: "canceled"
});

export const AGENTS = Object.freeze({
  DIAGNOSER: "diagnoser",
  MINER: "miner",
  VISUAL_INTAKE: "visual_intake",
  STRATEGIST: "strategist",
  PRODUCER: "producer",
  WRITER: "writer",
  RUNTIME_EDITOR: "runtime_editor",
  CRITIC: "critic",
  FORMATTER: "formatter"
});

export function ensureObject(value, label) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value;
}

export function ensureString(value, label) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return value;
}
