# Operating Guide

This guide is for the StudioNow team that owns the Script Agentic system on a day-to-day basis after handoff. It assumes the reader is comfortable with Node, Git, and Supabase, but not necessarily with this codebase. Pair it with `docs/ARCHITECTURE.md` and `docs/AGENT-CONTRACTS.md`.

## How the System Improves

This is an agentic system. It does not retrain itself. It improves in three ways, in order of how often you should expect to do each:

1. **Reviewers leave specific feedback** on outputs, and a curator promotes the best human-edited drafts to gold examples. New gold examples get ingested into `example_memory.json` so the agent retrieves them on future briefs.
2. **Operators or engineering support adjust agent prompts and schemas** when reviewer feedback reveals a pattern — for example, "the strategist keeps picking sizzle pacing for cinematic teasers."
3. **Reference documents in `references/` get edited** when StudioNow's house style or production standards change.

Everything else (model upgrades, new agents, new file types) is a less frequent project, not weekly maintenance.

## What to Monitor

A weekly check is enough during the pilot. Move to daily only if something breaks.

### Cost

Per-job and aggregate cost lives in two places:

- `script_jobs.total_cost_usd` for the rollup
- `script_job_events.cost_usd` for per-stage

A useful query:

```sql
select date_trunc('week', completed_at) as week,
       count(*) as briefs,
       sum(total_cost_usd) as cost_usd,
       avg(total_cost_usd) as avg_cost_per_brief
from public.script_jobs
where status = 'complete'
group by 1
order by 1 desc;
```

A typical brief on gpt-5 costs roughly $0.30. If average per-brief cost climbs above $0.60, something is wrong — usually a runaway revision loop or a model returning unusually large outputs. Investigate before usage scales.

### Failures

```sql
select status, current_stage, count(*)
from public.script_jobs
where created_at > now() - interval '7 days'
group by 1, 2
order by 1, 2;
```

A few `failed` rows per week is normal during the first month. A spike usually points to one specific stage. Look at `script_jobs.error` and `script_job_events` for the offending stage to diagnose.

### Feedback quality

```sql
select date_trunc('week', created_at) as week,
       count(*) as feedback_count,
       count(*) filter (where comment is not null and length(comment) > 20) as substantive_comments,
       count(*) filter (where promote_to_gold) as gold_candidates
from public.script_feedback
group by 1
order by 1 desc;
```

If reviewers stop leaving comments, the system stops improving. Substantive comments per week is the leading indicator of whether the pilot is healthy.

## How to Add a Gold Example

A gold example is a brief paired with the final human-edited script that StudioNow would be proud to show as a reference.

1. A reviewer flags a draft as a gold candidate using the feedback form.
2. The curator confirms the candidate is genuinely strong and that a final human-edited version exists.
3. Save the brief, the final human-edited script, and any context notes into a new entry alongside existing examples in the StudioNow example library.
4. Re-run `npm run examples:ingest` (or the appropriate ingestion script).
5. Verify the new example appears in `training/processed/example_memory.json` and shows up in retrieval on a relevant test brief.
6. Commit the updated `example_memory.json` to Git.

Quality over quantity. Five sharp gold examples per quarter is far more valuable than fifty mixed-quality ones.

## How to Re-Ingest Example Memory

The example memory is file-backed during the pilot. After accumulating new gold examples, the curator rebuilds it.

```bash
npm run training:ingest         # rebuilds paired examples from training/processed/pairing_manifest.json
npm run examples:ingest         # rebuilds script-only references from the original example folder
```

After ingestion:

1. Inspect `training/processed/example_memory_report.md` for changes.
2. Run `npm run check` to verify the workflow still passes.
3. Run one real brief through the system and confirm retrieval is sensible.
4. Commit the rebuilt `example_memory.json`.

## How to Update an Agent Prompt

Agent prompts live in `packages/studionow-agents/src/agents/<name>.mjs`. Each agent has a tight responsibility documented in `docs/AGENT-CONTRACTS.md`.

The discipline:

1. Identify the failure pattern from reviewer comments. Be specific: "the strategist defaults to Problem/Solution/Scale for every brief" is actionable; "the strategy feels generic" is not.
2. Edit the relevant agent file. Touch the smallest part of the prompt that addresses the pattern.
3. Run `npm run check` to confirm the mock workflow still passes.
4. Run two or three real briefs that previously exhibited the pattern. Confirm the change addresses it without breaking other behaviors.
5. Commit with a message describing the pattern and the fix.

Resist the urge to "while I'm in here, also fix..." Each agent prompt change should be one targeted edit. Prompts that try to fix everything fix nothing.

## How to Update Reference Documents

The 15 files in `references/` are loaded into agent prompts as house-style and production canon. They are the agent's understanding of what StudioNow means by "good."

Update them when:

- StudioNow's house style changes.
- A new genre or format becomes a common assignment.
- A pattern of feedback reveals the agent is missing a rule that should be canon.

Treat reference docs the same as code: review the change, test against a few briefs, commit. Avoid sprawl. Each reference file should remain focused on a single topic.

## How to Handle a Failed Run

1. Read `script_jobs.error` and `script_jobs.current_stage`. That tells you which stage broke.
2. Look at `script_job_events` for that job, ordered by `created_at`, to see what the system was doing right before the failure.
3. If the failure was a schema validation error, inspect the stage's artifact in `script_artifacts` to see what the model returned.
4. If the failure was a model JSON parse error, check `outputs/failed-responses/` (locally) or wherever the worker writes failed responses for the raw output.
5. Determine the cause:
   - **Model returned the wrong shape** → prompt fix.
   - **Schema is too strict** → schema fix.
   - **Network or rate-limit error** → retry. If it recurs, escalate.
   - **A specific brief always fails** → investigate the brief, not the system.

Document recurring failures so engineering support can prioritize fixes.

## How to Add a New Agent

Adding an agent is a real project, not a tweak. Only do it when reviewer feedback reveals a missing decision that no existing agent should own.

Process:

1. Define the agent's single responsibility. If you cannot state it in one sentence, do not add it.
2. Add the agent file under `packages/studionow-agents/src/agents/`.
3. Add a schema validator in `packages/studionow-agents/src/stage-schemas.mjs`.
4. Add a stage constant in `packages/studionow-agents/src/stages.mjs`.
5. Wire the agent into `workflow.mjs` at the correct point.
6. Update `docs/AGENT-CONTRACTS.md`.
7. Run `npm run check` and at least three real briefs.

If the new agent overlaps with an existing one, fix the existing one instead.

## Model Upgrades

OpenAI releases new models periodically. The default lives in `.env` as `OPENAI_MODEL`. Pricing is in `packages/studionow-agents/src/model/pricing.mjs`.

Before changing the production model:

1. Add the new model to the pricing table.
2. Run `npm run check` with the new model.
3. Run the full eval set (`npm run demo:quick`) with the new model and compare critique scores, runtime warnings, and cost against the previous model.
4. Run three known-good real briefs and confirm the new model handles them at least as well.
5. Only after the eval and real-brief comparisons look good, update `.env` in production.

Do not change models mid-pilot. Stability of evaluation matters more than chasing the newest model.

## Schema Migrations

`supabase/schema.sql` uses `create table if not exists` and `add column if not exists` patterns, so re-running it against an existing database is safe. New columns should be added the same way.

Discipline:

1. Add the migration to `supabase/schema.sql`.
2. Run it in the Supabase SQL editor.
3. Update repository code (`apps/worker/src/supabase-repository.mjs`) to write the new column.
4. Update `scripts/local-repository.mjs` for parity, if applicable.
5. Update relevant docs.
6. Commit.

Never drop or rename columns without a migration plan. Add new columns, deprecate old ones, then remove them after a release cycle.

## Pilot Review Cadence

A rhythm that has worked for similar tools:

- **Weekly:** Operator scans cost, failures, and feedback quality. Curator reviews any flagged gold candidates from the past week.
- **Bi-weekly:** Product owner reads through five recent outputs end-to-end. Notes patterns. Decides whether any agent or reference needs adjustment.
- **Monthly:** Curator re-ingests example memory if new gold examples have accumulated. Engineering support applies any prompt or schema changes that bi-weekly review surfaced.
- **Quarterly:** Whole-team review of pilot health. Decide whether to expand, narrow, or retire any part of the system.

## Backup and Recovery

The state of the system at any moment is:

1. The Git repo (code, prompts, references, example memory).
2. The Supabase database (jobs, events, artifacts, feedback).

GitHub provides the first. Supabase provides automated daily backups on paid plans; verify retention and test restore once during the first month. A failed restore on day 90 is much worse than a manual restore drill on day 7.

## Escalation Path

Define before the pilot starts:

- Who is paged when the worker stops claiming jobs.
- Who decides whether a stuck job should be retried or marked failed.
- Who has the authority to apply a schema change in production.
- Who reads reviewer comments and routes them to the right action (curator, engineering, product owner).

A pilot with no named escalation path becomes the product owner's full-time job by default.

## What Not to Do

- Do not let the agent automatically promote its own outputs to gold examples. Gold requires a human-approved final script.
- Do not commit `.env`, raw client briefs, or anything in `training_drop/`.
- Do not change multiple agents or schemas in one commit. Make each change traceable.
- Do not skip the mock smoke check before deploying. It is the cheapest signal you have.
- Do not run untested model upgrades on real briefs.
- Do not rename or delete examples from `example_memory.json` without keeping the source files. The memory is derived state.
- Do not add abstraction or features that no reviewer has asked for. The agent chain is already complex enough.
