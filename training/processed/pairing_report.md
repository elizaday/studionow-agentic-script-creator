# Training Pairing Report

Source folder: `training_drop/`

Assumption: user said these should be treated as usable examples. Confidence only reflects pairing confidence, not creative quality.

## High-confidence pairs

### Advanced Hydration Portfolio Sizzle

- ID: `advanced-hydration-portfolio`
- Confidence: `high`
- Type: `umbrella-brief-to-script`
- Brief: `training_drop/Advanced Hydration_vw_sw_pa_ba_Brief.pdf`, `training_drop/SN_RTS27_INTAKE FORM (1).pdf`
- Script: `training_drop/Advanced_Hydration_Sizzle_V3.docx`
- Notes: Portfolio script covers Smartwater, Vitaminwater, Powerade, and BODYARMOR. Composite brief contains Vitaminwater, Powerade, and Smartwater copy; Smartwater intake adds audience/goal detail. BODYARMOR detail is sparse or blank in extracted brief text.

### RTS Vitaminwater Sizzle

- ID: `vitaminwater-rts27`
- Confidence: `high`
- Type: `brief-section-to-script`
- Brief: `training_drop/Advanced Hydration_vw_sw_pa_ba_Brief.pdf`
- Script: `training_drop/SN_RTSVW_FinalScript.docx`
- Notes: Matches Vitaminwater section in composite Advanced Hydration brief: Built Different, #1 functional flavored water, growing 2x category, Zero Sugar, Focus+, Protein, 28oz, multipacks.

### RTS Powerade Sizzle

- ID: `powerade-rts27`
- Confidence: `high`
- Type: `brief-section-to-script`
- Brief: `training_drop/Advanced Hydration_vw_sw_pa_ba_Brief.pdf`
- Script: `training_drop/_RTS27 Powerade.docx`
- Notes: Matches Powerade section in composite brief: Power Water/Grape, FIFA Women's World Cup/summer of soccer, back to school with Jesser.

### RTS Minute Maid Sizzle

- ID: `minute-maid-rts27`
- Confidence: `high`
- Type: `intake-to-script`
- Brief: `training_drop/SN_RTS27_INTAKE FORM - Minute Maid (1).pdf`
- Script: `training_drop/SN_MM_RTS_finalscript_4.14.26.docx`
- Notes: Direct match: Minute Maid RTS sizzle, WWE partnership, swagger/vibrancy, recent successes and future plans.

### RTS Water, Tea, and Coffee Intro

- ID: `water-tea-coffee-rts27`
- Confidence: `high`
- Type: `intake-to-script`
- Brief: `training_drop/SN_RTS27_INTAKE FORM_Water Tea Coffee Intro Video_80_.pdf`
- Script: `training_drop/Script_TOS_RTS27 Water, Tea, Coffee Script .docx`
- Notes: Direct match: Water, Tea, and Coffee team intro, Topo Chico, Dasani, Peace Tea, Gold Peak, Fuze, Dunkin RTD, Costa; script introduces Daily Drivers portfolio idea.

## Low-confidence or script-only items

### RTS BODYARMOR Sizzle Compact Script

- ID: `bodyarmor-rts27-compact`
- Confidence: `low`
- Type: `script-only-or-low-confidence-umbrella`
- Brief: `training_drop/Advanced Hydration_vw_sw_pa_ba_Brief.pdf`
- Script: `training_drop/SN_Script - RTS_BODYARMOR SIZZLE_040826.docx`
- Notes: Likely same RTS/Advanced Hydration batch, but extracted composite brief has BODYARMOR heading with no substantive BodyArmor brief detail. Treat as script-only unless a BodyArmor intake appears.

### RTS BODYARMOR Sizzle Extended Outline

- ID: `bodyarmor-rts27-extended`
- Confidence: `low`
- Type: `script-only-or-low-confidence-umbrella`
- Brief: `training_drop/Advanced Hydration_vw_sw_pa_ba_Brief.pdf`
- Script: `training_drop/BODYARMOR RTS Sizzle Script [EXT].docx`
- Notes: Extended outline shares BODYARMOR/Choose Better strategy with compact script. No full matching brief text found in the batch. Useful as a script-only style/strategy example.

### Dunkin Donuts RTS Sizzle

- ID: `dunkin-rts27`
- Confidence: `none`
- Type: `orphan-script`
- Brief: _None found_
- Script: `training_drop/SN Script V3_Dunkin Donuts RTS_42826_.pdf`
- Notes: No matching Dunkin intake/brief found in this batch. Keep as script-only usable example unless the brief is added later.

## Files with no standalone pair

- `training_drop/SN_RTS27_INTAKE FORM (1).pdf`: Smartwater intake. It appears to support the Smartwater portion of `Advanced_Hydration_Sizzle_V3.docx`, but there is no standalone Smartwater-only final script in this batch.
- `training_drop/SN Script V3_Dunkin Donuts RTS_42826_.pdf`: script-only; no matching brief found.
- `training_drop/BODYARMOR RTS Sizzle Script [EXT].docx` and `training_drop/SN_Script - RTS_BODYARMOR SIZZLE_040826.docx`: likely BODYARMOR RTS examples, but no substantive BodyArmor intake/brief text was found.

## Recommended handling

- Ingest high-confidence pairs as paired examples.
- Ingest low-confidence BODYARMOR and Dunkin as script-only examples until matching briefs are added.
- Treat `Advanced Hydration_vw_sw_pa_ba_Brief.pdf` as a composite/umbrella brief that can feed multiple section-level examples.
