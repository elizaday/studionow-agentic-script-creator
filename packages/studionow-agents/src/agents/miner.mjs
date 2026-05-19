import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runMiner({ modelClient, references, brief, diagnosis, attachments = [] }) {
  return runAgent({
    modelClient,
    agentName: "miner",
    system: baseSystem({ role: "Brief Mining Producer", references }),
    payload: { brief, diagnosis, attachments },
    instructions: `Extract only material the creative team can actually use.

Critical contract:
- Return every top-level key shown below.
- "humanTension" is required and must be a non-empty string.
- If the brief does not state a clean human tension, derive it from diagnosis.openingTension.
- Do not rename "humanTension" to "tension", "openingTension", "coreTension", or any other key.
- assetNotes.existing and assetNotes.missing are required. Use "Not specified" only when the brief truly does not say.

Return this JSON shape:
{
  "humanTension": "",
  "metrics": [],
  "strategicFrameworks": [],
  "brandLanguage": [],
  "assetNotes": {
    "existing": "",
    "missing": ""
  },
  "clearanceFlags": [],
  "usableAmmunition": []
}

Do not summarize the brief. Mine it.`
  });
}
