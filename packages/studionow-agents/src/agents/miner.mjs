import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runMiner({ modelClient, references, brief, diagnosis, attachments = [] }) {
  return runAgent({
    modelClient,
    agentName: "miner",
    system: baseSystem({ role: "Brief Mining Producer", references }),
    payload: { brief, diagnosis, attachments },
    instructions: `Extract only material the creative team can actually use.

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
