"use client";

import { useEffect, useState } from "react";

// Threshold below which we switch to the mobile layout. 768 is the standard
// "small-tablet/large-phone" breakpoint — narrower than a horizontal iPad,
// wider than every phone in portrait. Devices in landscape mode at this
// width or above (e.g., iPhone Pro Max landscape ~932px) still get the
// desktop layout, which is intentional: the 1440×900 design scales down
// gracefully to that aspect ratio.
const MOBILE_MAX_W = 768;

/**
 * Returns true when the current viewport is narrow enough that the
 * 1440×900 fixed-canvas design (scaled by ViewportFit) becomes uncomfortably
 * small to read or interact with. Components can branch on this to render
 * a mobile-specific layout instead.
 *
 * SSR-safe: returns `false` on the server so the initial HTML matches the
 * desktop layout, then re-renders to the correct value after mount.
 *
 * NOTE: The dedicated Mobile* page layouts are currently paused — every
 * page renders the desktop 1440×900 layout regardless of viewport size,
 * and ViewportFit scales it down. The mobile layouts remain in the
 * codebase for a future revival; useIsPortraitMobile() (below) is what
 * the live "please rotate" UX checks against.
 */
export function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < MOBILE_MAX_W);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);

  return isMobile;
}

/**
 * True when the device is a narrow viewport (phone-class) AND currently
 * in PORTRAIT orientation. We use this to gate the "rotate to landscape"
 * prompt — the desktop design fits comfortably on a phone in landscape
 * (after ViewportFit's scale-to-fit) but is too cramped in portrait, so
 * we ask the user to rotate.
 *
 * Portrait detection uses window.matchMedia("(orientation: portrait)")
 * for correctness across devices; falls back to a height>width check
 * when matchMedia is unavailable.
 *
 * SSR-safe: returns `false` on the server so the initial HTML doesn't
 * flash the rotate prompt.
 */
/**
 * True when the primary pointer is COARSE — i.e., a touchscreen (finger)
 * rather than a mouse/trackpad. Unlike useIsMobile(), this is independent
 * of viewport width, so it stays true on a phone held in LANDSCAPE (where
 * the width-based check flips back to "desktop" because the width clears
 * 768px). That makes it the right signal for touch-only affordances — the
 * floating tool-cursor overlay and the larger candy sprinkle — which we
 * want on every phone/tablet regardless of orientation.
 *
 * Uses matchMedia("(pointer: coarse)") with a maxTouchPoints fallback.
 * SSR-safe: returns `false` on the server so the desktop affordances render
 * first, then re-evaluates after mount.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(false);

  useEffect(() => {
    const check = () => {
      const coarse = typeof window.matchMedia === "function"
        ? window.matchMedia("(pointer: coarse)").matches
        : (navigator.maxTouchPoints ?? 0) > 0;
      setIsTouch(coarse);
    };
    check();
    // Pointer type can change (e.g., a 2-in-1 docking a mouse), so re-check
    // on resize/orientation as cheap proxies for environment changes.
    window.addEventListener("resize", check);
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return isTouch;
}

export function useIsPortraitMobile(): boolean {
  const [portraitMobile, setPortraitMobile] = useState(false);

  useEffect(() => {
    const check = () => {
      const narrow = window.innerWidth < MOBILE_MAX_W;
      const portrait = typeof window.matchMedia === "function"
        ? window.matchMedia("(orientation: portrait)").matches
        : window.innerHeight > window.innerWidth;
      setPortraitMobile(narrow && portrait);
    };
    check();
    window.addEventListener("resize", check);
    // Modern iOS Safari fires resize on rotate, but for belt-and-braces
    // also listen to orientationchange.
    window.addEventListener("orientationchange", check);
    return () => {
      window.removeEventListener("resize", check);
      window.removeEventListener("orientationchange", check);
    };
  }, []);

  return portraitMobile;
}
