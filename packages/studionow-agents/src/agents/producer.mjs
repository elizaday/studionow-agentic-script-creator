import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runProducer({ modelClient, references, brief, diagnosis, mined, strategy }) {
  return runAgent({
    modelClient,
    agentName: "producer",
    system: baseSystem({ role: "Producer Blueprint Agent", references }),
    payload: { brief, diagnosis, mined, strategy },
    instructions: `Build the Script Blueprint. Think like a producer, not a copywriter.

Return this JSON shape:
{
  "title": "",
  "client": "",
  "runtimeSeconds": 0,
  "tone": "",
  "conceptEngine": "",
  "visualMotif": "",
  "structure": [
    {
      "tc": "",
      "job": "",
      "transition": ""
    }
  ],
  "openingMove": "",
  "closingMove": "",
  "productionNotes": [],
  "wordBudget": 0
}

Every visual idea must move or transform. Flag production risks plainly.`
  });
}
