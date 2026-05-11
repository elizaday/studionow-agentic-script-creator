import getJobHandler from "../../apps/web/netlify/functions/get-job.mjs";
import { createVercelHandler } from "../_adapter.mjs";

export default createVercelHandler(getJobHandler);

export function OPTIONS(request) {
  return getJobHandler(request);
}

export function GET(request) {
  return getJobHandler(request);
}
