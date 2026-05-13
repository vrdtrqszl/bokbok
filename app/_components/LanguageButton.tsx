"use client";

import { useEffect, useState } from "react";

// Language picker (Figma 2242:1455). Three labels — ENG / ESP / KOR —
// stacked horizontally with a hand-drawn slash between each pair. The
// currently-selected language gets a wavy marker highlight underneath
// it (each language has its OWN highlight SVG with its OWN default
// stroke colour: ENG → blue, ESP → yellow, KOR → red).
//
// Selection is persisted in localStorage so the choice survives reloads.
// The actual page-text translation isn't wired yet — this commit just
// adds the picker UI per the Figma design.

const LANG_STORAGE_KEY = "bokbok:language";
type Lang = "ENG" | "ESP" | "KOR";

const LANGS: ReadonlyArray<{
  key: Lang;
  // Page-absolute X of the text frame (each frame is 33 × 15 in Figma).
  textX: number;
  // Page-absolute X / width of the highlight stroke for this language.
  hlX: number;
  hlW: number;
  // Asset path under public/.
  hlSrc: string;
}> = [
  { key: "ENG", textX: 41,  hlX: 43,  hlW: 28,    hlSrc: "/assets/lang-highlight-eng.svg" },
  { key: "ESP", textX: 77,  hlX: 82,  hlW: 23.52, hlSrc: "/assets/lang-highlight-esp.svg" },
  { key: "KOR", textX: 111, hlX: 115, hlW: 26.03, hlSrc: "/assets/lang-highlight-kor.svg" },
];

// Slash separators (vertical hand-drawn squiggles between adjacent
// language labels). Position + size verbatim from Figma metadata.
const SLASHES: ReadonlyArray<{ x: number; y: number; w: number; h: number; src: string }> = [
  { x: 76.7, y: 879, w: 4.66, h: 11.72, src: "/assets/lang-slash-1.svg" },
  { x: 112,  y: 879, w: 3,    h: 11.57, src: "/assets/lang-slash-2.svg" },
];

export default function LanguageButton() {
  const [lang, setLang] = useState<Lang>("ENG");

  // Hydrate from localStorage on mount (SSR returns default).
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(LANG_STORAGE_KEY);
      if (stored === "ENG" || stored === "ESP" || stored === "KOR") {
        setLang(stored);
      }
    } catch {
      // Storage failures (private mode etc.) — fall back to default ENG.
    }
  }, []);

  const pick = (next: Lang) => {
    setLang(next);
    try {
      window.localStorage.setItem(LANG_STORAGE_KEY, next);
    } catch {
      // Same — in-memory state still works without persistence.
    }
  };

  return (
    <>
      {/* Language labels. Each is its own button at the Figma frame
          position; click to select. Active state gets the highlight. */}
      {LANGS.map(({ key, textX }) => (
        <button
          key={key}
          type="button"
          onClick={() => pick(key)}
          aria-pressed={lang === key}
          title={key}
          className="absolute z-[20] block cursor-pointer bg-transparent p-0 text-center text-[16px] font-bold leading-[normal] text-black font-(family-name:--font-casual)"
          style={{ left: `${textX}px`, top: "877px", width: "33px", height: "15px" }}
        >
          {key}
        </button>
      ))}

      {/* Slashes between adjacent labels. Pointer-events-none so they
          never steal clicks meant for a button beside them. */}
      {SLASHES.map((s, i) => (
        <img
          key={i}
          alt=""
          src={s.src}
          className="pointer-events-none absolute z-[15] block"
          style={{
            left: `${s.x}px`,
            top: `${s.y}px`,
            width: `${s.w}px`,
            height: `${s.h}px`,
          }}
          draggable={false}
        />
      ))}

      {/* Per-language highlight stroke — only the active one renders.
          Each SVG has its own default stroke colour baked in (ENG=blue,
          ESP=yellow, KOR=red), so we just swap the src by selection.
          A small vertical bbox is fine because the actual stroke
          inside the SVG renders well beyond the bbox (overflow:visible
          + non-uniform aspect ratio). */}
      {LANGS.filter((l) => l.key === lang).map(({ key, hlX, hlW, hlSrc }) => (
        <img
          key={key}
          alt=""
          src={hlSrc}
          className="pointer-events-none absolute z-[10] block"
          style={{
            left: `${hlX}px`,
            top: "885px",
            width: `${hlW}px`,
            // Stroke is 12 px thick in viewBox space; the wrapper just
            // needs to be wide enough to stretch the path horizontally,
            // and tall enough for the stroke to render (overflow:visible
            // on the SVG itself lets the thick stroke spill outside).
            height: "2px",
            overflow: "visible",
          }}
          draggable={false}
        />
      ))}
    </>
  );
}
