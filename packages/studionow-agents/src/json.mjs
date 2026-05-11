export function extractJson(text) {
  if (!text || typeof text !== "string") {
    throw new Error("No text returned from model");
  }

  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error(`Model response did not contain JSON: ${text.slice(0, 240)}`);
  }

  return JSON.parse(candidate.slice(start, end + 1));
}

export function stringifyForPrompt(value) {
  return JSON.stringify(value, null, 2);
}
