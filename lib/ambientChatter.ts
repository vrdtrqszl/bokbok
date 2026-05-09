// Main-page ambient chatter — keeps the ecosystem feeling "alive" by
// having creatures chirp constantly at low volume, with the currently-
// focused creature popping out at high volume.
//
// Behaviour:
//   - A global setTimeout loop fires every ~300–700 ms. Each tick picks
//     ONE creature to chirp (so we never get a wall of simultaneous
//     voices), then plays one random block of theirs through
//     playEnergyBlock.
//   - When a creature is selected, that creature is much more likely
//     to be the picked one (~70%) AND chirps at a much louder amp.
//     The other creatures still chirp occasionally at ambient amp, so
//     the room never goes silent — it sounds like distant chatter
//     while the focused one talks to you.
//   - Stopping (e.g., on page unmount) cancels the timer immediately.
//
// AudioContext autoplay policy: the loop won't actually produce sound
// until unlockAudio() has been called from a user gesture. The wiring in
// app/page.tsx attaches a one-shot pointerdown listener that does this.
"use client";

import type { CreatureSpec } from "./creature";
import { playEnergyBlock } from "./audio";

// Pacing: how often any creature chirps. Faster = more "talkative" room.
const MIN_INTERVAL_MS = 320;
const MAX_INTERVAL_MS = 720;

// When a creature is selected, it gets this share of ticks (the rest go
// to random other creatures, so background chatter continues).
const SELECTED_PICK_PROB = 0.70;

// Per-voice amp for the two states. Selected = clearly prominent;
// ambient = faint background. The ratio (~5×) makes the focus shift
// obvious without making non-selected creatures inaudible.
const AMP_AMBIENT = 0.11;
const AMP_SELECTED = 0.62;

let creatures: CreatureSpec[] = [];
let selectedId: string | null = null;
let timer: number | null = null;
let active = false;

function tick(): void {
  if (!active) return;
  if (creatures.length === 0) {
    // No creatures yet — still keep the loop alive so we pick up new
    // creatures as soon as they're pushed in.
    timer = window.setTimeout(tick, 600);
    return;
  }

  // Pick a creature: heavily biased toward the selected one (if any),
  // otherwise uniformly random.
  let picked: CreatureSpec | null = null;
  if (selectedId && Math.random() < SELECTED_PICK_PROB) {
    picked = creatures.find((c) => c.id === selectedId) ?? null;
  }
  if (!picked) {
    picked = creatures[Math.floor(Math.random() * creatures.length)];
  }

  if (picked && picked.blocks.length > 0) {
    const block = picked.blocks[Math.floor(Math.random() * picked.blocks.length)];
    const isSelected = picked.id === selectedId;
    const amp = isSelected ? AMP_SELECTED : AMP_AMBIENT;
    try {
      playEnergyBlock(block.emotionKey, amp);
    } catch {
      // Synth failures degrade silently — never block the loop.
    }
  }

  // Schedule the next tick. Slight bias toward faster cadence when a
  // creature is selected so the focused chatter feels engaged.
  const min = selectedId ? MIN_INTERVAL_MS - 60 : MIN_INTERVAL_MS;
  const max = selectedId ? MAX_INTERVAL_MS - 80 : MAX_INTERVAL_MS;
  const delay = min + Math.random() * (max - min);
  timer = window.setTimeout(tick, delay);
}

/** Public singleton — page-level useEffects call into these. */
export const ambientChatter = {
  /** Start the ticking loop. No-op if already running. */
  start(): void {
    if (active) return;
    active = true;
    tick();
  },
  /** Tear down the timer. Safe to call repeatedly. */
  stop(): void {
    active = false;
    if (timer !== null) {
      window.clearTimeout(timer);
      timer = null;
    }
  },
  /** Replace the creature roster. Cheap; can fire on every ecosystem change. */
  setCreatures(list: CreatureSpec[]): void {
    creatures = list;
  },
  /** Update which creature is "focused". null = nothing selected. */
  setSelected(id: string | null): void {
    selectedId = id;
  },
};
