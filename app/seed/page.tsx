"use client";

// Admin / one-shot seed page. Visit /seed and click "Seed Dec–Jan demo" to
// fill the ecosystem with one creature per day across 2025-12-01 → 2026-01-21
// following the emotional arc spec'd by the user (apathy+anger → depression+
// sadness → happiness → satisfaction+joy). The seeder is idempotent (skips
// any seed-* id that already exists), and "Clear demo seeds" removes only
// those entries — user-created creatures are left alone.

import Link from "next/link";
import { useState } from "react";
import {
  seedDecJan,
  clearDecJanSeeds,
  type SeedResult,
} from "@/lib/seedDecJan";

export default function SeedPage() {
  const [busy, setBusy] = useState<null | "seed" | "clear">(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const runSeed = async () => {
    setBusy("seed");
    setStatus(null);
    setError(null);
    try {
      const r: SeedResult = await seedDecJan();
      setStatus(
        `Seeded ${r.added} new creature${r.added === 1 ? "" : "s"} (${r.skipped} already present, ${r.total} total in arc).`,
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  const runClear = async () => {
    if (
      !window.confirm(
        "Delete all seed-* creatures from the ecosystem? User-created creatures will not be touched.",
      )
    ) {
      return;
    }
    setBusy("clear");
    setStatus(null);
    setError(null);
    try {
      const n = await clearDecJanSeeds();
      // Also wipe the auto-seed flag so the next page mount re-seeds
      // cleanly. Without this, "clear" would leave the user permanently
      // seedless until they manually flipped the flag.
      window.localStorage.removeItem("bokbok:dec-jan-seeded:v1");
      setStatus(
        `Removed ${n} seeded creature${n === 1 ? "" : "s"}. Auto-seed flag reset — next visit will re-seed.`,
      );
    } catch (e) {
      setError(String(e instanceof Error ? e.message : e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      <div className="absolute left-1/2 top-1/2 w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-md bg-white/70 p-[40px] backdrop-blur">
        <h1 className="mb-[16px] text-[40px] leading-tight text-black font-(family-name:--font-fancy)">
          Seed: Dec–Jan demo
        </h1>
        <p className="mb-[24px] text-[18px] leading-relaxed text-black">
          Fills the ecosystem with one creature per day from
          <strong> 2025-12-01 to 2026-01-21</strong>:
        </p>
        <ul className="mb-[28px] list-disc pl-[28px] text-[16px] leading-relaxed text-black/80">
          <li>Dec 1–7 — apathy + anger</li>
          <li>Dec 8–21 — depression + sadness</li>
          <li>Dec 22 → Jan 7 — happiness</li>
          <li>Jan 8–21 — satisfaction + joy</li>
        </ul>
        <p className="mb-[28px] text-[14px] leading-relaxed text-black/60">
          Idempotent — re-running skips dates that are already seeded. Clearing
          removes only the <code>seed-*</code> entries; anything you've made
          yourself stays.
        </p>

        <div className="flex gap-[12px]">
          <button
            type="button"
            onClick={runSeed}
            disabled={busy !== null}
            className="cursor-pointer rounded-md border-2 border-black bg-white px-[20px] py-[10px] text-[18px] font-bold text-black transition-transform hover:bg-black hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "seed" ? "Seeding…" : "Seed Dec–Jan demo"}
          </button>
          <button
            type="button"
            onClick={runClear}
            disabled={busy !== null}
            className="cursor-pointer rounded-md border-2 border-black bg-transparent px-[20px] py-[10px] text-[18px] font-bold text-black transition-transform hover:bg-black hover:text-white active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === "clear" ? "Clearing…" : "Clear demo seeds"}
          </button>
        </div>

        {status && (
          <p className="mt-[24px] rounded bg-black/5 p-[12px] text-[14px] leading-relaxed text-black">
            {status}
          </p>
        )}
        {error && (
          <p className="mt-[24px] rounded bg-red-100 p-[12px] text-[14px] leading-relaxed text-red-900">
            Error: {error}
          </p>
        )}

        <div className="mt-[32px] flex gap-[16px] text-[14px] text-black/60">
          <Link href="/" className="cursor-pointer underline hover:text-black">
            ← Main
          </Link>
          <Link
            href="/calender"
            className="cursor-pointer underline hover:text-black"
          >
            View on Calendar →
          </Link>
        </div>
      </div>
    </div>
  );
}
