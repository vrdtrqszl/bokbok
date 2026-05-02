// localStorage-backed registry of creatures uploaded to the ecosystem.
// The main page reads this list to render creatures into the 3D scene.

import type { CreatureSpec } from "./creature";

const KEY = "bokbok:ecosystem:v1";

export function loadEcosystem(): CreatureSpec[] {
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

export function uploadCreature(creature: CreatureSpec) {
  if (typeof window === "undefined") return;
  const current = loadEcosystem();
  // If a creature with this id already exists, replace it (edit flow).
  const existingIdx = current.findIndex((c) => c.id === creature.id);
  const next =
    existingIdx >= 0
      ? current.map((c, i) => (i === existingIdx ? creature : c))
      : [...current, creature];
  window.localStorage.setItem(KEY, JSON.stringify(next));
  // Notify same-tab listeners (storage events only fire across tabs).
  window.dispatchEvent(new CustomEvent("ecosystem:changed"));
}

export function findCreatureById(id: string): CreatureSpec | null {
  return loadEcosystem().find((c) => c.id === id) ?? null;
}

const MONTH_NAMES = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

/**
 * Returns true if `query` matches the creature by name, full ISO date,
 * compact date (no dashes), or month name. Empty query matches everything.
 */
export function matchesCreatureQuery(c: CreatureSpec, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  if ((c.name ?? "").toLowerCase().includes(q)) return true;
  if ((c.dateISO ?? "").includes(q)) return true;
  // Also match dates typed without dashes (e.g., "20240825" → "2024-08-25")
  const compactQ = q.replace(/-/g, "");
  const compactDate = (c.dateISO ?? "").replace(/-/g, "");
  if (compactQ && compactDate.includes(compactQ)) return true;
  // Match a month name like "August" against the date's month index.
  if (c.dateISO) {
    const monthIdx = Number(c.dateISO.split("-")[1]) - 1;
    const monthName = MONTH_NAMES[monthIdx];
    if (monthName && monthName.includes(q)) return true;
  }
  return false;
}

export function deleteCreatureById(id: string): boolean {
  if (typeof window === "undefined") return false;
  const current = loadEcosystem();
  const next = current.filter((c) => c.id !== id);
  if (next.length === current.length) return false;
  window.localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent("ecosystem:changed"));
  return true;
}

export function clearEcosystem() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent("ecosystem:changed"));
}
