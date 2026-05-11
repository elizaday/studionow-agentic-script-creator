# Architecture

This prototype separates the product surface from the creative workflow.

```text
Browser
  -> Vercel or local API function
  -> Supabase job row
  -> Worker claims job
  -> Agent workflow creates artifacts
  -> Browser reads status, critique, feedback, and final output
```

## Why This Shape

The original app is synchronous: one request, one large prompt, one output.

The agentic app is stateful: one job, many staged judgments, many artifacts, one final output.

That lets the system show its work:

- What the brief actually asks for.
- What assumptions were made.
- Which examples were retrieved.
- Which concept engine was chosen.
- Whether the user selected a direction.
- How the film moves visually.
- Where runtime was cut.
- What the critic rejected.
- What the human reviewer wants the system to learn.

## Runtime Boundary

The UI/API layer should not run the full creative workflow. It should create jobs, read jobs, save feedback, select directions, and serve documents.

The Node worker owns the long-running process because it needs:

- retries
- progress events
- file processing
- model calls across multiple agents
- possible user checkpoints
- revision loops
- deterministic runtime gates

## Data Boundary

Supabase stores workflow state. It is not the creative engine.

Tables:

- `script_jobs`: one row per script request
- `script_job_events`: visible progress log
- `script_artifacts`: staged outputs and final deliverables
- `script_feedback`: reviewer ratings, comments, verdicts, gold-candidate signals
- `script_examples`: future DB-backed example library
- `script_job_example_usage`: audit trail for retrieved examples

## Agent Boundary

Each agent owns one decision.

- Diagnoser: assignment truth
- Miner: source material
- Example Retriever: relevant taste memory
- Strategist: engine and direction
- Producer: film in motion
- Writer: script language
- Runtime Editor: time budget
- Critic: quality gate
- Formatter: final delivery

Do not let every agent do everything. That recreates the old giant prompt.

## Learning Boundary

The system should not automatically treat every generated output as training data.

Gold-level learning should require a human signal:

- rating
- verdict
- written feedback
- optional gold-candidate flag
- ideally the final human-edited script

The first loop can stay file-backed through `training/processed/example_memory.json`. Once the pilot has enough reviewed work, promote gold examples into `script_examples` and use that table as the primary retrieval source.
