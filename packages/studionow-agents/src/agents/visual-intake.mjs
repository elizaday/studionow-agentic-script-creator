import { runAgent, baseSystem } from "./run-agent.mjs";

const MAX_IMAGES_PER_CALL = 3;
const MAX_PARALLEL_BATCHES = Number(process.env.VISUAL_INTAKE_PARALLELISM || 6);

export async function runVisualIntake({ modelClient, references, brief, diagnosis, mined, imageAttachments }) {
  if (!Array.isArray(imageAttachments) || imageAttachments.length === 0) {
    return { inventory: [], notes: "No image attachments provided." };
  }

  const batches = chunk(imageAttachments, MAX_IMAGES_PER_CALL);
  const system = baseSystem({ role: "Visual Intake", references });

  const batchResults = await runWithConcurrency(batches, MAX_PARALLEL_BATCHES, async (batch, batchIndex) => {
    const visionImages = batch.map((image) => ({
      base64: image.base64,
      mediaType: image.mediaType,
      detail: image.detail || "auto"
    }));
    const imageManifest = batch.map((image, index) => ({
      id: image.id || `asset-${batchIndex * MAX_IMAGES_PER_CALL + index + 1}`,
      source: image.source || "uploaded",
      filename: image.filename || null,
      order: batchIndex * MAX_IMAGES_PER_CALL + index + 1
    }));

    const payload = {
      brief: summarizeBrief(brief),
      diagnosisHints: summarizeDiagnosis(diagnosis),
      minedHints: summarizeMined(mined),
      imageManifest
    };

    return runAgent({
      modelClient,
      agentName: "visual_intake",
      system,
      payload,
      instructions: `You are looking at ${batch.length} attached image(s) in the order listed in imageManifest. Build a concrete visual inventory that downstream writers can reference by id.

Return this JSON shape:
{
  "inventory": [
    {
      "id": "",
      "source": "",
      "shotType": "",
      "description": "",
      "containsText": false,
      "textContent": "",
      "usableFor": [],
      "sensitivity": "",
      "notes": ""
    }
  ],
  "notes": ""
}

Rules:
- One inventory entry per attached image, in the same order as imageManifest. Reuse the id from imageManifest exactly.
- shotType: one of "wide", "medium", "close", "macro", "graphic", "text-only", "ui", "logo", "mixed".
- description: concrete and visual. Name what is actually visible. Avoid mood adjectives unless they describe what the camera sees.
- containsText: true if visible text/data is on the image. textContent: transcribe legible text verbatim, or "" if none.
- usableFor: short tags like "establishing", "process", "human-moment", "reaction", "product-hero", "data-viz", "title-frame", "transition".
- sensitivity: one of "talent-clearance", "product-shot", "stock-ok", "client-supplied", "deck-source", "unknown".
- notes: production or rights flags only. Keep brief.
- Never invent content that is not visible.
- If an image is unreadable or empty, set description to "Unreadable" and note why.
- "notes" at the top level can summarize patterns across the batch (consistent style, recurring talent, etc.) or stay empty.`,
      images: visionImages
    });
  });

  const allEntries = [];
  const combinedNotes = [];
  for (const result of batchResults) {
    if (Array.isArray(result?.inventory)) allEntries.push(...result.inventory);
    if (typeof result?.notes === "string" && result.notes.trim()) combinedNotes.push(result.notes.trim());
  }

  return {
    inventory: allEntries,
    notes: combinedNotes.join(" ").trim() || "Visual intake complete."
  };
}

function chunk(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) {
    out.push(array.slice(i, i + size));
  }
  return out;
}

async function runWithConcurrency(items, concurrency, fn) {
  const results = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

function summarizeBrief(brief) {
  if (!brief) return {};
  const text = brief.brief || brief.text || "";
  return {
    name: brief.name || null,
    runtimeSeconds: brief.runtimeSeconds || null,
    expectedGenre: brief.expectedGenre || null,
    excerpt: text.length > 600 ? `${text.slice(0, 600)}...` : text
  };
}

function summarizeDiagnosis(diagnosis) {
  if (!diagnosis) return null;
  return {
    format: diagnosis.format,
    audience: diagnosis.audience,
    openingTension: diagnosis.openingTension,
    closingMove: diagnosis.closingMove
  };
}

function summarizeMined(mined) {
  if (!mined) return null;
  return {
    humanTension: mined.humanTension,
    metrics: mined.metrics,
    assetNotes: mined.assetNotes
  };
}
