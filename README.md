# StudioNow Agentic Script Creator

Experimental rebuild of the StudioNow Script Creator as an agent workflow.

## Data Handling Notice

This tool sends brief contents and intermediate creative artifacts to OpenAI's API. Before using it with confidential client materials (including any Coca-Cola or TCCC brief), confirm the following with the OpenAI account that owns the API key in `.env`:

- **Training opt-out.** OpenAI's standard API terms (since March 2023) state that data sent through the API is not used to train OpenAI models by default. Verify this is still in effect for your account at <https://platform.openai.com/docs/models#how-we-use-your-data> and that organization-level "Data sharing" is off.
- **Retention window.** OpenAI retains API inputs and outputs for up to 30 days for abuse monitoring under standard terms. Zero Data Retention (ZDR) is available for enterprise customers on request — required if StudioNow's legal or client agreements forbid third-party retention of brief content.
- **Account boundary.** Confirm the API key in `.env` belongs to a StudioNow-controlled OpenAI account, not a personal one.

If any of the above is unconfirmed, do not run real client briefs through this tool yet. The local mock client (`npm run check`) does not call OpenAI.

## Architecture

The working `Script Auto` app stays untouched. This workspace proves the next architecture for a StudioNow pilot:

```text
Vercel UI/API
  -> Supabase job row
  -> Node worker claims the job
  -> Agent workflow produces staged artifacts
  -> Supabase stores progress, examples, feedback, and final output
  -> UI reads job state and downloads Word deliverables
```

## What Is Different

The old app asks one model to do everything with one large prompt.

This version creates two staged creative paths:

- **First Draft**: faster default path for getting to an editable script. It diagnoses, mines, retrieves examples, builds a blueprint, writes, runtime-checks, and formats deliverables. It skips visual intake, concept-option selection, and critic/revision.
- **Full Producer**: deeper path for complex briefs, heavy attachments, visual references, and higher-stakes drafts. It runs the full agent workflow below.

The full workflow is:

1. **Diagnoser** locks the assignment and flags missing inputs.
2. **Miner** extracts usable material from the brief and attachments.
3. **Example Retriever** finds relevant StudioNow scripts and brief/script pairs.
4. **Strategist** chooses the story engine and direction.
5. **Producer** designs the moving film: motif, chapters, transitions, feasibility.
6. **Writer** writes the three-column script from the blueprint.
7. **Runtime Editor** cuts to the actual time budget.
8. **Critic** rejects generic, overlong, or unproduceable work.
9. **Formatter** creates the final client-facing script and producer notes.

The important artifact is the **Script Blueprint**. Every later stage is judged against it.

## Quick Local Proof

This runs the workflow with a mock model client, so it does not require API keys:

```bash
npm run demo
```

Run three regression briefs:

```bash
npm run demo:quick
```

Run the smoke check:

```bash
npm run check
```

Outputs are written to `outputs/local-runs/`.

## Example Memory

Gold examples are the system's taste memory. There are two ingestion paths:

```bash
npm run training:ingest
```

Builds paired examples from `training/processed/pairing_manifest.json`.

```bash
npm run examples:ingest
```

Imports script-only taste references from the original `../Script Auto/examples` folder.

The workflow reads `training/processed/example_memory.json`, retrieves the most relevant examples per job, and records example usage in Supabase when running live.

## Real Worker Setup

1. Create a Supabase project or reuse the project for this prototype.
2. Run `supabase/schema.sql` in the SQL editor.
3. Copy `.env.example` to `.env`.
4. Fill in:

```text
OPENAI_API_KEY
OPENAI_MODEL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_ANON_KEY
```

5. Install dependencies:

```bash
npm install
```

6. Start the local UI/API:

```bash
npm run dev:web
```

7. Start the worker:

```bash
npm run worker
```

## Hosting Recommendation

Use GitHub plus Vercel for the UI/API surface, Supabase for state and artifacts, and a persistent Node worker for the creative workflow.

For the first StudioNow pilot, run the worker on Railway, Render, Fly.io, or another always-on Node host. The worker does not need public web traffic. It only needs environment variables and outbound access to Supabase and the model API.

Vercel-compatible API entrypoints live in `api/`. The original Netlify-compatible functions remain in `apps/web/netlify/functions/` because they are also used by the local dev server.

## Pilot Loop

The system should improve through review, not silent prompt drift:

1. StudioNow submits a brief.
2. The worker generates staged artifacts and final Word deliverables.
3. A human rates the result, adds feedback, and can mark it as a gold candidate.
4. Gold examples become retrievable taste references after review.
5. Regressions stay visible through `npm run check` and saved local run artifacts.
