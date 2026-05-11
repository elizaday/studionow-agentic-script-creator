import createJobHandler from "../apps/web/netlify/functions/create-job.mjs";
import { createVercelHandler } from "./_adapter.mjs";

export default createVercelHandler(createJobHandler);

export function OPTIONS(request) {
  return createJobHandler(request);
}

export function POST(request) {
  return createJobHandler(request);
}
