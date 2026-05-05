"use client";

// Energy Blocks catalog page (Figma 2102:151).
//
// All 50 emotions listed in a 3-column grid inside the main wavy frame —
// the visible 3×2 chunk matches the Figma reference, and the rest scrolls
// down. Clicking a tile updates the right-hand "creature view" (PNG +
// name) and the info panel (one-word descriptor from EMOTION_ONE_WORD).
// Joy is selected by default to match the Figma reference.

import Link from "next/link";
import { useState } from "react";
import { EMOTIONS, EMOTION_LIST, EMOTION_ONE_WORD, type EmotionKey } from "@/lib/emotions";

// Grid metrics inside the main box (974.69 × 789.67). Column positions
// (23 / 352 / 679) and image size (278) come straight from Figma 2102:185;
// the column gap (51) and row gap (62) are derived from those positions
// so the visible portion matches the reference exactly.
const TILE_SIZE = 278;       // image width/height (square)
const LABEL_HEIGHT = 36;     // matches text-[24px] line-box
const TILE_HEIGHT = TILE_SIZE + 8 + LABEL_HEIGHT; // image + 8px gap + label
const COL_GAP = 51;          // 352 - (23 + 278) — col 2 left minus col 1 right
const ROW_GAP = 62;          // 424 - (40 + 322) — row 2 top minus row 1 bottom
const PAD_LEFT = 23;         // first column's x inside the main box
const PAD_TOP = 40;          // first row's y inside the main box
const PAD_RIGHT = 16;        // 974.69 - (23 + 278×3 + 51×2)
const PAD_BOTTOM = 30;       // breathing room at the bottom of the scroll

export default function EnergyBlocksPage() {
  const [selectedKey, setSelectedKey] = useState<EmotionKey>("joy");
  const selected = EMOTIONS[selectedKey];

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden bg-[#dfd9c9] font-(family-name:--font-casual)">
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
            Calender      (2102:153)  x=115 y=51 w=151
            Encyclopedia  (2102:157)  x=255 y=51 w=151
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
        Calender
      </Link>
      <Link
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        Encyclopedia
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

      {/* Main wavy frame (Figma 2102:185) — same asset as Calender/Encyclopedia. */}
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* All 50 emotions, 3-col scrollable grid inside the main frame.
          The first 6 fit the original Figma 3×2 layout exactly (column
          positions 23/352/679 at y=40 then y=424); rows 7..17 continue
          downward at the same pitch and become reachable via scroll. */}
      <div
        className="absolute left-[27px] top-[85px] grid h-[789.67px] w-[974.69px] overflow-y-auto overflow-x-clip"
        style={{
          gridTemplateColumns: `repeat(3, ${TILE_SIZE}px)`,
          columnGap: `${COL_GAP}px`,
          rowGap: `${ROW_GAP}px`,
          paddingTop: `${PAD_TOP}px`,
          paddingBottom: `${PAD_BOTTOM}px`,
          paddingLeft: `${PAD_LEFT}px`,
          paddingRight: `${PAD_RIGHT}px`,
          gridAutoRows: `${TILE_HEIGHT}px`,
        }}
      >
        {EMOTION_LIST.map((emotion) => {
          const isActive = emotion.key === selectedKey;
          return (
            <button
              key={emotion.key}
              type="button"
              onClick={() => setSelectedKey(emotion.key)}
              aria-pressed={isActive}
              className={`relative block cursor-pointer bg-transparent p-0 transition-transform hover:scale-[1.02] active:scale-95 ${
                isActive ? "scale-[1.02]" : ""
              }`}
              style={{ width: `${TILE_SIZE}px`, height: `${TILE_HEIGHT}px` }}
            >
              <img
                alt={emotion.displayName}
                src={emotion.imagePath}
                className="pointer-events-none absolute left-0 top-0 block size-[278px] object-contain"
              />
              <span className="pointer-events-none absolute left-0 right-0 bottom-0 block text-center text-[24px] font-bold leading-[normal] text-black">
                {emotion.displayName}
              </span>
            </button>
          );
        })}
      </div>

      {/* Right column: creature view (top) — Figma 2102:179, at (1016, 85),
          396.28 × 386.37. Shows the selected emotion's energy block + name. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        {/* Selected energy block PNG, sized + centered to roughly match the
            Figma reference (left 14.13%, right 15.72%). */}
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
        <span className="absolute left-0 right-0 block text-center text-[24px] font-bold leading-[normal] text-black"
          style={{ top: `${386.37 * 0.8903}px` }}
        >
          {selected.displayName}
        </span>
      </div>

      {/* Right column: info box (bottom) — Figma 2102:158, at (1015, 480),
          397.21 × 398.38. Holds the description text, vertically centered. */}
      <div className="pointer-events-none absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px]">
        <img
          alt=""
          src="/assets/info-box.svg"
          className="absolute inset-0 block size-full"
        />
        {/* One-word descriptor, centered both axes per Figma inset
            [46.19% 9.62% 45.03% 9.82%]. Source: EMOTION_ONE_WORD. */}
        <div
          className="absolute flex items-center justify-center"
          style={{
            left: `${397.21 * 0.0982}px`,
            right: `${397.21 * 0.0962}px`,
            top: `${398.38 * 0.4619}px`,
            bottom: `${398.38 * 0.4503}px`,
          }}
        >
          <p className="text-center text-[36px] font-bold leading-[normal] text-black">
            {EMOTION_ONE_WORD[selected.key]}
          </p>
        </div>
      </div>
    </div>
  );
}
