export function createMockModelClient() {
  return {
    name: "mock:deterministic",
    getLastResponseMeta() {
      return null;
    },
    async generateJson({ agentName, user }) {
      const payload = safeParsePayload(user);
      const briefText = payload?.brief?.brief || payload?.briefText || "";
      const client = inferClient(briefText);
      const runtimeSeconds = inferRuntimeSeconds(briefText);
      const tone = inferTone(briefText);

      switch (agentName) {
        case "diagnoser":
          return {
            format: inferFormat(briefText),
            placement: inferPlacement(briefText),
            audience: inferAudience(briefText),
            understand: "The audience must understand what changed, why it matters, and what action or belief the piece should create.",
            feel: "Clear-eyed confidence, not generic inspiration.",
            do: "Believe the idea is useful, produceable, and worth acting on.",
            runtimeSeconds,
            tone,
            approvalReality: "Claims, metrics, brand lines, likenesses, and archival footage require approval before final production.",
            existingAssets: briefText.includes("Existing Assets") ? "Existing assets are stated in the brief and should anchor the visuals." : "Existing assets are not fully specified.",
            openingTension: inferOpeningTension(briefText),
            closingMove: "Return to the visual motif in its resolved form and land the required action or belief.",
            endFeeling: "Convinced and ready to move.",
            assumptions: [
              "No additional attachments were provided for this local proof.",
              "All metrics in the brief are treated as client-supplied and require final fact check."
            ],
            risks: [
              "The script must not invent footage access.",
              "Runtime must match the number of required ideas."
            ]
          };
        case "miner":
          return {
            humanTension: inferOpeningTension(briefText),
            metrics: extractMetrics(briefText),
            strategicFrameworks: extractFrameworks(briefText),
            brandLanguage: extractBrandLanguage(briefText),
            assetNotes: extractAssetNotes(briefText),
            clearanceFlags: ["Verify all claims, UI screenshots, logos, archival footage, and brand lines."],
            usableAmmunition: [
              "Use data as pivots, not as a list.",
              "Make the audience friction visible before naming the solution."
            ]
          };
        case "strategist":
          return {
            needsDirectionChoice: false,
            recommendedDirectionId: "direction-a",
            directions: [
              {
                id: "direction-a",
                name: "From Friction To Flow",
                coreEngine: "Problem / Solution / Scale",
                whatMakesItWork: "It opens on the specific drag in the current state, then makes the solution feel like a visible release.",
                mainRisk: "If the opening friction stays generic, the whole film turns into a feature list.",
                whyItFits: "The brief needs clarity, proof, and a produceable visual structure."
              }
            ],
            storyArc: {
              act1: "The current state costs time, attention, or belief.",
              act2: "The new system or idea changes the behavior on screen.",
              act3: "The audience sees the clearer future and the action required."
            }
          };
        case "producer":
          return {
            title: `${client} Script`,
            client,
            runtimeSeconds,
            tone,
            conceptEngine: "Problem / Solution / Scale",
            visualMotif: "A cluttered signal line cleans itself into one precise pulse, then expands into a usable system.",
            structure: [
              { tc: "0:00-0:12", job: "Create felt friction.", transition: "Overlapping windows collapse into one moving line." },
              { tc: "0:12-0:38", job: "Reveal the change.", transition: "The line becomes the interface or core visual device." },
              { tc: "0:38-0:65", job: "Prove usefulness.", transition: "Data points travel through the motif instead of appearing as static supers." },
              { tc: "0:65-end", job: "Land action and confidence.", transition: "The motif resolves into the final lockup." }
            ],
            openingMove: "Start with a recognizable behavior, not a brand claim.",
            closingMove: "The motif resolves into one clean frame with the final action.",
            productionNotes: [
              "Use existing UI, campaign, or archival assets wherever the brief promises them.",
              "Flag any new footage as to-shoot and any claims as approval-required."
            ],
            wordBudget: Math.round(runtimeSeconds * 1.45)
          };
        case "writer":
          return {
            metadata: {
              title: `${client.toUpperCase()} AGENTIC DRAFT`,
              client,
              writer: "StudioNow AI Agent Workflow",
              version: 1
            },
            voWordCount: 73,
            markdown: `# ${client.toUpperCase()} AGENTIC DRAFT\nClient: ${client}\nWriter: StudioNow AI Agent Workflow\nDate: ${new Date().toLocaleDateString("en-US")}\nVersion: 1\n\n| AUDIO/VO | TC | VISUALS |\n|---|---:|---|\n| Three tools. Three exports. One team trying to answer one question. | 0:00-0:08 | (existing footage / motion graphics) Browser tabs stack over each other. CSV files slide across the frame until they jam the screen. |\n| But the work has changed. The view has to change with it. | 0:08-0:15 | (motion graphics) The clutter pulls into one moving signal line. It sharpens into a clean interface frame. |\n| **SUPER:** \"From scattered reports to one live read.\" | 0:15-0:24 | (existing UI / to-capture) The line travels through dashboards, summaries, and alerts. Each panel opens as the signal reaches it. |\n| Now decisions move at the speed of the market. | 0:24-0:38 | (motion graphics) Metrics rise through the same line. The motion stays precise, fast, and readable. |\n| **SUPER:** \"Ready for teams who need the answer before the meeting.\" | 0:38-0:52 | (to-shoot / existing footage) Brand managers review the same view across laptops and conference screens. The signal passes from screen to screen. |\n| One view. One rhythm. One smarter way forward. | 0:52-1:00 | (motion graphics) The signal resolves into the final product or initiative lockup. *SFX: soft pulse lock.* |`
          };
        case "runtime_editor":
          return {
            status: "within_budget",
            originalVoWords: payload?.draft?.voWordCount || 73,
            revisedVoWords: payload?.draft?.voWordCount || 73,
            notes: ["The mock draft is intentionally lean for local proof."],
            markdown: payload?.draft?.markdown
          };
        case "critic":
          return {
            passes: true,
            score: 88,
            findings: [
              "Opening creates tension quickly.",
              "Visual motif is visible, but the real run should make it more client-specific.",
              "Producer must verify asset access before production."
            ],
            requiredRevisions: []
          };
        case "formatter":
          return {
            clientScriptMarkdown: payload?.runtimeEdit?.markdown || payload?.draft?.markdown || "",
            producerNotesMarkdown: `# PRODUCER NOTES\n\n## Red Flags\n- Confirm claim approvals and current brand language.\n- Replace mock UI language with real product or campaign details before client delivery.\n\n## Production Notes\n- Separate creative proof from final approved product behavior.\n- Keep the CTA honest if access details are not final.`,
            finalMarkdown: payload?.runtimeEdit?.markdown || payload?.draft?.markdown || "",
            deliveryChecklist: [
              "Three-column script present.",
              "Visuals contain movement.",
              "Runtime and VO count checked.",
              "Production risks flagged."
            ]
          };
        default:
          throw new Error(`Unknown mock agent: ${agentName}`);
      }
    }
  };
}

function safeParsePayload(text) {
  const marker = "PAYLOAD:";
  const index = text.indexOf(marker);
  if (index === -1) return {};
  try {
    return JSON.parse(text.slice(index + marker.length).trim());
  } catch {
    return {};
  }
}

function inferClient(text) {
  const match = text.match(/Client:\s*([^\n]+)/i);
  return match ? match[1].trim() : "StudioNow";
}

function inferRuntimeSeconds(text) {
  const minuteMatch = text.match(/(\d+):(\d{2})/);
  if (minuteMatch) return Number(minuteMatch[1]) * 60 + Number(minuteMatch[2]);
  const secondsMatch = text.match(/(?:Runtime|Format):[^\n]*:?(\d{2,3})\s*(?:second|sec|s|:)/i);
  if (secondsMatch) return Number(secondsMatch[1]);
  if (text.includes(":30")) return 30;
  if (text.includes(":45")) return 45;
  if (text.includes(":60")) return 60;
  if (text.includes("1:30")) return 90;
  if (text.includes("2:00")) return 120;
  return 90;
}

function inferTone(text) {
  const match = text.match(/Tone:\s*([^\n]+)/i);
  return match ? match[1].trim() : "Confident / Corporate";
}

function inferFormat(text) {
  const match = text.match(/(?:Format|Script Type):\s*([^\n]+)/i);
  return match ? match[1].trim() : "Production script";
}

function inferPlacement(text) {
  if (/award|effie|nma/i.test(text)) return "Award submission";
  if (/internal|leadership|keynote/i.test(text)) return "Internal presentation";
  if (/social|tiktok|instagram/i.test(text)) return "Social";
  if (/broadcast|digital/i.test(text)) return "Broadcast and digital";
  return "Client presentation";
}

function inferAudience(text) {
  const match = text.match(/Audience:\s*([^\n]+)/i);
  return match ? match[1].trim() : "Stakeholders named or implied by the brief";
}

function inferOpeningTension(text) {
  if (/three different tools|manual|exports|CSV|reports/i.test(text)) {
    return "Teams are spending too much time assembling the answer instead of acting on it.";
  }
  if (/not a victory lap|progress report|fact-check/i.test(text)) {
    return "The story must prove progress without pretending the work is finished.";
  }
  if (/existing.*90|cutdown|15/i.test(text)) {
    return "A shorter piece cannot be a miniature version of the long film. It must choose one thread.";
  }
  return "The brief needs a sharper human friction before the solution can feel necessary.";
}

function extractMetrics(text) {
  return [...text.matchAll(/(?:\+?\d+(?:\.\d+)?%|\$?\d+(?:\.\d+)?\s?(?:M|B|million|billion)|\d+\s?(?:markets|cities|countries|votes|hours|days))/gi)].map((m) => m[0]);
}

function extractFrameworks(text) {
  const frameworks = [];
  if (/tiers?/i.test(text)) frameworks.push("Tiered framework");
  if (/pillars?/i.test(text)) frameworks.push("Pillar framework");
  if (/phases?|Q[1-4]/i.test(text)) frameworks.push("Phased rollout");
  return frameworks;
}

function extractBrandLanguage(text) {
  const tagline = text.match(/(?:Tagline|brand line):\s*["']?([^"\n]+)["']?/i);
  return tagline ? [tagline[1].trim()] : [];
}

function extractAssetNotes(text) {
  const existing = text.match(/Existing Assets:\s*([\s\S]*?)(?:\nMissing Assets:|\nMust-Haves:|\nDesired Ending:|$)/i);
  const missing = text.match(/Missing Assets:\s*([\s\S]*?)(?:\nMust-Haves:|\nDesired Ending:|$)/i);
  return {
    existing: existing ? existing[1].trim() : "Not specified",
    missing: missing ? missing[1].trim() : "Not specified"
  };
}
