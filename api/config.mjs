import configHandler from "../apps/web/netlify/functions/config.mjs";
import { createVercelHandler } from "./_adapter.mjs";

export default createVercelHandler(configHandler);

export function OPTIONS(request) {
  return configHandler(request);
}

export function GET(request) {
  return configHandler(request);
}
