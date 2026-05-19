import { jsonResponse } from "./_supabase.mjs";

export default async function handler(req) {
  if (req.method === "OPTIONS") return jsonResponse({});
  if (req.method !== "GET") return jsonResponse({ error: "Method not allowed" }, 405);

  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  if (!url || !anonKey) {
    return jsonResponse({ error: "Supabase env vars are not configured" }, 500);
  }

  return jsonResponse({
    supabaseUrl: url,
    supabaseAnonKey: anonKey,
    uploadsBucket: "script-uploads",
    maxUploadBytes: 80 * 1024 * 1024
  });
}

export const config = {
  path: "/api/config"
};
