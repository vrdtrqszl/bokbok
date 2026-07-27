// Shared-mode ecosystem adapter — backed by Supabase Postgres.
// Mirrors the localStorage adapter API so `lib/ecosystem.ts` can swap
// between them via the NEXT_PUBLIC_BOKBOK_MODE env var.

import type { CreatureSpec } from "./creature";
import { getSupabase } from "./supabase";

const TABLE = "creatures";

// ── row <-> spec mapping ──────────────────────────────────────────────────
// Postgres column convention is snake_case; CreatureSpec is camelCase. We
// translate at the adapter boundary.

type Row = {
  id: string;
  created_at: number;
  blocks: CreatureSpec["blocks"];
  emotions: CreatureSpec["emotions"];
  name: string | null;
  journal_text: string | null;
  date_iso: string | null;
  source: "generate" | "manually" | null;
};

function rowToSpec(r: Row): CreatureSpec {
  return {
    id: r.id,
    createdAt: r.created_at,
    blocks: r.blocks,
    emotions: r.emotions,
    name: r.name ?? undefined,
    journalText: r.journal_text ?? undefined,
    dateISO: r.date_iso ?? undefined,
    source: r.source ?? undefined,
  };
}

function specToRow(c: CreatureSpec): Row {
  return {
    id: c.id,
    created_at: c.createdAt,
    blocks: c.blocks,
    emotions: c.emotions,
    name: c.name ?? null,
    journal_text: c.journalText ?? null,
    date_iso: c.dateISO ?? null,
    source: c.source ?? null,
  };
}

// ── public adapter API ────────────────────────────────────────────────────

export async function loadEcosystemRemote(): Promise<CreatureSpec[]> {
  const sb = getSupabase();
  if (!sb) return [];
  const { data, error } = await sb
    .from(TABLE)
    .select("*")
    .order("created_at", { ascending: true });
  if (error) {
    console.error("[bokbok] loadEcosystem failed:", error.message);
    return [];
  }
  return (data as Row[]).map(rowToSpec);
}

export async function uploadCreatureRemote(creature: CreatureSpec): Promise<void> {
  const sb = getSupabase();
  if (!sb) return;
  const row = specToRow(creature);
  // upsert covers both new uploads and edit-flow replacements (same id).
  const { error } = await sb.from(TABLE).upsert(row, { onConflict: "id" });
  if (error) console.error("[bokbok] uploadCreature failed:", error.message);
}

export async function deleteCreatureByIdRemote(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;
  const { error } = await sb.from(TABLE).delete().eq("id", id);
  if (error) {
    console.error("[bokbok] deleteCreatureById failed:", error.message);
    return false;
  }
  return true;
}

/**
 * Cheap change-detection signature for the whole ecosystem. Returns a tiny
 * string derived from the exact row COUNT plus the newest `created_at`,
 * transferring a few bytes instead of the entire flock. The realtime/poll
 * backstop compares this each tick and only pulls the full ecosystem when it
 * actually changes — which is what stops an always-on exhibition display from
 * silently re-downloading every creature every few seconds (the egress leak
 * that tripped the free-tier quota).
 *
 * Detects creature ADD (count↑ / newer created_at) and DELETE (count↓). It
 * does NOT detect an in-place EDIT of an existing creature (upsert with the
 * same id keeps both count and created_at). Edits still propagate on the
 * editing client immediately (uploadCreature fires ecosystem:changed locally)
 * and to other clients via the realtime channel; the signature is only the
 * belt-and-suspenders backstop. Returns null on any error so the caller can
 * treat it as "no change / skip this tick" rather than reloading blindly.
 */
export async function remoteEcosystemSignature(): Promise<string | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, count, error } = await sb
    .from(TABLE)
    .select("created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .limit(1);
  if (error) return null;
  const latest = data && data[0] ? (data[0] as { created_at: number }).created_at : 0;
  return `${count ?? 0}:${latest}`;
}

export async function findCreatureByIdRemote(
  id: string,
): Promise<CreatureSpec | null> {
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.from(TABLE).select("*").eq("id", id).maybeSingle();
  if (error) {
    console.error("[bokbok] findCreatureById failed:", error.message);
    return null;
  }
  return data ? rowToSpec(data as Row) : null;
}

// Monotonic suffix so every subscribeEcosystemRemote call gets its OWN
// realtime channel name. supabase-js keys channels by name and refuses to
// attach postgres_changes callbacks to a second channel that shares a name
// with one that has already .subscribe()'d ("cannot add postgres_changes
// callbacks ... after subscribe()"). The main page subscribes twice at once
// (the 3D scene + the ambient-chatter loop), so a fixed "creatures-changes"
// name made the SECOND subscription throw and realtime silently die — which
// left the 8s poll as the only sync path. Unique names let every subscriber
// get live events, so the poll goes back to being a rare backstop.
let channelSeq = 0;

/**
 * Subscribe to realtime changes on the `creatures` table. The callback fires
 * with no args whenever any row is inserted/updated/deleted — the page is
 * expected to reload the full ecosystem in response.
 *
 * Returns an unsubscribe function.
 */
export function subscribeEcosystemRemote(onChange: () => void): () => void {
  const sb = getSupabase();
  if (!sb) return () => {};
  try {
    const channel = sb
      .channel(`creatures-changes-${++channelSeq}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: TABLE },
        () => onChange(),
      )
      .subscribe();
    return () => {
      try {
        sb.removeChannel(channel);
      } catch (err) {
        console.error("[bokbok] removeChannel failed:", err);
      }
    };
  } catch (err) {
    console.error("[bokbok] subscribeEcosystem failed:", err);
    return () => {};
  }
}
