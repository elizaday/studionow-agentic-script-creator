import { createClient } from "@supabase/supabase-js";

export function getSupabaseClient({ service = false } = {}) {
  const url = process.env.SUPABASE_URL;
  const key = service ? process.env.SUPABASE_SERVICE_ROLE_KEY : process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new Error(service
      ? "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required"
      : "SUPABASE_URL and SUPABASE_ANON_KEY are required");
  }

  return createClient(url, key, {
    auth: { persistSession: false }
  });
}

export function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS"
    }
  });
}
