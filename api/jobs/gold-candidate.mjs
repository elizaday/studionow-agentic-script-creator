import goldHandler from "../../apps/web/netlify/functions/gold-candidate.mjs";
import { createVercelHandler } from "../_adapter.mjs";

export default createVercelHandler(goldHandler);

export function OPTIONS(request) {
  return goldHandler(request);
}

export function POST(request) {
  return goldHandler(request);
}
