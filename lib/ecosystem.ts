// Ecosystem facade — routes calls to either the localStorage adapter
// (private / personal mode) or the Supabase adapter (shared / exhibition
// mode). Mode is selected at build time via NEXT_PUBLIC_BOKBOK_MODE:
//
//   NEXT_PUBLIC_BOKBOK_MODE=shared  → Supabase  (everyone sees same DB)
//   anything else / unset           → localStorage  (per-browser private)
//
// The public API is fully async so both backends can implement it the
// same way. Pages await the load functions; upload / delete fire-and-
// forget the returned promise.

import type { CreatureSpec } from "./creature";
import { sanitizeCreatureForCatalog } from "./creature";
import { isSharedMode } from "./supabase";
import {
  loadEcosystemRemote,
  uploadCreatureRemote,
  deleteCreatureByIdRemote,
  findCreatureByIdRemote,
  subscribeEcosystemRemote,
} from "./ecosystem-supabase";

const KEY = "bokbok:ecosystem:v1";

// ── localStorage adapter (built-in) ───────────────────────────────────────

function loadLocal(): CreatureSpec[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function uploadLocal(creature: CreatureSpec) {
  if (typeof window === "undefined") return;
  const current = loadLocal();
  const idx = current.findIndex((c) => c.id === creature.id);
  const next =
    idx >= 0
      ? current.map((c, i) => (i === idx ? creature : c))
      : [...current, creature];
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ecosystem:changed"));
}

function deleteLocal(id: string): boolean {
  if (typeof window === "undefined") return false;
  const current = loadLocal();
  const next = current.filter((c) => c.id !== id);
  if (next.length === current.length) return false;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ecosystem:changed"));
  return true;
}

// ── public API (async, mode-aware) ────────────────────────────────────────

export async function loadEcosystem(): Promise<CreatureSpec[]> {
  const list = isSharedMode() ? await loadEcosystemRemote() : loadLocal();
  // Sanitize against the current catalog so creatures stored before a
  // catalog rename / swap don't pass 404 imagePaths down to r3f's
  // useLoader (which would crash the whole React tree on a missing
  // texture). Drops blocks that can't be remapped, and drops creatures
  // that end up with zero blocks.
  const cleaned: CreatureSpec[] = [];
  for (const c of list) {
    const fixed = sanitizeCreatureForCatalog(c);
    if (fixed) cleaned.push(fixed);
  }
  return cleaned;
}

export async function uploadCreature(creature: CreatureSpec): Promise<void> {
  if (isSharedMode()) {
    await uploadCreatureRemote(creature);
    // realtime subscription on other clients will fire ecosystem:changed;
    // but also fire locally so the same-tab caller refreshes immediately.
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ecosystem:changed"));
    }
    return;
  }
  uploadLocal(creature);
}

export async function findCreatureById(
  id: string,
): Promise<CreatureSpec | null> {
  const raw = isSharedMode()
    ? await findCreatureByIdRemote(id)
    : (loadLocal().find((c) => c.id === id) ?? null);
  return raw ? sanitizeCreatureForCatalog(raw) : null;
}

export async function deleteCreatureById(id: string): Promise<boolean> {
  if (isSharedMode()) {
    const ok = await deleteCreatureByIdRemote(id);
    if (ok && typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("ecosystem:changed"));
    }
    return ok;
  }
  return deleteLocal(id);
}

export function clearEcosystem() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("ecosystem:changed"));
}

// ── search / matching (pure, sync) ────────────────────────────────────────

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

export function matchesCreatureQuery(c: CreatureSpec, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((c.name ?? "").toLowerCase().includes(q)) return true;
  if ((c.dateISO ?? "").includes(q)) return true;
  const compactQ = q.replace(/-/g, "");
  const compactDate = (c.dateISO ?? "").replace(/-/g, "");
  if (compactQ && compactDate.includes(compactQ)) return true;
  if (c.dateISO) {
    const monthIdx = Number(c.dateISO.split("-")[1]) - 1;
    const monthName = MONTH_NAMES[monthIdx];
    if (monthName && monthName.includes(q)) return true;
  }
  return false;
}

// ── realtime subscription (shared mode only) ──────────────────────────────

/**
 * Subscribe to remote changes when in shared mode. In local mode this is a
 * no-op. The callback gets called whenever another browser changes the DB,
 * so callers can re-fetch.
 *
 * Returns an unsubscribe function.
 */
export function subscribeRemoteEcosystem(onChange: () => void): () => void {
  if (!isSharedMode()) return () => {};
  return subscribeEcosystemRemote(onChange);
}
