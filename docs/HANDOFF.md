# Handoff to StudioNow

This document is for the meeting where ownership of the Script Agentic project transitions from Eli (consultant) to StudioNow. It states what is being handed over, what works today, what does not, what costs to expect, and what decisions StudioNow needs to make to take the project forward.

## What Is Being Handed Over

| Asset | Where it lives today | Action required to transfer |
|---|---|---|
| Source code | Eli's laptop, single local git repo at `/Users/eli/Downloads/StudioNow/Script Agentic` | Push to private StudioNow-owned GitHub repo |
| Agent prompts and contracts | `packages/studionow-agents/src/` | Travels with the repo |
| Reference library (15 markdown files) | `references/` | Travels with the repo |
| Example memory (366KB JSON) | `training/processed/example_memory.json` | Travels with the repo |
| Supabase schema | `supabase/schema.sql` | StudioNow runs against its own Supabase project |
| OpenAI API access | Eli's personal `.env` with an API key | Replace with a StudioNow-owned OpenAI account |
| Raw client materials | `training_drop/` (excluded from Git) | Stays local; or, transferred under StudioNow's data policy |
| Deployment | Not deployed anywhere yet | StudioNow chooses Vercel + Railway/Render and connects them |
| Documentation | `README.md`, `docs/ARCHITECTURE.md`, `docs/AGENT-CONTRACTS.md`, `docs/DEPLOYMENT.md`, `docs/PILOT-READINESS.md`, this file, and `docs/OPERATING-GUIDE.md` | Travels with the repo |

## What Works Today (Verified)

- The full nine-stage agent workflow runs end-to-end against a real model (gpt-5) and produces a usable three-column production script.
- Reference run on `spec-pibb` (Mr. Pibb :30 spec): critic passes at 92, output is specific and produceable, total cost $0.31.
- Token and cost telemetry is captured per stage and rolled up per job, both in events and in `script_jobs` columns.
- Example memory retrieval pulls the three most relevant StudioNow scripts per brief.
- The deterministic runtime gate parses the three-column table and flags VO density issues that the model cannot self-grade out of.
- Feedback capture (rating, verdict, comment, gold-candidate flag) is wired in the UI and the schema.
- The Vercel UI/API surface and the persistent Node worker share a single code base.
- The mock smoke run (`npm run check`) passes the three regression briefs end-to-end without calling any external service.

## What Does Not Work Today (Honest Gaps)

These need to be addressed before wider StudioNow usage. None is a redesign — each is bounded work.

- **No authentication.** Anyone with the deployed URL can submit briefs. Required before exposing confidential client material.
- **File upload exists, but is still pilot-grade.** The web UI accepts images and PDFs, PDFs are converted into page images, and the Visual Intake agent inventories attached visuals. This is enough for pilot testing. It is not yet a production asset-management system because uploaded files are not stored in a durable asset library with ownership, permissions, or review status.
- **No deployment.** The project has not yet been pushed to a remote GitHub repo or deployed to Vercel or a worker host. Local-only.
- **No gold-promotion workflow.** Reviewers can flag a draft as a gold candidate, but there is no path to upload the final human-edited script that closes the learning loop.
- **No automated tests.** The smoke check exercises the mock workflow but does not validate schemas, runtime gate edge cases, or repository behavior under stress.
- **Stage counter undercounts.** The "stages" field in the final totals event reports fewer stages than ran. Cost number is correct; stage attribution is off. Minor.
- **Netlify/Vercel duality.** The API layer is implemented as Vercel handlers that wrap Netlify functions. Functional, but two deployment patterns coexisting in one repo. Should consolidate.
- **Single-process worker.** Fine for the pilot; needs monitoring and a restart strategy before production usage.

## Costs to Expect

| Item | Cost | Notes |
|---|---|---|
| OpenAI per brief on gpt-5 | ~$0.30 | Based on the validated spec-pibb run. Range: $0.20–$0.50 depending on brief length and revision loops. |
| 10 pilot users × 5 briefs each | ~$15 | One-time pilot cost. Negligible. |
| Ongoing usage at, say, 50 briefs/month | ~$15/month | Linear with usage. |
| Vercel hosting | $0 on Hobby, $20/month per member on Pro | Pro plan only required if you also want Password Protection (one auth option). |
| Supabase | $0 on Free, $25/month on Pro | Free tier likely covers the pilot. |
| Worker host (Railway or Render) | $5–$10/month | Single small instance is enough for the pilot. |
| **Pilot total (3 months)** | **roughly $100–$200** | Mostly infrastructure, not API. |

OpenAI cost is the only variable that scales with usage. Everything else is fixed.

## Asset Ownership Transfer Checklist

Items below should move from Eli-controlled to StudioNow-controlled before the pilot opens.

- [ ] Create a private GitHub repo under a StudioNow GitHub organization. Push the local repo to it.
- [ ] Create a StudioNow OpenAI organization (or use an existing one). Generate a new API key. Retire Eli's personal key.
- [ ] Confirm OpenAI account data-retention posture (see `README.md` data-handling notice). Document the decision in writing.
- [ ] Create a StudioNow Supabase project. Apply `supabase/schema.sql`.
- [ ] Decide and configure authentication (see "Open Decisions" below).
- [ ] Provision a worker host (Railway, Render, or Fly.io) on a StudioNow-billable account.
- [ ] Provision a Vercel project on a StudioNow-billable account, connected to the GitHub repo.
- [ ] Decide where `training_drop/` (raw client materials) lives if anywhere outside Eli's laptop.

## Roles StudioNow Needs to Fill

The system improves only when humans feed it specific feedback. Plan for these roles even if one person wears more than one hat.

| Role | Responsibility | Time commitment |
|---|---|---|
| **Product owner** | Decides which briefs go through the pilot, what counts as success, when to expand or contract scope. Eli's equivalent. | A few hours per week |
| **Operator** | Watches for failed jobs, monitors per-job cost, restarts the worker when needed, applies schema migrations. | An hour per week, more during incidents |
| **Curator** | Reviews submitted feedback, decides which drafts become gold examples, runs periodic re-ingestion of `example_memory.json`. | A few hours per month |
| **Reviewers** | The 5–10 people scoring drafts, leaving comments, and uploading final human-edited scripts. | 15–30 minutes per brief reviewed |
| **Engineering support** | Someone with Node/JavaScript familiarity who can touch the agent prompts, schemas, and workflow when patterns emerge. Does not need to be full-time. | A few hours per month, more during the first weeks |

The pilot does not need all five roles staffed before it starts. It does need an explicit owner for each role.

## Open Decisions for StudioNow

These need answers before the pilot opens. They are not technical questions; they are policy and operating questions only StudioNow can answer.

1. **Authentication method.** The three viable options are documented in the conversation history with Eli. Recommended: Supabase magic-link auth for per-user accountability, or Vercel Password Protection for the fastest possible gate.
2. **OpenAI data posture.** Confirm whether the StudioNow OpenAI account has training opt-out and whether Zero Data Retention is required for client work.
3. **Pilot user list.** Which 5–10 people will receive briefs and provide feedback during the pilot.
4. **Pilot brief set.** Which 5–10 briefs will run through the system, mixing known-good ones, unknown ones, and known-hard ones.
5. **Success criteria.** What does "the pilot worked" mean. Suggested measures: drafts are usable as starting points more often than not, reviewers find specific feedback worth giving, gold examples accumulate.
6. **Whether Eli stays available** for engineering support during the pilot, and on what terms.

## Recommended First 30 Days

A pilot-readiness sequence that minimizes risk and surfaces real signal quickly.

**Week 1** — Asset transfer.
- Repo to StudioNow GitHub.
- OpenAI account provisioned.
- Supabase project created and schema applied.
- Authentication wired and tested.
- Vercel and worker deployed.

**Week 2** — End-to-end deployed test.
- Run the same `spec-pibb` brief through the deployed system. Match local results.
- Run two more briefs from `evals/briefs.json`. Confirm artifacts, downloads, and feedback all work.
- Train two reviewers on the feedback flow.

**Week 3** — First real briefs.
- Run three real StudioNow briefs through the pilot. Watch for failure modes that did not appear in synthetic briefs.
- Collect reviewer feedback on every output.

**Week 4** — Review and adjust.
- Read every comment. Categorize by stage (diagnosis wrong, blueprint wrong, writer voice off, etc.).
- Make one prompt or schema change per category.
- Promote any drafts that, with human edits, deserve to be gold examples.
- Re-ingest example memory.

The point of these four weeks is not to ship a finished product. It is to learn whether the agentic architecture earns its complexity under real StudioNow workflows. The architecture compounds only with feedback discipline.

## What Will Not Be Handed Over

For clarity, these are not part of the handoff:

- Eli's personal OpenAI account or API key.
- Eli's personal GitHub account credentials.
- Any raw client materials Eli has not been explicitly authorized to share.
- The standalone `Script Auto` project, which is a separate codebase and not part of this transition.

## Contact and Continuity

If Eli stays involved, define explicitly:

- Hours per week or month committed.
- Whether they touch production or only code.
- Whether they have direct Supabase or production access, or work through pull requests only.
- Escalation path when something breaks.

If Eli does not stay involved, ensure engineering support is named and onboarded before the pilot opens. The system is operable by a competent Node developer reading this repo's docs, but the first month will go faster with someone Eli has briefed directly.
