#!/usr/bin/env node
import "dotenv/config";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createOpenAIModelClient, runStudioNowWorkflow } from "../../../packages/studionow-agents/src/index.mjs";
import { createSupabaseRepository } from "./supabase-repository.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL_MS || 3000);
const maxRevisionLoops = Number(process.env.WORKER_MAX_REVISION_LOOPS || 1);

const repository = createSupabaseRepository();
const modelClient = createOpenAIModelClient();

console.log(`StudioNow agent worker started with ${modelClient.name}`);

while (true) {
  const job = await repository.claimNextJob();

  if (!job) {
    await sleep(pollIntervalMs);
    continue;
  }

  try {
    console.log(`Claimed job ${job.id}`);
    await runStudioNowWorkflow({
      rootDir: ROOT,
      modelClient,
      job,
      repository,
      maxRevisionLoops
    });
  } catch (error) {
    console.error(`Job ${job.id} failed`, error);
    await repository.failJob(job.id, error);
  }
}

function sleep(ms) {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
