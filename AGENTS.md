# StudioNow Agentic Prototype

This workspace is the experimental agentic version of the StudioNow Script Creator.

## Hard Boundary

Do not modify `/Users/eli/Downloads/StudioNow/Script Auto` from this workspace. That project is the working baseline.

## Product Goal

Build a staged script-creation system where each agent owns a specific judgment:

1. Diagnose the brief.
2. Mine usable source material.
3. Choose the concept engine and direction.
4. Build the producer blueprint.
5. Draft the script.
6. Enforce runtime and density.
7. Critique and revise.
8. Format final deliverables.

The goal is not "more prompts." The goal is disciplined disagreement and traceable creative decisions.

## Output Standard

Final scripts must still honor the StudioNow canon:

- Three-column script format: `AUDIO/VO | TC | VISUALS`
- Metadata header
- Motion-driven visuals
- A transforming visual motif
- Runtime honesty
- Producer notes where needed
- No em dashes in deliverables

## Architecture

- `apps/web`: Netlify UI and serverless functions.
- `apps/worker`: Long-running Node worker that runs the agent workflow.
- `packages/studionow-agents`: Agent prompts, schemas, and workflow contracts.
- `references`: StudioNow canon copied from the working project.
- `evals`: Regression briefs and scoring criteria copied from the working project.

## Development Rule

Keep this prototype small and testable. Add agents only when their judgment is distinct.
