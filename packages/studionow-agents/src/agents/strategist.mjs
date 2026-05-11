import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runStrategist({ modelClient, references, brief, diagnosis, mined }) {
  return runAgent({
    modelClient,
    agentName: "strategist",
    system: baseSystem({ role: "Concept Strategist", references }),
    payload: { brief, diagnosis, mined },
    instructions: `Choose the story engine.

If the brief is open, return three genuinely different directions and set needsDirectionChoice to true.
If the brief is tight, recommend one direction and set needsDirectionChoice to false.

Return this JSON shape:
{
  "needsDirectionChoice": false,
  "recommendedDirectionId": "",
  "directions": [
    {
      "id": "",
      "name": "",
      "coreEngine": "",
      "whatMakesItWork": "",
      "mainRisk": "",
      "whyItFits": ""
    }
  ],
  "storyArc": {
    "act1": "",
    "act2": "",
    "act3": ""
  }
}

Do not write script lines.`
  });
}
