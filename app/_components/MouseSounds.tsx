"use client";

import { useEffect } from "react";
import { playMagneticTick, unlockAudio } from "@/lib/audio";

/**
 * Global mouse-move sound layer. Fires a soft slice of magnetic.mp3
 * (see lib/audio.playMagneticTick) under the cursor as the user moves
 * around. Mounted once at the app root so every page picks it up
 * without per-page wiring.
 *
 * Throttling:
 *   • Minimum 80 ms between ticks (~12 ticks/sec max) — fast enough
 *     to feel responsive, slow enough not to stack into a wall.
 *   • Requires at least 6 px of cumulative movement since the last
 *     tick — filters out micro-jitter from a still-mostly-static
 *     cursor (the kind a trackpad emits while you rest your hand on
 *     it).
 *   • Goes through masterGain so the global Sound Off toggle silences
 *     the cursor trail along with the rest of the UI audio.
 *
 * Pause rules:
 *   • Mobile (touch-only): no real mousemove events happen, but the
 *     pointermove that touches generate could spam ticks. We skip if
 *     event.pointerType === "touch".
 */

const MIN_INTERVAL_MS = 80;
const MIN_MOVEMENT_PX = 6;

export default function MouseSounds() {
  useEffect(() => {
    let lastFireMs = 0;
    let lastX: number | null = null;
    let lastY: number | null = null;
    let accumDist = 0;

    const onPointerMove = (e: PointerEvent) => {
      // Skip touch — generates pointermove events on drag/scroll and
      // mobile doesn't have a hovering "cursor" to soundtrack.
      if (e.pointerType === "touch") return;

      // First move ever — just record position; no tick yet.
      if (lastX === null || lastY === null) {
        lastX = e.clientX;
        lastY = e.clientY;
        return;
      }

      // Accumulate distance since the last actual tick. This keeps the
      // movement filter intact even when individual mousemove events
      // are tiny — only the SUM matters.
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;
      accumDist += Math.hypot(dx, dy);
      if (accumDist < MIN_MOVEMENT_PX) return;

      const now = performance.now();
      if (now - lastFireMs < MIN_INTERVAL_MS) return;
      lastFireMs = now;
      accumDist = 0;

      // First gesture also unlocks the audio context (mousemove
      // doesn't count as a user activation in most browsers, but
      // by the time the user has moved the mouse they've usually
      // already clicked or pressed a key — this is just defensive).
      unlockAudio();
      try {
        playMagneticTick();
      } catch {
        // Sample-load failures degrade silently.
      }
    };

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, []);

  return null;
}
