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
 * Renders one of two hand-drawn icons (Figma 2238:1390 / 2238:1396). The
 * caller positions this component absolutely; it's a transparent button
 * with an inner <img>, sized to fill the parent.
 */
export default function SoundToggle({
  className = "",
  title,
}: {
  /** Tailwind / utility classes for absolute positioning + sizing. */
  className?: string;
  /** Optional override for the tooltip — defaults to a state-aware label. */
  title?: string;
}) {
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
      className={`bg-transparent p-0 opacity-80 transition-opacity hover:opacity-100 ${className}`}
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
