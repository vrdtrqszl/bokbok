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
  // Optional horizontal / vertical mirror flags, set from the
  // ManualCanvas context menu. Renderers apply them via scale(-1).
  // Default false / undefined when not set (most creatures).
  flipH?: boolean;
  flipV?: boolean;
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
      // Two placement personalities, mixed 65 / 35:
      //   - clump  (65%): prefer spots close to existing neighbours, so the
      //                   body fills in and reads as a tight mass
      //   - branch (35%): prefer spots far from existing neighbours, so the
      //                   silhouette gains organic, creature-like limbs
      // Both still anchor to a previously-placed block (random angle around
      // it) so the body never disconnects. The mode is decided per block.
      const wantBranch = rand() < 0.35;
      const TRIES = 8;
      const BRANCH_COMFORT = 0.55; // branch mode bails early at this gap
      const CLUMP_FLOOR = 0.3; // clump mode rejects near-identical overlaps
      let best: { x: number; y: number; gap: number } | null = null;

      for (let t = 0; t < TRIES; t++) {
        const anchor = blocks[Math.floor(rand() * blocks.length)];
        const angle = rand() * TAU;
        const avgScale = (anchor.scale + scale) / 2;
        // Block PNGs render their visible "blob" in the centre ~55-65 %
        // of the plane — the outer edges fade to transparent. So
        // geometric overlap alone doesn't guarantee a visible link.
        // 0.50 × avg → ~50 % geometric overlap (visible centres
        // definitely touch); 0.65 × avg → ~35 % overlap. Both keep the
        // new block firmly attached to the body, while branch mode
        // still gets to push the candidate AWAY from non-anchor blocks
        // for silhouette variety.
        const dist = (0.50 + rand() * 0.15) * avgScale;
        const cx = anchor.x + Math.cos(angle) * dist;
        const cy = anchor.y + Math.sin(angle) * dist;
        // Distance to nearest *non-anchor* block, normalised by avg scale.
        // Higher = more breathing room; lower = nestled into the crowd.
        let minGap = Infinity;
        for (const b of blocks) {
          if (b === anchor) continue;
          const gap =
            Math.hypot(b.x - cx, b.y - cy) / ((b.scale + scale) / 2);
          if (gap < minGap) minGap = gap;
        }
        const sample = { x: cx, y: cy, gap: minGap };

        if (best === null) {
          // Seed with whatever the first try produced — guarantees we always
          // have a placement even if every later candidate gets rejected.
          best = sample;
        } else if (wantBranch) {
          if (sample.gap > best.gap) best = sample;
        } else {
          // Clump: replace if (a) we previously seeded with a near-identical
          // overlap and this one is acceptable, or (b) this candidate sits
          // closer to the body than the current best (without fully
          // overlapping any block).
          if (
            sample.gap >= CLUMP_FLOOR &&
            (best.gap < CLUMP_FLOOR || sample.gap < best.gap)
          ) {
            best = sample;
          }
        }

        if (wantBranch && sample.gap >= BRANCH_COMFORT) break;
      }

      x = best!.x;
      y = best!.y;
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

// Set of every imagePath the current catalog ships. Used by
// sanitizeCreatureForCatalog to detect blocks that point at PNGs we no
// longer have on disk (creatures stored before a catalog rename / swap).
const VALID_IMAGE_PATHS = new Set<string>(EMOTION_LIST.map((e) => e.imagePath));

/**
 * Re-hydrate a stored creature against the CURRENT emotion catalog.
 * Stored creatures captured `block.imagePath` at upload time, so when the
 * catalog renames / removes a key (e.g. 31 → 50 swap, hurt-feelings →
 * embarrassment) those paths can become 404s. r3f's useLoader throws on a
 * missing texture and crashes the whole React tree — this helper avoids
 * that by:
 *
 *   1. If a block's imagePath is still valid, leave it alone.
 *   2. Otherwise, try to remap by `emotionKey` to the current catalog's
 *      path for that key.
 *   3. If the key is also unknown, drop the block.
 *
 * Returns `null` if the cleanup leaves the creature with zero blocks (we'd
 * rather not render an empty stub than render a dot).
 */
export function sanitizeCreatureForCatalog(
  creature: CreatureSpec,
): CreatureSpec | null {
  const cleanedBlocks: CreatureBlock[] = [];
  for (const b of creature.blocks) {
    if (VALID_IMAGE_PATHS.has(b.imagePath)) {
      cleanedBlocks.push(b);
      continue;
    }
    const meta = byKey.get(b.emotionKey);
    if (meta) {
      cleanedBlocks.push({ ...b, imagePath: meta.imagePath });
      continue;
    }
    // Unknown key + invalid path → can't render. Drop it.
  }
  if (cleanedBlocks.length === 0) return null;
  // Also drop emotion entries whose key no longer exists in the catalog
  // so the info-panel listing stays consistent with the rendered blocks.
  const cleanedEmotions = creature.emotions.filter((e) => byKey.has(e.key));
  return { ...creature, blocks: cleanedBlocks, emotions: cleanedEmotions };
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
