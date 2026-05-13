"use client";

import { triggerEcosystemGather } from "./EcosystemCreatures";
import { unlockAudio } from "@/lib/audio";

/**
 * Candy button (Figma 2239:1401) — pressing it calls the wandering
 * ecosystem creatures back toward the centre of the scene. The actual
 * wander loop in EcosystemCreatures reads a module-level "gather window"
 * timestamp and, while it's active, every creature's next hop targets
 * origin instead of taking a random wander step.
 *
 * Placed at the Figma frame position (52, 825) on the main page; the
 * page wraps it in the design-space ViewportFit so we just absolute
 * the coords. The artwork itself (a wrapped candy outline) is 66.43 ×
 * 35.26 px in the design canvas.
 */
export default function CandyButton() {
  return (
    <button
      type="button"
      onClick={() => {
        // Also unlock the audio context — clicking the candy button is a
        // user gesture, and the user may not have clicked anything else
        // yet, so this is a free moment to let ambient chatter start.
        unlockAudio();
        triggerEcosystemGather();
      }}
      title="Call creatures back to the centre"
      aria-label="Call creatures back to the centre"
      className="absolute left-[52px] top-[825px] z-[20] block h-[35.26px] w-[66.43px] cursor-pointer bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
    >
      <img
        alt=""
        src="/assets/candy-button.svg"
        className="block size-full"
        draggable={false}
      />
    </button>
  );
}
