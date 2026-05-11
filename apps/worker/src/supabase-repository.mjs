import { createClient } from "@supabase/supabase-js";

export function createSupabaseRepository({
  url = process.env.SUPABASE_URL,
  serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
} = {}) {
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }

  const client = createClient(url, serviceRoleKey, {
    auth: { persistSession: false }
  });

  return {
    client,
    async claimNextJob() {
      const { data, error } = await client.rpc("claim_next_script_job");
      if (error) throw error;
      if (!data) return null;
      if (Array.isArray(data)) return data[0]?.id ? data[0] : null;
      return data.id ? data : null;
    },
    async updateJob(jobId, patch) {
      const { error } = await client
        .from("script_jobs")
        .update(patch)
        .eq("id", jobId);
      if (error) throw error;
    },
    async event(jobId, stage, message, level = "info", payload = undefined) {
      const row = {
        job_id: jobId,
        stage,
        level,
        message
      };
      if (payload !== undefined && payload !== null) {
        row.payload = payload;
        if (typeof payload === "object") {
          if (payload.input_tokens != null) row.input_tokens = payload.input_tokens;
          if (payload.output_tokens != null) row.output_tokens = payload.output_tokens;
          if (payload.cost_usd != null) row.cost_usd = payload.cost_usd;
          if (payload.model_name != null) row.model_name = payload.model_name;
          if (payload.duration_ms != null) row.duration_ms = payload.duration_ms;
        }
      }
      const { error } = await client.from("script_job_events").insert(row);
      if (error) throw error;
      console.log(`[${jobId}] [${stage}] ${message}`);
    },
    async artifact(jobId, type, title, content, markdown = null) {
      const { error } = await client.from("script_artifacts").insert({
        job_id: jobId,
        type,
        title,
        content,
        markdown
      });
      if (error) throw error;
    },
    async exampleUsage(jobId, examples) {
      if (!Array.isArray(examples) || examples.length === 0) return;
      const rows = examples.map((example) => ({
        job_id: jobId,
        example_key: example.id,
        project_name: example.projectName,
        relevance_score: example.relevanceScore
      }));
      const { error } = await client.from("script_job_example_usage").insert(rows);
      if (error) throw error;
    },
    async failJob(jobId, error) {
      if (!jobId) {
        console.error("Cannot mark failure without a job id:", error);
        return;
      }
      await this.event(jobId, "failed", error.message || String(error), "error");
      await this.updateJob(jobId, {
        status: "failed",
        current_stage: "failed",
        error: error.stack || error.message || String(error)
      });
    }
  };
}
