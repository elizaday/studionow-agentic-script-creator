import { runAgent, baseSystem } from "./run-agent.mjs";

export async function runProducer({ modelClient, references, brief, diagnosis, mined, strategy, visualInventory }) {
  const hasInventory = Array.isArray(visualInventory?.inventory) && visualInventory.inventory.length > 0;
  const inventoryClause = hasInventory
    ? `\n\nA visual inventory is attached in the payload as visualInventory.inventory. Each entry is an existing asset with an id (e.g. "asset-3"), description, shotType, and usableFor tags. When a structure row should use one of those assets, list its id(s) in assetIds for that row. When a row needs new footage, leave assetIds empty and the transition should describe the new shot. Do not invent asset ids that are not in the inventory.`
    : "";

  return runAgent({
    modelClient,
    agentName: "producer",
    system: baseSystem({ role: "Producer Blueprint Agent", references }),
    payload: { brief, diagnosis, mined, strategy, visualInventory: hasInventory ? visualInventory : null },
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
      "transition": "",
      "assetIds": []
    }
  ],
  "openingMove": "",
  "closingMove": "",
  "productionNotes": [],
  "wordBudget": 0
}

Every visual idea must move or transform. Flag production risks plainly.${inventoryClause}`
  });
}
