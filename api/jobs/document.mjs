import documentHandler from "../../apps/web/netlify/functions/document.mjs";
import { createVercelHandler } from "../_adapter.mjs";

export default createVercelHandler(documentHandler);

export function OPTIONS(request) {
  return documentHandler(request);
}

export function GET(request) {
  return documentHandler(request);
}
