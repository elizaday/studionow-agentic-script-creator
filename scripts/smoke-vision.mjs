#!/usr/bin/env node
import "dotenv/config";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { createOpenAIModelClient } from "../packages/studionow-agents/src/model/openai-client.mjs";

const args = process.argv.slice(2);
const imagePath = args[0];

if (!imagePath) {
  console.error("Usage: node scripts/smoke-vision.mjs <path-to-image>");
  process.exit(2);
}

const absPath = resolve(process.cwd(), imagePath);
const ext = extname(absPath).toLowerCase().replace(".", "");
const mediaType = ({
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  gif: "image/gif",
  webp: "image/webp"
})[ext];

if (!mediaType) {
  console.error(`Unsupported image extension: .${ext}`);
  process.exit(2);
}

const buf = await readFile(absPath);
const base64 = buf.toString("base64");

const modelClient = createOpenAIModelClient();
console.log(`Sending image (${ext}, ${Math.round(buf.length / 1024)}KB) to ${modelClient.name}...`);

const result = await modelClient.generateJson({
  agentName: "vision-smoke",
  system: "You are a precise visual describer. Reply only with the requested JSON.",
  user: `Describe what is visible in the attached image as concretely as you can. Reply with this JSON:
{
  "primary_subject": "",
  "setting": "",
  "notable_objects": [],
  "mood": "",
  "text_in_image": ""
}
Use "none" or empty array if nothing applies.`,
  images: [{ base64, mediaType }]
});

const meta = modelClient.getLastResponseMeta();
console.log("\n=== Result ===");
console.log(JSON.stringify(result, null, 2));
console.log("\n=== Usage ===");
console.log(JSON.stringify(meta?.usage, null, 2));
