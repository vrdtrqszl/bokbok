"use client";

import { useLanguage, setLang, type Lang } from "@/lib/i18n";

// Language picker (Figma 2242:1455). Three labels — ENG / ESP / KOR —
// stacked horizontally with a hand-drawn slash between each pair. The
// currently-selected language gets a wavy marker highlight underneath
// it (each language has its OWN highlight SVG with its OWN default
// stroke colour: ENG → blue, ESP → yellow, KOR → red).
//
// Selection is persisted in localStorage (lib/i18n owns the key) and
// dispatches a global event so every useLanguage()-bound component
// re-renders with the new dictionary.

const LANGS: ReadonlyArray<{
  key: Lang;
  // Page-absolute X of the text frame (each frame is 33 × 15 in Figma).
  textX: number;
  // Per-language highlight stroke. Position + size derived from the
  // Figma path bbox (hlX / hlW) plus the stroke-width=12 in viewBox
  // space — the IMG has to be tall enough to render the full thick
  // stroke (not just the 2-px-tall path bbox). top/height are picked so
  // the visual centre stays at y=886 to match Figma.
  hlX: number;
  hlW: number;
  hlTop: number;
  hlH: number;
  hlSrc: string;
}> = [
  { key: "ENG", textX: 41,  hlX: 43,  hlW: 28,    hlTop: 879, hlH: 14, hlSrc: "/assets/lang-highlight-eng.svg" },
  { key: "ESP", textX: 77,  hlX: 82,  hlW: 23.52, hlTop: 880, hlH: 12, hlSrc: "/assets/lang-highlight-esp.svg" },
  { key: "KOR", textX: 111, hlX: 115, hlW: 26.03, hlTop: 880, hlH: 12, hlSrc: "/assets/lang-highlight-kor.svg" },
];

// Slash separators between adjacent language labels. Each SVG is a
// near-VERTICAL hand-drawn curve (path mostly along y); Figma rotates
// the asset 17.99° / 14.54° to turn it into a "/". The metadata's bbox
// X (e.g. 76.7) is the bbox of the rotated curve and overlaps the
// next label, so we use the Figma Dev Mode wrapper positions (73 / 109)
// which centre the slash in the gap between labels.
const SLASHES: ReadonlyArray<{
  x: number; y: number; w: number; h: number; rot: number; src: string;
}> = [
  { x: 73,  y: 879, w: 4.66, h: 11.72, rot: 17.99, src: "/assets/lang-slash-1.svg" },
  { x: 109, y: 879, w: 3,    h: 11.57, rot: 14.54, src: "/assets/lang-slash-2.svg" },
];

export default function LanguageButton() {
  const lang = useLanguage();
  const pick = (next: Lang) => setLang(next);

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

      {/* Slashes between adjacent labels. Each wrapper is the rotated
          slash's bbox; the inner <img> is the native-orientation curve
          (~2×12) rotated to make the "/" angle, centred via flex.
          pointer-events-none so the slash never steals a label click. */}
      {SLASHES.map((s, i) => (
        <div
          key={i}
          className="pointer-events-none absolute z-[15] flex items-center justify-center"
          style={{
            left: `${s.x}px`,
            top: `${s.y}px`,
            width: `${s.w}px`,
            height: `${s.h}px`,
          }}
        >
          <img
            alt=""
            src={s.src}
            style={{
              width: "2px",
              height: "12px",
              transform: `rotate(${s.rot}deg)`,
              transformOrigin: "center",
              maxWidth: "none",
              display: "block",
            }}
            draggable={false}
          />
        </div>
      ))}

      {/* Per-language highlight stroke — only the active one renders.
          Each SVG has its own default stroke colour baked in (ENG=blue,
          ESP=yellow, KOR=red). The IMG box must be tall enough for the
          12-unit-thick viewBox stroke to render — clipping it to the
          path's 2-px bbox (what the Figma node reports) makes the
          highlight visually disappear. Width matches the bbox; height
          is picked to roughly preserve the viewBox aspect; top is set
          so the stroke's visual centre stays at y≈886 (= 885 + 1 from
          the Figma bbox). */}
      {LANGS.filter((l) => l.key === lang).map(({ key, hlX, hlW, hlTop, hlH, hlSrc }) => (
        <img
          key={key}
          alt=""
          src={hlSrc}
          className="pointer-events-none absolute z-[10] block max-w-none"
          style={{
            left: `${hlX}px`,
            top: `${hlTop}px`,
            width: `${hlW}px`,
            height: `${hlH}px`,
          }}
          draggable={false}
        />
      ))}
    </>
  );
}
