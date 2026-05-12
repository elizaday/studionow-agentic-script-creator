import { runAgent, baseSystem } from "./run-agent.mjs";
import { parseThreeColumnScriptTable } from "../runtime-gate.mjs";

export async function runWriter({
  modelClient,
  references,
  brief,
  diagnosis,
  mined,
  strategy,
  blueprint,
  visualInventory = null,
  currentDraft = null,
  runtimeEdit = null,
  critique = null
}) {
  const isRevision = Boolean(currentDraft && critique);
  const system = baseSystem({ role: "Script Writer", references });
  const hasInventory = Array.isArray(visualInventory?.inventory) && visualInventory.inventory.length > 0;
  const payload = { brief, diagnosis, mined, strategy, blueprint, currentDraft, runtimeEdit, critique, visualInventory: hasInventory ? visualInventory : null };
  const result = await runAgent({
    modelClient,
    agentName: "writer",
    system,
    payload,
    instructions: `${isRevision
      ? "Rewrite the complete StudioNow script by addressing the critic's required revisions. Return a clean replacement draft, not a marked-up draft."
      : "Write the first complete StudioNow script from the blueprint."}

Return this JSON shape:
{
  "metadata": {
    "title": "",
    "client": "",
    "writer": "StudioNow AI Agent Workflow",
    "version": 1
  },
  "voWordCount": 0,
  "markdown": ""
}

Script requirements:
- Metadata header.
- Three-column table with this exact header: | AUDIO/VO | TC | VISUALS |.
- Present tense visuals.
- Motion in every visual row.
- Source flags in visuals.
- SUPER labels bolded.
- SFX italicized.
- No em dashes.
- Do not overwrite.
- If this is a revision, remove any embedded critique comments from the previous draft.
- markdown must contain only the client-facing script. Do not include producer notes, critique, explanations, or extra sections.${hasInventory
  ? `\n- A visualInventory is attached in the payload. When a row uses an existing asset from that inventory, reference it inline in the VISUALS cell using the format [asset-id] followed by a brief in-script description. Example: "[asset-3] (existing) Wide shot of bottling line, camera dollies right." Use the asset id exactly as it appears in the inventory.\n- For rows that need new footage, use a source tag like (to-shoot), (motion graphics), or (stock) and describe the shot.\n- Use blueprint structure.assetIds as a guide to which row each asset belongs in.\n- Never reference an asset id that is not in the inventory.`
  : ""}`
  });

  if (parseThreeColumnScriptTable(result.markdown).ok) return result;

  const repaired = await runAgent({
    modelClient,
    agentName: "writer",
    system,
    payload: { ...payload, invalidWriterResult: result },
    instructions: `Your previous writer output failed because the markdown field did not contain a valid three-column script table.

Return this JSON shape:
{
  "metadata": {
    "title": "",
    "client": "",
    "writer": "StudioNow AI Agent Workflow",
    "version": 1
  },
  "voWordCount": 0,
  "markdown": ""
}

The markdown field must be a complete client-facing script only. It must include:
- Metadata header.
- This exact table header: | AUDIO/VO | TC | VISUALS |.
- No producer notes.
- No critique.
- No explanations.
- No revision comments.

If this is a revision, address the critic's required revisions inside the rewritten script.`
  });

  if (parseThreeColumnScriptTable(repaired.markdown).ok) return repaired;

  if (currentDraft && parseThreeColumnScriptTable(currentDraft.markdown).ok) {
    return {
      ...currentDraft,
      markdown: currentDraft.markdown.replace(/\n?<!--[\s\S]*?-->/g, "").trim()
    };
  }

  return repaired;
}
