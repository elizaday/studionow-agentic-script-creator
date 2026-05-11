const KNOWN_MODEL_PRICES_PER_MTOK = {
  "gpt-5": { input: 1.25, output: 10.0 },
  "gpt-5-mini": { input: 0.25, output: 2.0 },
  "gpt-5-nano": { input: 0.05, output: 0.4 },
  "gpt-4.1": { input: 2.0, output: 8.0 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6 },
  "gpt-4o": { input: 2.5, output: 10.0 },
  "gpt-4o-mini": { input: 0.15, output: 0.6 },
  "o1": { input: 15.0, output: 60.0 },
  "o3": { input: 2.0, output: 8.0 },
  "o3-mini": { input: 1.1, output: 4.4 }
};

export function resolveModelPrice(model) {
  const inputOverride = parseFloatEnv(process.env.OPENAI_INPUT_PRICE_PER_MTOK);
  const outputOverride = parseFloatEnv(process.env.OPENAI_OUTPUT_PRICE_PER_MTOK);
  if (inputOverride != null && outputOverride != null) {
    return { source: "env_override", input: inputOverride, output: outputOverride };
  }

  const normalized = normalizeModelName(model);
  if (normalized && KNOWN_MODEL_PRICES_PER_MTOK[normalized]) {
    const entry = KNOWN_MODEL_PRICES_PER_MTOK[normalized];
    return { source: "table", input: entry.input, output: entry.output };
  }

  return { source: "unknown", input: null, output: null };
}

export function computeCostUsd({ model, inputTokens, outputTokens }) {
  const price = resolveModelPrice(model);
  if (price.input == null || price.output == null) {
    return { costUsd: null, priceSource: price.source };
  }
  const cost = ((Number(inputTokens) || 0) * price.input + (Number(outputTokens) || 0) * price.output) / 1_000_000;
  return {
    costUsd: Number(cost.toFixed(6)),
    priceSource: price.source,
    inputPricePerMtok: price.input,
    outputPricePerMtok: price.output
  };
}

function normalizeModelName(model) {
  if (!model || typeof model !== "string") return null;
  const lower = model.toLowerCase().replace(/^openai:/, "");
  if (KNOWN_MODEL_PRICES_PER_MTOK[lower]) return lower;
  for (const key of Object.keys(KNOWN_MODEL_PRICES_PER_MTOK)) {
    if (lower.startsWith(`${key}-`) || lower === key) return key;
  }
  return null;
}

function parseFloatEnv(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
