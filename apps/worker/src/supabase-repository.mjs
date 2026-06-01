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
    async downloadFromStorage({ bucket = "script-uploads", path }) {
      if (!path) throw new Error("downloadFromStorage requires a path");
      const { data, error } = await client.storage.from(bucket).download(path);
      if (error) throw new Error(`Storage download failed for ${bucket}/${path}: ${error.message}`);
      const arrayBuffer = await data.arrayBuffer();
      return Buffer.from(arrayBuffer);
    },
    async loadExamplesFromDb() {
      const { data, error } = await client
        .from("script_examples")
        .select("*")
        .eq("status", "active")
        .in("quality", ["gold", "usable"])
        .order("quality", { ascending: false });
      if (error) throw error;
      return (data || []).map(row => ({
        id: row.id,
        projectName: row.project_name,
        quality: row.quality,
        pairingConfidence: row.pairing_confidence || "unknown",
        pairingType: row.pairing_type || "unknown",
        tags: row.tags || [],
        teachingPoints: row.teaching_points || [],
        briefText: row.brief_text || "",
        scriptText: row.script_text || "",
        scriptExcerpt: row.script_excerpt || "",
        retrievalText: row.retrieval_text || "",
        notes: row.notes || ""
      }));
    },
    async loadActiveLearningRules(agentName = null) {
      let query = client
        .from("learning_rules")
        .select("rule, category, applies_to")
        .eq("status", "active");
      const { data, error } = await query;
      if (error) throw error;
      return (data || []).filter(row => {
        if (!agentName) return true;
        if (!row.applies_to || row.applies_to.length === 0) return true;
        return row.applies_to.includes(agentName);
      }).map(row => row.rule);
    },
    async ingestGoldCandidate(candidateId) {
      // Read the gold candidate
      const { data: candidate, error: fetchErr } = await client
        .from("script_gold_candidates")
        .select("*")
        .eq("id", candidateId)
        .single();
      if (fetchErr) throw fetchErr;
      if (!candidate) throw new Error(`Gold candidate ${candidateId} not found`);

      // Build the example row
      const projectName = candidate.project_name || "Gold Example";
      const tags = Array.isArray(candidate.tags) && candidate.tags.length > 0
        ? candidate.tags
        : ["gold", "human-edited"];
      const teachingPoints = Array.isArray(candidate.teaching_points) && candidate.teaching_points.length > 0
        ? candidate.teaching_points
        : [candidate.why_gold || "Human-edited gold standard.", candidate.what_changed || ""].filter(Boolean);
      const scriptText = candidate.final_script_text || "";
      const scriptExcerpt = scriptText.slice(0, 2000);
      const briefText = candidate.brief_text || "";
      const retrievalText = [projectName, briefText.slice(0, 500), tags.join(" "), scriptExcerpt.slice(0, 500)].join("\n");

      const { data: example, error: insertErr } = await client
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
          teaching_points: teachingPoints,
          notes: `Promoted from gold candidate ${candidateId}. Reviewer: ${candidate.reviewer_name || "unknown"}.`,
          source_gold_candidate_id: candidateId,
          status: "active"
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      // Update the gold candidate status
      await client
        .from("script_gold_candidates")
        .update({
          status: "ingested",
          promoted_example_key: example.id
        })
        .eq("id", candidateId);

      return example.id;
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
