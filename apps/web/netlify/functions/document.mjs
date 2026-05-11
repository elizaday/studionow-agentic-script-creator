import { getSupabaseClient } from "./_supabase.mjs";
import { buildProducerNotesDocx, buildScriptDocx } from "./_docx.mjs";

export default async function handler(req) {
  if (req.method !== "GET") {
    return new Response("Method not allowed", { status: 405 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  const kind = url.searchParams.get("kind");

  if (!id || !["script", "notes"].includes(kind)) {
    return new Response("id and kind=script|notes are required", { status: 400 });
  }

  try {
    const supabase = getSupabaseClient({ service: true });
    const [{ data: job, error: jobError }, { data: artifacts, error: artifactsError }] = await Promise.all([
      supabase.from("script_jobs").select("id,brief").eq("id", id).single(),
      supabase.from("script_artifacts").select("type,markdown").eq("job_id", id)
    ]);

    if (jobError) throw jobError;
    if (artifactsError) throw artifactsError;

    const artifactType = kind === "script" ? "client_script" : "producer_notes";
    const artifact = artifacts.find((entry) => entry.type === artifactType)
      || artifacts.find((entry) => entry.type === "final_script");

    if (!artifact?.markdown) {
      return new Response("Requested document is not ready yet", { status: 404 });
    }

    const titleBase = job?.brief?.name || "StudioNow Deliverable";
    const buffer = kind === "script"
      ? await buildScriptDocx({ title: `${titleBase} Script`, markdown: artifact.markdown })
      : await buildProducerNotesDocx({ title: `${titleBase} Producer Notes`, markdown: artifact.markdown });

    const fileName = `${slugify(titleBase)}-${kind === "script" ? "script" : "producer-notes"}.docx`;
    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename=\"${fileName}\"`
      }
    });
  } catch (error) {
    return new Response(error.message || "Could not build document", { status: 500 });
  }
}

export const config = {
  path: "/api/jobs/document"
};

function slugify(value) {
  return String(value || "document")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
