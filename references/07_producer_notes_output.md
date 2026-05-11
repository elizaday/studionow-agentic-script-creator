# Producer Notes Output

This is a separate deliverable from the client script. It is written for production: editors, animators, designers, producers. It tells them what they need to build the film.

Never mix producer notes into the client-facing script document. They are two separate files.

## When to generate producer notes

Always. Every script gets a Producer Notes document alongside the client script. No exceptions.

## Document format

```
PRODUCER NOTES
[Script Title]
Date: [M/D/YY]
Version: [Matches script version]
```


## Section 0: Red flags

Call out anything that could break the schedule or budget:
- missing hero asset
- approval bottleneck
- heavy graphics load
- unrealistic AI generation dependency
- rights risk

## Section 1: Asset sourcing matrix

For every visual called out in the script, categorize the source:

| Script Ref | Visual | Source Type | Status | Priority | Notes |
|-----------|--------|-------------|--------|----------|-------|
| [:00-:03 / CH1] | [Description] | Existing footage / Stock / To-shoot / AI-generated / Archival / Motion graphics | Available / Needs sourcing / Needs approval / Placeholder | High / Medium / Low | [Specifics] |

Source type definitions:
- **Existing footage**: Client already has this. Name the source if known.
- **Stock**: Available through licensing platforms. Include search terms.
- **To-shoot**: Requires new production. Flag scope.
- **AI-generated**: Can be created with AI tools. Include prompt direction (see Section 5).
- **Archival**: Historical footage requiring rights clearance.
- **Motion graphics**: Requires design and animation. Flag complexity.

## Section 2: Approval flags

List everything that requires sign-off before production:

- Executive or talent likeness
- Brand logos and partner marks
- Broadcast or sports footage
- Stadium or event venue footage
- Celebrity appearances or references
- Historical recreations
- City-specific branded activations
- AI-generated faces or recognizable resemblances
- Any footage from controlled events

For each flag, name who likely needs to approve and what the risk is if approval is delayed or denied.

## Section 3: Missing assets and placeholders

When the script calls for footage or visuals that do not currently exist or may not be available:

1. **Flag it clearly.** Do not bury it in the visual column.
2. **Suggest a placeholder.** What can production use in the interim?
3. **Provide fallback options.** If the ideal asset never materializes, what is the backup?

Format:
```
MISSING ASSET: [Description]
Ideal: [What the script calls for]
Placeholder: [What to use while sourcing]
Fallback: [Alternative if ideal is unavailable]
Search terms: [For stock or licensing platforms]
```

## Section 4: Graphics and motion design load

Estimate the motion graphics workload:

- Number of SUPER cards
- Number of animated transitions
- Data visualizations or chart animations
- Recurring graphic frameworks (strategic pillars, progress trackers)
- Brand lockup and end card specs
- Complexity rating: Light / Moderate / Heavy

If the graphics load is heavy, flag it. A script that calls for 15 custom animations in a :60 is not realistic on a fast timeline.

## Section 5: AI prompt direction

When visuals are flagged as AI-generated, include practical prompt language:

```
AI VISUAL: [Script reference]
Style: [Art direction: photorealistic, illustrated, abstract, etc.]
Subject: [What is in the frame]
Motion: [Camera move, element behavior, transformation]
Mood: [Lighting, color palette, energy]
Constraints: [What to avoid: recognizable faces, specific logos, etc.]
```

This gives the AI artist a starting point, not a finished prompt. Human curation is always required.

## Section 6: Music and sound direction

Reference the tone system (08) and music direction (14) for:
- Recommended tempo range and genre
- Energy curve across the script
- Whether the piece is underscore-driven, featured track, or sound design-driven
- Licensing search terms for music platforms
- Key moments where music must shift, drop, or build

## Section 7: Localization notes (when applicable)

If the script is modular or needs market versions:
- Which elements are locked vs. variable
- Asset requirements per version
- Local footage sourcing needs
- Translation and VO re-record requirements

## Section 8: Timeline and feasibility

Flag anything that could affect the production schedule:
- Footage that requires rights clearance (timeline risk)
- Shoots that need scheduling
- Heavy motion graphics (design time)
- Multiple rounds of AI generation and curation
- Stakeholder approvals that could bottleneck

Be honest. If the script as written requires three weeks of motion design and the timeline is five days, say so.

## Guiding principle

The producer notes exist so that no one reads the client script and asks, "But how do we actually make this?" Every question production would have should be answered here, or at least flagged as an open item.
