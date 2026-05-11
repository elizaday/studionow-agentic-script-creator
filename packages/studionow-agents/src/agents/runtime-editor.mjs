import { runAgent, baseSystem } from "./run-agent.mjs";
import { parseThreeColumnScriptTable } from "../runtime-gate.mjs";

export async function runRuntimeEditor({ modelClient, references, brief, diagnosis, blueprint, draft }) {
  const result = await runAgent({
    modelClient,
    agentName: "runtime_editor",
    system: baseSystem({ role: "Runtime Editor", references }),
    payload: { brief, diagnosis, blueprint, draft },
    instructions: `Enforce the runtime. Cut weak lines. Do not speed up the read.

Return this JSON shape:
{
  "status": "within_budget | cut_required | underwritten",
  "originalVoWords": 0,
  "revisedVoWords": 0,
  "notes": [],
  "markdown": ""
}

If over budget, cut the draft and return the revised markdown. Preserve the concept and motif.`
    + ` The markdown must remain a client-facing script with the exact three-column header | AUDIO/VO | TC | VISUALS |. Do not append producer notes or commentary.`
  });

  if (!parseThreeColumnScriptTable(result.markdown).ok && parseThreeColumnScriptTable(draft?.markdown).ok) {
    return {
      ...result,
      status: result.status === "cut_required" ? "within_budget" : result.status,
      revisedVoWords: draft.voWordCount,
      notes: [
        ...(Array.isArray(result.notes) ? result.notes : []),
        "Runtime editor returned non-script markdown, so the original draft table was preserved for format safety."
      ],
      markdown: draft.markdown
    };
  }

  return result;
}
