"use client";

// One-shot client bootstrap that fires the Dec–Jan demo seed on the user's
// VERY first visit, so the calendar / ecosystem aren't empty out of the box.
// Gated by:
//   - local mode only (never auto-pollutes the shared Supabase exhibition)
//   - a localStorage flag (`bokbok:dec-jan-seeded:v1`) so subsequent visits
//     don't re-trigger
//   - seedDecJan itself is also idempotent (skips seed-* ids already
//     present), so even a flag wipe is safe to re-run
//
// Mounted next to ViewportFit in app/layout.tsx so it runs no matter which
// page the user lands on first.

import { useEffect } from "react";
import { seedDecJan } from "@/lib/seedDecJan";
import { isSharedMode } from "@/lib/supabase";

const FLAG = "bokbok:dec-jan-seeded:v1";

export default function SeedBootstrap() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    // Never auto-seed the shared ecosystem — every visitor would write
    // the same demo creatures into Supabase, polluting it for everyone.
    if (isSharedMode()) return;
    if (window.localStorage.getItem(FLAG)) return;
    seedDecJan()
      .then((r) => {
        window.localStorage.setItem(FLAG, "1");
        // eslint-disable-next-line no-console
        console.info(
          `[bokbok] auto-seeded Dec–Jan demo (${r.added} added, ${r.skipped} skipped, ${r.total} total)`,
        );
      })
      .catch((err) => {
        // eslint-disable-next-line no-console
        console.error("[bokbok] auto-seed failed:", err);
      });
  }, []);
  return null;
}
