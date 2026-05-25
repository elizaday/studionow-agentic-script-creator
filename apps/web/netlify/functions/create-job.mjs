import { getSupabaseClient, jsonResponse } from "./_supabase.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  try {
    const body = await req.json();
    const brief = normalizeBrief(body);

    const supabase = getSupabaseClient({ service: true });
    const { data, error } = await supabase
      .from("script_jobs")
      .insert({ brief, status: "queued", current_stage: "queued" })
      .select("id,status,current_stage,created_at")
      .single();

    if (error) throw error;
    return jsonResponse({ job: data }, 201);
  } catch (error) {
    return jsonResponse({ error: error.message || "Could not create job" }, 500);
  }
}

function normalizeBrief(body) {
  if (!body?.brief || typeof body.brief !== "string" || body.brief.trim().length === 0) {
    throw new Error("brief is required");
  }
  const workflowMode = normalizeWorkflowMode(body.workflowMode);

  return {
    brief: body.brief.trim(),
    name: body.name || "Untitled StudioNow Brief",
    workflowMode,
    attachments: body.attachments || []
  };
}

function normalizeWorkflowMode(value) {
  const mode = String(value || "").trim().toLowerCase();
  if (mode === "first_draft" || mode === "fast" || mode === "draft") return "first_draft";
  if (mode === "production" || mode === "package" || mode === "production_package") return "production";
  if (mode === "full_producer" || mode === "full" || mode === "producer" || mode === "deep") return "full_producer";
  return "production";
}

export const config = {
  path: "/api/jobs"
};
