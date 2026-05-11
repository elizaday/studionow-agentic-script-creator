import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    if (!body?.jobId) throw new Error("jobId is required");
    if (!body?.directionId) throw new Error("directionId is required");

    const supabase = getSupabaseClient({ service: true });
    const { data: strategyArtifact, error: strategyError } = await supabase
      .from("script_artifacts")
      .select("content")
      .eq("job_id", body.jobId)
      .eq("type", "strategy")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (strategyError) throw strategyError;

    const knownDirections = strategyArtifact?.content?.directions || [];
    if (
      knownDirections.length > 0
      && !knownDirections.some((direction) => direction.id === body.directionId)
    ) {
      throw new Error("directionId does not match this job's strategy directions");
    }

    const { data: job, error } = await supabase
      .from("script_jobs")
      .update({
        selected_direction_id: body.directionId,
        status: "queued",
        current_stage: "queued",
        error: null
      })
      .eq("id", body.jobId)
      .select("id,status,current_stage,selected_direction_id")
      .single();

    if (error) throw error;

    await supabase.from("script_job_events").insert({
      job_id: body.jobId,
      stage: "strategy",
      level: "info",
      message: `Direction selected: ${body.directionId}`,
      payload: { direction_id: body.directionId }
    });

    return jsonResponse({ job });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not select direction" }, 500);
  }
}

export const config = {
  path: "/api/jobs/select-direction"
};
