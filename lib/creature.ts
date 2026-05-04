// Creature generator: turns an array of EmotionScore into a CreatureSpec —
// a list of placed energy blocks with positions, rotations, and scales.
// Composition rules implement the "emergence" requirement:
//   - duplicate strong emotions
//   - rotate every block by a small random angle
//   - scale variation kept tight (0.85 – 1.15) so blocks read as one body
//   - each new block anchors to an already-placed neighbor with overlap so
//     the result is a connected mass, not separate islands

import { EMOTION_LIST, type Emotion, type EmotionKey, type EmotionScore } from "./emotions";

export type CreatureBlock = {
  emotionKey: EmotionKey;
  imagePath: string;
  // Coordinates are in a normalized "creature space" centered on (0, 0).
  // Renderers map this to viewport pixels via a uniform scale.
  x: number;
  y: number;
  rotation: number; // degrees
  scale: number;
  zIndex: number;
  // Animation phase offset (0..1) so each block breathes out of sync.
  phase: number;
};

/**
 * Largest distance from the creature's origin to any block edge, measured
 * along whichever axis is wider. Used by the 3D viewport to pick a focus
 * distance that keeps the creature fully in view — no clipping at the
 * canvas edges when the camera zooms in. Conservative halo factor (just
 * past the block plane) so the camera can pull in close and the creature
 * fills the box.
 */
export function creatureHalfExtent(creature: { blocks: CreatureBlock[] }): number {
  let halfX = 0;
  let halfY = 0;
  for (const b of creature.blocks) {
    // Block plane half-width 0.5 + a small halo bleed of ~0.05 = 0.55 * scale.
    // Anything more makes the camera pull back further than necessary.
    const r = b.scale * 0.55;
    halfX = Math.max(halfX, Math.abs(b.x) + r);
    halfY = Math.max(halfY, Math.abs(b.y) + r);
  }
  return Math.max(halfX, halfY);
}

export type CreatureSpec = {
  id: string;
  createdAt: number;
  blocks: CreatureBlock[];
  emotions: Array<{ key: EmotionKey; displayName: string; score: number }>;
  /** Display name — derived from dominant emotion at upload time. */
  name?: string;
  /** Journal entry from the day this creature represents. */
  journalText?: string;
  /** ISO calendar date (YYYY-MM-DD) the journal/creature is for. */
  dateISO?: string;
  /** How the creature was authored, for routing the Edit button. */
  source?: "generate" | "manually";
};

// Tiny seeded PRNG so the same emotion list produces the same shape within
// one generate call but two calls with the same input still differ (we mix in
// Date.now() at call time).
function makeRng(seed: number) {
  let state = seed >>> 0 || 1;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0xffffffff;
  };
}

const TAU = Math.PI * 2;

export function generateCreature(scores: EmotionScore[]): CreatureSpec {
  const seed = Date.now() ^ Math.floor(Math.random() * 0xffffffff);
  const rand = makeRng(seed);

  const blocks: CreatureBlock[] = [];

  // Strongest emotion dominates: scale slightly larger, dead center.
  const sorted = [...scores].sort((a, b) => b.score - a.score);

  // Decide how many block instances each emotion contributes. Strong emotions
  // duplicate up to 3 times; weaker ones stay at 1.
  const placements: Array<{ emotion: Emotion; baseScale: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const { emotion, score } = sorted[i];
    const isLead = i === 0;
    const dup = isLead && score >= 2 ? 3 : score >= 2 ? 2 : 1;
    const baseScale = isLead ? 1.1 : 0.95;
    for (let d = 0; d < dup; d++) {
      placements.push({ emotion, baseScale });
    }
  }

  for (let i = 0; i < placements.length; i++) {
    const { emotion, baseScale } = placements[i];

    let x = 0;
    let y = 0;

    if (i > 0) {
      // Anchor to a previously-placed block and offset along a random angle
      // by a fraction of the block size — this guarantees overlap so the
      // body stays connected.
      const anchor = blocks[Math.floor(rand() * blocks.length)];
      const angle = rand() * TAU;
      // Distance: 35–55% of block size keeps blocks merging with overlap.
      const dist = 0.35 + rand() * 0.2;
      x = anchor.x + Math.cos(angle) * dist;
      y = anchor.y + Math.sin(angle) * dist;
    }

    // Tight scale variation per request (similar scale, "not too much").
    const scale = baseScale * (0.92 + rand() * 0.16); // ~0.85 – ~1.15 range
    const rotation = (rand() * 360) - 180; // any angle

    blocks.push({
      emotionKey: emotion.key,
      imagePath: emotion.imagePath,
      x,
      y,
      rotation,
      scale,
      zIndex: i, // later placements stack on top
      phase: rand(),
    });
  }

  // Center the creature: shift all blocks by the centroid so the cluster is
  // visually balanced inside its container.
  if (blocks.length > 0) {
    const cx = blocks.reduce((s, b) => s + b.x, 0) / blocks.length;
    const cy = blocks.reduce((s, b) => s + b.y, 0) / blocks.length;
    for (const b of blocks) {
      b.x -= cx;
      b.y -= cy;
    }
  }

  // Dedupe emotions for the info-list (we kept duplicates for visual mass).
  const seen = new Set<EmotionKey>();
  const emotions = sorted
    .filter(({ emotion }) => {
      if (seen.has(emotion.key)) return false;
      seen.add(emotion.key);
      return true;
    })
    .map(({ emotion, score }) => ({
      key: emotion.key,
      displayName: emotion.displayName,
      score,
    }));

  return {
    id: `creature-${Date.now()}-${Math.floor(rand() * 1e6)}`,
    createdAt: Date.now(),
    blocks,
    emotions,
  };
}

// Helper used by both 2D and 3D renderers to map creature-space coords to
// pixel coords given a viewport size and a desired block size.
export function projectBlock(
  block: CreatureBlock,
  viewport: { width: number; height: number },
  blockSize: number,
) {
  const px = viewport.width / 2 + block.x * blockSize;
  const py = viewport.height / 2 + block.y * blockSize;
  return { px, py, blockSize };
}

// Lookup helper for renderers that need the full Emotion record from a key.
const byKey = new Map<EmotionKey, Emotion>(EMOTION_LIST.map((e) => [e.key, e]));
export function emotionByKey(key: EmotionKey) {
  return byKey.get(key);
}

// Whimsical adjectives for auto-naming new creatures (combined with the
// dominant emotion's display name, e.g. "Tiny Joy", "Wandering Sadness").
const RANDOM_ADJECTIVES = [
  "Tiny", "Wandering", "Curious", "Sleepy", "Brave", "Playful", "Quiet",
  "Bouncing", "Glowing", "Whispering", "Soft", "Restless", "Gentle",
  "Drifting", "Fluffy", "Mossy", "Twirling", "Dappled", "Shy", "Lively",
  "Hidden", "Tender", "Wobbly", "Misty", "Velvet", "Honest", "Tiny",
];

export function randomCreatureName(emotionDisplayName?: string): string {
  const adj =
    RANDOM_ADJECTIVES[Math.floor(Math.random() * RANDOM_ADJECTIVES.length)];
  return emotionDisplayName ? `${adj} ${emotionDisplayName}` : adj;
}
