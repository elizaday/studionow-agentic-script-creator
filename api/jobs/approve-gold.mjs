import approveGoldHandler from "../../apps/web/netlify/functions/approve-gold.mjs";
import { createVercelHandler } from "../_adapter.mjs";

export default createVercelHandler(approveGoldHandler);

export function OPTIONS(request) {
  return approveGoldHandler(request);
}
