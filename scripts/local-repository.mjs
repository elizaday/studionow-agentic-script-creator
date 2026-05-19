import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export function createLocalRepository({ outputDir }) {
  const events = [];
  const artifacts = [];
  const exampleUsages = [];

  return {
    events,
    artifacts,
    exampleUsages,
    async updateJob(jobId, patch) {
      events.push({
        jobId,
        stage: patch.current_stage || "job",
        level: "status",
        message: `status update: ${JSON.stringify(patch)}`
      });
    },
    async event(jobId, stage, message, level = "info", payload = undefined) {
      events.push({ jobId, stage, level, message, payload });
      console.log(`[${stage}] ${message}`);
    },
    async artifact(jobId, type, title, content, markdown = null) {
      artifacts.push({ jobId, type, title, content, markdown });
      const jobDir = resolve(outputDir, jobId);
      await mkdir(jobDir, { recursive: true });
      await writeFile(
        resolve(jobDir, `${String(artifacts.length).padStart(2, "0")}-${type}.json`),
        JSON.stringify({ title, content }, null, 2)
      );
      if (markdown) {
        await writeFile(resolve(jobDir, `${String(artifacts.length).padStart(2, "0")}-${type}.md`), markdown);
      }
    },
    async exampleUsage(jobId, examples) {
      exampleUsages.push({ jobId, examples });
    },
    async downloadFromStorage() {
      throw new Error(
        "Local runner does not support storage-path attachments. Pass --attach with a local file or use base64 directly."
      );
    }
  };
}
