import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { extractJson } from "../json.mjs";

function buildUserContent(user, images) {
  if (!Array.isArray(images) || images.length === 0) {
    return user;
  }
  const parts = [{ type: "input_text", text: typeof user === "string" ? user : String(user ?? "") }];
  for (const image of images) {
    if (!image) continue;
    const url = image.dataUrl || (image.base64 && image.mediaType
      ? `data:${image.mediaType};base64,${image.base64}`
      : null);
    if (!url) continue;
    const block = { type: "input_image", image_url: url };
    if (image.detail) block.detail = image.detail;
    parts.push(block);
  }
  return parts;
}

function envModel(name) {
  const value = process.env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function modelEnvNameForAgent(agentName) {
  return `OPENAI_MODEL_${String(agentName || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")}`;
}

function resolveModelForAgent(agentName, fallbackModel) {
  const agentSpecific = envModel(modelEnvNameForAgent(agentName));
  if (agentSpecific) return agentSpecific;

  if (agentName === "writer_producer" || agentName === "writer" || agentName === "formatter") {
    return envModel("OPENAI_MODEL_WRITER") || fallbackModel;
  }

  if (agentName === "planner" || agentName === "diagnoser" || agentName === "miner" || agentName === "strategist" || agentName === "producer") {
    return envModel("OPENAI_MODEL_PLANNING") || fallbackModel;
  }

  return fallbackModel;
}

async function saveFailedResponse(agentName, text, error) {
  try {
    const dir = process.env.OPENAI_DEBUG_DIR || resolve(process.cwd(), "outputs", "failed-responses");
    await mkdir(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const file = resolve(dir, `${stamp}_${agentName}.txt`);
    await writeFile(file, `// ${error?.message || "parse error"}\n${text}`);
    console.error(`[openai] Saved failed ${agentName} response to ${file}`);
  } catch (saveError) {
    console.error(`[openai] Could not save failed response:`, saveError.message);
  }
}

export function createOpenAIModelClient({
  apiKey = process.env.OPENAI_API_KEY,
  model = process.env.OPENAI_MODEL || "gpt-5",
  timeoutMs = Number(process.env.OPENAI_TIMEOUT_MS) || 1500000,
  maxRetries = Number(process.env.OPENAI_MAX_RETRIES) || 1
} = {}) {
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is required for the real model client");
  }

  const client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries });
  let lastMeta = null;

  return {
    name: `openai:${model}`,
    getLastResponseMeta() {
      return lastMeta;
    },
    async generateJson({ agentName, system, user, images = [] }) {
      lastMeta = null;
      const requestModel = resolveModelForAgent(agentName, model);
      const userContent = buildUserContent(user, images);
      const response = await client.responses.create({
        model: requestModel,
        input: [
          { role: "system", content: system },
          { role: "user", content: userContent }
        ],
        text: { format: { type: "json_object" } }
      });

      const usage = response.usage;
      lastMeta = {
        response_id: response.id,
        model: requestModel,
        usage: usage
          ? {
              input_tokens: usage.input_tokens,
              output_tokens: usage.output_tokens,
              total_tokens: usage.total_tokens
            }
          : undefined
      };

      const text = response.output_text || "";
      try {
        return extractJson(text);
      } catch (error) {
        await saveFailedResponse(agentName, text, error);
        error.message = `${agentName} returned invalid JSON: ${error.message}`;
        throw error;
      }
    }
  };
}
