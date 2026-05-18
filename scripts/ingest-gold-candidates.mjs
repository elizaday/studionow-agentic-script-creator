#!/usr/bin/env node
import "dotenv/config";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const MEMORY_PATH = resolve(ROOT, "training", "processed", "example_memory.json");

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.");
  process.exit(2);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

console.log(`Looking for approved gold candidates...`);
const { data: approved, error } = await supabase
  .from("script_gold_candidates")
  .select("*")
  .eq("status", "approved")
  .order("created_at", { ascending: true });
if (error) throw error;
console.log(`Found ${approved.length} approved candidate(s).`);

if (approved.length === 0) {
  console.log("Nothing to ingest. Approve candidates first (status='approved').");
  process.exit(0);
}

if (!existsSync(MEMORY_PATH)) {
  throw new Error(`Example memory not found at ${MEMORY_PATH}`);
}
const memory = JSON.parse(await readFile(MEMORY_PATH, "utf-8"));
const existingIds = new Set(memory.map((entry) => entry.id));

const additions = [];
const promoted = [];
for (const candidate of approved) {
  const id = `gold-${candidate.id.slice(0, 8)}`;
  if (existingIds.has(id)) {
    console.log(`Skipping ${id}: already in example_memory.json.`);
    continue;
  }
  const entry = {
    id,
    projectName: candidate.final_script_filename
      ? `Gold pair — ${candidate.final_script_filename.replace(/\.[^.]+$/, "")}`
      : `Gold pair — job ${candidate.job_id.slice(0, 8)}`,
    quality: "gold",
    pairingConfidence: "high",
    pairingType: "human-approved-pair",
    briefFiles: [],
    scriptFiles: [],
    briefText: candidate.brief_text,
    scriptText: candidate.final_script_text,
    scriptExcerpt: candidate.final_script_text.slice(0, 4000),
    notes: [
      candidate.why_gold ? `Why gold: ${candidate.why_gold}` : null,
      candidate.what_changed ? `Changed from draft: ${candidate.what_changed}` : null,
      `Source: gold candidate ${candidate.id}, job ${candidate.job_id}`
    ].filter(Boolean).join(" "),
    tags: [],
    teachingPoints: [
      candidate.why_gold || null,
      candidate.what_changed ? `Notable edit: ${candidate.what_changed}` : null
    ].filter(Boolean),
    sourceJobId: candidate.job_id,
    promotedAt: new Date().toISOString()
  };
  additions.push(entry);
  promoted.push(candidate.id);
}

if (additions.length === 0) {
  console.log("All approved candidates were already ingested. Nothing to write.");
  process.exit(0);
}

if (DRY_RUN) {
  console.log(`Would add ${additions.length} entries:`);
  for (const a of additions) console.log(`  + ${a.id}: ${a.projectName}`);
  console.log("Run without --dry-run to apply.");
  process.exit(0);
}

const updated = memory.concat(additions);
await writeFile(MEMORY_PATH, JSON.stringify(updated, null, 2));
console.log(`Wrote ${additions.length} new entries to ${MEMORY_PATH}`);

const { error: markError } = await supabase
  .from("script_gold_candidates")
  .update({ status: "ingested" })
  .in("id", promoted);
if (markError) {
  console.error("WARNING: ingested rows could not be marked. Re-run may duplicate. Error:", markError.message);
} else {
  console.log(`Marked ${promoted.length} candidate(s) as ingested.`);
}

console.log("Done. Re-deploy the worker (or restart locally) to pick up new examples.");
