"use client";

import { useEffect } from "react";
import { playBubbleTick, unlockAudio } from "@/lib/audio";

/**
 * Fires a soft underwater bubble note (lib/audio playBubbleTick) as
 * the cursor wanders the page, giving the whole site a quiet drifting
 * soundtrack.
 *
 * Throttled by BOTH a minimum travel distance AND a minimum time gap
 * between notes so even fast cursor sweeps cap at ~5 notes / second —
 * sparse enough to feel ambient, not chimey.
 *
 * Pitch is mapped from cursor Y: top of the viewport reads as the
 * highest note in the marimba scale, bottom as the lowest. Horizontal
 * motion just changes the rate (because it triggers the distance
 * threshold sooner), giving the impression of "drawing" with sound.
 *
 * Goes through masterGain so the Sound Off toggle silences it along
 * with the rest of the ambient audio.
 */
export default function MouseSounds() {
  useEffect(() => {
    // Last position and last fire time. Initialised off-screen so the
    // very first mousemove always crosses the distance threshold.
    let lastX = -9999;
    let lastY = -9999;
    let lastT = 0;

    // Tuning. Bigger MIN_DIST = sparser notes; bigger MIN_MS = harder
    // upper rate cap. Together they give about 4–5 notes / second of
    // continuous fast cursor movement, sparser when slow.
    const MIN_DIST = 60;
    const MIN_MS = 180;
    const NOTE_COUNT = 10; // matches lib/audio BUBBLE_NOTES_HZ.length

    const onMove = (e: MouseEvent) => {
      const now = performance.now();
      if (now - lastT < MIN_MS) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      if (Math.hypot(dx, dy) < MIN_DIST) return;

      lastX = e.clientX;
      lastY = e.clientY;
      lastT = now;

      // Cursor Y → pitch index. Top of viewport = highest note.
      const wh = Math.max(1, window.innerHeight);
      const yRatio = Math.max(0, Math.min(1, 1 - e.clientY / wh));
      const idx = Math.min(NOTE_COUNT - 1, Math.floor(yRatio * NOTE_COUNT));

      unlockAudio();
      try {
        playBubbleTick(idx);
      } catch {
        // Synth failures degrade silently.
      }
    };

    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return null;
}
