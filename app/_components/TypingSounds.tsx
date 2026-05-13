"use client";

import { useEffect } from "react";
import { playTypingTick, unlockAudio } from "@/lib/audio";

/**
 * Attaches a global keydown listener that fires a water-drop "plip"
 * (lib/audio playTypingTick) every time the user types into a text
 * field. Mounted once at the app root so every input on every page
 * gets the effect for free — no per-input wiring needed.
 *
 * Filter rules:
 *   • Only inside <input>, <textarea>, or contenteditable elements.
 *   • Only on real character-producing keys (Backspace and Space are
 *     also "typing"); navigation / shortcut / modifier keys are silent.
 *   • Skipped when a modifier (Ctrl / Meta / Alt) is held so keyboard
 *     shortcuts (Cmd+A, Cmd+S, …) don't trigger the sound.
 *
 * The tick goes through masterGain, so the global Sound Off toggle
 * silences typing along with the rest of the UI audio.
 */
export default function TypingSounds() {
  useEffect(() => {
    const isTextEditableTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.tagName === "TEXTAREA") return true;
      if (el.tagName === "INPUT") {
        const type = (el as HTMLInputElement).type;
        // Plain text-like input types only — skip checkbox / radio /
        // button / range / file etc.
        const TEXT_TYPES = new Set([
          "",
          "text",
          "search",
          "url",
          "tel",
          "email",
          "password",
          "number",
        ]);
        return TEXT_TYPES.has(type);
      }
      if (el.isContentEditable) return true;
      return false;
    };

    const onKeyDown = (e: KeyboardEvent) => {
      // Shortcuts: leave silent.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!isTextEditableTarget(e.target)) return;

      // Accept any single-character key plus the few non-printables
      // that still count as "typing".
      const k = e.key;
      const isCharKey = k.length === 1;
      const isTypingControl =
        k === "Backspace" || k === "Enter" || k === "Tab";
      if (!isCharKey && !isTypingControl) return;

      // First gesture inside any text field also unlocks the audio
      // context — keydown counts as a user activation.
      unlockAudio();
      try {
        playTypingTick();
      } catch {
        // Synth failures degrade silently.
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  return null;
}
