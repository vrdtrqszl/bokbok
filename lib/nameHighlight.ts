// Hand-drawn highlight stroke (Figma 2241:1429) — a wavy marker swipe
// originally baked at #67BDFA / opacity 0.4. We encode it inline as a
// data URL with a caller-supplied colour so each surface (BokBokpedia
// tile, Energy Blocks tile, Calendar date, etc.) can recolour the same
// artwork without shipping multiple SVGs. The path data is verbatim
// from the Figma asset; only the stroke colour is templated.

import { EMOTION_COLOR_GROUP, EMOTION_GROUP_HEX } from "./emotions";
import type { CreatureSpec } from "./creature";

const HIGHLIGHT_PATH =
  "M1.18715 5.90339C1.66563 5.99031 4.18405 6.7279 12.8098 7.63263 19.1556 8.29821 29.5306 7.55454 35.1323 7.33536 40.734 7.11619 41.2564 6.97662 42.9102 6.8316 44.5641 6.68657 47.3337 6.54032 50.1872 6.38964";

/**
 * Returns a CSS `url(...)` value (suitable for `background-image`) of
 * the name-highlight stroke rendered in the given colour at 40 % opacity
 * — the design's published opacity for this asset.
 */
export function nameHighlightDataUrl(strokeHex: string): string {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" preserveAspectRatio="none" viewBox="0 0 50.5036 13.8996" fill="none">` +
    `<path d="${HIGHLIGHT_PATH}" stroke="${strokeHex}" stroke-opacity="0.4" stroke-width="12"/></svg>`;
  return `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`;
}

/**
 * Picks one of a creature's blocks deterministically by id-hash and
 * returns the matching colour group's hex. Stable per-creature so the
 * highlight stays the same colour across renders / refreshes. Falls
 * back to the design default (#67BDFA, the original Figma blue) if the
 * creature has no blocks.
 */
export function creatureHighlightColor(creature: CreatureSpec): string {
  const blocks = creature.blocks ?? [];
  if (blocks.length === 0) return "#67BDFA";
  let h = 0x811c9dc5;
  for (let i = 0; i < creature.id.length; i++) {
    h ^= creature.id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  const idx = (h >>> 0) % blocks.length;
  const key = blocks[idx].emotionKey;
  const group = EMOTION_COLOR_GROUP[key];
  return EMOTION_GROUP_HEX[group] ?? "#67BDFA";
}
