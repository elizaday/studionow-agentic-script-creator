import { runAgent, baseSystem } from "./run-agent.mjs";

// The Planner collapses four stages — Diagnoser, Miner, Strategist, Producer —
// into a single structured call. It is the core of the lean "Production" mode.
// It returns the same four sub-objects those stages used to return separately,
// so every downstream stage (writer, runtime gate, formatter) consumes the
// result unchanged.
//
// Unlike the standalone Strategist, the Planner always commits to ONE direction
// (needsDirectionChoice = false). Direction-picking is reserved for Deep
// Producer Review mode.

export async function runPlanner({ modelClient, references, brief, exampleHints = "", visualInventory = null }) {
  const hasInventory = Array.isArray(visualInventory?.inventory) && visualInventory.inventory.length > 0;
  const inventoryClause = hasInventory
    ? `\n\nA visual inventory is attached in the payload as visualInventory.inventory. Each entry is an existing asset with an id, description, and usableFor tags. When the blueprint.structure should use one of these assets, list its id(s) in that row's assetIds. Do not invent ids that are not in the inventory.`
    : "";

  return runAgent({
    modelClient,
    agentName: "planner",
    system: baseSystem({ role: "Production Planner", references }),
    payload: { brief, visualInventory: hasInventory ? visualInventory : null },
    instructions: `You are the StudioNow Production Planner. In one pass you do the work of four specialists: you diagnose the assignment, mine the brief for usable material, choose the single best story engine and direction, and produce the script blueprint. Be decisive. Commit to one direction — do not offer options.

Return this exact JSON shape. Every field is required.

{
  "diagnosis": {
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
  },
  "mined": {
    "humanTension": "",
    "metrics": [],
    "strategicFrameworks": [],
    "brandLanguage": [],
    "assetNotes": { "existing": "", "missing": "" },
    "clearanceFlags": [],
    "usableAmmunition": []
  },
  "strategy": {
    "needsDirectionChoice": false,
    "recommendedDirectionId": "direction-1",
    "directions": [
      {
        "id": "direction-1",
        "name": "",
        "coreEngine": "",
        "whatMakesItWork": "",
        "mainRisk": "",
        "whyItFits": ""
      }
    ],
    "storyArc": { "act1": "", "act2": "", "act3": "" }
  },
  "blueprint": {
    "title": "",
    "client": "",
    "runtimeSeconds": 0,
    "tone": "",
    "conceptEngine": "",
    "visualMotif": "",
    "structure": [
      { "tc": "", "job": "", "transition": "", "assetIds": [] }
    ],
    "openingMove": "",
    "closingMove": "",
    "productionNotes": [],
    "wordBudget": 0
  }
}

Rules:
- diagnosis: lock the real assignment. Never leave a string empty — if the brief is silent, infer and prefix with "TBD: ". Capture gaps in assumptions or risks.
- mined: extract only material the creative team can actually use. humanTension is required and must be a non-empty string; if the brief does not state one, derive it from the opening tension. assetNotes.existing and assetNotes.missing are required; use "Not specified" only when the brief truly does not say.
- strategy: choose ONE engine. needsDirectionChoice must be false. Provide exactly one direction with id "direction-1" and set recommendedDirectionId to "direction-1". coreEngine should be a named StudioNow engine (Relay/Handoff, Route/Map, Countdown, Reveal, Chaptered Case Study, Problem/Solution/Scale, Sensory Escalation, Day-in-the-Life, Thesis Across Time).
- blueprint: think like a producer. conceptEngine must match strategy.directions[0].coreEngine. Every structure row must move or transform (a real transition, not a cut). runtimeSeconds must match the diagnosis. wordBudget is the VO word budget for the runtime (0 if text-on-screen only). Flag production risks plainly in productionNotes.
- Keep diagnosis.runtimeSeconds and blueprint.runtimeSeconds identical.${inventoryClause}${exampleHints}`
  });
}
