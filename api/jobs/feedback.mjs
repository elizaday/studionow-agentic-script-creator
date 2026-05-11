import feedbackHandler from "../../apps/web/netlify/functions/feedback.mjs";
import { createVercelHandler } from "../_adapter.mjs";

export default createVercelHandler(feedbackHandler);

export function OPTIONS(request) {
  return feedbackHandler(request);
}

export function POST(request) {
  return feedbackHandler(request);
}
