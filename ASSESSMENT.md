# StudioNow Agentic Script Creator: Full Assessment

## What This System Is

A multi-agent video script production pipeline. A browser form submits a brief to Supabase, a Node worker claims the job and runs 8-10 specialized agents (diagnoser, miner, strategist, producer, writer, runtime editor, critic, formatter) in sequence, each reading from the 15 reference files. The frontend polls Supabase for progress and renders the final script and producer notes.

Three workflow modes: Quick Draft (fast, text-only), Production Package (lean, one planner call), Full Producer (every agent, concept options, critic loop).

Stack: Vercel (frontend + API adapters), Supabase (job queue, artifacts, events, feedback, storage), Node worker (long-running process), OpenAI GPT-5 (model calls).

## What Works Well

1. **Architecture is sound.** Separating the UI/API layer from the worker is the right call. Job-based state means the browser can disconnect and reconnect. Each agent owns one decision, which makes debugging and prompt iteration tractable.

2. **Reference files are loaded intelligently.** The `reference-loader.mjs` maps topic packs to specific files, so each agent gets only the references it needs (diagnoser gets context + diagnosis + voice; writer gets voice + format; critic gets critique + voice + production). This is more efficient than dumping all 15 files into every call.

3. **All 15 references are present.** The `/references` directory has all 15 files matching what's in the Script Auto project. The reference-loader covers 13 of the 15 files across its packs. (See issues below for the two missing ones.)

4. **Runtime gate is deterministic.** The `runtime-gate.mjs` enforces word budget mathematically rather than trusting the model's self-assessment. This catches overwritten scripts that the critic might miss.

5. **Example memory and gold candidate pipeline.** The ingestion scripts, pairing manifests, and Supabase gold_candidates table create a real learning loop. Reviewers can promote human-edited scripts back into the system's taste memory.

6. **Cost tracking and caps.** Per-stage token/cost tracking with a hard cap ($2 default) prevents runaway jobs.

7. **Three workflow modes.** Giving users a speed/depth tradeoff is practical. Quick Draft skips attachments, visual intake, strategy options, and the critic loop.

## Issues to Fix (Priority Order)

### 1. Two reference files are never loaded

`reference-loader.mjs` maps 7 packs covering 13 files. Two reference files are orphaned:

- `09_localization_systems.md` (modular scripts, market versions)
- `13_examples_index.md` (what each example type teaches)

Neither is assigned to any pack. The localization file matters when the brief mentions multi-market or modular content. The examples index helps the strategist and writer understand what patterns to draw from.

**Fix:** Add a `localization` pack (`09`) and an `examples` pack (`13`), and load them in the appropriate agents (strategist, writer, producer for localization; strategist, critic for examples index).

### 2. The worker must be running separately

The Vercel functions only create jobs and read state. The actual agent workflow runs in `apps/worker/src/index.mjs`, which is a long-polling Node process. If nobody is running `npm run worker` on a machine with the OpenAI key and Supabase credentials, submitted jobs sit in "queued" forever.

This is the most likely reason the app feels broken. The UI submits a job, shows "Queued," and nothing ever happens.

**Options to fix:**
- Run the worker on a VPS, Railway, Render, or Fly.io (a simple always-on Node process).
- Use Supabase Edge Functions or a cron-triggered Vercel function to process jobs (would need restructuring for the long-running workflow).
- For now during development, run `npm run worker` locally when testing.

### 3. The frontend has no feedback when the worker is offline

When a job is queued and no worker picks it up, the UI says "Queued" indefinitely with no explanation. The user has no way to know the worker is down.

**Fix:** Add a "worker heartbeat" check. The worker could write a heartbeat timestamp to a Supabase table every 30 seconds. The frontend can check that timestamp and show "Worker offline — jobs will process when the worker restarts" if the heartbeat is stale.

### 4. Vercel function timeout is 60 seconds

`vercel.json` sets `maxDuration: 60` for API functions. The create-job and status endpoints are fast reads/writes, so this is fine for them. But if any future API endpoint needs to do real work (like generating a DOCX on-the-fly), 60 seconds may be tight.

Currently `api/jobs/document.mjs` generates DOCX from stored artifacts, which should be fast. Monitor this.

### 5. No error recovery for partially completed jobs

If the worker crashes mid-job (between agents), the job stays in "running" status permanently. There is no mechanism to detect stale running jobs and reset them to "queued" for retry.

**Fix:** Add a Supabase function or periodic check: if a job has been in "running" for more than 15 minutes, reset it to "queued" (with a retry counter to prevent infinite loops).

### 6. CLAUDE.md is not used as a system prompt

The `CLAUDE.md` from Script Auto (the master instructions document) is not loaded anywhere in the agentic system. Each agent builds its own system prompt from the reference pack. This means the overarching rules in CLAUDE.md (the critique protocol, the blacklisted language list, the visual motif requirements, the opening/closing rules) are only applied if they happen to appear in the individual reference files.

**Consider:** Loading CLAUDE.md as a shared preamble for all agents, or ensuring its critical rules are replicated in the reference files that each agent loads.

### 7. Frontend Supabase credentials are hardcoded

The `index.html` has inline JavaScript that initializes Supabase with the anon key directly in the page source. This is normal for Supabase's design (anon key is safe for client-side use with RLS), but the URL says the app is behind Vercel Password Protection for the pilot. If password protection is removed, anyone can create jobs (and upload files to storage).

**For production:** Add row-level security or API-key gating on the create-job endpoint.

### 8. Supabase real-time could replace polling

The frontend polls `/api/jobs/status` every 3 seconds. Supabase has built-in real-time subscriptions. Switching to real-time would give instant UI updates (events appear as they happen instead of with a 3-second delay) and reduce API calls.

### 9. The .env file contains live API keys

The `.env` file with the OpenAI API key and Supabase service role key is in the repo directory. Make sure `.env` is in `.gitignore` (it is). But if this directory is shared or backed up, those keys are exposed.

## UI/UX Improvements

### 10. The progress section needs visual clarity

The current stages display is a horizontal list of text items. For a multi-minute workflow, this should be more visual: a vertical timeline with checkmarks, durations, and expandable event logs per stage. Users need to see "diagnosis took 8s, mining took 12s, writer is running now."

### 11. No way to cancel a running job

Once submitted, there's no cancel button. If someone submits the wrong brief, they have to wait for the full workflow to complete (or fail).

### 12. The form is long for repeat users

The full form (project basics, type, runtime, tone, audio, brief, attachments) is good for first-time users but slow for power users who just want to paste a brief and go. Consider a "quick mode" that collapses optional fields and defaults to Production Package.

### 13. Script output should support copy and export

The rendered script and producer notes sections have download-to-DOCX buttons, which is good. Add a "Copy to clipboard" button for each section. Writers often paste into Google Docs or Slack before downloading a DOCX.

### 14. No history of past jobs

The UI shows one job at a time. There's no way to see past jobs, compare outputs, or resubmit a brief. The data is all in Supabase. Adding a "Recent jobs" sidebar or page would make the tool much more useful for repeat use.

## Agent/Prompt Improvements

### 15. Production Package planner prompt could be stronger

The lean production workflow runs one `planner` call that replaces diagnose + mine + strategize + blueprint. This is a lot of work for one model call. If the planner output quality is lower than the full pipeline, consider splitting it into at least two calls (diagnose+mine, then strategize+blueprint) while still being faster than full producer mode.

### 16. Writer doesn't receive visual inventory in all paths

In the full producer workflow, `visualInventory` is passed to the producer (blueprint) but the writer call only receives it via the blueprint's content. If the blueprint doesn't surface every visual detail, the writer loses information. Consider passing `visualInventory` directly to the writer as well. (The production package path already does this.)

### 17. Critic has no calibration examples

The critic agent decides if the draft "passes" but has no gold-standard examples to calibrate against. As gold examples accumulate, the critic should receive 1-2 gold examples as taste anchors for what "good" looks like in this specific StudioNow context.

## Summary: What to Do First

1. **Run the worker.** Nothing works without it. Either run `npm run worker` locally or deploy it to Railway/Render.
2. **Add the two missing reference files** to reference-loader.mjs.
3. **Add worker-offline detection** to the frontend.
4. **Add stale-job recovery** to prevent permanently stuck jobs.
5. **Improve the progress UI** with a vertical timeline and per-stage timing.

Everything else is polish that can happen iteratively once the core pipeline is running reliably.
