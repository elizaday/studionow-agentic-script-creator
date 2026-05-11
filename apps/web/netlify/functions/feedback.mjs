import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";

const VERDICTS = new Set(["gold_candidate", "usable", "needs_work", "miss", "needs_review"]);

export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const feedback = normalizeFeedback(body);
    const supabase = getSupabaseClient({ service: true });

    const { data, error } = await supabase
      .from("script_feedback")
      .insert(feedback)
      .select("*")
      .single();

    if (error) throw error;

    const jobPatch = {
      review_status: feedback.promote_to_gold ? "gold_candidate" : "reviewed",
      human_rating: feedback.rating ?? null,
      human_verdict: feedback.verdict
    };

    const { error: updateError } = await supabase
      .from("script_jobs")
      .update(jobPatch)
      .eq("id", feedback.job_id);

    if (updateError) throw updateError;

    await supabase.from("script_job_events").insert({
      job_id: feedback.job_id,
      stage: "feedback",
      level: "info",
      message: feedback.promote_to_gold
        ? "Human feedback marked this run as a gold candidate."
        : "Human feedback was captured.",
      payload: {
        feedback_id: data.id,
        rating: feedback.rating,
        verdict: feedback.verdict,
        category: feedback.category,
        promote_to_gold: feedback.promote_to_gold
      }
    });

    return jsonResponse({ feedback: data }, 201);
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not save feedback" }, 500);
  }
}

function normalizeFeedback(body) {
  if (!body?.jobId) throw new Error("jobId is required");
  const rating = body.rating === "" || body.rating == null ? null : Number(body.rating);
  if (rating != null && (!Number.isInteger(rating) || rating < 1 || rating > 5)) {
    throw new Error("rating must be an integer from 1 to 5");
  }

  const verdict = VERDICTS.has(body.verdict) ? body.verdict : "needs_review";

  return {
    job_id: body.jobId,
    artifact_id: body.artifactId || null,
    rating,
    verdict,
    category: body.category || null,
    comment: body.comment?.trim() || null,
    suggested_fix: body.suggestedFix?.trim() || null,
    promote_to_gold: Boolean(body.promoteToGold || verdict === "gold_candidate"),
    reviewer_name: body.reviewerName?.trim() || null,
    reviewer_email: body.reviewerEmail?.trim() || null
  };
}

export const config = {
  path: "/api/jobs/feedback"
};
