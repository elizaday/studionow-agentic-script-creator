import { runAgent, baseSystem } from "./run-agent.mjs";
import { parseThreeColumnScriptTable } from "../runtime-gate.mjs";

export async function runFormatter({ modelClient, references, brief, diagnosis, mined, blueprint, draft, runtimeEdit, critique }) {
  const result = await runAgent({
    modelClient,
    agentName: "formatter",
    system: baseSystem({ role: "Final Formatter", references }),
    payload: { brief, diagnosis, mined, blueprint, draft, runtimeEdit, critique },
    instructions: `Prepare the final deliverables. Do not make new creative decisions unless required to fix formatting and accuracy.

Return this JSON shape:
{
  "clientScriptMarkdown": "",
  "producerNotesMarkdown": "",
  "finalMarkdown": "",
  "deliveryChecklist": []
}

Rules:
- clientScriptMarkdown must contain only the client-facing script: metadata header plus three-column script table.
- Do not include producer notes inside clientScriptMarkdown.
- producerNotesMarkdown must be a separate document.
- finalMarkdown may mirror clientScriptMarkdown for compatibility.
- Producer notes must not use asset tags as if they are script visuals.`
  });

  if (typeof result.finalMarkdown !== "string") {
    result.finalMarkdown = typeof result.clientScriptMarkdown === "string" ? result.clientScriptMarkdown : "";
  }

  if (parseThreeColumnScriptTable(result.clientScriptMarkdown || result.finalMarkdown).ok) {
    return result;
  }

  const fallbackScript = [runtimeEdit?.markdown, draft?.markdown].find((markdown) =>
    parseThreeColumnScriptTable(markdown).ok
  );

  if (fallbackScript) {
    return {
      ...result,
      clientScriptMarkdown: fallbackScript,
      finalMarkdown: fallbackScript,
      producerNotesMarkdown: result.producerNotesMarkdown || buildFormatterNotesFallback(critique),
      deliveryChecklist: Array.isArray(result.deliveryChecklist)
        ? result.deliveryChecklist
        : ["Client script table preserved from last valid runtime pass."]
    };
  }

  return result;
}

function buildFormatterNotesFallback(critique) {
  const findings = Array.isArray(critique?.findings) && critique.findings.length > 0
    ? critique.findings.map((finding) => `- ${finding}`).join("\n")
    : "- No critique findings captured.";
  return `# PRODUCER NOTES

## Delivery Notes
- Formatter returned an invalid client script table, so the last valid runtime script was preserved.

## Critique Findings
${findings}`;
}
