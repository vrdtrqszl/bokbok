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
 * Screen-aligned bounding box of all creature blocks. Used by the 3D viewport
 * to fit and CENTER the camera on a creature when it's selected — many
 * creatures aren't symmetric around their group origin, and looking at the
 * origin instead of the bbox center leaves big empty bands on one side of
 * the box. The X axis here is creature-local (= camera right after billboard
 * rotation); Y is screen-up (=  -b.y, since blocks render at -b.y).
 */
export function creatureFocusBox(creature: { blocks: CreatureBlock[] }): {
  centerX: number;
  centerY: number;
  halfWidth: number;
  halfHeight: number;
} {
  let minX = Infinity, maxX = -Infinity;
  let minY = Infinity, maxY = -Infinity;
  for (const b of creature.blocks) {
    // Block plane half-width 0.5 covers the solid block content; the soft
    // halo gradient that fades past the plane edge is not counted (it's
    // already mostly transparent). Letting halo bleed slightly past the
    // frame is fine — the alternative is a much smaller creature on screen.
    const r = b.scale * 0.5;
    minX = Math.min(minX, b.x - r);
    maxX = Math.max(maxX, b.x + r);
    // Screen-Y of a block = -b.y (rendering puts block at world -b.y).
    const sy = -b.y;
    minY = Math.min(minY, sy - r);
    maxY = Math.max(maxY, sy + r);
  }
  return {
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2,
    halfWidth: (maxX - minX) / 2,
    halfHeight: (maxY - minY) / 2,
  };
}

/**
 * Convenience — the larger of (halfWidth, halfHeight) from creatureFocusBox.
 * Older code used max(|b.x|, |b.y|) here which over-estimated for asymmetric
 * creatures and pushed the camera too far back.
 */
export function creatureHalfExtent(creature: { blocks: CreatureBlock[] }): number {
  const b = creatureFocusBox(creature);
  return Math.max(b.halfWidth, b.halfHeight);
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

  // Decide how many block instances each emotion contributes, and at what
  // base scale. Both grow with the per-emotion `score` (= keyword hits in the
  // journal) — the stronger an emotion shows up in the writing, the more
  // present it becomes on the creature, both in count and in size. Caps:
  //   - duplicates: 1..4 (5 for the lead) — keeps the cluster readable
  //   - baseScale:  0.95..1.25 from intensity, lead gets a +0.08 bump
  // Filler emotions from extractEmotions() (score=0.5) settle at 1 dup at
  // 0.95 so they round out the body without overpowering it.
  const MIN_BLOCKS = 3;
  const placements: Array<{ emotion: Emotion; baseScale: number }> = [];
  for (let i = 0; i < sorted.length; i++) {
    const { emotion, score } = sorted[i];
    const isLead = i === 0;
    // Duplicates ramp linearly with score, rounded to int. Lead is bumped so
    // the dominant emotion always has visible presence.
    const dupRaw = Math.max(1, Math.min(4, Math.round(score)));
    const dup = isLead ? Math.max(2, dupRaw) : dupRaw;
    // Scale ramp: start at 0.95 (filler floor) and add 0.05 per score-step
    // above 1. Cap at 1.25 so even very strong emotions don't dwarf the rest.
    const intensityScale =
      0.95 + Math.max(0, Math.min(score, 6) - 1) * 0.05;
    const baseScale = Math.min(1.33, intensityScale + (isLead ? 0.08 : 0));
    for (let d = 0; d < dup; d++) {
      placements.push({ emotion, baseScale });
    }
  }

  // Floor: at least MIN_BLOCKS blocks. If the scored input was thin (e.g. a
  // very short journal with one keyword hit), top up by duplicating the lead
  // emotion so the creature still reads as a cluster, not a lone block.
  while (placements.length < MIN_BLOCKS && sorted.length > 0) {
    const lead = sorted[0];
    const intensityScale = 0.95 + Math.max(0, Math.min(lead.score, 6) - 1) * 0.05;
    placements.push({ emotion: lead.emotion, baseScale: Math.min(1.33, intensityScale + 0.08) });
  }

  for (let i = 0; i < placements.length; i++) {
    const { emotion, baseScale } = placements[i];
    // Resolve the final scale FIRST — placement spacing scales with it, so
    // bigger blocks naturally claim more room and the body doesn't bunch up.
    const scale = baseScale * (0.92 + rand() * 0.16); // ±8% jitter on baseScale
    const rotation = (rand() * 360) - 180;

    let x = 0;
    let y = 0;

    if (i > 0) {
      // Rejection-sampling for a slot that (a) anchors to an existing block
      // so the body stays connected and (b) keeps comfortable distance from
      // every OTHER block so we don't end up with a stack of overlapping
      // blobs. We sample TRIES candidate angles around random anchors and
      // keep the candidate whose nearest non-anchor neighbour is farthest
      // away (normalised by average block size). Bail early once a candidate
      // clears the comfort threshold — that's "good enough", saves cycles,
      // and over many blocks this produces an organic, branching cluster
      // that reads like a creature instead of a single dense blob.
      const TRIES = 12;
      const ACCEPT = 0.55; // normalised gap considered "enough breathing room"
      let bestX = 0;
      let bestY = 0;
      let bestGap = -Infinity;
      for (let t = 0; t < TRIES; t++) {
        const anchor = blocks[Math.floor(rand() * blocks.length)];
        const angle = rand() * TAU;
        const avgScale = (anchor.scale + scale) / 2;
        // 0.65 × avg → ~30% overlap; 0.82 × avg → ~18% overlap. Visibly
        // merged with the anchor (so the body looks like one creature)
        // without burying it.
        const dist = (0.65 + rand() * 0.17) * avgScale;
        const cx = anchor.x + Math.cos(angle) * dist;
        const cy = anchor.y + Math.sin(angle) * dist;
        // Score the candidate by how far the NEAREST non-anchor block is,
        // normalised by their average size — pushes new blocks into open
        // space rather than into the crowd already next to the anchor.
        let minGap = Infinity;
        for (const b of blocks) {
          if (b === anchor) continue;
          const gap =
            Math.hypot(b.x - cx, b.y - cy) / ((b.scale + scale) / 2);
          if (gap < minGap) minGap = gap;
        }
        if (minGap > bestGap) {
          bestGap = minGap;
          bestX = cx;
          bestY = cy;
        }
        if (minGap >= ACCEPT) break;
      }
      x = bestX;
      y = bestY;
    }

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
