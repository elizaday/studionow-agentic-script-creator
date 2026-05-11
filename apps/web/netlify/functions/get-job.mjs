import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) return jsonResponse({ error: "id is required" }, 400);

  try {
    const supabase = getSupabaseClient({ service: true });
    const [{ data: job, error: jobError }, { data: events, error: eventsError }, { data: artifacts, error: artifactsError }] = await Promise.all([
      supabase.from("script_jobs").select("*").eq("id", id).single(),
      supabase.from("script_job_events").select("*").eq("job_id", id).order("created_at", { ascending: true }),
      supabase.from("script_artifacts").select("*").eq("job_id", id).order("created_at", { ascending: true })
    ]);

    if (jobError) throw jobError;
    if (eventsError) throw eventsError;
    if (artifactsError) throw artifactsError;

    return jsonResponse({ job, events, artifacts });
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not fetch job" }, 500);
  }
}

export const config = {
  path: "/api/jobs/status"
};
