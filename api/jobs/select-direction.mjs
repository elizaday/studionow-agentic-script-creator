import selectDirectionHandler from "../../apps/web/netlify/functions/select-direction.mjs";
import { createVercelHandler } from "../_adapter.mjs";

export default createVercelHandler(selectDirectionHandler);

export function OPTIONS(request) {
  return selectDirectionHandler(request);
}

export function POST(request) {
  return selectDirectionHandler(request);
}
