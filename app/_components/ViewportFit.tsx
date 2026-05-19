"use client";

import { useEffect, useState } from "react";
import { useIsMobile } from "@/lib/useIsMobile";

// All pages are designed at this fixed size. We scale the entire stage to fit
// the window while preserving aspect ratio (letterboxed when the window has a
// different shape).
const DESIGN_W = 1440;
const DESIGN_H = 900;

/**
 * Scales a fixed-size design canvas (1440×900) to fit the current window
 * while preserving aspect ratio. The page itself is positioned and sized in
 * design pixels — this wrapper just applies a CSS transform so it always
 * fills the available space.
 *
 * - Listens to window resize and updates scale on the fly.
 * - Uses `transform: scale()` (GPU-accelerated, no layout reflow).
 * - Letterboxes with the page background color when window aspect ≠ 16:10.
 *
 * MOBILE BYPASS: when the viewport is below the mobile breakpoint
 * (useIsMobile), the fixed-canvas transform is skipped entirely and
 * children render in a normal flow inside a full-viewport container.
 * Each page is responsible for branching on useIsMobile() and rendering
 * a mobile-friendly layout in that case.
 */
export default function ViewportFit({ children }: { children: React.ReactNode }) {
  // Start at 1 so SSR markup matches the un-scaled design; the real scale is
  // computed in the first effect tick after mount.
  const [scale, setScale] = useState(1);
  const [mounted, setMounted] = useState(false);
  const isMobile = useIsMobile();

  useEffect(() => {
    const compute = () => {
      const sx = window.innerWidth / DESIGN_W;
      const sy = window.innerHeight / DESIGN_H;
      setScale(Math.min(sx, sy));
    };
    compute();
    setMounted(true);
    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  // Mobile: skip the fixed-canvas transform. Children render directly in a
  // full-viewport container with the same grain background. Allow native
  // vertical scrolling because mobile layouts are designed to be longer
  // than the viewport (stacked panels under the canvas, etc.).
  if (isMobile) {
    return (
      <div
        className="bg-grain"
        style={{
          position: "fixed",
          inset: 0,
          overflowY: "auto",
          overflowX: "hidden",
          // Disable touch-pan-x so swipes scroll vertically without
          // accidentally triggering horizontal scroll on iOS.
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    );
  }

  return (
    <div
      // Fills the viewport, centers the scaled stage. Carries the grain
      // background (.bg-grain) so the texture extends across the entire
      // viewport — including the letterbox bars on aspect-ratio mismatch.
      // Pages inside this wrapper are transparent so they don't double up
      // with their own grain at a different scale (which would create a
      // visible seam at the design-frame edge).
      className="bg-grain"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          width: DESIGN_W,
          height: DESIGN_H,
          transform: `scale(${scale})`,
          transformOrigin: "center center",
          // Hide pre-mount flash on small windows where scale=1 would
          // overflow before the first effect tick.
          visibility: mounted ? "visible" : "hidden",
          flexShrink: 0,
        }}
      >
        {children}
      </div>
    </div>
  );
}
