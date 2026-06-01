import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";

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

    // 2. Build the example row
    const projectName = candidate.project_name || "Gold Example";
    const tags = Array.isArray(candidate.tags) && candidate.tags.length > 0
      ? [...new Set([...candidate.tags, "gold", "human-edited"])]
      : ["gold", "human-edited"];
    const teachingPoints = Array.isArray(candidate.teaching_points) && candidate.teaching_points.length > 0
      ? candidate.teaching_points
      : [candidate.why_gold, candidate.what_changed].filter(Boolean);
    const scriptText = candidate.final_script_text || "";
    const scriptExcerpt = scriptText.slice(0, 2000);
    const briefText = candidate.brief_text || "";
    const retrievalText = [projectName, briefText.slice(0, 500), tags.join(" "), scriptExcerpt.slice(0, 500)].join("\n");

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
        tags,
        brief_text: briefText,
        script_text: scriptText,
        script_excerpt: scriptExcerpt,
        retrieval_text: retrievalText,
        teaching_points: teachingPoints.length > 0 ? teachingPoints : ["Human-approved gold standard."],
        notes: `Promoted from gold candidate ${candidateId}. Reviewer: ${candidate.reviewer_name || body.reviewerName || "unknown"}.`,
        source_gold_candidate_id: candidateId,
        status: "active"
      })
      .select("id")
      .single();
    if (insertErr) throw insertErr;

    // 4. Update gold candidate status
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

    // 5. Log the event on the parent job if present
    if (candidate.job_id) {
      await supabase.from("script_job_events").insert({
        job_id: candidate.job_id,
        stage: "gold_ingestion",
        level: "info",
        message: `Gold candidate approved and ingested as example ${example.id}. It will be available to the agent on the next run.`,
        payload: { gold_candidate_id: candidateId, example_id: example.id }
      });
    }

    return jsonResponse({
      ok: true,
      exampleId: example.id,
      message: "Gold candidate approved and ingested. The agent will use it on the next script."
    });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not approve gold candidate" }, 500);
  }
}

export const config = {
  path: "/api/jobs/approve-gold"
};
