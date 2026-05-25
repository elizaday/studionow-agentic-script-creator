#!/usr/bin/env node
// Standalone Planner test. Proves the single planning call produces a valid,
// complete plan (diagnosis + mined + strategy + blueprint) before we refactor
// the workflow around it.
//
//   node scripts/test-planner.mjs                 # mock client, free
//   node scripts/test-planner.mjs --real          # gpt-5, ~1 call
//   node scripts/test-planner.mjs --real --id spec-pibb

import "dotenv/config";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runPlanner } from "../packages/studionow-agents/src/agents/planner.mjs";
import { loadReferencePack } from "../packages/studionow-agents/src/reference-loader.mjs";
import { validatePlan } from "../packages/studionow-agents/src/stage-schemas.mjs";
import { createMockModelClient } from "../packages/studionow-agents/src/model/mock-client.mjs";
import { createOpenAIModelClient } from "../packages/studionow-agents/src/model/openai-client.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const useReal = args.includes("--real");
const id = readArg("--id") || "explainer-pulse";

const briefs = JSON.parse(await readFile(resolve(ROOT, "evals", "briefs.json"), "utf-8"));
const chosen = briefs.find((b) => b.id === id) || briefs[0];

const brief = {
  id: chosen.id,
  name: chosen.name,
  brief: chosen.brief,
  expectedGenre: chosen.expected_genre,
  runtimeSeconds: chosen.runtime_seconds
};

const modelClient = useReal ? createOpenAIModelClient() : createMockModelClient();
const references = await loadReferencePack(ROOT, ["context", "diagnosis", "strategy", "production", "voice"]);

console.log(`Planner test — ${modelClient.name} — brief: ${chosen.name}`);
const started = Date.now();
const plan = await runPlanner({ modelClient, references, brief });
const elapsed = ((Date.now() - started) / 1000).toFixed(1);

try {
  validatePlan(plan);
  console.log(`\n✓ validatePlan PASSED in ${elapsed}s`);
} catch (err) {
  console.log(`\n✗ validatePlan FAILED in ${elapsed}s: ${err.message}`);
  console.log(JSON.stringify(plan, null, 2).slice(0, 2000));
  process.exit(1);
}

const meta = typeof modelClient.getLastResponseMeta === "function" ? modelClient.getLastResponseMeta() : null;
console.log("\n=== PLAN SUMMARY ===");
console.log(`Format:        ${plan.diagnosis.format}`);
console.log(`Audience:      ${plan.diagnosis.audience}`);
console.log(`Runtime:       ${plan.diagnosis.runtimeSeconds}s`);
console.log(`Human tension: ${plan.mined.humanTension}`);
console.log(`Engine:        ${plan.strategy.directions[0].coreEngine}`);
console.log(`Direction:     ${plan.strategy.directions[0].name}`);
console.log(`Title:         ${plan.blueprint.title}`);
console.log(`Visual motif:  ${plan.blueprint.visualMotif}`);
console.log(`Structure:     ${plan.blueprint.structure.length} beats`);
console.log(`Word budget:   ${plan.blueprint.wordBudget}`);
console.log(`Metrics found: ${plan.mined.metrics.length}`);
console.log(`Clearance flags: ${plan.mined.clearanceFlags.length}`);
if (meta?.usage) {
  console.log(`\nTokens: ${meta.usage.input_tokens} in / ${meta.usage.output_tokens} out`);
}
console.log(`\nOne planning call replaced four stages (diagnoser + miner + strategist + producer).`);

function readArg(name) {
  const i = args.indexOf(name);
  return i === -1 ? undefined : args[i + 1];
}
