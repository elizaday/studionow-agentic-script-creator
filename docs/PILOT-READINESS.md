# StudioNow Pilot Readiness

## Intent

Make the tool usable by StudioNow producers and reviewers without pretending it is already a finished platform.

The pilot should answer three questions:

1. Can the agent create a credible first script from a real brief?
2. Can humans see why it made its choices?
3. Can the system improve from gold examples and direct feedback?

## Strong Today

- The architecture has the right boundaries: UI/API, Supabase state, persistent worker, staged agents.
- The workflow produces visible artifacts instead of hiding everything inside one prompt.
- Runtime honesty is enforced with a deterministic gate, not just model self-reporting.
- Word document downloads exist for the client script and producer notes.
- Example memory now includes paired training examples plus script-only references from the original Script Auto example library.
- Human feedback has a first data path: rating, verdict, comment, and gold-candidate flag.

## Weak Today

- Authentication is not in place. Do not expose client briefs publicly.
- File upload is pilot-grade, not production-grade. The web UI can accept images and PDFs, and the worker can convert PDFs into page images for visual intake, but uploaded files are not yet managed as durable assets with ownership and review status.
- Gold promotion is captured as a signal, but not yet a full review workflow that stores the final human-edited script.
- The UI is functional but still prototype-level. It needs a clearer review experience before StudioNow-wide usage.
- Example retrieval is file-backed. That is good for speed now, but DB-backed examples will be cleaner once reviewers start adding feedback.
- The worker is a single process. That is fine for a pilot, but it needs monitoring before production usage.

## Trim Before GitHub

- Do not commit `.env`, `.env.*`, `.vercel/`, `.netlify/`, `outputs/`, or `node_modules/`.
- Keep `training_drop/` out of Git unless StudioNow explicitly approves storing raw client files in the private repo.
- Keep old local run outputs local. They are useful for debugging, not for the pilot repo.
- Avoid adding more prompt files unless there is one canonical source of truth for each stage.

## Add Before Wider Use

- Authentication for StudioNow users.
- Basic job ownership: who submitted, who reviewed, who approved.
- Durable file storage for briefs, decks, reference scripts, uploaded visuals, and final human edits.
- A "promote to gold" workflow that requires the final human-approved script, not just the model draft.
- A reviewer dashboard for jobs needing feedback.
- A small evaluation set that represents StudioNow's most common work: sizzle, explainer, award case, internal opener, social cutdown.
- Cost and latency logging per job.

## Pilot Rules

- Treat every generated script as a draft until a human marks it reviewed.
- Treat gold examples as curated examples, not automatic model training.
- Keep production notes separate from the client script.
- Capture why a script is good or bad in reviewer language the agent can reuse.
- Prefer fewer, sharper gold examples over a large pile of mixed quality scripts.

## First StudioNow Pilot

Start with 5 to 10 briefs:

- 3 briefs with known gold scripts
- 3 briefs without scripts, reviewed by StudioNow
- 2 edge cases that usually break the current workflow

For each job, capture:

- rating from 1 to 5
- verdict
- what worked
- what failed
- final human-edited script
- whether it should become a gold example

The pilot is successful when the system consistently produces drafts that are specific, produceable, and worth editing rather than rewriting from scratch.
