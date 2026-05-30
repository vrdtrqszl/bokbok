"use client";

import { useEffect, useState } from "react";
import {
  getAudioMuted,
  setAudioMuted,
  subscribeAudioMuted,
} from "@/lib/audio";

/**
 * Sound on/off toggle — flips the global mute state managed by `lib/audio.ts`.
 * The mute state is persisted in localStorage there, and the audio module
 * applies it to the master gain so EVERYTHING (one-shot block voices,
 * ambient chatter, creature giggle) goes silent at once when off.
 *
 * Each Figma icon has its OWN frame placement INSIDE its parent (the
 * "main box" frame on the main page) — they differ in offset and in
 * intrinsic bbox size because the hand-drawn artwork inside isn't
 * symmetric. To match the design exactly, we swap not just the icon
 * src but also the wrapper's left/top/width/height when the state flips.
 *
 *   Sound On  (Figma 2238:1390): x 21, y 16, w 41.46, h 43.06
 *   Sound Off (Figma 2238:1396): x 11, y 17, w 43.09, h 41.08
 *
 * Original Figma had two DIFFERENT bounding boxes (the artwork's
 * visual centre differs between the speaker-with-waves and the
 * speaker-with-X), which made the icon visibly jump 10 px left/right
 * every time the user toggled mute. We now use a SINGLE fixed
 * bounding box (BUTTON_STYLE below) for both states — both SVGs
 * declare preserveAspectRatio="none" so the icon stretches harmlessly
 * to fit, and the button no longer hops.
 *
 * Box centred between the two original Figma anchors at a 38×38
 * footprint (~90% of the raw 41×43 / 43×41) so it sits at the same
 * visual weight as the other corner buttons (× close, fullscreen,
 * +/− zoom — all 32.12 × 32.5).
 *
 * Coordinates are absolute, relative to the parent positioned element
 * (currently the main viewport box wrapper, whose origin matches the
 * Figma "main box" frame's top-left).
 */

const BUTTON_STYLE = {
  left: 16,
  top: 16,
  width: 38,
  height: 38,
} as const;

export default function SoundToggle({
  title,
}: {
  /** Optional override for the tooltip — defaults to a state-aware label. */
  title?: string;
} = {}) {
  // Mount-safe hydration: on SSR getAudioMuted() is always false. We then
  // subscribe in an effect so any later flips (from another instance, or
  // from the audio module itself reading localStorage on first ctx) sync.
  const [muted, setMuted] = useState(false);

  useEffect(() => {
    // On mount, pull the (possibly localStorage-hydrated) current state.
    setMuted(getAudioMuted());
    const unsub = subscribeAudioMuted((m) => setMuted(m));
    return unsub;
  }, []);

  const label = title ?? (muted ? "Sound off — click to turn on" : "Sound on — click to mute");

  return (
    <button
      type="button"
      onClick={() => setAudioMuted(!muted)}
      title={label}
      aria-label={label}
      aria-pressed={!muted}
      // Single fixed footprint for BOTH states so toggling mute swaps
      // only the SVG src — the button itself stays exactly where it is.
      style={{
        position: "absolute",
        left: `${BUTTON_STYLE.left}px`,
        top: `${BUTTON_STYLE.top}px`,
        width: `${BUTTON_STYLE.width}px`,
        height: `${BUTTON_STYLE.height}px`,
      }}
      className="tool-hit cursor-pointer overflow-visible bg-transparent p-0 opacity-80 transition-opacity hover:opacity-100"
    >
      <img
        alt=""
        src={muted ? "/assets/sound-off.svg" : "/assets/sound-on.svg"}
        className="block size-full"
        draggable={false}
      />
    </button>
  );
}
