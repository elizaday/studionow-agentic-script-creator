import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";
import { buildGoldImprovement, insertDraftLearningRules } from "./_self_improve.mjs";

/**
 * POST /api/jobs/approve-gold
 *
 * Approves a gold candidate and auto-ingests it into the script_examples table
 * so it's immediately available to the agent as a learning example.
 *
 * Body: { candidateId: string, reviewerName?: string }
 */
export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const candidateId = body?.candidateId;
    if (!candidateId) throw new Error("candidateId is required");

    const supabase = getSupabaseClient({ service: true });

    // 1. Read the gold candidate
    const { data: candidate, error: fetchErr } = await supabase
      .from("script_gold_candidates")
      .select("*")
      .eq("id", candidateId)
      .single();
    if (fetchErr) throw fetchErr;
    if (!candidate) throw new Error("Gold candidate not found");
    if (candidate.status === "ingested") throw new Error("Already ingested");

    // 2. Build the improved example row
    const projectName = candidate.project_name || "Gold Example";
    const scriptText = candidate.final_script_text || "";
    const briefText = candidate.brief_text || "";
    const improvement = buildGoldImprovement(candidate);

    // 3. Insert into script_examples
    const { data: example, error: insertErr } = await supabase
      .from("script_examples")
      .insert({
        project_name: projectName,
        client: candidate.client || null,
        quality: "gold",
        source_kind: "gold-candidate",
        pairing_confidence: "high",
        pairing_type: "brief-to-edited-script",
        tags: improvement.tags,
        brief_text: briefText,
        script_text: scriptText,
        script_excerpt: improvement.scriptExcerpt,
        retrieval_text: improvement.retrievalText,
        teaching_points: improvement.teachingPoints,
        notes: [
          `Promoted from gold candidate ${candidateId}. Reviewer: ${candidate.reviewer_name || body.reviewerName || "unknown"}.`,
          improvement.memoryCard
        ].filter(Boolean).join("\n\n"),
        source_gold_candidate_id: candidateId,
        status: "active"
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // 4. Propose draft learning rules from the approved gold pair.
    // Draft status is intentional: Mike can promote durable rules to active.
    const draftRules = await insertDraftLearningRules({
      supabase,
      rules: improvement.proposedRules,
      candidateId,
      exampleId: example.id
    });

    // 5. Update gold candidate status
    const { error: updateErr } = await supabase
      .from("script_gold_candidates")
      .update({
        status: "ingested",
        promoted_example_key: example.id,
        reviewed_by: body.reviewerName || candidate.reviewer_name || null,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", candidateId);
    if (updateErr) throw updateErr;

    // 6. Log the event on the parent job if present
    if (candidate.job_id) {
      await supabase.from("script_job_events").insert({
        job_id: candidate.job_id,
        stage: "gold_ingestion",
        level: "info",
        message: `Gold candidate approved and ingested as example ${example.id}. Proposed ${draftRules.length} draft learning rule(s).`,
        payload: {
          gold_candidate_id: candidateId,
          example_id: example.id,
          tags: improvement.tags,
          teaching_points: improvement.teachingPoints,
          draft_learning_rule_ids: draftRules.map((rule) => rule.id)
        }
      });
    }

    return jsonResponse({
      ok: true,
      exampleId: example.id,
      tags: improvement.tags,
      teachingPoints: improvement.teachingPoints,
      draftLearningRules: draftRules,
      message: draftRules.length > 0
        ? "Gold candidate approved, ingested, and draft learning rules proposed. The example is available on the next script."
        : "Gold candidate approved and ingested. The example is available on the next script."
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not approve gold candidate" }, 500);
  }
}

export const config = {
  path: "/api/jobs/approve-gold"
};
