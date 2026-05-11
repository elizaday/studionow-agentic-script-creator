import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runCritic({ modelClient, references, brief, diagnosis, blueprint, draft, runtimeEdit }) {
  return runAgent({
    modelClient,
    agentName: "critic",
    system: baseSystem({ role: "Ruthless Script Critic", references }),
    payload: { brief, diagnosis, blueprint, draft, runtimeEdit },
    instructions: `Stress test the script. Findings first. Be exact, not performatively harsh.

Return this JSON shape:
{
  "passes": true,
  "score": 0,
  "findings": [],
  "requiredRevisions": []
}

Fail the script if it has generic openings, cold transitions, unproduceable visuals, no motif, fake data confidence, runtime dishonesty, or portable language.`
  });
}
