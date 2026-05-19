#!/usr/bin/env node
import "dotenv/config";
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.SUPABASE_ANON_KEY;

const REQUIRED_TABLES = [
  "script_jobs",
  "script_job_events",
  "script_artifacts",
  "script_feedback",
  "script_examples",
  "script_job_example_usage",
  "script_gold_candidates"
];

const REQUIRED_RPCS = ["claim_next_script_job"];

const checks = [];
function record(label, ok, detail = "") {
  checks.push({ label, ok, detail });
  const icon = ok ? "[32m✓[0m" : "[31m✗[0m";
  console.log(`${icon} ${label}${detail ? `  — ${detail}` : ""}`);
}

if (!url) {
  record("SUPABASE_URL is set", false, "missing in .env");
  process.exit(1);
}
record("SUPABASE_URL is set", true, url);

if (!serviceKey) {
  record("SUPABASE_SERVICE_ROLE_KEY is set", false, "missing in .env");
  process.exit(1);
}
record("SUPABASE_SERVICE_ROLE_KEY is set", true, mask(serviceKey));

if (!anonKey) {
  record("SUPABASE_ANON_KEY is set", false, "missing in .env");
} else {
  record("SUPABASE_ANON_KEY is set", true, mask(anonKey));
}

const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });

console.log("\nChecking tables...");
let allTablesOk = true;
for (const table of REQUIRED_TABLES) {
  const { error } = await supabase.from(table).select("*").limit(0);
  if (error) {
    allTablesOk = false;
    record(`Table public.${table} exists`, false, error.message);
  } else {
    record(`Table public.${table} exists`, true);
  }
}

console.log("\nChecking RPCs...");
for (const rpcName of REQUIRED_RPCS) {
  const { error } = await supabase.rpc(rpcName);
  if (error && /function .* does not exist/i.test(error.message)) {
    record(`RPC ${rpcName} exists`, false, error.message);
  } else {
    record(`RPC ${rpcName} exists`, true, error ? `returned: ${error.message.split("\n")[0]}` : "callable");
  }
}

console.log("\nRound-trip test: insert -> select -> delete in script_jobs...");
const testBrief = { brief: "verify-supabase round trip", name: "verify-supabase test", attachments: [] };
const { data: inserted, error: insertError } = await supabase
  .from("script_jobs")
  .insert({ brief: testBrief, status: "queued", current_stage: "queued" })
  .select("id, status, current_stage")
  .single();
if (insertError) {
  record("Insert into script_jobs", false, insertError.message);
} else {
  record("Insert into script_jobs", true, `id ${inserted.id}`);
  const { data: read, error: readError } = await supabase
    .from("script_jobs")
    .select("id, brief")
    .eq("id", inserted.id)
    .single();
  if (readError) record("Read back row", false, readError.message);
  else record("Read back row", read?.brief?.brief === testBrief.brief, "matches inserted brief");
  const { error: deleteError } = await supabase
    .from("script_jobs")
    .delete()
    .eq("id", inserted.id);
  record("Delete test row", !deleteError, deleteError?.message || "cleaned up");
}

console.log("\nChecking gold-candidate columns...");
const { error: goldCheck } = await supabase
  .from("script_gold_candidates")
  .select("id, status, why_gold, what_changed, final_script_text")
  .limit(0);
record("script_gold_candidates has required columns", !goldCheck, goldCheck?.message || "ok");

console.log("\nChecking cost-tracking columns on script_jobs...");
const { error: costCheck } = await supabase
  .from("script_jobs")
  .select("id, total_input_tokens, total_output_tokens, total_cost_usd, model_name")
  .limit(0);
record("script_jobs has cost columns", !costCheck, costCheck?.message || "ok");

const failed = checks.filter((c) => !c.ok);
console.log("");
if (failed.length === 0) {
  console.log("[32mAll checks passed.[0m Supabase is ready for the pilot.");
  process.exit(0);
} else {
  console.log(`[31m${failed.length} check(s) failed.[0m See messages above.`);
  for (const f of failed) {
    console.log(`  - ${f.label}${f.detail ? `: ${f.detail}` : ""}`);
  }
  process.exit(1);
}

function mask(s) {
  if (!s) return "";
  if (s.length <= 12) return "***";
  return `${s.slice(0, 6)}...${s.slice(-4)} (${s.length} chars)`;
}
