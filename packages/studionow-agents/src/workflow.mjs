import { STATUS, STAGES } from "./stages.mjs";
import { loadReferencePack } from "./reference-loader.mjs";
import { runDiagnoser } from "./agents/diagnoser.mjs";
import { runMiner } from "./agents/miner.mjs";
import { runPlanner } from "./agents/planner.mjs";
import { runVisualIntake } from "./agents/visual-intake.mjs";
import { runStrategist } from "./agents/strategist.mjs";
import { runProducer } from "./agents/producer.mjs";
import { runWriter } from "./agents/writer.mjs";
import { runRuntimeEditor } from "./agents/runtime-editor.mjs";
import { runCritic } from "./agents/critic.mjs";
import { runFormatter } from "./agents/formatter.mjs";
import { runWriterProducer } from "./agents/writer-producer.mjs";
import { prepareFinalArtifacts, sanitizeClientMarkdown, sanitizeProducerNotesMarkdown } from "./final-artifacts.mjs";
import { formatExamplesForAgent, selectRelevantExamples, loadExamples } from "./example-memory.mjs";
import {
  validateDiagnosis,
  validateMined,
  validateVisualInventory,
  validateStrategy,
  validateBlueprint,
  validateDraft,
  validateRuntimeEdit,
  validateCritique,
  validateFormatted,
  validateWriterProducer,
  validatePlan
} from "./stage-schemas.mjs";
import { evaluateRuntimeHonesty, resolveRuntimeTargets } from "./runtime-gate.mjs";
import { computeCostUsd } from "./model/pricing.mjs";
import { pdfToImageAttachments } from "./pdf-extract.mjs";
import { findExampleLeaks } from "./taste-cards.mjs";

export const WORKFLOW_MODES = Object.freeze({
  FIRST_DRAFT: "first_draft",
  PRODUCTION: "production",
  FULL_PRODUCER: "full_producer"
});

export async function runStudioNowWorkflow({
  rootDir,
  modelClient,
  job,
  repository,
  maxRevisionLoops = 1,
  maxCostUsd = Number(process.env.MAX_JOB_COST_USD || 2),
  autoSelectDirection = false
}) {
  const rawBrief = normalizeBrief(job.brief);
  const workflowMode = resolveWorkflowMode(rawBrief.workflowMode || job.workflow_mode);

  // Safe draft/production modes run on a separate, self-contained path. One
  // Planner call replaces the diagnose/mine/strategize/blueprint chain, then a
  // combined writer produces the script and notes without the slow formatter.
  if (workflowMode === WORKFLOW_MODES.PRODUCTION || workflowMode === WORKFLOW_MODES.FIRST_DRAFT) {
    return runLeanProductionWorkflow({ rootDir, modelClient, job, repository, rawBrief, workflowMode, maxRevisionLoops, maxCostUsd });
  }

  const isFirstDraftMode = workflowMode === WORKFLOW_MODES.FIRST_DRAFT;
  const incomingAttachments = rawBrief.attachments || [];

  // First Draft mode: ignore attachments completely. No Storage download,
  // no PDF expansion, no Visual Intake. The agent works from brief text only.
  // This is the explicit fast path for text briefs and intake forms.
  let hydratedAttachments;
  let expandedAttachments;
  if (isFirstDraftMode) {
    hydratedAttachments = [];
    expandedAttachments = [];
  } else {
    hydratedAttachments = await hydrateStorageAttachments(incomingAttachments, repository);
    expandedAttachments = await expandPdfAttachments(hydratedAttachments);
  }

  const rawAttachments = expandedAttachments;
  const briefWithExpanded = { ...rawBrief, attachments: expandedAttachments };
  const brief = stripBinaryAttachments(briefWithExpanded);
  const attachments = brief.attachmentSummary || [];
  const totals = createCostTotals();

  await repository.updateJob(job.id, { status: STATUS.RUNNING, current_stage: STAGES.DIAGNOSIS });
  await repository.event(job.id, STAGES.DIAGNOSIS, `Workflow mode: ${workflowModeLabel(workflowMode)}.`, "info", {
    kind: "workflow_mode",
    workflow_mode: workflowMode,
    ignored_attachments: isFirstDraftMode ? incomingAttachments.length : 0
  });
  if (isFirstDraftMode && incomingAttachments.length > 0) {
    await repository.event(
      job.id,
      STAGES.DIAGNOSIS,
      `First Draft mode ignored ${incomingAttachments.length} attached file(s). Use Full Producer mode if the visuals or deck content matter for this brief.`,
      "info",
      { kind: "attachments_ignored", count: incomingAttachments.length }
    );
  }
  await repository.event(job.id, STAGES.DIAGNOSIS, "Diagnosing the assignment before writing.");
  const diagnosis = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    maxCostUsd,
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
    maxCostUsd,
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
      const normalized = normalizeMinedOutput(out, { diagnosis, brief });
      validateMined(normalized);
      return normalized;
    }
  });
  await repository.artifact(job.id, "source_mining", "Source Mining", mined);

  const imageAttachments = collectImageAttachments(rawAttachments);
  const visualCandidateCount = countVisualCandidates(rawAttachments);
  let visualInventory = { inventory: [], notes: "" };
  const visualAssets = buildVisualAssetManifest(imageAttachments);
  if (visualAssets.length > 0) {
    await repository.artifact(job.id, "visual_assets", "Visual Assets", {
      assets: visualAssets
    });
  }
  if (visualCandidateCount > 0 && isFirstDraftMode) {
    await repository.event(
      job.id,
      STAGES.VISUAL_INTAKE,
      `First Draft mode skipped visual intake for ${visualCandidateCount} attached visual file(s). Use Full Producer mode when asset-specific visuals matter.`,
      "info",
      { kind: "stage_skipped", workflow_mode: workflowMode, skipped_visual_files: visualCandidateCount }
    );
  } else if (imageAttachments.length > 0) {
    await repository.updateJob(job.id, { current_stage: STAGES.VISUAL_INTAKE });
    await repository.event(
      job.id,
      STAGES.VISUAL_INTAKE,
      `Running visual intake on ${imageAttachments.length} attached image(s).`
    );
    visualInventory = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      totals,
      maxCostUsd,
      stage: STAGES.VISUAL_INTAKE,
      agentName: "visual_intake",
      run: async () => {
        const out = await runVisualIntake({
          modelClient,
          references: await loadReferencePack(rootDir, ["production", "voice"]),
          brief,
          diagnosis,
          mined,
          imageAttachments
        });
        validateVisualInventory(out);
        return out;
      }
    });
    await repository.artifact(job.id, "visual_inventory", "Visual Inventory", visualInventory);
  }

  const relevantExamples = isExampleRetrievalEnabled()
    ? selectRelevantExamples({
        rootDir,
        brief,
        diagnosis,
        mined,
        limit: 3
      })
    : [];
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

  let strategy;
  if (isFirstDraftMode) {
    await repository.updateJob(job.id, { current_stage: STAGES.STRATEGY });
    strategy = buildFirstDraftStrategy({ diagnosis, mined });
    validateStrategy(strategy);
    await repository.event(
      job.id,
      STAGES.STRATEGY,
      "First Draft mode used a direct single-direction strategy instead of generating multiple concept options.",
      "info",
      { kind: "stage_shortcut", workflow_mode: workflowMode }
    );
  } else {
    await repository.updateJob(job.id, { current_stage: STAGES.STRATEGY });
    await repository.event(job.id, STAGES.STRATEGY, "Choosing the story engine and direction.");
    strategy = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      totals,
      maxCostUsd,
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
  }
  validateStrategy(strategy);
  await repository.artifact(job.id, "strategy", "Concept Strategy", strategy);

  if (!isFirstDraftMode && job.selected_direction_id) {
    await repository.event(job.id, STAGES.STRATEGY, `Using selected direction: ${strategy.recommendedDirectionId}.`, "info", {
      kind: "selected_direction",
      requested_direction_id: job.selected_direction_id,
      applied_direction_id: strategy.recommendedDirectionId
    });
  }

  if (!isFirstDraftMode && strategy.needsDirectionChoice && !job.selected_direction_id) {
    if (autoSelectDirection && Array.isArray(strategy.directions) && strategy.directions.length > 0) {
      const pick = strategy.recommendedDirectionId || strategy.directions[0].id;
      strategy = applySelectedDirection(strategy, pick);
      await repository.event(job.id, STAGES.STRATEGY, `Auto-selected direction "${strategy.recommendedDirectionId}" (no human in the loop).`, "info", {
        kind: "auto_selected_direction",
        applied_direction_id: strategy.recommendedDirectionId
      });
      await repository.artifact(job.id, "strategy", "Concept Strategy", strategy);
    } else {
      await repository.updateJob(job.id, {
        status: STATUS.WAITING_FOR_DIRECTION,
        current_stage: STAGES.STRATEGY
      });
      await repository.event(job.id, STAGES.STRATEGY, "Waiting for user to select a concept direction.");
      return { status: STATUS.WAITING_FOR_DIRECTION, diagnosis, mined, strategy };
    }
  }

  await repository.updateJob(job.id, { current_stage: STAGES.BLUEPRINT });
  await repository.event(job.id, STAGES.BLUEPRINT, "Building the producer blueprint.");
  const blueprint = await withStageMetrics({
    modelClient,
    repository,
    jobId: job.id,
    totals,
    maxCostUsd,
    stage: STAGES.BLUEPRINT,
    agentName: "producer",
    run: async () => {
      const out = await runProducer({
        modelClient,
        references: `${await loadReferencePack(rootDir, ["strategy", "production", "voice"])}${formatExamplesForAgent(relevantExamples, "producer")}`,
        brief,
        diagnosis,
        mined,
        strategy,
        visualInventory
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
    maxCostUsd,
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
        blueprint,
        visualInventory
      });
      validateDraft(out);
      return out;
    }
  });
  await repository.artifact(job.id, "draft_script", "Draft Script", draft, draft.markdown);

  let runtimeEdit;
  let critique;
  const loops = isFirstDraftMode ? 0 : maxRevisionLoops;

  for (let loop = 0; loop <= loops; loop += 1) {
    // Reset per-loop critique so a synthetic one from the previous iteration
    // (e.g. runtime gate forcing a revision) doesn't suppress the critic
    // on this new draft.
    critique = undefined;
    await repository.updateJob(job.id, { current_stage: STAGES.RUNTIME });
    await repository.event(job.id, STAGES.RUNTIME, "Checking VO density and runtime honesty.");
    runtimeEdit = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      totals,
      maxCostUsd,
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

    // Runtime gate has hard errors. Don't kill the job — turn it into a
    // forced revision so the writer gets a chance to trim. Only fail-hard
    // if we've already exhausted revision attempts.
    if (honesty.errors.length > 0 && loop < maxRevisionLoops) {
      const trimInstruction = `Runtime gate failed: ${honesty.errors.join(" ")} Your VO is over the hard ceiling. Cut the script to fit a word budget of ${runtimeTargets.wordBudget} VO words (hard ceiling ${honesty.metrics?.hardCeiling ?? "n/a"}). Trim weak transitions and redundant beats first. Keep the visual motif, structure, and direction from the blueprint intact.`;
      critique = {
        passes: false,
        score: 0,
        findings: [`Runtime gate: ${honesty.errors.join(" ")}`],
        requiredRevisions: [trimInstruction]
      };
      await repository.event(
        job.id,
        STAGES.RUNTIME,
        `Runtime gate over hard ceiling on loop ${loop + 1}. Forcing writer revision instead of failing the job.`,
        "warn",
        { kind: "runtime_gate_revision", loop: loop + 1, errors: honesty.errors, metrics: honesty.metrics }
      );
      await repository.artifact(job.id, "critique", `Critique ${loop + 1} (synthetic — runtime gate)`, critique);
      // Skip the critic for this loop; the revision is mandated by the runtime gate.
      if (loop === maxRevisionLoops) break;
      // Fall through to the existing revision block at the bottom of the loop.
    } else if (honesty.errors.length > 0) {
      // Exhausted revisions. Log loudly but keep the script — partial
      // delivery is more useful than a dead job. The reviewer sees the
      // warning and can decide whether to accept.
      await repository.event(
        job.id,
        STAGES.RUNTIME,
        `Runtime gate still over hard ceiling after ${maxRevisionLoops + 1} write attempt(s). Delivering best draft with explicit warning.`,
        "error",
        { kind: "runtime_gate_exhausted", errors: honesty.errors, metrics: honesty.metrics }
      );
    }

    await repository.event(
      job.id,
      STAGES.RUNTIME,
      honesty.warnings.length > 0
        ? `Deterministic runtime check: ${honesty.warnings.length} warning(s).`
        : (honesty.errors.length === 0 ? "Deterministic runtime check: OK." : "Deterministic runtime check: over budget, see above."),
      honesty.warnings.length > 0 || honesty.errors.length > 0 ? "warn" : "info",
      { kind: "runtime_gate", loop: loop + 1, warnings: honesty.warnings, errors: honesty.errors, metrics: honesty.metrics }
    );

    if (isFirstDraftMode) {
      await repository.event(
        job.id,
        STAGES.CRITIQUE,
        "First Draft mode skipped critic and revision loop. Use Full Producer mode for a producer-grade critique pass.",
        "info",
        { kind: "stage_skipped", workflow_mode: workflowMode }
      );
      critique = {
        passes: true,
        score: 0,
        findings: ["Critic skipped in First Draft mode."],
        requiredRevisions: []
      };
      break;
    }

    // Skip the critic if the runtime gate already produced a synthetic
    // critique. No point calling the critic on a script we already know is
    // over budget — the writer needs to trim first.
    if (!critique) {
      await repository.updateJob(job.id, { current_stage: STAGES.CRITIQUE });
      await repository.event(job.id, STAGES.CRITIQUE, "Running the ruthless critic pass.");
      critique = await withStageMetrics({
        modelClient,
        repository,
        jobId: job.id,
        totals,
        maxCostUsd,
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
    }

    if (critique.passes || loop === maxRevisionLoops) break;

    await repository.updateJob(job.id, { current_stage: STAGES.REVISION });
    await repository.event(job.id, STAGES.REVISION, "Revision requested by critic. Rewriting against required fixes.");
    draft = await withStageMetrics({
      modelClient,
      repository,
      jobId: job.id,
      totals,
      maxCostUsd,
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
    maxCostUsd,
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

  return { status: STATUS.COMPLETE, diagnosis, mined, visualInventory, strategy, blueprint, draft, runtimeEdit, critique, final: preparedFinal, totals };
}

// Lean Production Package mode. Self-contained so it cannot disturb the
// First Draft / Full Producer paths. One Planner call replaces the
// diagnose+mine+strategize+blueprint chain; then writer, deterministic
// runtime gate (with one forced trim if over budget), and producer notes.
// No standalone critic, no concept-option pause.
async function runLeanProductionWorkflow({ rootDir, modelClient, job, repository, rawBrief, workflowMode, maxRevisionLoops, maxCostUsd }) {
  const isFirstDraftMode = workflowMode === WORKFLOW_MODES.FIRST_DRAFT;
  const incomingAttachments = isFirstDraftMode ? [] : (rawBrief.attachments || []);
  const hydratedAttachments = await hydrateStorageAttachments(incomingAttachments, repository);
  const expandedAttachments = await expandPdfAttachments(hydratedAttachments);
  const rawAttachments = expandedAttachments;
  const brief = stripBinaryAttachments({ ...rawBrief, attachments: expandedAttachments });
  const totals = createCostTotals();
  const loops = Math.max(0, maxRevisionLoops);

  await repository.updateJob(job.id, { status: STATUS.RUNNING, current_stage: STAGES.DIAGNOSIS });
  await repository.event(job.id, STAGES.DIAGNOSIS, `Workflow mode: ${workflowModeLabel(workflowMode)}.`, "info", {
    kind: "workflow_mode",
    workflow_mode: workflowMode,
    ignored_attachments: isFirstDraftMode ? (rawBrief.attachments || []).length : 0
  });
  if (isFirstDraftMode && (rawBrief.attachments || []).length > 0) {
    await repository.event(
      job.id,
      STAGES.DIAGNOSIS,
      `Quick Draft ignored ${(rawBrief.attachments || []).length} attached file(s). Use Production Package or Deep Producer Review when deck/image content matters.`,
      "info",
      { kind: "attachments_ignored", count: (rawBrief.attachments || []).length }
    );
  }

  // 1. Optional visual intake (only when images/decks are attached).
  const imageAttachments = collectImageAttachments(rawAttachments);
  let visualInventory = { inventory: [], notes: "" };
  const visualAssets = buildVisualAssetManifest(imageAttachments);
  if (visualAssets.length > 0) {
    await repository.artifact(job.id, "visual_assets", "Visual Assets", {
      assets: visualAssets
    });
  }
  if (imageAttachments.length > 0) {
    await repository.updateJob(job.id, { current_stage: STAGES.VISUAL_INTAKE });
    await repository.event(job.id, STAGES.VISUAL_INTAKE, `Running visual intake on ${imageAttachments.length} attached image(s).`);
    visualInventory = await withStageMetrics({
      modelClient, repository, jobId: job.id, totals, maxCostUsd,
      stage: STAGES.VISUAL_INTAKE, agentName: "visual_intake",
      run: async () => {
        const out = await runVisualIntake({
          modelClient,
          references: await loadReferencePack(rootDir, ["production", "voice"]),
          brief, diagnosis: null, mined: null, imageAttachments
        });
        validateVisualInventory(out);
        return out;
      }
    });
    await repository.artifact(job.id, "visual_inventory", "Visual Inventory", visualInventory);
  }

  // 2. One planning call (diagnose + mine + strategy + blueprint).
  await repository.updateJob(job.id, { current_stage: STAGES.STRATEGY });
  await repository.event(job.id, STAGES.STRATEGY, "Planning the production in one pass (diagnose, mine, strategy, blueprint).");
  const plan = await withStageMetrics({
    modelClient, repository, jobId: job.id, totals, maxCostUsd,
    stage: STAGES.BLUEPRINT, agentName: "planner",
    run: async () => {
      const out = await runPlanner({
        modelClient,
        references: await loadReferencePack(rootDir, ["context", "diagnosis", "strategy", "production", "voice"]),
        brief,
        visualInventory
      });
      validatePlan(out);
      return out;
    }
  });
  const diagnosis = plan.diagnosis;
  const mined = normalizeMinedOutput(plan.mined, { diagnosis, brief });
  const strategy = plan.strategy;
  const blueprint = plan.blueprint;
  await repository.artifact(job.id, "diagnosis", "Brief Diagnosis", diagnosis);
  await repository.artifact(job.id, "source_mining", "Source Mining", mined);
  await repository.artifact(job.id, "strategy", "Concept Strategy", strategy);
  await repository.artifact(job.id, "script_blueprint", "Script Blueprint", blueprint);

  // 3. Example retrieval is opt-in. Production defaults to no per-job samples.
  let relevantExamples = [];
  if (isExampleRetrievalEnabled()) {
    const allExamples = await loadExamples({ rootDir, repository });
    relevantExamples = selectRelevantExamples({ rootDir, examples: allExamples, brief, diagnosis, mined, limit: 3 });
  }
  if (relevantExamples.length > 0 && typeof repository.exampleUsage === "function") {
    await repository.exampleUsage(job.id, relevantExamples);
  }
  if (relevantExamples.length > 0) {
    const goldCount = relevantExamples.filter(e => e.quality === "gold").length;
    await repository.event(job.id, STAGES.STRATEGY, `Retrieved ${relevantExamples.length} example(s)${goldCount > 0 ? ` (${goldCount} gold)` : ""}.`, "info", {
      kind: "example_retrieval",
      examples: relevantExamples.map(e => ({ id: e.id, projectName: e.projectName, quality: e.quality, relevanceScore: e.relevanceScore }))
    });
  } else if (!isExampleRetrievalEnabled()) {
    await repository.event(job.id, STAGES.STRATEGY, "Example retrieval opted out via ENABLE_EXAMPLE_RETRIEVAL=false. Using current brief and attached materials only.", "info", {
      kind: "example_retrieval_disabled"
    });
  }

  // 3b. Load learning rules from Supabase (accumulated feedback patterns as hard constraints).
  let learningRulesBlock = "";
  if (typeof repository.loadActiveLearningRules === "function") {
    try {
      const rules = await repository.loadActiveLearningRules("writer_producer");
      if (rules.length > 0) {
        learningRulesBlock = "\n\n## LEARNING RULES (HARD CONSTRAINTS)\n\nThese rules come from accumulated reviewer feedback. Follow every one.\n\n" + rules.map((r, i) => `${i + 1}. ${r}`).join("\n");
        await repository.event(job.id, STAGES.DRAFT, `Loaded ${rules.length} active learning rule(s).`, "info", { kind: "learning_rules", count: rules.length });
      }
    } catch (err) {
      console.warn("Failed to load learning rules:", err.message);
    }
  }

  // 4. Combined Writer + Producer Notes (single call replaces writer, runtime editor, formatter).
  await repository.updateJob(job.id, { current_stage: STAGES.DRAFT });
  await repository.event(job.id, STAGES.DRAFT, "Writing script and producer notes.");
  let writerResult = await withStageMetrics({
    modelClient, repository, jobId: job.id, totals, maxCostUsd,
    stage: STAGES.DRAFT, agentName: "writer_producer",
    run: async () => {
      const out = await runWriterProducer({
        modelClient,
        references: `${await loadReferencePack(rootDir, ["voice", "format", "production"])}${formatExamplesForAgent(relevantExamples, "writer")}${learningRulesBlock}`,
        brief, diagnosis, mined, strategy, blueprint, visualInventory
      });
      validateWriterProducer(out);
      return out;
    }
  });
  await repository.artifact(job.id, "draft_script", "Draft Script", writerResult, writerResult.clientScriptMarkdown);

  // 5. Deterministic runtime gate (code-only, no model call).
  // If over the hard ceiling, force one trim via the combined agent.
  const targets = resolveRuntimeTargets({ brief, diagnosis, blueprint });
  const measured = evaluateRuntimeHonesty(writerResult.clientScriptMarkdown, {
    targetSeconds: targets.targetSeconds,
    wordBudget: targets.wordBudget
  });
  const runtimeEdit = {
    status: measured.errors.length > 0 ? "cut_required" : "within_budget",
    originalVoWords: measured.metrics?.vo_words_measured ?? writerResult.voWordCount ?? 0,
    revisedVoWords: measured.metrics?.vo_words_measured ?? writerResult.voWordCount ?? 0,
    notes: [...measured.errors, ...measured.warnings],
    markdown: writerResult.clientScriptMarkdown,
    deterministic: true
  };
  await repository.event(
    job.id, STAGES.RUNTIME,
    measured.errors.length > 0
      ? `Runtime gate: over budget (${measured.errors.join(" ")}). Forcing one trim.`
      : (measured.warnings.length > 0 ? `Runtime check: ${measured.warnings.length} warning(s).` : "Runtime check: OK."),
    measured.errors.length > 0 ? "warn" : "info",
    { kind: "runtime_gate", warnings: measured.warnings, errors: measured.errors, metrics: measured.metrics }
  );

  if (measured.errors.length > 0 && loops > 0) {
    await repository.updateJob(job.id, { current_stage: STAGES.REVISION });
    await repository.event(job.id, STAGES.REVISION, "Trimming script to meet word budget.");
    writerResult = await withStageMetrics({
      modelClient, repository, jobId: job.id, totals, maxCostUsd,
      stage: STAGES.REVISION, agentName: "writer_producer",
      run: async () => {
        const out = await runWriterProducer({
          modelClient,
          references: `${await loadReferencePack(rootDir, ["voice", "format", "production"])}${formatExamplesForAgent(relevantExamples, "writer")}`,
          brief, diagnosis, mined, strategy, blueprint, visualInventory,
          currentDraft: writerResult,
          trimInstruction: `${measured.errors.join(" ")} Cut to ${targets.wordBudget} VO words max.`
        });
        validateWriterProducer(out);
        return out;
      }
    });
    await repository.artifact(job.id, "revision", "Revision 1", writerResult, writerResult.clientScriptMarkdown);
    runtimeEdit.revisedVoWords = writerResult.voWordCount;
    runtimeEdit.markdown = writerResult.clientScriptMarkdown;
    runtimeEdit.status = "within_budget";
  }

  // 5b. Leak gate (code-only): no distinctive token from a retrieved example
  // may appear in the output unless it is also in the brief. Cards make this
  // nearly impossible; the gate is the regression net. One forced rewrite,
  // then deliver-with-error-event so a human sees it.
  if (relevantExamples.length > 0) {
    const briefTextForGate = typeof brief === "string" ? brief : brief.brief || "";
    let leaks = findExampleLeaks({
      outputText: `${writerResult.clientScriptMarkdown}\n${writerResult.producerNotesMarkdown || ""}`,
      briefText: briefTextForGate,
      examples: relevantExamples
    });
    if (leaks.length > 0 && loops > 0) {
      await repository.event(job.id, STAGES.REVISION, `Leak gate: ${leaks.length} token(s) from retrieved examples found in output (${leaks.map((l) => l.token).join(", ")}). Forcing one rewrite.`, "warn", {
        kind: "leak_gate_revision", leaks
      });
      writerResult = await withStageMetrics({
        modelClient, repository, jobId: job.id, totals, maxCostUsd,
        stage: STAGES.REVISION, agentName: "writer_producer",
        run: async () => {
          const out = await runWriterProducer({
            modelClient,
            references: `${await loadReferencePack(rootDir, ["voice", "format", "production"])}${formatExamplesForAgent(relevantExamples, "writer")}`,
            brief, diagnosis, mined, strategy, blueprint, visualInventory,
            currentDraft: writerResult,
            trimInstruction: `Remove every occurrence of the following terms — they belong to other clients' projects and must not appear in this script or its producer notes: ${leaks.map((l) => `"${l.token}"`).join(", ")}. Replace each with material from the current brief only. Change nothing else.`
          });
          validateWriterProducer(out);
          return out;
        }
      });
      await repository.artifact(job.id, "revision", "Leak-gate rewrite", writerResult, writerResult.clientScriptMarkdown);
      leaks = findExampleLeaks({
        outputText: `${writerResult.clientScriptMarkdown}\n${writerResult.producerNotesMarkdown || ""}`,
        briefText: briefTextForGate,
        examples: relevantExamples
      });
    }
    if (leaks.length > 0) {
      await repository.event(job.id, STAGES.FINAL, `Leak gate: ${leaks.length} example token(s) still present after rewrite (${leaks.map((l) => l.token).join(", ")}). Review before client delivery.`, "error", {
        kind: "leak_gate_failed", leaks
      });
    } else {
      await repository.event(job.id, STAGES.FINAL, "Leak gate: clean. No example content in output.", "info", { kind: "leak_gate_clean" });
    }
  }

  // 6. Assemble final artifacts (no model call — just cleanup).
  await repository.updateJob(job.id, { current_stage: STAGES.FINAL });
  await repository.event(job.id, STAGES.FINAL, "Assembling final deliverables.");
  const critique = { passes: true, score: 0, findings: ["Production Package mode: runtime gate enforced."], requiredRevisions: [] };
  const draft = writerResult;
  const clientScriptMarkdown = sanitizeClientMarkdown(writerResult.clientScriptMarkdown);
  const producerNotesMarkdown = sanitizeProducerNotesMarkdown(writerResult.producerNotesMarkdown || "# PRODUCER NOTES\n\n## Notes\n- No producer notes were generated.");
  const preparedFinal = {
    clientScriptMarkdown,
    producerNotesMarkdown,
    finalMarkdown: clientScriptMarkdown,
    combinedMarkdown: `${clientScriptMarkdown}\n\n---\n\n${producerNotesMarkdown}`.trim(),
    deliveryChecklist: []
  };

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

  return { status: STATUS.COMPLETE, diagnosis, mined, visualInventory, strategy, blueprint, draft, runtimeEdit, critique, final: preparedFinal, totals };
}

function formatTotalsMessage(totals) {
  const tokens = totals.inputTokens + totals.outputTokens;
  if (totals.unpricedStages > 0 && totals.costUsd === 0) {
    return `Run used ${tokens.toLocaleString()} tokens across ${totals.stages} stage(s). Cost not priced (set OPENAI_INPUT_PRICE_PER_MTOK and OPENAI_OUTPUT_PRICE_PER_MTOK or use a known model).`;
  }
  return `Run used ${tokens.toLocaleString()} tokens across ${totals.stages} stage(s). Estimated cost $${totals.costUsd.toFixed(4)}.`;
}

async function withStageMetrics({ modelClient, repository, jobId, stage, agentName, run, totals, maxCostUsd }) {
  const started = Date.now();
  const result = await run();
  const durationMs = Date.now() - started;
  const meta = typeof modelClient?.getLastResponseMeta === "function" ? modelClient.getLastResponseMeta() : null;
  const usage = meta?.usage;
  const modelName = stripModelPrefix(meta?.model || modelClient?.name);
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

  if (Number.isFinite(maxCostUsd) && maxCostUsd > 0 && totals && totals.costUsd > maxCostUsd) {
    await repository.event(jobId, stage, `Aborting job: spent $${totals.costUsd.toFixed(4)}, over the $${maxCostUsd.toFixed(2)} cap.`, "error", {
      kind: "cost_cap_exceeded",
      total_cost_usd: totals.costUsd,
      max_cost_usd: maxCostUsd
    });
    const err = new Error(`Cost cap exceeded: $${totals.costUsd.toFixed(4)} > $${maxCostUsd.toFixed(2)}`);
    err.code = "COST_CAP_EXCEEDED";
    throw err;
  }
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

async function hydrateStorageAttachments(attachments, repository) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const out = [];
  for (const file of attachments) {
    if (!file) continue;
    if (file.base64) {
      out.push(file);
      continue;
    }
    if (file.storagePath && typeof repository?.downloadFromStorage === "function") {
      const buf = await repository.downloadFromStorage({
        bucket: file.storageBucket || "script-uploads",
        path: file.storagePath
      });
      out.push({
        ...file,
        base64: buf.toString("base64")
      });
      continue;
    }
    out.push(file);
  }
  return out;
}

async function expandPdfAttachments(attachments) {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const out = [];
  let assetIndex = 1;
  for (const file of attachments) {
    if (!file) continue;
    if (file.mediaType === "application/pdf" && file.base64) {
      const pages = await pdfToImageAttachments({
        pdfBase64: file.base64,
        source: file.source || file.filename || "uploaded pdf",
        filename: file.filename || null,
        startAssetIndex: assetIndex
      });
      out.push(...pages);
      assetIndex += pages.length;
      continue;
    }
    if (file.mediaType && file.base64) {
      out.push({
        ...file,
        id: file.id || `Asset ${assetIndex}`
      });
      assetIndex += 1;
      continue;
    }
    out.push(file);
  }
  return out;
}

function stripBinaryAttachments(brief) {
  if (!brief || typeof brief !== "object") return brief;
  const { attachments, ...rest } = brief;
  if (!Array.isArray(attachments) || attachments.length === 0) {
    return rest;
  }
  const summary = attachments.map((file) => {
    if (!file) return null;
    return {
      id: file.id || null,
      source: file.source || file.filename || "uploaded",
      filename: file.filename || null,
      mediaType: file.mediaType || null,
      hasImage: Boolean(file.base64)
    };
  }).filter(Boolean);
  return { ...rest, attachmentSummary: summary };
}

function collectImageAttachments(attachments) {
  if (!Array.isArray(attachments)) return [];
  const out = [];
  let counter = 0;
  for (const file of attachments) {
    if (!file || !file.base64 || !file.mediaType) continue;
    if (!String(file.mediaType).startsWith("image/")) continue;
    counter += 1;
    out.push({
      id: file.id || `Asset ${counter}`,
      source: file.source || file.filename || "uploaded image",
      filename: file.filename || null,
      mediaType: file.mediaType,
      base64: file.base64,
      detail: file.detail
    });
  }
  return out;
}

function buildVisualAssetManifest(imageAttachments) {
  if (!Array.isArray(imageAttachments) || imageAttachments.length === 0) return [];
  const maxAssets = Number(process.env.MAX_VISUAL_ASSET_THUMBNAILS || 40);
  const maxBase64Chars = Number(process.env.MAX_VISUAL_ASSET_BASE64_CHARS || 1200000);
  return imageAttachments.slice(0, maxAssets).map((image) => {
    const data = typeof image.base64 === "string" && image.base64.length <= maxBase64Chars
      ? image.base64
      : null;
    return {
      id: image.id,
      source: image.source || image.filename || image.id,
      filename: image.filename || null,
      mediaType: image.mediaType || "image/jpeg",
      data,
      omitted: data ? false : true
    };
  });
}

function countVisualCandidates(attachments) {
  if (!Array.isArray(attachments)) return 0;
  return attachments.filter((file) => {
    if (!file || !file.mediaType) return false;
    const mediaType = String(file.mediaType);
    return mediaType.startsWith("image/") || mediaType === "application/pdf";
  }).length;
}

function normalizeMinedOutput(mined, { diagnosis, brief } = {}) {
  const out = mined && typeof mined === "object" && !Array.isArray(mined) ? { ...mined } : {};
  const assetNotes = out.assetNotes && typeof out.assetNotes === "object" && !Array.isArray(out.assetNotes)
    ? { ...out.assetNotes }
    : {};

  out.humanTension = firstNonEmptyString(
    out.humanTension,
    out.openingTension,
    out.tension,
    out.coreTension,
    diagnosis?.openingTension,
    extractBriefLine(brief, "Human Tension"),
    extractBriefLine(brief, "Opening Tension"),
    "The audience needs a clear reason to care before the solution or offer can land."
  );
  out.metrics = ensureArray(out.metrics);
  out.strategicFrameworks = ensureArray(out.strategicFrameworks);
  out.brandLanguage = ensureArray(out.brandLanguage);
  out.clearanceFlags = ensureArray(out.clearanceFlags);
  out.usableAmmunition = ensureArray(out.usableAmmunition);
  out.assetNotes = {
    existing: firstNonEmptyString(
      assetNotes.existing,
      assetNotes.current,
      diagnosis?.existingAssets,
      extractBriefLine(brief, "Existing Assets"),
      "Not specified"
    ),
    missing: firstNonEmptyString(
      assetNotes.missing,
      assetNotes.needed,
      extractBriefLine(brief, "Missing Assets"),
      "Not specified"
    )
  };

  return out;
}

function firstNonEmptyString(...values) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
}

function ensureArray(value) {
  if (Array.isArray(value)) return value;
  if (value == null || value === "") return [];
  return [value];
}

function extractBriefLine(brief, label) {
  const text = typeof brief === "string" ? brief : brief?.brief || brief?.text || "";
  if (!text) return "";
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = text.match(new RegExp(`^\\s*${escaped}\\s*:\\s*(.+)$`, "im"));
  return match?.[1] || "";
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

function resolveWorkflowMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === WORKFLOW_MODES.FIRST_DRAFT || mode === "fast" || mode === "draft") {
    return WORKFLOW_MODES.FIRST_DRAFT;
  }
  if (mode === WORKFLOW_MODES.PRODUCTION || mode === "package" || mode === "production_package") {
    return WORKFLOW_MODES.PRODUCTION;
  }
  if (mode === WORKFLOW_MODES.FULL_PRODUCER || mode === "full" || mode === "producer" || mode === "deep") {
    return WORKFLOW_MODES.FULL_PRODUCER;
  }
  return WORKFLOW_MODES.PRODUCTION;
}

function workflowModeLabel(mode) {
  if (mode === WORKFLOW_MODES.FIRST_DRAFT) return "Quick Draft";
  if (mode === WORKFLOW_MODES.PRODUCTION) return "Safe Production Package";
  return "Deep Producer Review";
}

function isExampleRetrievalEnabled() {
  // Retrieval is ON by default. The June 2026 contamination incident was
  // fixed structurally — prompts receive taste cards (structural facts with
  // scrubbed lessons), never example text — and the leak gate verifies the
  // output. Set ENABLE_EXAMPLE_RETRIEVAL=false to opt out.
  const value = String(process.env.ENABLE_EXAMPLE_RETRIEVAL || "").trim().toLowerCase();
  if (value === "0" || value === "false" || value === "no" || value === "off") return false;
  return true;
}

function buildFirstDraftStrategy({ diagnosis, mined }) {
  const direction = {
    id: "direct-first-draft",
    name: "Direct First Draft",
    coreEngine: inferCoreEngine(diagnosis, mined),
    whatMakesItWork: "Gets to a credible, editable script quickly by using the diagnosed tension and mined proof without pausing for concept options.",
    mainRisk: "Less producer-level exploration; visual motif and transitions may need a human or Full Producer pass.",
    whyItFits: "Best when the priority is a strong starting draft instead of a fully challenged producer blueprint."
  };

  return {
    needsDirectionChoice: false,
    directions: [direction],
    recommendedDirectionId: direction.id,
    selectedDirection: direction,
    storyArc: {
      act1: diagnosis?.openingTension || mined?.humanTension || "Open on the audience tension.",
      act2: "Use the strongest proof, behaviors, and brand details from the brief to make the idea concrete.",
      act3: diagnosis?.closingMove || "Land the assignment with a clear closing move and end feeling."
    },
    workflowMode: WORKFLOW_MODES.FIRST_DRAFT
  };
}

function inferCoreEngine(diagnosis, mined) {
  const format = String(diagnosis?.format || "").toLowerCase();
  const metrics = Array.isArray(mined?.metrics) ? mined.metrics : [];
  const frameworks = Array.isArray(mined?.strategicFrameworks) ? mined.strategicFrameworks : [];
  if (frameworks.length > 0) return "Framework";
  if (metrics.length > 0 || format.includes("case") || format.includes("award")) return "Proof";
  if (format.includes("explainer") || format.includes("training")) return "Reveal";
  if (format.includes("sizzle")) return "Escalation";
  return "Tension to Resolution";
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
