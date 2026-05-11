# Deployment

## Recommended Pilot Shape

Use the split that matches the workflow:

```text
GitHub private repo
  -> Vercel static UI and API functions
  -> Supabase Postgres state and artifacts
  -> Persistent Node worker
```

Vercel should create jobs, read status, save feedback, serve downloads, and host the UI. It should not run the full creative workflow.

The worker owns model calls, retries, file processing, revision loops, and human-in-the-loop resumes.

## Vercel

Connect the private GitHub repo to Vercel.

Project settings:

```text
Framework preset: Other
Build command: echo "Static prototype, no build step"
Output directory: apps/web/public
Install command: npm install
```

The repo includes `vercel.json` for the same settings and Vercel API functions under `api/`. Vercel's project configuration supports file-based `buildCommand`, `functions`, and `outputDirectory` settings in `vercel.json`: https://vercel.com/docs/project-configuration

Environment variables:

```text
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The service role key is used only inside server-side API functions. Do not expose it in browser code.

## Supabase

Run `supabase/schema.sql` in the Supabase SQL editor.

Core tables and functions:

- `script_jobs`: job state, selected direction, review status, human verdict
- `script_job_events`: visible event log and stage metrics
- `script_artifacts`: staged outputs and final deliverables
- `script_feedback`: human feedback and gold-candidate signals
- `script_examples`: future DB-backed example library
- `script_job_example_usage`: which examples influenced each job
- `claim_next_script_job()`: worker claim function using `for update skip locked`

For a pilot, keep Row Level Security disabled until authentication is added, or add explicit service-role-only policies and test them carefully. Do not make this public without authentication.

## Worker Host

Recommended first hosts:

- Railway service
- Render background worker
- Fly.io machine

Worker command:

```bash
npm install
npm run worker
```

Worker environment variables:

```text
OPENAI_API_KEY
OPENAI_MODEL
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
WORKER_POLL_INTERVAL_MS
WORKER_MAX_REVISION_LOOPS
```

The worker can scale horizontally later because jobs are claimed through Supabase with row locking. For the first pilot, run one worker until the feedback loop is proven.

## Future Vercel Workflow Option

Vercel Workflow and Vercel Queues are worth revisiting once the pilot proves usage and failure modes. They could eventually replace the separate worker with a durable Vercel-native workflow. For now, a persistent Node worker is simpler, more inspectable, and easier to debug with Supabase as the source of truth.

References:

- https://vercel.com/docs/workflow
- https://vercel.com/docs/queues

## Local Smoke Test

The local demo does not call OpenAI or Supabase.

```bash
npm run check
```

It uses the deterministic mock client to prove the workflow, artifacts, final formatting path, and runtime gates before live wiring.
