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
