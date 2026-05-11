# Scoring Criteria

The test runner uses Claude to grade each script output against these criteria. Every script is scored on 8 universal dimensions (1–5 each, 40 points max), plus brief-specific checks (pass/fail).

## Universal Dimensions (scored 1–5)

1. **Brief alignment** — Does the script solve the actual assignment? Not a cooler adjacent version.
2. **Engine clarity** — Is there a recognizable structural engine, or just scenes in order?
3. **Runtime realism** — Could this actually fit the stated runtime and still breathe? Count VO words (~2.5 words/sec).
4. **Production usefulness** — Would a production team, editor, or VO artist know exactly what to build?
5. **Language quality** — Is the writing sharp and specific? No generic filler, no blacklisted phrases?
6. **Emotional specificity** — Real human stakes, or abstract corporate uplift? Are behaviors/gestures named, or just feelings described?
7. **Format correctness** — Three-column table, proper metadata header, SUPER formatting, SFX conventions?
8. **Distinctiveness** — Is this unique to this brief, or could it be swapped onto any brand?

## Story Arc Dimensions (scored 1-5)

9. **Opening tension** — Does the opening surface a real contradiction, friction, or immediate relevance in the first 8 seconds? Or is it a flat statement that could open any brand film?
10. **Middle progression** — Does the middle build momentum, with each beat advancing the argument or raising the stakes? Or could the sections be reordered without anyone noticing?
11. **Ending payoff** — Does the ending resolve the tension from the opening? Does the audience feel the distance traveled? Or does the script just stop and paste a tagline?
12. **Overall movement** — Can you name three different emotional states for the audience at open, middle, and close? If the states are the same, the script has no arc.

## Visual Filmmaking Bonus (up to +3 points added to total)

Score these 0 or 1 each. These reward producer-level visual writing:

13. **Visual motif** (+1) — Is there a visual element (material, color, graphic) that transforms through the piece? Not just present, but evolving.
14. **Transitions** (+1) — Does each section visually flow into the next via transformation? Or do sections cut cold?
15. **Motion in visuals** (+1) — Do visual descriptions contain movement and camera behavior? Or do any read like stock photo captions ("diverse people enjoying moments")?

Add these bonus points to the total (max becomes 63: 12 dimensions x 5 = 60, plus 3 bonus).

## Blacklist Check (automatic)

Flag any occurrence of these words/phrases in the VO column:
- coveted, unforgettable, world-class, immersive, leverage/leveraging, best-in-class
- building anticipation, a celebration of, this is more than, iconic, a journey (non-literal)
- greatness, transformative, cutting-edge, groundbreaking, game-changing, synergy, holistic

Each blacklisted phrase found = -1 point from Language quality.

## VO Density Check (automatic)

Count the VO words in the script. Check them against the tone's VO density range:
- Tech-Forward: 70-80% | Emotion-Driven: 50-65% | Product-Led: 70-80%
- Brand-Led: 60-75% | Commercial/Cinematic: 20-40% | Human/Documentary: 50-70%
- Confident/Corporate: 75-85% | Direct/Informational: 80-90% | Energetic/Upbeat: 50-65%
- Inspirational: 60-75%

Formula: runtime (seconds) x 2.5 x density percentage = adjusted target.
Flag if VO word count is more than 20% above or below the adjusted target range.

## Brief-Specific Checks (pass/fail)

### award-sprint
- [ ] Has chapter/section structure
- [ ] Contains at least 3 specific metrics with baselines (e.g., "+18% vs YA")
- [ ] Includes a contrast pivot (crisis before triumph)
- [ ] Mentions Gen Z / culture-first approach
- [ ] Pivot happens before :55

### explainer-pulse
- [ ] Names the platform ("Pulse") within first 15 seconds
- [ ] References the 3 legacy tools it replaces
- [ ] Shows UI/UX visual descriptions (not just abstract concepts)
- [ ] Addresses skepticism (the "yet another tool" problem)
- [ ] Includes a clear before/after contrast

### sizzle-food
- [ ] Uses localization brackets for city-variable elements
- [ ] Identifies locked vs variable elements
- [ ] Visual descriptions are sensory/appetizing (not generic "food shots")
- [ ] Includes SFX (sizzle, pour, fizz — not just music)
- [ ] Feels warm and human, not corporate

### event-opener
- [ ] No VO — music and supers only
- [ ] Nashville location is specific (not generic "city shots")
- [ ] Builds energy toward the CEO intro moment
- [ ] References "The Next Frame" theme
- [ ] Feels like it belongs in a dark ballroom

### spec-pibb
- [ ] No dialogue
- [ ] Humor comes from tonal contrast (serious treatment of mundane)
- [ ] Fits in :30 (max 8 scene beats)
- [ ] Flags AI production considerations
- [ ] Has a gut-punch closing line/moment

### internal-capabilities
- [ ] Shows actual work examples, not just claims
- [ ] Mentions key stats (120K+ projects, 200+ countries)
- [ ] References Coca-Cola partnership specifically
- [ ] Avoids typical agency sizzle energy
- [ ] Addresses what makes StudioNow different (embedded model)

### localization-mm
- [ ] Includes a master script
- [ ] Includes a localization guide with locked/variable breakdown
- [ ] Shows at least 2 market-specific examples
- [ ] Variable elements are behavior/culture-rooted, not just landmarks
- [ ] Bracket syntax is correct

### ai-showcase
- [ ] Covers all 3 use cases (localization, packaging, social)
- [ ] Flags human oversight requirements
- [ ] Feels premium, not like a tech demo
- [ ] Addresses quality concerns for AI-wary audience
- [ ] Shows output, not process

### reg-vague-emotion
- [ ] Diagnoses what is missing from the brief (audience, tension, objective) before writing
- [ ] States assumptions explicitly
- [ ] Does NOT produce a generic nostalgia montage of "people laughing and hugging"
- [ ] Has a specific, nameable tension in the opening (not "people are looking for more")
- [ ] The closing line could only belong to a Coca-Cola film

### reg-just-cool
- [ ] Diagnoses the missing inputs (audience, tension, problem, CTA)
- [ ] Invents a specific tension from the business context
- [ ] Does NOT default to a fast-cut montage of "cool visuals"
- [ ] Has a real story arc (tension > shift > outcome), not just energy
- [ ] VO density matches Energetic / Upbeat range (50-65%)

### reg-sustainability
- [ ] Does NOT use inflated language ("changing the world," "leading the way," "groundbreaking")
- [ ] Acknowledges the 2030 gap honestly (we will not hit 100% without system-level change)
- [ ] Deploys all four key metrics (68% EU, 45% global, $300M, 35% PlantBottle)
- [ ] The tone holds Human / Documentary throughout (no drift to corporate uplift)
- [ ] The closing earns credibility through transparency, not through a rallying cry

### reg-info-dump
- [ ] Opens with the problem (current model wastes resources / underserves stores), not with "here is the new model"
- [ ] The three tiers are explained in a logical progression, not dumped simultaneously
- [ ] Both metrics (18% cost reduction, 22% availability improvement) appear at pivot points
- [ ] Flags localization need (Spanish and Portuguese versions)
- [ ] Has a clear CTA (attend the briefing, contact the transition team)

### reg-still-here
- [ ] VO word count is under 40 words (Cinematic :30 at 30% density = ~22 words target)
- [ ] Visuals carry the narrative, not VO
- [ ] Product presence feels organic, not hero-lit
- [ ] Uses at least one archival element
- [ ] "Still Here" brand line lands as the earned closing, not announced early

### reg-mesa-familia
- [ ] Does NOT reduce Hispanic culture to visual cliches (flags, generic bright colors, sombreros)
- [ ] Names at least one specific food, recipe, or gesture (not "authentic family cooking")
- [ ] Integrates Spanish language moments naturally, not as decoration
- [ ] The emotional progression tracks the consumer journey (arrival > connection > belonging)
- [ ] Sign-up CTA is clear

### reg-ceo-keynote
- [ ] No blacklisted language (especially "world-class," "groundbreaking," "game-changing")
- [ ] All three metrics are correct (8% revenue, 3 categories, 12 carbon-neutral markets)
- [ ] Tone holds Confident / Corporate throughout (no drift to hype or generic inspiration)
- [ ] The piece frames forward momentum, not a victory lap
- [ ] VO density matches Confident / Corporate range (75-85%)

### reg-pulse-explainer
- [ ] Opens with user pain (6 hours/week, 3 tools, missed signals), NOT "Meet Pulse"
- [ ] Names Pulse within the first 15 seconds
- [ ] Covers all three capabilities (dashboards, automated summaries, anomaly detection)
- [ ] Addresses skepticism of "yet another tool"
- [ ] Includes sign-up CTA and Q3 2026 date

### reg-costa-cutdown
- [ ] Picks ONE thread from the :90, does not try to compress the full journey
- [ ] VO word count is under 40 words (:15 max = ~37 words)
- [ ] Feels complete, not like a trailer for a longer piece
- [ ] Uses only footage described as available from the existing :90
- [ ] Tagline "Life Tastes Better With Costa" appears at the close

### reg-fanta-lab
- [ ] All four metrics deployed (4.2M votes, 23% consideration lift, 31% engagement lift, 72-hour sellout)
- [ ] Metrics appear at pivot points, not listed in a data dump
- [ ] The consumer insight (Gen Z wants to be the marketer) drives the narrative structure
- [ ] Has chapter or section structure appropriate for a case study
- [ ] The close zooms out to significance beyond the stats
