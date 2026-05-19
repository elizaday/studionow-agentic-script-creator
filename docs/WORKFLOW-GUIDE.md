# Agent Workflow Guide

For the StudioNow audience: a plain-English walkthrough of what happens between "user pastes a brief" and "Word doc downloads."

For Mike and the engineer who inherits this: a phase-by-phase map of the code, the prompts, and the failure modes.

---

## Part 1 — Overview (the slides version)

### What this system does

A user submits a brief through a web form. The system returns a Word document containing a production-ready three-column script (AUDIO / TC / VISUALS), plus a separate producer notes document with asset sourcing, approval flags, and music direction.

The user can choose one of two modes:

- **First Draft**: faster default path. It diagnoses, mines, retrieves examples, builds a blueprint, writes, runtime-checks, and formats deliverables. It skips visual intake, concept-option selection, and critic/revision.
- **Full Producer**: deeper path. It runs the complete staged workflow for complex briefs, visual references, attachments, and higher-stakes producer review.

In Full Producer mode, **nine specialized agents** run in sequence. Each agent makes one decision and hands off to the next. They never run all at once with a single mega-prompt.

### The three tiers

```
Browser (Vercel-hosted UI)
    │
    │   1. User submits brief + uploads files
    │      Files go DIRECTLY to Supabase Storage
    │      Brief metadata + storage paths go to /api/jobs
    │
    ▼
Supabase
    │
    │   2. Job row inserted into script_jobs (status = "queued")
    │      Files sit in script-uploads bucket
    │
    ▼
Worker (Railway-hosted Node process)
    │
    │   3. Polls Supabase for queued jobs
    │   4. Claims a job, runs the 9-stage agent workflow
    │   5. Writes events, artifacts, and final outputs back to Supabase
    │
    ▼
Browser polls /api/jobs/status
    Renders stage progress, final script, producer notes
    Reviewer leaves feedback and/or promotes to gold
```

### The Full Producer stages at a glance

| # | Stage | What it decides | Typical time |
|---|---|---|---|
| 1 | **Diagnoser** | What is the assignment really asking? | 30–60s |
| 2 | **Miner** | What in the brief is usable creative ammunition? | 30–60s |
| 3 | **Visual Intake** | What is in each uploaded image (only if files attached)? | 30–90s |
| 4 | **Example Retrieval** | Which 3 past StudioNow scripts most resemble this brief? | <1s (no AI call) |
| 5 | **Strategist** | What story engine fits? One direction, or pause and ask the human? | 60–120s |
| 6 | **Producer (Blueprint)** | What does the film *do*? Title, motif, structure, runtime budget. | 45–90s |
| 7 | **Writer (Draft)** | Write the three-column script. | 60–120s |
| 8 | **Runtime Edit + Critic** | Does the script actually fit the runtime? Is it generic or weak? Force a rewrite if needed. | 60–180s |
| 9 | **Formatter** | Split client script from producer notes; output Word docs. | 60–90s |

### What makes this different from "one big AI call"

Three things, and they all serve the same purpose: **the system can show its work**.

1. **Every stage produces a saved artifact** (the brief diagnosis, the visual inventory, the blueprint, the draft, the critique). Reviewers can see *why* the agent made each choice, not just the final output.
2. **Each stage has a tight contract** (a JSON schema). If the model returns garbage at stage 3, the validator catches it before stage 9 produces a bad script.
3. **There is a deterministic runtime gate** that parses the script's three-column table and mathematically checks whether VO fits the timecodes. The model cannot lie about runtime.

### What the system improves on over time

The agents do not retrain themselves. The system gets better through one mechanism: **gold examples**. Reviewers approve drafts as gold (along with the final human-edited script). Once Mike approves the candidate, that brief/script pair gets ingested into the agent's taste memory. Retrieval then surfaces gold examples first on future briefs.

Today the memory holds 22 examples, 5 of them properly paired. The first month of curation should target 10–15 more paired gold examples.

---

## Part 2 — Phase by phase (technical detail)

For each phase: the purpose, the files, the prompt, the output artifact, the most common failure modes.

### Phase 1 — Diagnoser

**Purpose.** Lock the assignment before anyone writes. The brief often says "make a sizzle" but does not state the audience, the placement, the opening tension, or the closing move. The Diagnoser names all of these explicitly so downstream agents are not free-styling on assumptions.

**Files.**
- `packages/studionow-agents/src/agents/diagnoser.mjs` — agent code and prompt
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateDiagnosis()` enforces all 14 required fields
- `references/03_brief_diagnosis.md` — house-style rules for diagnosis (loaded into the system prompt)
- `references/01_studionow_context.md` — StudioNow voice context

**Output artifact.** `script_artifacts` row with `type = "diagnosis"` containing the JSON: format, placement, audience, understand/feel/do, runtime, tone, approvalReality, existingAssets, openingTension, closingMove, endFeeling, assumptions[], risks[].

**Common failures.**
- Model returns a field as empty string — the prompt explicitly says "never return empty; use 'TBD: …' if unknown." Fixed.
- Model returns the brief's literal text instead of a diagnosis — tighten the system prompt to "do not echo; decide."

### Phase 2 — Miner

**Purpose.** Extract usable creative ammunition from the brief — metrics, brand language, strategic frameworks, asset notes, clearance flags. The Diagnoser asks "what's the assignment?" The Miner asks "what tools did the brief actually hand us?"

**Files.**
- `packages/studionow-agents/src/agents/miner.mjs` — agent code and prompt. The prompt has an explicit contract block listing every required key.
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateMined()`.
- `packages/studionow-agents/src/workflow.mjs` — `normalizeMinedOutput()` defensively fills missing fields from the diagnosis or the raw brief text. This is what caught the early production bug where the model returned `openingTension` instead of `humanTension`.
- `references/10_production_reality.md` — what counts as a clearance flag.

**Output artifact.** `script_artifacts` row with `type = "source_mining"`: humanTension, metrics[], strategicFrameworks[], brandLanguage[], assetNotes{existing, missing}, clearanceFlags[], usableAmmunition[].

**Common failures.**
- Renamed keys (handled by `normalizeMinedOutput`).
- "humanTension" comes back empty (filled from diagnosis.openingTension as a fallback).
- Metrics list contains made-up numbers — current mitigation is downstream: the critic flags fake data confidence.

### Phase 3 — Visual Intake

**Purpose.** When the user uploads images or a PDF deck, the worker first expands PDFs into per-page JPEGs (via `pdftoppm`), then runs gpt-5's vision model on each image once. Each image gets a structured inventory entry that downstream agents reference by ID — no agent ever re-processes the raw bytes.

**Files.**
- `packages/studionow-agents/src/agents/visual-intake.mjs` — batched vision calls. Default is 3 images per call, 6 batches in parallel.
- `packages/studionow-agents/src/pdf-extract.mjs` — `pdftoppm` wrapper that scales each PDF page to 1280px JPEG at quality 72.
- `packages/studionow-agents/src/workflow.mjs` — `hydrateStorageAttachments()` downloads file bytes from Supabase Storage; `expandPdfAttachments()` runs `pdftoppm`; `collectImageAttachments()` filters to just images for Visual Intake.
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateVisualInventory()`.

**Output artifact.** `script_artifacts` row with `type = "visual_inventory"`: array of `{id, source, shotType, description, containsText, textContent, usableFor, sensitivity, notes}`.

**Why batches and parallelism.** OpenAI caps a single content field at 10MB, so each image stays small (~150KB JPEG). Three images per call keeps batches under 1MB. With 6 batches running concurrently, a 40-page deck (~14 batches) finishes in ~30–90 seconds instead of ~7 minutes sequential.

**Common failures.**
- File too large for OpenAI's 10MB content limit — already mitigated by `-scale-to 1280` and JPEG q72.
- `pdftoppm: not found` — Railway must use Nixpacks builder so `nixpacks.toml` installs `poppler-utils`.
- Storage download fails — usually means the SQL migration creating the `script-uploads` bucket didn't run, or RLS policies are missing.

### Phase 4 — Example Retrieval

**Purpose.** Find the three most relevant past StudioNow scripts so the writer downstream has taste anchors specific to this kind of brief. Not a generative step — pure scoring against a file-backed library.

**Files.**
- `packages/studionow-agents/src/example-memory.mjs` — `selectRelevantExamples()` tokenizes the brief/diagnosis/mined fields, scores each example, returns the top 3.
- `training/processed/example_memory.json` — the 22 examples currently in the library, ~366KB.
- `scripts/ingest-example-library.mjs` — rebuilds the JSON from the original `examples/` folder.
- `scripts/ingest-gold-candidates.mjs` — appends approved gold candidates to the JSON (this is how the system actually improves).

**Output artifact.** `script_artifacts` row with `type = "retrieved_examples"`. Also writes one `script_job_example_usage` row per retrieved example for audit.

**Scoring formula.** Relevance score (tag matches > identity > teaching > script content) × quality multiplier (gold 1.5×, usable 1.0×, low_confidence 0.7×, reject 0×) + quality floor (gold +6, usable +2). Result: a moderately relevant gold example outranks a highly relevant usable one — by design.

### Phase 5 — Strategist

**Purpose.** Choose the story engine. StudioNow has roughly 10 named engines (Relay/Handoff, Reveal, Countdown, Chaptered Case Study, Problem/Solution/Scale, etc.). If the brief is tight, the strategist picks one. If the brief is open enough to support multiple genuinely different directions, the strategist returns three options and pauses for the human to pick.

**Files.**
- `packages/studionow-agents/src/agents/strategist.mjs` — agent code and prompt.
- `references/04_script_engines.md` — the engine catalog. This is one of the most important reference files; updating it changes how the strategist thinks.
- `references/15_story_arc_system.md` — the act structure thinking.
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateStrategy()`.
- `packages/studionow-agents/src/workflow.mjs` — `applySelectedDirection()` is what re-injects the user's choice when they unpause a job.

**Output artifact.** `script_artifacts` row with `type = "strategy"`: directions[], recommendedDirectionId, needsDirectionChoice, storyArc {act1, act2, act3}.

**Pause-and-resume.** When `needsDirectionChoice = true` and `selected_direction_id` is null, the workflow sets the job status to `waiting_for_direction` and returns. The UI shows the three direction cards. When the user picks one, `POST /api/jobs/select-direction` updates the row and the worker re-claims it (a new strategy run is performed and the choice is applied via `applySelectedDirection`).

**Common failures.**
- Strategist proposes only one direction but sets `needsDirectionChoice = true` (schema requires ≥3 if so). Validation catches this and the workflow fails — usually a prompt tightening fix.

### Phase 6 — Producer (Blueprint)

**Purpose.** Design the moving film. This is where the **visual motif**, the **structure with timecode beats**, the **opening move**, the **closing move**, and the **production notes** get decided. The Producer also assigns asset IDs from the Visual Intake inventory to specific structure rows.

**Files.**
- `packages/studionow-agents/src/agents/producer.mjs` — agent code and prompt. Has a conditional clause for when a visual inventory is present, telling the producer to use real asset IDs.
- `references/04_script_engines.md`, `references/10_production_reality.md`, `references/05_voice_and_language.md` — combined into the prompt.
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateBlueprint()`.

**Output artifact.** `script_artifacts` row with `type = "script_blueprint"`: title, client, runtimeSeconds, tone, conceptEngine, visualMotif, structure[{tc, job, transition, assetIds}], openingMove, closingMove, productionNotes[], wordBudget.

**Common failures.**
- `wordBudget = 0` for no-VO briefs (Mr. Pibb spec) — the schema was relaxed to accept non-negative.
- Producer invents asset IDs not in the inventory — caught downstream by the writer, which then strips bogus refs.

### Phase 7 — Writer (Draft)

**Purpose.** Write the three-column script in StudioNow house style. The writer follows the blueprint exactly: same title, same runtime, same motif, same structure. The writer's job is voice, not structure.

**Files.**
- `packages/studionow-agents/src/agents/writer.mjs` — agent code, prompt, and a built-in retry: if the markdown the model returns does not parse as a valid three-column table, the writer re-prompts with the validation error.
- `references/05_voice_and_language.md` — voice rules. Heavy lift.
- `references/06_client_script_output.md` — exact three-column format spec.
- `references/12_gotchas.md` — common mistakes (em dashes, overwriting, weak openings).
- `packages/studionow-agents/src/runtime-gate.mjs` — `parseThreeColumnScriptTable()` is what validates the markdown format.
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateDraft()`.

**Output artifact.** `script_artifacts` row with `type = "draft_script"` containing JSON metadata + markdown. The markdown body is also saved separately so it renders in the UI without parsing the JSON.

**Common failures.**
- JSON parse error from OpenAI returning malformed JSON — fixed by setting `text.format = { type: "json_object" }` on the Responses API request. Raw bad responses are saved to `outputs/failed-responses/` (locally) or the worker's stdout (deployed) for debugging.
- Writer leaks producer notes into the client script — the formatter and critic both catch and strip this.

### Phase 8 — Runtime Edit + Critic

**Purpose.** Two gates that protect against the two most common failure modes: **fake runtime confidence** and **generic writing**.

#### Runtime Editor

**Files.**
- `packages/studionow-agents/src/agents/runtime-editor.mjs` — agent code.
- `packages/studionow-agents/src/runtime-gate.mjs` — **the deterministic gate.** Parses the three-column table, counts VO words per timecode block, computes density (words per second), flags any block above ~3 words/sec, and computes whether the total VO actually fits the runtime budget.

The deterministic gate is the key here. The runtime-editor agent can edit the script, but the gate is what gives the truth.

**Output artifact.** `script_artifacts` row with `type = "runtime_pass"`: status, originalVoWords, revisedVoWords, notes, revised markdown if any.

#### Critic

**Files.**
- `packages/studionow-agents/src/agents/critic.mjs` — agent code and a deliberately short, ruthless prompt.
- `references/11_self_critique.md` — what counts as failure.
- `packages/studionow-agents/src/stage-schemas.mjs` — `validateCritique()`.

**Output artifact.** `script_artifacts` row with `type = "critique"`: passes, score, findings[], requiredRevisions[].

**Revision loop.** If the critic returns `passes = false` AND `requiredRevisions` is non-empty AND the workflow has not exceeded `maxRevisionLoops` (default 1), the writer is called again with the critique as input, producing a revised draft. The runtime gate and critic then re-run. Maximum: one revision.

### Phase 9 — Formatter

**Purpose.** Produce the final deliverables. Splits the client-facing script from the producer notes (the writer often combines them), ensures the client script has no producer-facing content (no asset IDs, no clearance flags), and generates Word documents.

**Files.**
- `packages/studionow-agents/src/agents/formatter.mjs` — agent code.
- `packages/studionow-agents/src/final-artifacts.mjs` — post-processing that splits combined markdown, cleans client script of producer leaks, and provides a fallback producer-notes document if the agent did not generate one.
- `packages/studionow-agents/src/docx.mjs` — the Word document generator. Builds a real three-column table with proper column widths, bolded supers, italicized SFX.
- `apps/web/netlify/functions/document.mjs` + `api/jobs/document.mjs` — the download endpoints (`/api/jobs/document?id=...&kind=script` or `kind=notes`).
- `references/06_client_script_output.md`, `references/07_producer_notes_output.md` — output format specs.

**Output artifacts.** Four artifacts:
- `client_script` (markdown + JSON)
- `producer_notes` (markdown)
- `final_script` (markdown, mirrors client_script for backwards compat)
- A delivery checklist

Downstream: the UI surfaces `client_script` and `producer_notes` as Word doc downloads.

---

## Part 3 — Supporting systems

These are not stages, but they touch every stage.

### Reference library (`references/`)

Fifteen markdown files totaling ~2,200 lines. They are the agent's understanding of StudioNow's house style and production canon. Each agent loads a subset of them as part of its system prompt:

- Diagnoser → 01 (context), 03 (diagnosis), 05 (voice)
- Miner → 01, 03, 10 (production reality)
- Visual Intake → 10, 05
- Strategist → 04 (engines), 05
- Producer → 04, 10, 05
- Writer → 05, 06 (script format)
- Critic → 11 (self-critique)
- Formatter → 06, 07 (producer notes format)

To change how the agent thinks about, say, sizzles, edit `references/04_script_engines.md`. The agent will pick up the change on the next worker restart.

### Schema validators (`stage-schemas.mjs`)

Each stage has an `assert`-based validator. If the model's JSON output is missing a required field or has the wrong type, the validator throws and the job fails fast. Without these, garbage at stage 3 silently poisons stage 9.

### Cost telemetry and the $2 cap

Every model call's input and output tokens are computed in `packages/studionow-agents/src/model/pricing.mjs` against a price table. Per-stage cost is logged to `script_job_events.cost_usd`; per-job totals roll up into `script_jobs.total_cost_usd`.

If a single job exceeds `MAX_JOB_COST_USD` (default `$2`, env-overridable), the workflow aborts mid-job with a `cost_cap_exceeded` event. This protects against runaway revision loops.

### Gold promotion (the feedback loop)

The mechanism by which the system gets smarter:

1. Reviewer in the UI clicks **Promote to Gold**, uploads the final human-edited script, fills in "why is this gold" and "what did you change."
2. Row inserted into `script_gold_candidates` with `status = "pending"`.
3. Mike reviews via SQL queries documented in `docs/OPERATING-GUIDE.md`.
4. Mike sets `status = "approved"` (or `"rejected"`).
5. Mike runs `npm run gold:ingest` which appends approved pairs to `training/processed/example_memory.json` with `quality = "gold"`.
6. Mike commits the updated JSON and redeploys the worker.
7. Retrieval now boosts those examples 1.5× on future briefs.

### Storage and uploads

The browser uploads PDFs and images directly to Supabase Storage (`script-uploads` bucket). The Vercel function never touches the bytes — only metadata (storagePath, filename, mediaType). The worker downloads bytes from Storage when it processes a job.

This is what lets us accept 20MB+ decks. Vercel functions have a hard 4.5MB body cap.

### Direction picker (human-in-the-loop)

If the strategist returns three directions, the job pauses at `waiting_for_direction`. The UI renders the cards; the user clicks **Use This Direction**; `POST /api/jobs/select-direction` patches `script_jobs.selected_direction_id`; the worker re-claims and continues.

---

## Part 4 — When things break: a triage guide

### Where to look first

1. **Web UI feels broken.** Open browser DevTools → Network tab → check for failing requests. Look at response body. If it starts with HTML, it is a Vercel function error; check Vercel's Function Logs.
2. **Job is queued forever.** The worker is not running. Check Railway → service → Deploy Logs.
3. **Job started but failed at stage X.** Query Supabase: `select * from script_job_events where job_id = '…' order by created_at`. The error message will be in the last event's payload.
4. **Worker crashes on startup.** Almost always missing environment variables. Check Railway → Variables tab.

### Failure mode by stage

| Stage | Common error | Where to look |
|---|---|---|
| Diagnoser | Empty required field | `diagnoser.mjs` prompt; add explicit "no empty strings" |
| Miner | Wrong field name (e.g. `coreTension` instead of `humanTension`) | `normalizeMinedOutput()` in `workflow.mjs` already remaps several; add more if needed |
| Visual Intake | "string too long" from OpenAI | Image too large; check `pdf-extract.mjs` DPI and `-scale-to` settings |
| Visual Intake | `pdftoppm: not found` | Railway must use Nixpacks builder |
| Strategy | Single direction with `needsDirectionChoice = true` | Prompt fix in `strategist.mjs` |
| Producer | `wordBudget` validation | Already relaxed to `>= 0` |
| Writer | Invalid JSON from model | `text.format = { type: "json_object" }` is set; if it still happens, raw response is logged |
| Runtime | "VO too dense" warnings | These are *warnings* from the deterministic gate, not failures — they appear in the final notes |
| Critic | `score` field mismatched scale (9/10 vs 88/100) | Known minor inconsistency; harden the prompt |
| Formatter | `finalMarkdown must be a string` | Already coerced from `clientScriptMarkdown` if missing |
| Cost cap | `COST_CAP_EXCEEDED` | Either increase `MAX_JOB_COST_USD` env var or investigate why the job ran long |

### How to retry a job

There is no automatic retry today. If a job fails, the row stays in `script_jobs` with `status = "failed"` and an `error` column. To retry:

```sql
-- Reset a failed job back to queued
update public.script_jobs
set status = 'queued',
    current_stage = 'queued',
    error = null
where id = '...';
```

The worker will pick it up on its next poll cycle.

### How to cancel a job

```sql
update public.script_jobs
set status = 'canceled',
    current_stage = 'canceled'
where id = '...';
```

The worker checks status before each stage and exits cleanly.

---

## Part 5 — Repo layout map

```
Script Agentic/
├── apps/
│   ├── web/
│   │   ├── public/index.html              → the entire web UI (form, polling, downloads, feedback, gold)
│   │   └── netlify/functions/             → API handlers (Netlify-style, also wrapped for Vercel)
│   │       ├── create-job.mjs             → POST /api/jobs
│   │       ├── get-job.mjs                → GET /api/jobs/status
│   │       ├── select-direction.mjs       → POST /api/jobs/select-direction
│   │       ├── feedback.mjs               → POST /api/jobs/feedback
│   │       ├── gold-candidate.mjs         → POST /api/jobs/gold-candidate
│   │       ├── document.mjs               → GET /api/jobs/document (Word downloads)
│   │       └── config.mjs                 → GET /api/config (browser bootstrap)
│   └── worker/
│       └── src/
│           ├── index.mjs                  → worker entry: polls Supabase, runs workflow
│           └── supabase-repository.mjs    → Supabase client wrapped with job/event/artifact/storage helpers
├── api/                                   → Vercel adapter functions that wrap the Netlify handlers above
├── packages/studionow-agents/src/
│   ├── workflow.mjs                       → THE orchestrator: ties all 9 stages together
│   ├── stages.mjs                         → stage and status constants
│   ├── stage-schemas.mjs                  → JSON-shape validators for every stage
│   ├── runtime-gate.mjs                   → deterministic three-column-table parser + density checker
│   ├── example-memory.mjs                 → retrieval scoring against example_memory.json
│   ├── final-artifacts.mjs                → splits client/producer notes, cleans, fallbacks
│   ├── docx.mjs                           → Word document generation
│   ├── pdf-extract.mjs                    → pdftoppm wrapper for per-page JPEG extraction
│   ├── reference-loader.mjs               → reads references/ markdown into prompts
│   ├── model/
│   │   ├── openai-client.mjs              → gpt-5 with vision, JSON mode, error logging
│   │   ├── mock-client.mjs                → deterministic fake for $0 smoke tests
│   │   └── pricing.mjs                    → per-model token pricing
│   └── agents/                            → ONE FILE PER STAGE
│       ├── diagnoser.mjs
│       ├── miner.mjs
│       ├── visual-intake.mjs
│       ├── strategist.mjs
│       ├── producer.mjs
│       ├── writer.mjs
│       ├── runtime-editor.mjs
│       ├── critic.mjs
│       ├── formatter.mjs
│       └── run-agent.mjs                  → shared "call the model and parse JSON" wrapper
├── references/                            → 15 markdown files that shape the agents' system prompts
├── training/processed/example_memory.json → the agent's taste memory (22 examples today)
├── supabase/schema.sql                    → all tables, RLS policies, Storage bucket — idempotent
├── scripts/
│   ├── run-brief.mjs                      → CLI: run a brief locally against real OpenAI
│   ├── run-local.mjs                      → CLI: regression/mock runner
│   ├── verify-supabase.mjs                → npm run supabase:verify
│   ├── ingest-example-library.mjs         → npm run examples:ingest
│   ├── ingest-training-examples.mjs       → npm run training:ingest
│   ├── ingest-gold-candidates.mjs         → npm run gold:ingest  ← the curator's command
│   └── local-repository.mjs               → in-memory repository for CLI runs
├── evals/briefs.json                      → 6 evaluation briefs used by mock smoke
├── docs/
│   ├── HANDOFF.md                         → transition plan (for executive audience)
│   ├── OPERATING-GUIDE.md                 → day-to-day playbook (for engineering/curator)
│   ├── ARCHITECTURE.md                    → architectural rationale
│   ├── AGENT-CONTRACTS.md                 → one-line summary of each agent's job
│   ├── PILOT-READINESS.md                 → what's verified, what's still gap
│   ├── DEPLOYMENT.md                      → infrastructure setup
│   └── WORKFLOW-GUIDE.md                  → this file
├── package.json                           → npm scripts, dependencies
├── vercel.json                            → Vercel deploy config
├── nixpacks.toml                          → Railway/Render build config (poppler-utils, start command)
└── .env / .env.example                    → environment variables (NEVER commit .env)
```

### The five files Mike will spend most of his time in

1. `packages/studionow-agents/src/workflow.mjs` — when you need to understand the flow or change stage ordering.
2. `packages/studionow-agents/src/agents/<name>.mjs` — when you need to change how a specific agent thinks.
3. `references/04_script_engines.md` (and other references) — when StudioNow house style evolves.
4. `training/processed/example_memory.json` — what the agent remembers as good. Driven by `gold:ingest`, not edited by hand.
5. `supabase/schema.sql` — when adding new columns, tables, or RLS policies. Idempotent; safe to re-run.

---

## One-sentence summary

A brief goes in; nine specialized agents make nine separate decisions visible at every step; a deterministic gate enforces that the script actually fits the runtime; the critic forces a rewrite when needed; a Word document comes out; reviewer feedback and gold-approved pairs improve the system's taste over time.
