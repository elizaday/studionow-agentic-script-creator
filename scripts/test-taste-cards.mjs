#!/usr/bin/env node
// Contamination regression tests for the taste-card system.
//
//   npm run test:contamination
//
// A deliberately "poisoned" example carries a fake brand, tagline, metric,
// and partner name. The tests assert that none of it can reach a prompt
// (card compilation), and that the leak gate catches it if a model ever
// echoes it into an output anyway.

import { compileTasteCard, formatTasteCardsForPrompt, scrubProperNouns, findExampleLeaks } from "../packages/studionow-agents/src/taste-cards.mjs";
import { formatExamplesForAgent } from "../packages/studionow-agents/src/example-memory.mjs";

let failures = 0;
function check(label, cond, detail = "") {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    failures += 1;
    console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ""}`);
  }
}

const POISON = {
  brand: "ZephyrCola",
  tagline: "Taste The Storm",
  metric: "+23%",
  partner: "MegaFest"
};

const poisonedExample = {
  id: "poisoned-test",
  projectName: "ZephyrCola Storm Launch Sizzle",
  client: "ZephyrCola Beverages",
  quality: "gold",
  tags: ["gold", "sizzle", "30s", "zephyrcola"],
  teachingPoints: [
    `Use named real partnerships (MegaFest) as proof points instead of generic culture language.`,
    `The +23% volume growth lands at the beat change, not in a list.`,
    `Open with friction before the brand appears.`
  ],
  briefText: `Client: ZephyrCola Beverages\nFormat: :30 sizzle\nBrief: Launch the Storm campaign with MegaFest partnership. Volume grew +23% vs YA. Tagline: "Taste The Storm".`,
  scriptText: `ZEPHYRCOLA STORM (:30)

| AUDIO / VO | TC | VISUALS |
|---|---|---|
| MUSIC: Storm rumble builds. | 00:00-00:04 | Dark clouds over a stadium crowd at MegaFest. (existing footage) |
| VO: When the storm comes, you taste it first. | 00:04-00:10 | Macro on a ZephyrCola can, condensation racing. (to-shoot) |
| **SUPER:** "Taste The Storm" | 00:10-00:15 | Lightning splits to reveal the ZephyrCola logo. (motion graphics) |
| VO: Up twenty-three percent and rising. | 00:15-00:22 | Charts surge as crowds cheer at MegaFest. (existing footage) |
| **SUPER:** "ZEPHYRCOLA" | 00:22-00:30 | Product hero, storm calms, logo lockup. (to-shoot) |`
};

console.log("\n1. Card compilation strips all client content from a poisoned example");
const card = compileTasteCard(poisonedExample);
const cardJson = JSON.stringify(card);
for (const [kind, value] of Object.entries(POISON)) {
  check(`card contains no ${kind} ("${value}")`, !cardJson.toLowerCase().includes(value.toLowerCase()));
}
check("card keeps structural tags only", card.tags.every((t) => ["gold", "sizzle", "30s"].includes(t)), JSON.stringify(card.tags));
check("card measured 5 beats", card.beats?.count === 5, `got ${card.beats?.count}`);
check("card measured runtime 30s", card.runtimeSeconds === 30, `got ${card.runtimeSeconds}`);
check("card counted 2 supers", card.supers?.count === 2, `got ${card.supers?.count}`);
check("card kept a generic lesson", cardJson.includes("Open with friction"));

console.log("\n2. Prompt formatting is clean end to end");
const prompt = formatTasteCardsForPrompt([card]);
for (const [kind, value] of Object.entries(POISON)) {
  check(`prompt contains no ${kind}`, !prompt.toLowerCase().includes(value.toLowerCase()));
}
const viaExampleMemory = formatExamplesForAgent([poisonedExample], "writer");
for (const [kind, value] of Object.entries(POISON)) {
  check(`formatExamplesForAgent contains no ${kind}`, !viaExampleMemory.toLowerCase().includes(value.toLowerCase()));
}
check("prompt includes gold hard-standard language", /GOLD CARDS ARE HARD STANDARDS/.test(viaExampleMemory));

console.log("\n3. Noun scrubber");
check(
  "scrubs brand + partner from a lesson",
  !/(MegaFest|ZephyrCola)/i.test(scrubProperNouns("Use named real partnerships (MegaFest) like ZephyrCola did."))
);
check(
  "scrubs quoted taglines",
  !/Taste The Storm/i.test(scrubProperNouns(`The tagline "Taste The Storm" lands at the close.`))
);
check(
  "scrubs metrics",
  !/\+23%|\$2M/.test(scrubProperNouns("Volume grew +23% on a $2M spend."))
);
check(
  "keeps structural numbers",
  /4 words/.test(scrubProperNouns("Keep supers under 4 words for LED walls."))
);
check(
  "keeps plain English sentences intact",
  scrubProperNouns("Open with friction before the brand appears.") === "Open with friction before the brand appears."
);

console.log("\n4. Leak gate");
const cleanBrief = "Client: The Coca-Cola Company\nFormat: :30 sizzle\nBrief: Launch the new summer flavor with festival energy.";
const leakyOutput = `| VO: ZephyrCola brings the storm to every festival. | 00:00-00:05 | Crowd at MegaFest cheers. |`;
const cleanOutput = `| VO: Summer hits different with the new flavor. | 00:00-00:05 | Festival crowd, golden hour. (to-shoot) |`;

const leaksFound = findExampleLeaks({ outputText: leakyOutput, briefText: cleanBrief, examples: [poisonedExample] });
check("catches brand leak", leaksFound.some((l) => l.token.toLowerCase() === "zephyrcola"), JSON.stringify(leaksFound));
check("catches partner leak", leaksFound.some((l) => l.token.toLowerCase() === "megafest"));

const noLeaks = findExampleLeaks({ outputText: cleanOutput, briefText: cleanBrief, examples: [poisonedExample] });
check("clean output passes", noLeaks.length === 0, JSON.stringify(noLeaks));

const briefWithToken = `${cleanBrief}\nNote: this brief explicitly references the MegaFest partnership.`;
const allowed = findExampleLeaks({ outputText: leakyOutput, briefText: briefWithToken, examples: [poisonedExample] });
check("token present in brief is allowed (no false positive)", !allowed.some((l) => l.token.toLowerCase() === "megafest"), JSON.stringify(allowed));

const taglineLeak = findExampleLeaks({
  outputText: `**SUPER:** "Taste The Storm"`,
  briefText: cleanBrief,
  examples: [poisonedExample]
});
check("catches quoted tagline leak", taglineLeak.length > 0, JSON.stringify(taglineLeak));

console.log("");
if (failures > 0) {
  console.log(`${failures} check(s) FAILED.`);
  process.exit(1);
}
console.log("All contamination checks passed.");
