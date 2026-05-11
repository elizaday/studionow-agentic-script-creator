import { STATUS, STAGES } from "./stages.mjs";
import { loadReferencePack } from "./reference-loader.mjs";
import { runDiagnoser } from "./agents/diagnoser.mjs";
import { runMiner } from "./agents/miner.mjs";
import { runStrategist } from "./agents/strategist.mjs";
import { runProducer } from "./agents/producer.mjs";
import { runWriter } from "./agents/writer.mjs";
import { runRuntimeEditor } from "./agents/runtime-editor.mjs";
import { runCritic } from "./agents/critic.mjs";
import { runFormatter } from "./agents/formatter.mjs";
import { prepareFinalArtifacts } from "./final-artifacts.mjs";
import { formatExamplesForAgent, selectRelevantExamples } from "./example-memory.mjs";
import {
  validateDiagnosis,
  validateMined,
  validateStrategy,
  validateBlueprint,
  validateDraft,
  validateRuntimeEdit,
  validateCritique,
  validateFormatted
} from "./stage-schemas.mjs";
import { evaluateRuntimeHonesty, resolveRuntimeTargets } from "./runtime-gate.mjs";
import { computeCostUsd } from "./model/pricing.mjs";

export async function runStudioNowWorkflow({
  rootDir,
  modelClient,
  job,
  repository,
  maxRevisionLoops = 1
}) {
  const brief = normalizeBrief(job.brief);
  const attachments = brief.attachments || [];
  const totals = createCostTotals();

  await repository.updateJob(job.id, { status: STATUS.RUNNING, current_stage: STAGES.DIAGNOSIS });
  await repository.event(job.id, STAGES.DIAGNOSIS, "Diagnosing the assignment before writing.");
  const diagnosis = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    stage: STAGES.DIAGNOSIS,
    agentName: "diagnoser",
    run: async () => {
      const out = await runDiagnoser({
        modelClient,
        references: await loadReferencePack(rootDir, ["context", "diagnosis", "voice"]),
        brief
      });
      validateDiagnosis(out);
      return out;
    }
  });
  await repository.artifact(job.id, "diagnosis", "Brief Diagnosis", diagnosis);

  await repository.updateJob(job.id, { current_stage: STAGES.MINING });
  await repository.event(job.id, STAGES.MINING, "Mining the brief and attachments for usable creative ammunition.");
  const mined = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    stage: STAGES.MINING,
    agentName: "miner",
    run: async () => {
      const out = await runMiner({
        modelClient,
        references: await loadReferencePack(rootDir, ["context", "diagnosis", "production"]),
        brief,
        diagnosis,
        attachments
      });
      validateMined(out);
      return out;
    }
  });
  await repository.artifact(job.id, "source_mining", "Source Mining", mined);

  const relevantExamples = selectRelevantExamples({
    rootDir,
    brief,
    diagnosis,
    mined,
    limit: 3
  });
  if (relevantExamples.length > 0) {
    if (typeof repository.exampleUsage === "function") {
      await repository.exampleUsage(job.id, relevantExamples);
    }
    await repository.event(
      job.id,
      STAGES.MINING,
      `Retrieved ${relevantExamples.length} usable StudioNow example(s).`,
      "info",
      {
        kind: "example_retrieval",
        examples: relevantExamples.map((example) => ({
          id: example.id,
          projectName: example.projectName,
          relevanceScore: example.relevanceScore
        }))
      }
    );
    await repository.artifact(job.id, "retrieved_examples", "Retrieved StudioNow Examples", {
      examples: relevantExamples.map((example) => ({
        id: example.id,
        projectName: example.projectName,
        quality: example.quality,
        pairingConfidence: example.pairingConfidence,
        relevanceScore: example.relevanceScore,
        tags: example.tags,
        teachingPoints: example.teachingPoints
      }))
    });
  }

  await repository.updateJob(job.id, { current_stage: STAGES.STRATEGY });
  await repository.event(job.id, STAGES.STRATEGY, "Choosing the story engine and direction.");
  const strategy = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    stage: STAGES.STRATEGY,
    agentName: "strategist",
    run: async () => {
      const out = await runStrategist({
        modelClient,
        references: `${await loadReferencePack(rootDir, ["strategy", "voice"])}${formatExamplesForAgent(relevantExamples, "strategist")}`,
        brief,
        diagnosis,
        mined
      });
      validateStrategy(out);
      return applySelectedDirection(out, job.selected_direction_id);
    }
  });
  validateStrategy(strategy);
  await repository.artifact(job.id, "strategy", "Concept Strategy", strategy);

  if (job.selected_direction_id) {
    await repository.event(job.id, STAGES.STRATEGY, `Using selected direction: ${strategy.recommendedDirectionId}.`, "info", {
      kind: "selected_direction",
      requested_direction_id: job.selected_direction_id,
      applied_direction_id: strategy.recommendedDirectionId
    });
  }

  if (strategy.needsDirectionChoice && !job.selected_direction_id) {
    await repository.updateJob(job.id, {
      status: STATUS.WAITING_FOR_DIRECTION,
      current_stage: STAGES.STRATEGY
    });
    await repository.event(job.id, STAGES.STRATEGY, "Waiting for user to select a concept direction.");
    return { status: STATUS.WAITING_FOR_DIRECTION, diagnosis, mined, strategy };
  }

  await repository.updateJob(job.id, { current_stage: STAGES.BLUEPRINT });
  await repository.event(job.id, STAGES.BLUEPRINT, "Building the producer blueprint.");
  const blueprint = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    stage: STAGES.BLUEPRINT,
    agentName: "producer",
    run: async () => {
      const out = await runProducer({
        modelClient,
        references: `${await loadReferencePack(rootDir, ["strategy", "production", "voice"])}${formatExamplesForAgent(relevantExamples, "producer")}`,
        brief,
        diagnosis,
        mined,
        strategy
      });
      validateBlueprint(out);
      return out;
    }
  });
  await repository.artifact(job.id, "script_blueprint", "Script Blueprint", blueprint);

  await repository.updateJob(job.id, { current_stage: STAGES.DRAFT });
  await repository.event(job.id, STAGES.DRAFT, "Writing the first complete three-column draft.");
  let draft = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    stage: STAGES.DRAFT,
    agentName: "writer",
    run: async () => {
      const out = await runWriter({
        modelClient,
        references: `${await loadReferencePack(rootDir, ["voice", "format"])}${formatExamplesForAgent(relevantExamples, "writer")}`,
        brief,
        diagnosis,
        mined,
        strategy,
        blueprint
      });
      validateDraft(out);
      return out;
    }
  });
  await repository.artifact(job.id, "draft_script", "Draft Script", draft, draft.markdown);

  let runtimeEdit;
  let critique;

  for (let loop = 0; loop <= maxRevisionLoops; loop += 1) {
    await repository.updateJob(job.id, { current_stage: STAGES.RUNTIME });
    await repository.event(job.id, STAGES.RUNTIME, "Checking VO density and runtime honesty.");
    runtimeEdit = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      stage: STAGES.RUNTIME,
      agentName: "runtime_editor",
      run: async () => {
        const out = await runRuntimeEditor({
          modelClient,
          references: await loadReferencePack(rootDir, ["voice", "format"]),
          brief,
          diagnosis,
          blueprint,
          draft
        });
        validateRuntimeEdit(out);
        return out;
      }
    });
    await repository.artifact(job.id, "runtime_pass", `Runtime Pass ${loop + 1}`, runtimeEdit, runtimeEdit.markdown);

    const runtimeTargets = resolveRuntimeTargets({ brief, diagnosis, blueprint });
    const honesty = evaluateRuntimeHonesty(runtimeEdit.markdown, {
      targetSeconds: runtimeTargets.targetSeconds,
      wordBudget: runtimeTargets.wordBudget,
      modelStatus: runtimeEdit.status,
      modelRevisedVoWords: runtimeEdit.revisedVoWords
    });
    if (honesty.errors.length > 0) {
      throw new Error(`Runtime honesty gate failed: ${honesty.errors.join(" ")}`);
    }
    await repository.event(
      job.id,
      STAGES.RUNTIME,
      honesty.warnings.length > 0
        ? `Deterministic runtime check: ${honesty.warnings.length} warning(s).`
        : "Deterministic runtime check: OK.",
      honesty.warnings.length > 0 ? "warn" : "info",
      { kind: "runtime_gate", loop: loop + 1, warnings: honesty.warnings, metrics: honesty.metrics }
    );

    await repository.updateJob(job.id, { current_stage: STAGES.CRITIQUE });
    await repository.event(job.id, STAGES.CRITIQUE, "Running the ruthless critic pass.");
    critique = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      stage: STAGES.CRITIQUE,
      agentName: "critic",
      run: async () => {
        const out = await runCritic({
          modelClient,
          references: `${await loadReferencePack(rootDir, ["critique", "voice", "production"])}${formatExamplesForAgent(relevantExamples, "critic")}`,
          brief,
          diagnosis,
          blueprint,
          draft,
          runtimeEdit
        });
        validateCritique(out);
        return out;
      }
    });
    await repository.artifact(job.id, "critique", `Critique ${loop + 1}`, critique);

    if (critique.passes || loop === maxRevisionLoops) break;

    await repository.updateJob(job.id, { current_stage: STAGES.REVISION });
    await repository.event(job.id, STAGES.REVISION, "Revision requested by critic. Rewriting against required fixes.");
    draft = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      stage: STAGES.REVISION,
      agentName: "writer",
      run: async () => {
        const out = await runWriter({
          modelClient,
          references: `${await loadReferencePack(rootDir, ["voice", "format"])}${formatExamplesForAgent(relevantExamples, "writer")}`,
          brief,
          diagnosis,
          mined,
          strategy,
          blueprint,
          currentDraft: draft,
          runtimeEdit,
          critique
        });
        validateDraft(out);
        return out;
      }
    });
    await repository.artifact(job.id, "revision", `Revision ${loop + 1}`, draft, draft.markdown);
  }

  await repository.updateJob(job.id, { current_stage: STAGES.FINAL });
  await repository.event(job.id, STAGES.FINAL, "Formatting final script and producer notes.");
  const final = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    stage: STAGES.FINAL,
    agentName: "formatter",
    run: async () => {
      const out = await runFormatter({
        modelClient,
        references: await loadReferencePack(rootDir, ["format", "production"]),
        brief,
        diagnosis,
        mined,
        blueprint,
        draft,
        runtimeEdit,
        critique
      });
      validateFormatted(out);
      return out;
    }
  });
  const preparedFinal = prepareFinalArtifacts({
    formatted: final,
    runtimeEdit,
    draft,
    critique
  });

  const finalTargets = resolveRuntimeTargets({ brief, diagnosis, blueprint });
  const finalHonesty = evaluateRuntimeHonesty(preparedFinal.clientScriptMarkdown, {
    targetSeconds: finalTargets.targetSeconds,
    wordBudget: finalTargets.wordBudget,
    modelStatus: runtimeEdit?.status,
    modelRevisedVoWords: runtimeEdit?.revisedVoWords
  });
  if (finalHonesty.errors.length > 0) {
    throw new Error(`Final script failed runtime gate: ${finalHonesty.errors.join(" ")}`);
  }
  if (finalHonesty.warnings.length > 0) {
    await repository.event(job.id, STAGES.FINAL, `Final script runtime warnings (${finalHonesty.warnings.length}).`, "warn", {
      kind: "runtime_gate_final",
      warnings: finalHonesty.warnings,
      metrics: finalHonesty.metrics
    });
  }

  await repository.artifact(job.id, "client_script", "Client Script", preparedFinal, preparedFinal.clientScriptMarkdown);
  await repository.artifact(job.id, "producer_notes", "Producer Notes", preparedFinal, preparedFinal.producerNotesMarkdown);
  await repository.artifact(job.id, "final_script", "Final Script", preparedFinal, preparedFinal.clientScriptMarkdown);

  await repository.updateJob(job.id, {
    status: STATUS.COMPLETE,
    current_stage: STAGES.FINAL,
    completed_at: new Date().toISOString(),
    total_input_tokens: totals.inputTokens,
    total_output_tokens: totals.outputTokens,
    total_cost_usd: Number(totals.costUsd.toFixed(6)),
    model_name: totals.modelName
  });
  await repository.event(job.id, STAGES.FINAL, formatTotalsMessage(totals), "info", {
    kind: "workflow_totals",
    total_input_tokens: totals.inputTokens,
    total_output_tokens: totals.outputTokens,
    total_cost_usd: Number(totals.costUsd.toFixed(6)),
    model_name: totals.modelName,
    stages: totals.stages,
    unpriced_stages: totals.unpricedStages
  });
  await repository.event(job.id, STAGES.FINAL, "Workflow complete.", "info", { kind: "workflow_complete" });

  return { status: STATUS.COMPLETE, diagnosis, mined, strategy, blueprint, draft, runtimeEdit, critique, final: preparedFinal, totals };
}

function formatTotalsMessage(totals) {
  const tokens = totals.inputTokens + totals.outputTokens;
  if (totals.unpricedStages > 0 && totals.costUsd === 0) {
    return `Run used ${tokens.toLocaleString()} tokens across ${totals.stages} stage(s). Cost not priced (set OPENAI_INPUT_PRICE_PER_MTOK and OPENAI_OUTPUT_PRICE_PER_MTOK or use a known model).`;
  }
  return `Run used ${tokens.toLocaleString()} tokens across ${totals.stages} stage(s). Estimated cost $${totals.costUsd.toFixed(4)}.`;
}

async function withStageMetrics({ modelClient, repository, jobId, stage, agentName, run, totals }) {
  const started = Date.now();
  const result = await run();
  const durationMs = Date.now() - started;
  const meta = typeof modelClient?.getLastResponseMeta === "function" ? modelClient.getLastResponseMeta() : null;
  const usage = meta?.usage;
  const modelName = stripModelPrefix(modelClient?.name);
  const cost = usage
    ? computeCostUsd({
        model: modelName,
        inputTokens: usage.input_tokens,
        outputTokens: usage.output_tokens
      })
    : { costUsd: null, priceSource: "no_usage" };

  if (totals && usage) {
    totals.inputTokens += Number(usage.input_tokens) || 0;
    totals.outputTokens += Number(usage.output_tokens) || 0;
    if (cost.costUsd != null) totals.costUsd += cost.costUsd;
    if (modelName) totals.modelName = modelName;
    totals.stages += 1;
    if (cost.priceSource && cost.priceSource !== "table" && cost.priceSource !== "env_override") {
      totals.unpricedStages += 1;
    }
  }

  await repository.event(jobId, stage, `${humanAgentName(agentName)} finished in ${formatDuration(durationMs)}.`, "info", {
    kind: "stage_metrics",
    agent: agentName,
    stage,
    duration_ms: durationMs,
    model: modelClient?.name,
    model_name: modelName,
    usage,
    response_id: meta?.response_id,
    input_tokens: usage?.input_tokens ?? null,
    output_tokens: usage?.output_tokens ?? null,
    cost_usd: cost.costUsd,
    price_source: cost.priceSource
  });
  return result;
}

function createCostTotals() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    costUsd: 0,
    stages: 0,
    unpricedStages: 0,
    modelName: null
  };
}

function stripModelPrefix(name) {
  if (!name || typeof name !== "string") return name || null;
  return name.replace(/^openai:/, "");
}

function humanAgentName(agentName) {
  const map = {
    diagnoser: "Brief diagnosis",
    miner: "Source mining",
    strategist: "Concept strategy",
    producer: "Producer blueprint",
    writer: "Draft script",
    runtime_editor: "Runtime edit",
    critic: "Critique",
    formatter: "Final formatting"
  };
  return map[agentName] || agentName;
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function normalizeBrief(brief) {
  if (typeof brief === "string") {
    return { brief };
  }
  if (brief && typeof brief === "object") {
    return brief;
  }
  throw new Error("Job brief must be a string or object");
}

function applySelectedDirection(strategy, selectedDirectionId) {
  if (!selectedDirectionId) return strategy;

  const selectedDirection = strategy.directions.find((direction) => direction.id === selectedDirectionId);
  const fallbackDirection = selectedDirection || strategy.directions[0];

  return {
    ...strategy,
    needsDirectionChoice: false,
    recommendedDirectionId: fallbackDirection.id,
    selectedDirectionId,
    selectedDirection: fallbackDirection,
    selectionWarning: selectedDirection
      ? null
      : `Selected direction "${selectedDirectionId}" was not found on the regenerated strategy. Used "${fallbackDirection.id}" instead.`
  };
}
