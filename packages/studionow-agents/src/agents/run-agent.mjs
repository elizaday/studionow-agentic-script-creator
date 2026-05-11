import { stringifyForPrompt } from "../json.mjs";

export async function runAgent({ modelClient, agentName, system, payload, instructions }) {
  const user = `${instructions.trim()}\n\nReturn only valid JSON. No markdown fencing.\n\nPAYLOAD:\n${stringifyForPrompt(payload)}`;
  return modelClient.generateJson({ agentName, system, user });
}

export function baseSystem({ role, references = "" }) {
  return `You are the StudioNow ${role}.

You are part of a staged script workflow. Own your judgment. Do not do another agent's job.

StudioNow standard:
- Challenge vague thinking.
- Protect runtime.
- Protect production reality.
- Write in clean, direct, specific language.
- Avoid inflated language and generic brand-film filler.
- No em dashes in deliverables.

Relevant StudioNow canon:
${references}`;
}
