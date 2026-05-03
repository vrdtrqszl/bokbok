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
  const channel = sb
    .channel("creatures-changes")
    .on(
      "postgres_changes",
      { event: "*", schema: "public", table: TABLE },
      () => onChange(),
    )
    .subscribe();
  return () => {
    sb.removeChannel(channel);
  };
}
