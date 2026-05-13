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
 * Coordinates are absolute, relative to the parent positioned element
 * (currently the main viewport box wrapper, whose origin matches the
 * Figma "main box" frame's top-left).
 */

const ON_STYLE = {
  left: 21,
  top: 16,
  width: 41.46,
  height: 43.06,
} as const;

const OFF_STYLE = {
  left: 11,
  top: 17,
  width: 43.09,
  height: 41.08,
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
  const frame = muted ? OFF_STYLE : ON_STYLE;

  return (
    <button
      type="button"
      onClick={() => setAudioMuted(!muted)}
      title={label}
      aria-label={label}
      aria-pressed={!muted}
      // Inline style because each state has its own pixel-precise Figma
      // frame — keeping it out of Tailwind avoids two duplicate class
      // strings and makes the mapping to the design tokens obvious.
      style={{
        position: "absolute",
        left: `${frame.left}px`,
        top: `${frame.top}px`,
        width: `${frame.width}px`,
        height: `${frame.height}px`,
      }}
      className="cursor-pointer bg-transparent p-0 opacity-80 transition-opacity hover:opacity-100"
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
