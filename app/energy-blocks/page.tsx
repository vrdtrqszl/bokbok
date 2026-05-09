"use client";

// Energy Blocks catalog page (Figma 2102:151 + 2133:350 grid revision).
//
// All 50 emotions listed in a 5-column grid inside the main wavy frame.
// The visible 5×3-ish chunk matches the Figma reference at 2133:350 — the
// rest scrolls down. Clicking a tile updates the right-hand "creature
// view" (PNG + name) and the info panel (one-sentence description from
// EMOTION_DESCRIPTION). Joy is selected by default.

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  EMOTIONS,
  EMOTION_LIST,
  EMOTION_DESCRIPTION,
  EMOTION_COLOR_GROUP,
  type Emotion,
  type EmotionKey,
} from "@/lib/emotions";
import { playEnergyBlock } from "@/lib/audio";

// Random shuffle (Fisher–Yates) followed by a greedy pass that swaps tiles
// around so no two adjacent grid cells (left or directly above) share the
// same coarse color group. We only swap forward — replace the current spot
// with the next non-conflicting item later in the queue — which keeps the
// arrangement random while spreading colours apart. If no later item fits
// (rare, dense color groups), we leave the conflict; not worth chasing.
function shuffleWithColorSpread(list: Emotion[], cols: number): Emotion[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  for (let i = 0; i < out.length; i++) {
    const leftKey = i % cols > 0 ? out[i - 1].key : null;
    const upKey = i >= cols ? out[i - cols].key : null;
    const conflicts = (e: Emotion) => {
      const c = EMOTION_COLOR_GROUP[e.key];
      if (leftKey && EMOTION_COLOR_GROUP[leftKey] === c) return true;
      if (upKey && EMOTION_COLOR_GROUP[upKey] === c) return true;
      return false;
    };
    if (!conflicts(out[i])) continue;
    for (let j = i + 1; j < out.length; j++) {
      if (!conflicts(out[j])) {
        [out[i], out[j]] = [out[j], out[i]];
        break;
      }
    }
  }
  return out;
}

// Grid metrics inside the main box (974.69 × 789.67). Derived from
// Figma 2133:350 — the page-relative percentages there resolve to:
//   tile width  = 11.22% × 1440 ≈ 162 px
//   col pitch   = 13.21% × 1440 ≈ 190 px (so col gap ≈ 28 px)
//   row pitch   = 224 px (Δ between row tops 95 / 319 / 543)
//   first row's image y = 95 (page) ≈ 10 px below the main-box top.
const NUM_COLS = 5;
const TILE_SIZE = 162;       // image width/height (square)
const LABEL_HEIGHT = 36;     // matches text-[24px] line-box
const TILE_HEIGHT = TILE_SIZE + 8 + LABEL_HEIGHT; // image + 8 gap + label
const COL_GAP = 28;          // ≈ col pitch (190) − tile width (162)
const ROW_GAP = 18;          // ≈ row pitch (224) − tile height (206)
const PAD_LEFT = 33;         // first column's x inside the main box
const PAD_TOP = 10;          // first row's y inside the main box
const PAD_RIGHT = 18;        // 974.69 − (33 + 162×5 + 28×4) ≈ 18
const PAD_BOTTOM = 30;       // breathing room at the bottom of the scroll

export default function EnergyBlocksPage() {
  // null = nothing selected yet — both right-hand panels start empty and
  // only populate once the user clicks a tile.
  const [selectedKey, setSelectedKey] = useState<EmotionKey | null>(null);
  const selected = selectedKey ? EMOTIONS[selectedKey] : null;

  // Tile order. SSR (and the very first client render) uses the catalog
  // order so hydration matches; on mount we shuffle and re-render with a
  // colour-spaced random order so the user gets a fresh layout each visit.
  const [order, setOrder] = useState<Emotion[]>(() => EMOTION_LIST);
  useEffect(() => {
    setOrder(shuffleWithColorSpread(EMOTION_LIST, NUM_COLS));
  }, []);

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* BokBok logo / Home link */}
      <Link
        href="/"
        className="absolute left-[1213.5px] top-[24px] block -translate-x-1/2 cursor-pointer whitespace-nowrap text-[48px] leading-normal text-black font-(family-name:--font-fancy)"
      >
        BokBok
      </Link>

      {/* Top nav — Figma values per node, with the row stair-stepping
          slightly down across the bar:
            Create        (2102:152)  x=35  y=48 w=91
            Calendar      (2102:153)  x=115 y=51 w=151
            BokBokpedia  (2102:157)  x=255 y=51 w=151
          Energy Blocks (active here) and About sit at y=54. */}
      <Link
        href="/create"
        className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        Create
      </Link>
      <Link
        href="/calender"
        className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        Calendar
      </Link>
      <Link
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        BokBokpedia
      </Link>

      {/* Active tab indicator behind Energy Blocks (Figma 2122:125 → 2129:230
          equivalent). Stroke box sits +3px relative to the label like the
          other active-tab indicators. */}
      <div className="absolute left-[412px] top-[44.55px] h-[49.95px] w-[163.73px]">
        <img
          alt=""
          src="/assets/energy-blocks-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        Energy Blocks
      </span>

      {/* About (Figma 2109:250) — at x=581, y=54, w=76. */}
      <Link
        href="/about"
        className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        About
      </Link>

      {/* Main wavy frame (Figma 2102:185) — same asset as Calendar/BokBokpedia. */}
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* All 50 emotions, 5-col scrollable grid inside the main frame.
          The visible top portion matches Figma 2133:350 — 5 tiles per
          row at 162×162, ~28 px column gap, ~18 px row gap; rows beyond
          row 3 reach below the main-box bottom and are reached by
          scrolling. */}
      <div
        className="absolute left-[27px] top-[85px] grid h-[789.67px] w-[974.69px] overflow-y-auto overflow-x-clip"
        style={{
          gridTemplateColumns: `repeat(${NUM_COLS}, ${TILE_SIZE}px)`,
          columnGap: `${COL_GAP}px`,
          rowGap: `${ROW_GAP}px`,
          paddingTop: `${PAD_TOP}px`,
          paddingBottom: `${PAD_BOTTOM}px`,
          paddingLeft: `${PAD_LEFT}px`,
          paddingRight: `${PAD_RIGHT}px`,
          gridAutoRows: `${TILE_HEIGHT}px`,
        }}
      >
        {order.map((emotion) => {
          const isActive = emotion.key === selectedKey;
          return (
            <button
              key={emotion.key}
              type="button"
              onClick={() => {
                setSelectedKey(emotion.key);
                // Play the block's voice on every tap — even tapping the
                // same tile again replays the sound, since each click is a
                // user gesture so the AudioContext stays unlocked.
                playEnergyBlock(emotion.key);
              }}
              aria-pressed={isActive}
              className={`relative block cursor-pointer bg-transparent p-0 transition-transform hover:scale-[1.04] active:scale-95 ${
                isActive ? "scale-[1.04]" : ""
              }`}
              style={{ width: `${TILE_SIZE}px`, height: `${TILE_HEIGHT}px` }}
            >
              <img
                alt={emotion.displayName}
                src={emotion.imagePath}
                className="pointer-events-none absolute left-0 top-0 block object-contain"
                style={{ width: `${TILE_SIZE}px`, height: `${TILE_SIZE}px` }}
              />
              <span className="pointer-events-none absolute left-0 right-0 bottom-0 block whitespace-nowrap text-center text-[20px] font-bold leading-[normal] text-black">
                {emotion.displayName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right column: creature view (top) — Figma 2102:179, at (1016, 85),
          396.28 × 386.37. Empty until the user picks a tile; then shows
          the selected emotion's energy block + name. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        {selected ? (
          <>
            {/* Selected energy block PNG, sized + centered to roughly match
                the Figma reference (left 14.13%, right 15.72%). */}
            <img
              alt={selected.displayName}
              src={selected.imagePath}
              className="absolute object-contain"
              style={{
                left: `${396.28 * 0.1413}px`,
                top: `51px`,
                width: `${396.28 * (1 - 0.1413 - 0.1572)}px`,
                height: `${396.28 * (1 - 0.1413 - 0.1572)}px`,
              }}
            />
            {/* Name label — text-[24px] Casual Human Bold, centered, near the
                bottom of the box (Figma inset 89.03%/1.91%). */}
            <span
              className="absolute left-0 right-0 block text-center text-[24px] font-bold leading-[normal] text-black"
              style={{ top: `${386.37 * 0.8903}px` }}
            >
              {selected.displayName}
            </span>
          </>
        ) : (
          /* Empty-state hint — same styling as the Calendar / BokBokpedia
             pages so the three viewfinders read as a family. */
          <div className="absolute inset-0 flex items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
            Click an energy block in the
            <br />
            gallery to view it
          </div>
        )}
      </div>

      {/* Right column: info box (bottom) — Figma 2102:158, at (1015, 480),
          397.21 × 398.38. Empty until the user picks a tile; then holds
          the description text, vertically centered. */}
      <div className="pointer-events-none absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px]">
        <img
          alt=""
          src="/assets/info-box.svg"
          className="absolute inset-0 block size-full"
        />
        {selected ? (
          /* One-sentence description, centered both axes per Figma inset
             [46.19% 9.62% 45.03% 9.82%]. Source: EMOTION_DESCRIPTION. */
          <div
            className="absolute flex items-center justify-center"
            style={{
              left: `${397.21 * 0.0982}px`,
              right: `${397.21 * 0.0962}px`,
              top: `${398.38 * 0.4619}px`,
              bottom: `${398.38 * 0.4503}px`,
            }}
          >
            <p className="text-center text-[24px] font-bold leading-[normal] text-black">
              {EMOTION_DESCRIPTION[selected.key]}
            </p>
          </div>
        ) : (
          /* Empty-state hint — pairs with the viewfinder hint above. */
          <div className="absolute inset-0 flex items-center justify-center px-[39px] text-center text-[14px] leading-relaxed text-black/40">
            Each block holds a feeling.
            <br />
            Click one to read about it.
          </div>
        )}
      </div>
    </div>
  );
}
