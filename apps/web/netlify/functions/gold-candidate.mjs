import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";

const MAX_FINAL_SCRIPT_BYTES = 5 * 1024 * 1024;

export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const candidate = normalizeCandidate(body);

    const supabase = getSupabaseClient({ service: true });

    const { data: job, error: jobErr } = await supabase
      .from("script_jobs")
      .select("id, brief")
      .eq("id", candidate.job_id)
      .single();
    if (jobErr) throw jobErr;
    if (!job) throw new Error(`Job not found: ${candidate.job_id}`);

    candidate.brief_text = candidate.brief_text || job.brief?.brief || "";
    if (!candidate.brief_text) throw new Error("Original brief text could not be resolved");

    if (candidate.artifact_id) {
      const { data: artifact } = await supabase
        .from("script_artifacts")
        .select("markdown")
        .eq("id", candidate.artifact_id)
        .single();
      if (artifact?.markdown) candidate.agent_draft_markdown = artifact.markdown;
    }

    const { data, error } = await supabase
      .from("script_gold_candidates")
      .insert(candidate)
      .select("*")
      .single();
    if (error) throw error;

    await supabase
      .from("script_jobs")
      .update({ review_status: "gold_candidate" })
      .eq("id", candidate.job_id);

    await supabase.from("script_job_events").insert({
      job_id: candidate.job_id,
      stage: "gold_candidate",
      level: "info",
      message: `Reviewer ${candidate.reviewer_name || candidate.reviewer_email || "anonymous"} submitted a gold candidate.`,
      payload: { gold_candidate_id: data.id }
    });

    return jsonResponse({ goldCandidate: data }, 201);
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not save gold candidate" }, 500);
  }
}

function normalizeCandidate(body) {
  if (!body?.jobId) throw new Error("jobId is required");
  if (!body?.finalScript) throw new Error("finalScript is required");

  const finalScript = body.finalScript;
  const hasText = typeof finalScript.text === "string" && finalScript.text.trim().length > 0;
  const hasFile = typeof finalScript.base64 === "string" && finalScript.base64.length > 0;
  if (!hasText && !hasFile) {
    throw new Error("finalScript must include either text or a base64-encoded file");
  }

  let base64 = null;
  let filename = null;
  let mediaType = null;
  if (hasFile) {
    base64 = finalScript.base64;
    filename = finalScript.filename || null;
    mediaType = finalScript.mediaType || null;
    const approxBytes = Math.floor((base64.length * 3) / 4);
    if (approxBytes > MAX_FINAL_SCRIPT_BYTES) {
      throw new Error(`finalScript file exceeds ${Math.floor(MAX_FINAL_SCRIPT_BYTES / 1024 / 1024)}MB limit`);
    }
  }

  const finalText = hasText
    ? finalScript.text.trim()
    : "(uploaded file — see attachment)";

  return {
    job_id: body.jobId,
    artifact_id: body.artifactId || null,
    reviewer_name: body.reviewerName?.trim() || null,
    reviewer_email: body.reviewerEmail?.trim() || null,
    brief_text: body.briefText?.trim() || null,
    final_script_text: finalText,
    final_script_filename: filename,
    final_script_media_type: mediaType,
    final_script_base64: base64,
    why_gold: body.whyGold?.trim() || null,
    what_changed: body.whatChanged?.trim() || null,
    status: "pending"
  };
}

export const config = {
  path: "/api/jobs/gold-candidate"
};
