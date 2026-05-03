// Supabase client singleton — used by the shared-mode ecosystem adapter.
// Lazily created so localStorage-only deployments don't depend on Supabase
// env vars being defined.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;
// Track whether init has already failed so we don't spam the console on every
// call. A failed init "sticks" — we fall back to local mode for the session.
let initFailed = false;

export function getSupabase(): SupabaseClient | null {
  if (cached) return cached;
  if (initFailed) return null;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  try {
    cached = createClient(url, key, {
      auth: { persistSession: false },
      realtime: { params: { eventsPerSecond: 5 } },
    });
    return cached;
  } catch (err) {
    // Bad URL, unsupported key format, or any other ctor error — log once
    // and fall back to local mode rather than crashing the calling page.
    initFailed = true;
    console.error("[bokbok] Supabase init failed, falling back to local:", err);
    return null;
  }
}

/** True when the app is configured for the shared (Supabase) ecosystem. */
export function isSharedMode(): boolean {
  return (
    process.env.NEXT_PUBLIC_BOKBOK_MODE === "shared" && getSupabase() !== null
  );
}
