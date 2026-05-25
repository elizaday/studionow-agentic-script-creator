# Blind Bakeoff Scoring Rubric

You are scoring script outputs **without knowing which system produced each one.** Each output has an anonymous code (e.g., `A7`). Score every output on the six axes below, then give the one verdict that matters most: edit or rewrite.

Do not try to guess which system wrote it. The point is to find out which one StudioNow producers actually prefer when they can't see the label.

## How to run it

1. The harness produced 30 anonymized agentic outputs in `evals/bakeoff/outputs/` (10 briefs × 3 agentic modes). Each is a folder with `script.md` and, where present, `producer-notes.md`.
2. Run each of the 10 briefs through **Legacy** (studionow.netlify.app) yourself and drop each result into `evals/bakeoff/outputs/legacy-<code>/script.md` using the codes listed in `legacy-slots.md`.
3. Open each output, score it on this rubric in `scoresheet.csv`. Score blind — don't open the answer key.
4. When all are scored, reveal `answer-key.json` and aggregate by arm.

## The six axes (score each 1–5)

| # | Axis | 1 | 5 |
|---|---|---|---|
| 1 | **Brief alignment** | Solves a different, adjacent assignment | Nails the actual ask, including the constraints |
| 2 | **StudioNow voice** | Generic AI brand-film language | Sounds like StudioNow — specific, confident, no filler |
| 3 | **Produceability** | A team couldn't build this without guessing | A producer/editor/VO artist knows exactly what to make |
| 4 | **Runtime realism** | VO clearly won't fit the runtime | Fits the time and still breathes |
| 5 | **Distinctiveness** | Could be swapped onto any brand | Unmistakably this brief, this brand, this moment |
| 6 | **Producer notes usefulness** | Missing, or generic boilerplate | Asset matrix, clearances, music, risks a producer would actually use. **Score N/A if the arm produced no notes (Legacy, Quick Draft).** |

## The verdict that decides everything

For each output, mark one:

- **EDIT** — "I would start from this and edit it." (A win.)
- **REWRITE** — "I would throw this out and start over." (A loss.)

This single binary is the headline result. A system whose outputs are "edit, not rewrite" 70%+ of the time is worth using. Below that, it isn't.

## Also capture (from the harness output, not your judgment)

- **Time to output** (seconds) — from the run log
- **Cost** (USD) — from the run log

These are recorded automatically per run; you don't score them, but they go in the final comparison.

## How to read the results

After revealing the answer key, for each arm compute:

- **% EDIT** (the headline — target 70%+)
- **Mean total score** (axes 1–5, plus 6 where applicable)
- **Mean producer-notes score** (production + deep arms only — target 4+ on package jobs)
- **Median time** and **mean cost**

Then the decision is mechanical:

- If **Production** wins on % EDIT and producer-notes usefulness at roughly half the time/cost of **Deep**, Deep mode is ceremony — cut it or keep it as a rare opt-in.
- If **Quick Draft** matches **Legacy** on script quality, the cheap agentic path is justified by the runtime gate + retrieval alone.
- If **Legacy** beats all agentic arms on script quality, the agentic system's only justification is the producer notes — decide whether that alone is worth the product.

The data answers the question. Don't pre-decide it.
