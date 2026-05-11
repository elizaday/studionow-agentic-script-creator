import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runDiagnoser({ modelClient, references, brief }) {
  return runAgent({
    modelClient,
    agentName: "diagnoser",
    system: baseSystem({ role: "Brief Diagnoser", references }),
    payload: { brief },
    instructions: `Lock the assignment before anyone writes.

Return this JSON shape:
{
  "format": "",
  "placement": "",
  "audience": "",
  "understand": "",
  "feel": "",
  "do": "",
  "runtimeSeconds": 0,
  "tone": "",
  "approvalReality": "",
  "existingAssets": "",
  "openingTension": "",
  "closingMove": "",
  "endFeeling": "",
  "assumptions": [],
  "risks": []
}

Every string field above is required and must be non-empty. If the brief does not specify a value, infer the most likely answer and prefix it with "TBD: ". Capture the gap in "assumptions" or "risks". Never return an empty string.

If the brief is incomplete, state assumptions and proceed. Be direct.`
  });
}
