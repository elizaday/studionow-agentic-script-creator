import { runAgent, baseSystem } from "./run-agent.mjs";
import { parseThreeColumnScriptTable } from "../runtime-gate.mjs";

/**
 * Combined Writer + Producer Notes agent.
 *
 * Replaces three sequential calls (writer, runtime-editor, formatter) with one.
 * The word budget is given as a hard constraint upfront so the model writes to
 * budget on the first pass. The deterministic runtime gate still runs after this
 * call as a safety net.
 */
export async function runWriterProducer({
  modelClient,
  references,
  brief,
  diagnosis,
  mined,
  strategy,
  blueprint,
  visualInventory = null,
  exampleHints = "",
  // Revision inputs (used when the runtime gate forces a trim)
  currentDraft = null,
  trimInstruction = null
}) {
  const isRevision = Boolean(currentDraft && trimInstruction);
  const hasInventory = Array.isArray(visualInventory?.inventory) && visualInventory.inventory.length > 0;

  const wordBudget = blueprint?.wordBudget || 0;
  const runtimeSeconds = blueprint?.runtimeSeconds || diagnosis?.runtimeSeconds || 90;
  const tone = blueprint?.tone || diagnosis?.tone || "Confident / Corporate";

  const wordBudgetClause = wordBudget > 0
    ? `\n\nVO WORD BUDGET (HARD CONSTRAINT): Your VO must total ${wordBudget} words or fewer. This is not a suggestion. Count as you write. If your VO exceeds ${wordBudget} words, cut lines before returning. The runtime is ${runtimeSeconds} seconds and the tone is ${tone}. Write to this density, not over it.`
    : `\n\nThis appears to be a text-on-screen / supers-only piece. The AUDIO/VO column should contain music cues, SFX, and SUPER directions, not spoken VO.`;

  const inventoryClause = hasInventory
    ? `\n- A visualInventory is attached in the payload. When a row uses an existing asset, reference it inline in the VISUALS cell using [asset-id] followed by a brief description. Example: "[asset-3] (existing) Wide shot of bottling line, camera dollies right." For new footage, use (to-shoot), (motion graphics), or (stock). Never reference an asset id not in the inventory.`
    : "";

  const system = baseSystem({ role: "Script Writer and Producer", references });

  const payload = {
    brief,
    diagnosis,
    mined,
    strategy,
    blueprint,
    visualInventory: hasInventory ? visualInventory : null,
    currentDraft: isRevision ? currentDraft : null,
    trimInstruction: isRevision ? trimInstruction : null
  };

  const instructions = `${isRevision
    ? `The runtime gate rejected this script for exceeding the word budget. Trim the draft to meet the constraint below. Do not rewrite from scratch. Cut weak transitions, redundant beats, and lines that repeat what the visual already shows. Keep the visual motif, structure, and direction intact.\n\nTrim instruction: ${trimInstruction}`
    : "Write the complete StudioNow production script AND the producer notes in one pass."}
${wordBudgetClause}

Return this exact JSON shape:
{
  "metadata": {
    "title": "",
    "client": "",
    "writer": "StudioNow AI Agent Workflow",
    "version": 1
  },
  "voWordCount": 0,
  "clientScriptMarkdown": "",
  "producerNotesMarkdown": ""
}

SCRIPT RULES (clientScriptMarkdown):
- Metadata header at the top.
- Three-column table with this exact header: | AUDIO/VO | TC | VISUALS |
- Present tense visuals. Motion in every visual row. No stock-photo descriptions.
- Source flags in visuals: (existing footage), (to-shoot), (stock), (motion graphics), (AI-generated).
- SUPERs bolded: **SUPER:** "Text"
- SFX italicized: *SFX: description*
- No em dashes anywhere. Use ellipses for pauses.
- voWordCount must be your actual count of spoken VO words in the table.
- clientScriptMarkdown must contain ONLY the client-facing script. No producer notes, no commentary.${inventoryClause}

PRODUCER NOTES RULES (producerNotesMarkdown):
- Separate document. Start with # PRODUCER NOTES
- Include these sections: Asset Sourcing Matrix, Approval Flags, Missing Assets, Graphics/Animation Load, Music Direction, Timeline/Feasibility Notes.
- Be specific and actionable. "Need footage of X" not "footage may be needed."
- Do not repeat the script. Reference timecodes when noting production concerns.${exampleHints}`;

  const result = await runAgent({
    modelClient,
    agentName: "writer_producer",
    system,
    payload,
    instructions
  });

  // Validate the script table exists
  if (parseThreeColumnScriptTable(result.clientScriptMarkdown).ok) {
    return normalizeResult(result);
  }

  // One repair attempt if the table is malformed
  const repaired = await runAgent({
    modelClient,
    agentName: "writer_producer",
    system,
    payload: { ...payload, invalidResult: result },
    instructions: `Your previous output had a malformed script table. Return the same JSON shape with a valid three-column table.

{
  "metadata": { "title": "", "client": "", "writer": "StudioNow AI Agent Workflow", "version": 1 },
  "voWordCount": 0,
  "clientScriptMarkdown": "",
  "producerNotesMarkdown": ""
}

clientScriptMarkdown MUST include: metadata header, then | AUDIO/VO | TC | VISUALS | table. No producer notes inside it.
producerNotesMarkdown is the separate producer notes document.`
  });

  if (parseThreeColumnScriptTable(repaired.clientScriptMarkdown).ok) {
    return normalizeResult(repaired);
  }

  // If revision, fall back to the draft we were trying to trim
  if (currentDraft?.clientScriptMarkdown && parseThreeColumnScriptTable(currentDraft.clientScriptMarkdown).ok) {
    return normalizeResult({
      ...currentDraft,
      producerNotesMarkdown: repaired.producerNotesMarkdown || currentDraft.producerNotesMarkdown || ""
    });
  }

  return normalizeResult(repaired);
}

function normalizeResult(result) {
  return {
    metadata: result.metadata || { title: "", client: "", writer: "StudioNow AI Agent Workflow", version: 1 },
    voWordCount: result.voWordCount || 0,
    clientScriptMarkdown: result.clientScriptMarkdown || "",
    producerNotesMarkdown: result.producerNotesMarkdown || "",
    // Compat fields for downstream code that reads draft-shaped objects
    markdown: result.clientScriptMarkdown || ""
  };
}
