"use client";

// Energy Blocks catalog page (Figma 2102:151).
//
// Six primary emotions laid out in a 3×2 grid inside the main wavy frame.
// Clicking a tile updates the right-hand "creature view" (PNG + name) and
// the info panel (1–2 sentence description). Joy is selected by default,
// matching the Figma reference.

import Link from "next/link";
import { useState } from "react";
import { EMOTIONS, type EmotionKey } from "@/lib/emotions";

// Order matches the Figma layout (left→right, top→bottom). Six primary
// emotions chosen to span the valence spectrum (positive / neutral /
// negative) and all backed by descriptions in the catalog.
const PRIMARY_EMOTIONS: EmotionKey[] = [
  "joy",
  "sadness",
  "anger",
  "surprise",
  "love",
  "disgust",
];

// Grid layout inside the main box (974.69 × 789.67). Coordinates
// derived from Figma 2102:185 — three columns of ~278×278 PNGs at
// y=40 (top row) and y=424 (bottom row).
const COL_LEFTS = [23, 352, 679] as const;   // image left edge (px)
const ROW_TOPS = [40, 424] as const;          // image top edge (px)
const TILE_SIZE = 278;                         // image width/height (square)
const LABEL_HEIGHT = 36;                       // matches text-[24px] line-box

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

      {/* 3×2 grid of energy blocks, anchored inside the main frame. */}
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        {PRIMARY_EMOTIONS.map((key, i) => {
          const emotion = EMOTIONS[key];
          const col = i % 3;
          const row = Math.floor(i / 3);
          const left = COL_LEFTS[col];
          const top = ROW_TOPS[row];
          const isActive = key === selectedKey;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setSelectedKey(key)}
              aria-pressed={isActive}
              className={`absolute block cursor-pointer bg-transparent p-0 transition-transform hover:scale-[1.02] active:scale-95 ${
                isActive ? "scale-[1.02]" : ""
              }`}
              style={{
                left: `${left}px`,
                top: `${top}px`,
                width: `${TILE_SIZE}px`,
                height: `${TILE_SIZE + 8 + LABEL_HEIGHT}px`,
              }}
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
        {/* Description, centered both axes per Figma inset
            [46.19% 9.62% 45.03% 9.82%]. */}
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
            {selected.description ?? ""}
          </p>
        </div>
      </div>
    </div>
  );
}
