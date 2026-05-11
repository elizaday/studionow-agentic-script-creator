import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const REFERENCE_MAP = {
  context: ["01_studionow_context.md"],
  diagnosis: ["02_operating_principles.md", "03_brief_diagnosis.md"],
  strategy: ["04_script_engines.md", "15_story_arc_system.md"],
  voice: ["05_voice_and_language.md", "08_tone_system.md"],
  format: ["06_client_script_output.md", "07_producer_notes_output.md"],
  production: ["10_production_reality.md", "14_music_direction.md"],
  critique: ["11_self_critique.md", "12_gotchas.md"]
};

export async function loadReferencePack(rootDir, keys) {
  const selected = [...new Set(keys.flatMap((key) => REFERENCE_MAP[key] || []))];
  const chunks = [];

  for (const file of selected) {
    const path = resolve(rootDir, "references", file);
    const text = await readFile(path, "utf-8");
    chunks.push(`\n\n## ${file}\n\n${text.trim()}`);
  }

  return chunks.join("\n");
}

export function availableReferencePacks() {
  return Object.keys(REFERENCE_MAP);
}
