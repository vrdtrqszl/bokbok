"use client";

import { useEffect, useState } from "react";
import MobileTopBar from "./MobileTopBar";
import {
  EMOTIONS,
  EMOTION_LIST,
  EMOTION_DESCRIPTION,
  EMOTION_COLOR_GROUP,
  EMOTION_GROUP_HEX,
  type Emotion,
  type EmotionKey,
} from "@/lib/emotions";
import { playEnergyBlock } from "@/lib/audio";
import { nameHighlightDataUrl } from "@/lib/nameHighlight";
import { emotionName, useLanguage, useT } from "@/lib/i18n";

// Same colour-spread shuffle as desktop, but parameterised for the mobile
// 3-column grid so adjacent tiles still don't share a coarse colour group.
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

const MOBILE_COLS = 3;

/**
 * Mobile Energy Blocks catalog.
 *
 * Desktop is a 5-col grid (162-px tiles) inside a wavy frame with a
 * right-column viewfinder (block PNG + name) and an info panel (one-
 * sentence description). On a phone, the right column doesn't fit, so
 * the layout becomes:
 *   1. MobileTopBar
 *   2. Selected-emotion view card (block PNG, name, description) at top
 *      — only renders when something is selected; otherwise a short hint.
 *   3. 3-column grid of all 50 emotion tiles below.
 *
 * Tapping any tile updates the top card and replays the block's voice.
 */
export default function MobileEnergyBlocksPage() {
  const t = useT();
  const lang = useLanguage();
  const [selectedKey, setSelectedKey] = useState<EmotionKey | null>(null);
  const selected = selectedKey ? EMOTIONS[selectedKey] : null;

  // SSR-stable initial order, shuffle on mount.
  const [order, setOrder] = useState<Emotion[]>(() => EMOTION_LIST);
  useEffect(() => {
    setOrder(shuffleWithColorSpread(EMOTION_LIST, MOBILE_COLS));
  }, []);

  return (
    <div className="relative min-h-screen w-full font-(family-name:--font-casual)">
      <MobileTopBar active="energy_blocks" />

      {/* Selected-emotion card — image + name + description. Pinned at the
          top of the scrollable content area so the user can see what they
          just tapped while their thumb is still over the grid. */}
      <section className="px-4 pb-4 pt-5">
        {selected ? (
          <div className="flex items-center gap-4">
            <img
              alt={emotionName(selected.key, lang)}
              src={selected.imagePath}
              className="block h-[110px] w-[110px] flex-shrink-0 object-contain"
            />
            <div className="flex min-w-0 flex-col">
              <span className="block text-[20px] font-bold leading-tight text-black">
                {emotionName(selected.key, lang)}
              </span>
              <p className="m-0 mt-1 text-[14px] font-bold leading-snug text-black/70">
                {EMOTION_DESCRIPTION[selected.key]}
              </p>
            </div>
          </div>
        ) : (
          <p className="m-0 text-center text-[14px] font-bold leading-relaxed text-black/40">
            {t("eb.empty_viewfinder_line1")}
            <br />
            {t("eb.empty_viewfinder_line2")}
          </p>
        )}
      </section>

      {/* 3-col emotion grid. Tiles sized to fit a portrait phone (375 wide
          → ~107 per tile after 12 px gutters). Label overlays the bottom
          of the tile image with a hand-drawn highlight on the active tile,
          same as desktop. */}
      <section className="px-3 pb-12">
        <div
          className="grid"
          style={{
            gridTemplateColumns: `repeat(${MOBILE_COLS}, 1fr)`,
            gap: "12px",
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
                  playEnergyBlock(emotion.key, undefined, { force: true });
                  // Scroll the top card into view so the user sees the
                  // update on small phones where the tile they tapped is
                  // already near the top of the screen.
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                aria-pressed={isActive}
                className={`relative block aspect-square cursor-pointer bg-transparent p-0 transition-transform active:scale-95 ${
                  isActive ? "scale-[1.03]" : ""
                }`}
              >
                <img
                  alt={emotionName(emotion.key, lang)}
                  src={emotion.imagePath}
                  className="pointer-events-none block size-full object-contain"
                />
                <span className="pointer-events-none absolute left-0 right-0 bottom-0 flex justify-center text-[14px] font-bold leading-[normal] text-black">
                  <span
                    className="whitespace-nowrap truncate px-[3px]"
                    style={
                      isActive
                        ? {
                            backgroundImage: nameHighlightDataUrl(
                              EMOTION_GROUP_HEX[EMOTION_COLOR_GROUP[emotion.key]],
                            ),
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 16px",
                            backgroundPosition: "center",
                            maxWidth: "100%",
                          }
                        : { maxWidth: "100%" }
                    }
                  >
                    {emotionName(emotion.key, lang)}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      </section>
    </div>
  );
}
