"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import MobileTopBar from "./MobileTopBar";
import CreatureCanvas from "./CreatureCanvas";
import CreatureThumbnail from "./CreatureThumbnail";
import {
  loadEcosystem,
  deleteCreatureById,
  subscribeRemoteEcosystem,
} from "@/lib/ecosystem";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
import { nameHighlightDataUrl, creatureHighlightColor } from "@/lib/nameHighlight";
import { useT, type TranslationKey } from "@/lib/i18n";
import type { CreatureSpec } from "@/lib/creature";

const MONTH_KEYS: TranslationKey[] = [
  "month.1", "month.2", "month.3", "month.4",  "month.5",  "month.6",
  "month.7", "month.8", "month.9", "month.10", "month.11", "month.12",
];
const DAY_KEYS: TranslationKey[] = [
  "day.sun", "day.mon", "day.tue", "day.wed", "day.thu", "day.fri", "day.sat",
];

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function firstWeekday(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).getDay();
}

/**
 * Mobile Calendar.
 *
 * Desktop scrolls through every month from 2020 to 2035 in one vertical
 * column, with the selected creature shown in the right-side canvas +
 * info panel. On mobile that's too much — we focus on ONE month at a
 * time with prev/next chevrons + a year/month picker header. Each day
 * cell shows the creature thumbnail for that date (cycling tick removed
 * — mobile users tap the day to see the full list if more than one).
 *
 * Tapping a day with creature(s) opens a bottom sheet: live
 * CreatureCanvas + name + date + journal + the same hand-drawn
 * Download/Edit/Delete row used on every other mobile page.
 */
export default function MobileCalendarPage() {
  const t = useT();
  const router = useRouter();
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);
  const [selected, setSelected] = useState<CreatureSpec | null>(null);

  // Default to current month — gives every visit a sensible starting
  // point. User can flip with chevrons.
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());

  // Live ecosystem load + cross-tab/in-tab sync + remote realtime.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadEcosystem().then((list) => {
        if (!cancelled) setCreatures(list);
      });
    };
    refresh();
    const onChange = () => refresh();
    window.addEventListener("ecosystem:changed", onChange);
    window.addEventListener("storage", onChange);
    const unsubscribeRemote = subscribeRemoteEcosystem(refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecosystem:changed", onChange);
      window.removeEventListener("storage", onChange);
      unsubscribeRemote();
    };
  }, []);

  // Lock body scroll while the bottom sheet is open.
  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

  // Group creatures by ISO date for O(1) cell lookup.
  const creaturesByDate = useMemo(() => {
    const map = new Map<string, CreatureSpec[]>();
    for (const c of creatures) {
      if (!c.dateISO) continue;
      const list = map.get(c.dateISO) ?? [];
      list.push(c);
      map.set(c.dateISO, list);
    }
    return map;
  }, [creatures]);

  const days = daysInMonth(year, month);
  const startDow = firstWeekday(year, month);
  // Leading blanks so the 1st lands on its correct weekday column.
  const cells: Array<{ date: number | null; iso: string | null }> = [];
  for (let i = 0; i < startDow; i++) cells.push({ date: null, iso: null });
  for (let d = 1; d <= days; d++) {
    const iso = `${year}-${String(month + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    cells.push({ date: d, iso });
  }

  const prevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };
  const nextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
    }
  };

  const handleEdit = () => {
    if (!selected) return;
    const dest = selected.source === "manually" ? "/create/manually" : "/create";
    router.push(`${dest}?edit=${encodeURIComponent(selected.id)}`);
  };
  const handleDelete = () => {
    if (!selected) return;
    const ok = window.confirm(
      `Delete "${selected.name ?? "this creature"}" from the ecosystem? This cannot be undone.`,
    );
    if (!ok) return;
    deleteCreatureById(selected.id);
    setSelected(null);
  };

  return (
    <div className="relative min-h-screen w-full font-(family-name:--font-casual)">
      <MobileTopBar active="calender" />

      {/* Month header — prev / "2026 January" Orange title / next */}
      <header className="flex items-center justify-between px-4 pt-5">
        <button
          type="button"
          onClick={prevMonth}
          aria-label="Previous month"
          className="flex h-10 w-10 cursor-pointer items-center justify-center bg-transparent text-[28px] font-bold text-black active:scale-95"
        >
          ‹
        </button>
        <h2 className="m-0 whitespace-nowrap text-[28px] leading-none text-black font-(family-name:--font-fancy)">
          {year} {t(MONTH_KEYS[month])}
        </h2>
        <button
          type="button"
          onClick={nextMonth}
          aria-label="Next month"
          className="flex h-10 w-10 cursor-pointer items-center justify-center bg-transparent text-[28px] font-bold text-black active:scale-95"
        >
          ›
        </button>
      </header>

      {/* 7-column day-of-week header */}
      <div className="mt-4 grid grid-cols-7 px-2 text-center text-[13px] font-bold text-black/70">
        {DAY_KEYS.map((dayKey) => (
          <span key={dayKey} className="block">
            {t(dayKey)}
          </span>
        ))}
      </div>

      {/* 7-column day cells — each cell is a square; date number top-left
          + creature thumbnail centered when there's one on that date. */}
      <div className="mt-2 grid grid-cols-7 gap-1 px-2 pb-12">
        {cells.map((cell, i) => {
          if (cell.date === null) {
            return <div key={`blank-${i}`} className="aspect-square" />;
          }
          const list = creaturesByDate.get(cell.iso!);
          // Show the first creature; if multiple, indicate with a "+N"
          // badge in the bottom corner. Tapping always opens the most
          // recent one — the bottom sheet has prev/next if needed.
          const c = list?.[0];
          const extra = list && list.length > 1 ? list.length - 1 : 0;
          return (
            <button
              key={cell.iso!}
              type="button"
              onClick={() => {
                if (!c) return;
                unlockAudio();
                playCreatureGiggle(c.blocks, { force: true });
                setSelected(c);
              }}
              disabled={!c}
              className={`relative block aspect-square cursor-pointer bg-transparent p-0 transition-transform ${
                c ? "active:scale-95" : "cursor-default"
              }`}
            >
              <span
                className="absolute left-1 top-0.5 text-[12px] font-bold leading-none text-black"
                style={
                  selected && c && selected.id === c.id
                    ? {
                        backgroundImage: nameHighlightDataUrl(
                          creatureHighlightColor(c),
                        ),
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "100% 14px",
                        backgroundPosition: "center",
                        padding: "0 3px",
                      }
                    : undefined
                }
              >
                {cell.date}
              </span>
              {c && (
                <div className="absolute inset-[14%_8%_8%_8%]">
                  <CreatureThumbnail creature={c} blockSize={20} />
                </div>
              )}
              {extra > 0 && (
                <span className="absolute bottom-0.5 right-1 text-[10px] font-bold leading-none text-black/70">
                  +{extra}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ── Bottom sheet (same pattern as encyclopedia) ───────────── */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto bg-[#dfd9c9] px-4 pb-6 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
            <div className="mb-2 flex items-center justify-between">
              <span className="block h-1 w-12 rounded-full bg-black/30" />
              <button
                type="button"
                onClick={() => setSelected(null)}
                aria-label="Close"
                className="flex h-9 w-9 cursor-pointer items-center justify-center bg-transparent text-[22px] font-bold text-black active:scale-95"
              >
                ×
              </button>
            </div>

            <h2 className="m-0 text-[28px] leading-none text-black font-(family-name:--font-fancy)">
              {selected.name ?? "Creature"}
            </h2>
            <p className="mt-1 text-[14px] font-bold text-black/60">
              {selected.dateISO ?? "—"}
            </p>

            <div className="mt-4 aspect-square w-full overflow-hidden">
              <CreatureCanvas creature={selected} blockSize={100} padding={6} />
            </div>

            <div className="mt-4 text-[15px] font-bold leading-relaxed text-black">
              {selected.journalText ? (
                selected.journalText.split(/\n\n+/).map((para, i, arr) => (
                  <p key={i} className={i === arr.length - 1 ? "m-0" : "mb-3"}>
                    {para}
                  </p>
                ))
              ) : (
                <p className="m-0 text-black/50">{t("panel.no_journal_manual")}</p>
              )}
            </div>

            <div className="mt-5 flex h-12 items-stretch gap-2">
              <button
                type="button"
                onClick={() => downloadCreaturePng(selected)}
                className="relative block h-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
                style={{ flexBasis: "45%" }}
              >
                <img
                  alt=""
                  src="/assets/uploaded-box.svg"
                  className="absolute inset-0 block size-full"
                />
                <span
                  className="absolute flex items-center justify-center text-center text-[18px] font-bold leading-[normal] text-black"
                  style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
                >
                  Download
                </span>
              </button>
              <button
                type="button"
                onClick={handleEdit}
                className="relative block h-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
                style={{ flexBasis: "20%" }}
              >
                <img
                  alt=""
                  src="/assets/edit-button.svg"
                  className="absolute inset-0 block size-full"
                />
                <span className="absolute inset-0 flex items-center justify-center text-[16px] font-bold leading-none text-black">
                  Edit
                </span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="relative block h-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
                style={{ flexBasis: "35%" }}
              >
                <div className="absolute" style={{ inset: "0 3.3% 19.51% 4.4%" }}>
                  <div className="absolute" style={{ inset: "-1.53% -0.61% -1.53% -2.94%" }}>
                    <img
                      alt=""
                      src="/assets/delete-vector.svg"
                      className="block size-full max-w-none"
                    />
                  </div>
                </div>
                <p
                  className="absolute m-0 text-center text-[18px] font-bold leading-[normal] text-black"
                  style={{ inset: "12.2% 0 0 0" }}
                >
                  Delete
                </p>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
