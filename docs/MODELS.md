# Models: What Runs Where, and How to Change It

Single source of truth for which AI model powers each part of both script
tools, and the exact steps to change them. No code changes are ever needed
to swap models — everything is environment variables.

Last verified against deployed runs: 2026-06-11.

## Current state (verified, not assumed)

| System | Stage | Model today | Controlled by |
|---|---|---|---|
| **Agentic** (Railway worker) | every stage | `gpt-5` | `OPENAI_MODEL` (no routing vars set on Railway) |
| **Legacy** (Netlify) | the single generate call | `claude-sonnet-4-20250514` | `ANTHROPIC_MODEL` (fallback hardcoded) |
| **Legacy** | refine call | `claude-sonnet-4-20250514` | `ANTHROPIC_MODEL` (same var) |

Verified by reading per-stage `model` fields in the Supabase
`script_job_events` log for the June 10 production runs — not from config
files, which can drift from what is deployed.

Note: the per-stage routing system EXISTS in the agentic code but is dormant
because no routing variables are set on Railway. Setting them activates it
instantly.

## Agentic: which calls happen in each mode

| Mode | Model calls, in order |
|---|---|
| Quick Draft (`first_draft`) | diagnoser → miner → producer → writer → runtime_editor → formatter (6 calls) |
| Safe Production Package (`production`, default) | [visual_intake if files] → planner → writer_producer → [writer_producer again if a gate forces a trim] (2–4 calls) |
| Deep Producer Review (`full_producer`) | diagnoser → miner → [visual_intake] → strategist → producer → writer → runtime_editor → critic → [writer revision] → formatter (9–10 calls) |

## Agentic: model resolution order

For each agent, the worker picks the first of:

1. `OPENAI_MODEL_<AGENT_NAME>` — exact per-agent override.
   Examples: `OPENAI_MODEL_PLANNER`, `OPENAI_MODEL_WRITER_PRODUCER`,
   `OPENAI_MODEL_VISUAL_INTAKE`, `OPENAI_MODEL_CRITIC`,
   `OPENAI_MODEL_RUNTIME_EDITOR`, `OPENAI_MODEL_DIAGNOSER`.
2. Group variable:
   - `OPENAI_MODEL_WRITER` covers writer_producer, writer, formatter
   - `OPENAI_MODEL_PLANNING` covers planner, diagnoser, miner, strategist, producer
   - (critic, runtime_editor, visual_intake have NO group — per-agent var or global only)
3. `OPENAI_MODEL` — the global default (currently `gpt-5`).

Implementation: `packages/studionow-agents/src/model/openai-client.mjs`
(`resolveModelForAgent`). Pricing for cost telemetry:
`packages/studionow-agents/src/model/pricing.mjs` — add a row when you adopt
a model not already listed, or cost shows as unpriced.

## How to change a model

### Agentic (Railway)

1. Railway dashboard → the worker service → **Variables**.
2. Add or edit the variable (e.g. `OPENAI_MODEL_PLANNING=gpt-5-mini`, or
   change `OPENAI_MODEL`).
3. Save — Railway redeploys automatically (~1 minute).
4. **Verify**: run any brief, then check the job's event log in the UI (each
   stage event records the model used), or run the verification query below.

### Legacy (Netlify)

1. Netlify dashboard → the site → **Site configuration → Environment
   variables**.
2. Set `ANTHROPIC_MODEL` (e.g. `claude-sonnet-4-6`).
3. Trigger a redeploy (Deploys → Trigger deploy). Required for env changes.
4. Verify by generating a script — quality/latency shift is observable;
   there is no per-call model log in Legacy.

### Local testing (either repo)

Set the same variables in `.env` in the repo root. The agentic local runners
(`npm run brief`, `npm run demo`, bakeoff) read them via dotenv.

## Verification query (deployed truth)

What models did recent deployed jobs actually use:

```sql
select j.created_at::date, j.brief->>'name' as brief,
       e.payload->>'agent' as agent, e.payload->>'model_name' as model,
       round((e.payload->>'duration_ms')::numeric / 1000) as seconds
from script_job_events e
join script_jobs j on j.id = e.job_id
where e.payload->>'kind' = 'stage_metrics'
order by j.created_at desc, e.created_at
limit 30;
```

## Measured timings (gpt-5 everywhere, June 2026)

| Scenario | Wall clock | Cost |
|---|---|---|
| Production, text brief, no revision | ~3–4 min | ~$0.25 |
| Production, text brief, gate forces one trim | ~5 min | ~$0.26 |
| Production with PDF deck attached | 6–8 min | ~$0.25–0.28 |
| Quick Draft (6-call path) | 6–9 min — slower than Production; candidate for retirement | ~$0.30 |
| Deep Producer Review | 8–15 min | ~$0.42–0.55 |
| Legacy (one streamed call) | 30–60 s | n/a (Anthropic) |

## Rules when changing models

- Never change models mid-pilot without re-running the sentinel briefs and
  comparing (see OPERATING-GUIDE: Model Upgrades).
- Change one variable at a time so quality shifts are attributable.
- The writer (`OPENAI_MODEL_WRITER` / `OPENAI_MODEL_WRITER_PRODUCER`) is the
  quality-critical slot — spend there. Planning and extraction stages tolerate
  cheaper/faster models.
- After adopting a new model, add it to `pricing.mjs` so cost telemetry stays
  accurate.
