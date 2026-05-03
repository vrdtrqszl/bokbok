// Supabase client singleton — used by the shared-mode ecosystem adapter.
// Lazily created so localStorage-only deployments don't depend on Supabase
// env vars being defined.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  cached = createClient(url, key, {
    auth: { persistSession: false },
    realtime: { params: { eventsPerSecond: 5 } },
  });
  return cached;
}

/** True when the app is configured for the shared (Supabase) ecosystem. */
export function isSharedMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_BOKBOK_MODE === "shared" && getSupabase() !== null
  );
}
