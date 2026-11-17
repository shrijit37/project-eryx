import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Fleet Supabase client (fleet project `rjrynmjugsxuytpotfma`).
 *
 * The fleet is reached over its public HTTP gateway (PostgREST / GoTrue) with
 * the service-role key — raw Postgres connections are intentionally NOT used
 * from Coolify containers. Only the API server may import this module; the
 * service-role key bypasses RLS and must never be serialized to a response.
 */
export const SUPABASE_URL =
  process.env.SUPABASE_URL ||
  "https://supabase.shrijit.tech/rjrynmjugsxuytpotfma";

export const SUPABASE_PUBLISHABLE_KEY =
  process.env.SUPABASE_PUBLISHABLE_KEY ||
  process.env.SUPABASE_ANON_KEY ||
  "supabase-key-not-configured";

export const SUPABASE_SECRET_KEY =
  process.env.SUPABASE_SECRET_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_KEY ||
  "supabase-key-not-configured";

const clientOptions = {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false,
  },
  global: {
    headers: { "x-application-name": "eryx-api" },
  },
} as const;

/** service-role client — SERVER SIDE ONLY. Bypasses RLS. */
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SECRET_KEY,
  clientOptions,
);

/** publishable (anon) client — browser-safe; used only where an anon JWT is needed. */
export const supabasePublic: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_PUBLISHABLE_KEY,
  clientOptions,
);

/**
 * Liveness probe for the HTTP gateway. Does not depend on a particular table
 * existing, so it can report the database as up before migrations are applied.
 */
export async function checkSupabase(timeoutMs = 3000): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(
      `${SUPABASE_URL.replace(/\/+$/, "")}/auth/v1/health`,
      {
        headers: {
          apikey: SUPABASE_PUBLISHABLE_KEY,
          authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
        },
        signal: controller.signal,
      },
    );
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}
