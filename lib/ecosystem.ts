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
  remoteEcosystemSignature,
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
  // Soft-archive to the per-browser trash BEFORE removing from the
  // active ecosystem (Supabase row or localStorage entry). Even in
  // shared mode the trash stays local — every visitor sees only the
  // creatures THEY personally deleted. The trash page can later show
  // these in grayscale; we don't currently auto-restore them.
  await archiveToTrash(id);

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

// ── Trash (per-browser localStorage of soft-deleted creatures) ────────────
//
// Every creature deleted via deleteCreatureById is COPIED into this
// localStorage list with a `deletedAt` timestamp. The trash page reads
// from here. The list is per-browser by design: even on shared/Supabase
// mode, your trash shows only what YOU deleted from this device, since
// the deletion event itself didn't carry author info to the server.

const TRASH_KEY = "bokbok:ecosystem-trash:v1";

export type TrashEntry = CreatureSpec & {
  /** ISO timestamp set by archiveToTrash, used for sorting (newest first). */
  deletedAt: string;
};

function loadTrashRaw(): TrashEntry[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(TRASH_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? (arr as TrashEntry[]) : [];
  } catch {
    return [];
  }
}

function writeTrashRaw(list: TrashEntry[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(TRASH_KEY, JSON.stringify(list));
    window.dispatchEvent(new CustomEvent("trash:changed"));
  } catch {
    // Quota exceeded etc. — silently no-op. The deletion still proceeds.
  }
}

/** Fetch the soon-to-be-deleted creature and copy it into the trash. */
async function archiveToTrash(id: string): Promise<void> {
  const c = await findCreatureById(id);
  if (!c) return;
  const list = loadTrashRaw();
  // Dedupe: if the same id is already in trash, replace the entry.
  const filtered = list.filter((e) => e.id !== c.id);
  filtered.unshift({ ...c, deletedAt: new Date().toISOString() });
  writeTrashRaw(filtered);
}

/** Public read for the trash page. Same shape as loadEcosystem returns,
 *  with the extra deletedAt field on each entry. Newest deletions first. */
export async function loadTrash(): Promise<TrashEntry[]> {
  const list = loadTrashRaw();
  // Sanitize each entry against the current catalog so the trash page
  // can render their thumbnails / canvas without 404 textures.
  const cleaned: TrashEntry[] = [];
  for (const c of list) {
    const fixed = sanitizeCreatureForCatalog(c);
    if (fixed) cleaned.push({ ...fixed, deletedAt: c.deletedAt });
  }
  return cleaned;
}

/** Permanently remove an entry from the trash (no undo). */
export function purgeTrashCreature(id: string): void {
  writeTrashRaw(loadTrashRaw().filter((e) => e.id !== id));
}

/** Clear the whole trash. */
export function clearTrash(): void {
  writeTrashRaw([]);
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

// Poll interval (ms) for the fallback change-detection loop. Supabase
// realtime generally delivers postgres_changes within a few hundred ms when
// the table is part of the realtime publication and RLS allows it, but in
// practice some deployments lose events (network flake, channel re-connect,
// publication misconfig). A modest periodic check gives us belt-and-
// suspenders coverage: new creatures from other clients show up within at
// most POLL_MS even if no realtime event ever arrives.
//
// This is only a BACKSTOP now. The realtime channel (subscribeEcosystemRemote)
// delivers inserts/updates/deletes within a few hundred ms when it's healthy,
// so the poll only has to cover the rare case where a realtime event is lost
// (network flake, channel re-connect). 60s is plenty for that in an
// installation/exhibition context, and a slower tick means far fewer idle
// requests when nothing is changing.
//
// (Realtime used to be dead — a fixed channel name made the main page's
// second subscription throw — so this poll was the ONLY sync path and had to
// run every 8s. With unique channel names realtime works, so we can back off.)
//
// CRITICAL: each tick fetches only a tiny CHANGE SIGNATURE (row count +
// newest created_at, a few bytes), NOT the whole flock. It calls onChange —
// which pulls the full ecosystem via select(*) — ONLY when that signature
// actually changes. The old version re-downloaded all ~100 creatures every
// 8s per open tab; an always-on exhibition screen burned through the free-
// tier egress quota in a day or two and got the project restricted. Fetching
// bytes-not-megabytes on the idle path is what keeps us under the cap.
const POLL_MS = 60000;

/**
 * Subscribe to remote changes when in shared mode. In local mode this is a
 * no-op. The callback gets called whenever another browser changes the DB
 * (via the Supabase realtime channel) OR when the periodic signature check
 * detects a change, as a backstop in case realtime events are missed.
 *
 * Returns an unsubscribe function that tears down BOTH the realtime
 * channel and the poll interval.
 */
export function subscribeRemoteEcosystem(onChange: () => void): () => void {
  if (!isSharedMode()) return () => {};
  const unsubscribeRealtime = subscribeEcosystemRemote(onChange);

  // Backup change-detection poll — independent of the realtime channel.
  // Instead of blindly reloading every tick, we fetch the cheap signature
  // and only fire onChange (a full reload) when it differs from the last
  // one we saw. `lastSig` starts undefined; the first tick primes it. If a
  // realtime event fires first, the next signature check simply confirms
  // the value it already reloaded for and stays quiet.
  let lastSig: string | undefined;
  let stopped = false;
  const interval =
    typeof window !== "undefined"
      ? window.setInterval(async () => {
          const sig = await remoteEcosystemSignature();
          if (stopped || sig === null) return; // error → skip, try next tick
          if (lastSig === undefined) {
            lastSig = sig; // prime without an initial reload
            return;
          }
          if (sig !== lastSig) {
            lastSig = sig;
            onChange();
          }
        }, POLL_MS)
      : null;

  return () => {
    stopped = true;
    unsubscribeRealtime();
    if (interval !== null) window.clearInterval(interval);
  };
}
