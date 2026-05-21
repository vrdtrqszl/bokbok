"use client";

import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { loadEcosystem, deleteCreatureById, matchesCreatureQuery, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
import { nameHighlightDataUrl, creatureHighlightColor } from "@/lib/nameHighlight";
import { useT, type TranslationKey } from "@/lib/i18n";
import { useIsMobile } from "@/lib/useIsMobile";
import type { CreatureSpec } from "@/lib/creature";
import CreatureThumbnail from "@/app/_components/CreatureThumbnail";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import ViewportZoomControls from "@/app/_components/ViewportZoomControls";
import MobileCalendarPage from "@/app/_components/MobileCalendarPage";
import BokBokLogo from "@/app/_components/BokBokLogo";
import CloseToHomeButton from "@/app/_components/CloseToHomeButton";

// MONTHS / DAY_LABELS used to be hardcoded English. Now they're keys
// into the i18n dictionary so the calendar grid switches language with
// the rest of the UI. ENG values are still the canonical fallbacks.
const MONTH_KEYS: TranslationKey[] = [
  "month.1", "month.2", "month.3", "month.4",  "month.5",  "month.6",
  "month.7", "month.8", "month.9", "month.10", "month.11", "month.12",
];
const DAY_KEYS: TranslationKey[] = [
  "day.sun", "day.mon", "day.tue", "day.wed", "day.thu", "day.fri", "day.sat",
];
const COL_X = [0, 126, 252, 377, 503, 629, 755] as const;
const ROW_Y = [164, 306, 448, 590, 732, 874] as const;
const CELL_WIDTH = 108;
const CELL_HEIGHT = 36;

// Year range — wide enough to cover any practical journaling timeline.
const YEAR_START = 2020;
const YEAR_END = 2035;
const YEARS = Array.from(
  { length: YEAR_END - YEAR_START + 1 },
  (_, i) => YEAR_START + i,
);

function daysInMonth(year: number, monthIndex: number) {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function firstWeekday(year: number, monthIndex: number) {
  return new Date(year, monthIndex, 1).getDay();
}

// Thumbnail visual budget: a cell is 108×142 (col-width × row spacing). Date
// number takes ~36px on top, leaving most of the cell for the creature image.
const THUMB_W = 120;
const THUMB_H = 120;
const THUMB_TOP_OFFSET = 30;

function MonthGrid({
  year,
  monthIndex,
  id,
  creaturesByDate,
  onSelect,
  selectedId,
  cycleTick,
  t,
}: {
  year: number;
  monthIndex: number;
  id?: string;
  creaturesByDate: Map<string, CreatureSpec[]>;
  onSelect?: (c: CreatureSpec) => void;
  selectedId?: string | null;
  // Globally-incrementing counter that advances every 1.5s. Cells with
  // multiple creatures use `cycleTick % length` to rotate through them so
  // every busy day cycles in lockstep across the visible months.
  cycleTick: number;
  // Translator passed in (the parent page owns the useT hook).
  t: (key: TranslationKey) => string;
}) {
  const days = daysInMonth(year, monthIndex);
  const startDow = firstWeekday(year, monthIndex);
  const weeks = Math.ceil((startDow + days) / 7);
  const height = ROW_Y[weeks - 1] + CELL_HEIGHT;

  return (
    <div id={id} className="relative shrink-0" style={{ width: 863, height }}>
      <p
        className="absolute font-(family-name:--font-fancy) text-[64px] leading-normal text-black"
        style={{ left: 158, top: 0, width: 548, height: 84 }}
      >
        {year} {t(MONTH_KEYS[monthIndex])}
      </p>

      {DAY_KEYS.map((dayKey, i) => (
        <p
          key={dayKey}
          className="absolute text-[24px] font-bold leading-normal text-black"
          style={{ left: COL_X[i], top: 112, width: CELL_WIDTH, height: CELL_HEIGHT }}
        >
          {t(dayKey)}
        </p>
      ))}

      {Array.from({ length: days }, (_, i) => {
        const date = i + 1;
        const weekday = (startDow + i) % 7;
        const weekIndex = Math.floor((startDow + i) / 7);
        const dateISO = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        const cellCreatures = creaturesByDate.get(dateISO);
        // Cycle through every creature on this date — index wraps with
        // the global tick so days with one creature stay put and days
        // with several flip through them every 1.5s.
        const showCreature = cellCreatures && cellCreatures.length > 0
          ? cellCreatures[cycleTick % cellCreatures.length]
          : null;
        // When the currently-selected creature lives in this cell, the
        // date number gets the same hand-drawn highlight used elsewhere
        // (BokBokpedia, Energy Blocks). Colour is picked from one of the
        // creature's own blocks by id-hash so it's stable across renders.
        const isHighlighted =
          !!showCreature && !!selectedId && showCreature.id === selectedId;
        const highlightHex = isHighlighted
          ? creatureHighlightColor(showCreature)
          : null;
        return (
          <Fragment key={date}>
            <p
              className="absolute text-[24px] font-bold leading-normal text-black"
              style={{
                left: COL_X[weekday],
                top: ROW_Y[weekIndex],
                width: CELL_WIDTH,
                height: CELL_HEIGHT,
              }}
            >
              {/* Inline span so the highlight background hugs the date
                  number's text box (not the full CELL_WIDTH cell). */}
              <span
                style={
                  highlightHex
                    ? {
                        backgroundImage: nameHighlightDataUrl(highlightHex),
                        backgroundRepeat: "no-repeat",
                        backgroundSize: "100% 18px",
                        backgroundPosition: "center",
                        padding: "0 4px",
                      }
                    : undefined
                }
              >
                {date}
              </span>
            </p>
            {showCreature && (
              <button
                type="button"
                onClick={() => onSelect?.(showCreature)}
                className="absolute cursor-pointer transition-transform active:scale-95 hover:scale-[1.04]"
                style={{
                  left: COL_X[weekday] + (CELL_WIDTH - THUMB_W) / 2,
                  top: ROW_Y[weekIndex] + THUMB_TOP_OFFSET,
                  width: THUMB_W,
                  height: THUMB_H,
                }}
              >
                <CreatureThumbnail creature={showCreature} blockSize={48} />
              </button>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export default function CalendarPage() {
  // Mobile branches to a single-month grid + bottom sheet.
  const isMobile = useIsMobile();
  if (isMobile) return <MobileCalendarPage />;
  return <DesktopCalendarPage />;
}

function DesktopCalendarPage() {
  const t = useT();
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [query, setQuery] = useState("");
  const [viewportZoom, setViewportZoom] = useState(1);
  const zoomIn = () => setViewportZoom((z) => Math.min(3, z * 1.2));
  const zoomOut = () => setViewportZoom((z) => Math.max(0.4, z / 1.2));
  useEffect(() => {
    setViewportZoom(1);
  }, [selected?.id]);

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

  // True after the very first ecosystem load attempt settles. Gates the
  // initial-scroll effect so it can wait for the actual data instead of
  // jumping to today before creatures load.
  const [creaturesLoaded, setCreaturesLoaded] = useState(false);

  // Live ecosystem load + cross-tab sync + Supabase realtime (no-op in
  // local mode).
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadEcosystem().then((list) => {
        if (!cancelled) {
          setCreatures(list);
          setCreaturesLoaded(true);
        }
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

  // Global tick — advances every 1.5s. Multi-creature cells rotate
  // through their list using this counter, so all busy days cycle in
  // lockstep (one timer, no per-cell intervals). Single-creature cells
  // are unaffected because `0 % 1 === 0`.
  const [cycleTick, setCycleTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => {
      setCycleTick((t) => t + 1);
    }, 1500);
    return () => window.clearInterval(id);
  }, []);

  // Index by ISO date so each MonthGrid cell can lookup in O(1). The
  // search query filters BEFORE indexing — non-matching creatures
  // disappear from the calendar cells, so the user can scrub through
  // their journal entries by name.
  const creaturesByDate = useMemo(() => {
    const q = query.trim();
    const list = q
      ? creatures.filter((c) => matchesCreatureQuery(c, q))
      : creatures;
    const map = new Map<string, CreatureSpec[]>();
    for (const c of list) {
      if (!c.dateISO) continue;
      const arr = map.get(c.dateISO) ?? [];
      arr.push(c);
      map.set(c.dateISO, arr);
    }
    return map;
  }, [creatures, query]);

  // Initial scroll target: prefer the LATEST month that actually has a
  // creature (so the user lands on their data instead of an empty month
  // — important when "today" is ahead of all journals, e.g. a demo seed
  // sitting in past months). Falls back to today's month if the
  // ecosystem is empty. Runs once after the first load settles, gated
  // by `creaturesLoaded` and `initialScrollDone` so refreshes / tab
  // sync don't yank the scroll position later.
  const initialScrollDone = useRef(false);
  useEffect(() => {
    if (!creaturesLoaded || initialScrollDone.current) return;
    initialScrollDone.current = true;

    let targetYear: number;
    let targetMonth: number;
    let latest = -Infinity;
    for (const c of creatures) {
      if (!c.dateISO) continue;
      const t = new Date(`${c.dateISO}T00:00:00`).getTime();
      if (Number.isFinite(t) && t > latest) latest = t;
    }
    if (latest > -Infinity) {
      const d = new Date(latest);
      targetYear = Math.min(YEAR_END, Math.max(YEAR_START, d.getFullYear()));
      targetMonth = d.getMonth();
    } else {
      const today = new Date();
      targetYear = Math.min(YEAR_END, Math.max(YEAR_START, today.getFullYear()));
      targetMonth = today.getMonth();
    }

    const targetId = `month-${targetYear}-${targetMonth}`;
    const target = document.getElementById(targetId) as HTMLElement | null;
    const container = scrollRef.current;
    if (!target || !container) return;
    // target.offsetParent is the scroll container (it's the nearest
    // positioned ancestor). target.offsetTop is therefore the target's
    // top relative to the container's content origin — scrolling there
    // puts the month at the visible top.
    container.scrollTop = target.offsetTop;
  }, [creaturesLoaded, creatures]);

  // Auto-scroll when the search query changes:
  //   • Non-empty + date pattern (YYYY / YYYY-MM / YYYYMM[DD]) →
  //     smooth-scroll to that month so the user lands on the matched
  //     creatures' window.
  //   • Empty (cleared after typing) → snap back to today's month so
  //     erasing the query returns the user to "now".
  //
  // We track the previous query in a ref so the empty case only fires
  // AFTER the user has typed something — the initial-load scroll
  // (handled by a separate effect above, which targets the latest
  // creature) isn't fighting this one for control.
  const prevQueryRef = useRef("");
  useEffect(() => {
    const q = query.trim();
    const prev = prevQueryRef.current.trim();
    prevQueryRef.current = query;
    const container = scrollRef.current;
    if (!container) return;

    if (q) {
      // Date-pattern parsing.
      let yr: number | null = null;
      let mo: number | null = null;
      // Hyphenated form first (avoids YYYY matching the leading 4
      // chars of a YYYY-MM-DD string).
      let m = /^(\d{4})-(\d{1,2})(?:-\d{1,2})?$/.exec(q);
      if (m) {
        yr = parseInt(m[1], 10);
        mo = parseInt(m[2], 10) - 1;
      } else {
        m = /^(\d{4})(\d{2})?(\d{2})?$/.exec(q);
        if (m) {
          yr = parseInt(m[1], 10);
          mo = m[2] ? parseInt(m[2], 10) - 1 : 0;
        }
      }
      if (yr === null) return;
      if (yr < YEAR_START || yr > YEAR_END) return;
      if (mo === null || mo < 0 || mo > 11) mo = 0;

      const targetId = `month-${yr}-${mo}`;
      const target = document.getElementById(targetId) as HTMLElement | null;
      if (!target) return;
      container.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    } else if (prev) {
      // Query just got cleared (was non-empty, now empty) → return to
      // today's month. Clamped to the YEAR_START..YEAR_END range in
      // case "today" falls outside (unlikely, but safe).
      const today = new Date();
      const yr = Math.min(YEAR_END, Math.max(YEAR_START, today.getFullYear()));
      const mo = today.getMonth();
      const targetId = `month-${yr}-${mo}`;
      const target = document.getElementById(targetId) as HTMLElement | null;
      if (!target) return;
      container.scrollTo({ top: target.offsetTop, behavior: "smooth" });
    }
  }, [query]);

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* BokBok logo / Home link — hand-drawn wordmark (Figma 2287:82). */}
      <a
        href="/"
        aria-label="BokBok home"
        className="absolute block cursor-pointer transition-transform active:scale-95 hover:scale-[1.02]"
        style={{ left: 1152, top: -27 }}
      >
        <BokBokLogo />
      </a>
      {/* × close button (Figma 2288:37) — back to main from any non-main page. */}
      <CloseToHomeButton />

      {/* Top nav — Figma values per node, with the row stair-stepping
          slightly down across the bar:
            Create        (2102:152)  x=35  y=48 w=91
            Calendar      (2102:153)  x=115 y=51 w=151
            BokBokpedia  (2102:157)  x=255 y=51 w=151
          Energy Blocks and About (further right) sit at y=54. */}
      <a
        href="/create"
        className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.create")}
      </a>

      {/* Active tab indicator behind Calendar — shifted +3px with the label. */}
      <div className="absolute left-[133px] top-[45px] h-[53px] w-[122px]">
        <img
          alt=""
          src="/assets/calender-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        {t("nav.calendar")}
      </span>

      <a
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.encyclopedia")}
      </a>

      {/* Energy Blocks (Figma 2109:248) — at x=418, y=54, w=151. */}
      <a
        href="/energy-blocks"
        className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.energy_blocks")}
      </a>

      {/* About (Figma 2109:250) — at x=581, y=54, w=76. */}
      <a
        href="/about"
        className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.about")}
      </a>

      {/* Search box (Figma 2303:149) — in the top nav strip. Filters
          which creatures appear in calendar day cells AND scrolls the
          month list to a YYYY-MM date if the query is a date pattern
          (handled in the useEffect on `query`). */}
      <div className="absolute left-[776.64px] top-[53.99px] z-[5] h-[30.66px] w-[219.71px]">
        <div
          className="pointer-events-none absolute"
          style={{ inset: "-1.63% -0.23% -1.63% 0" }}
        >
          <img
            alt=""
            src="/assets/search-box-v2.svg"
            className="block size-full max-w-none"
          />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("enc.search_placeholder")}
          className="absolute left-[28px] top-[4px] block h-[22px] w-[180px] bg-transparent text-[16px] font-bold text-black outline-none placeholder:text-black/35"
        />
      </div>

      {/* Main canvas box */}
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* Calendar months — scrollable, multi-year */}
      <div
        ref={scrollRef}
        className="scroll-fade absolute left-[82px] top-[95px] flex h-[771px] w-[863px] flex-col items-center gap-[150px] overflow-y-auto overflow-x-clip text-center text-black"
      >
        {YEARS.flatMap((year) =>
          MONTH_KEYS.map((_, monthIdx) => (
            <MonthGrid
              key={`${year}-${monthIdx}`}
              id={`month-${year}-${monthIdx}`}
              year={year}
              monthIndex={monthIdx}
              creaturesByDate={creaturesByDate}
              t={t}
              onSelect={(c) => {
                // Play the creature's giggle on every selection — same
                // signature as on BokBokpedia. `force: true` bypasses the
                // global Sound Off toggle so pressing a calendar cell
                // always plays.
                unlockAudio();
                playCreatureGiggle(c.blocks, { force: true });
                setSelected(c);
              }}
              selectedId={selected?.id ?? null}
              cycleTick={cycleTick}
            />
          )),
        )}
      </div>

      {/* Creature view (top right) — shows selected creature with breathing
          animation, or an empty hint when nothing is selected. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt="creature"
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        {/* Inner canvas area — pushed tighter into the hand-drawn frame
            so the creature has more room to breathe (especially when
            zoomed). scroll-fade adds a soft 4-side mask so the visible
            content dissolves into the wavy outline instead of clipping
            against a hard rectangular edge. pointer-events-auto re-
            enables hit-testing for drag-to-rotate on CreatureCanvas. */}
        <div className="scroll-fade pointer-events-auto absolute left-[8px] right-[8px] top-[10px] bottom-[16px]">
          {selected ? (
            <CreatureCanvas
              creature={selected}
              blockSize={140}
              padding={8}
              zoom={viewportZoom}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
              {t("panel.click_creature")}
              <br />
              {t("panel.calendar_to_view")}
            </div>
          )}
        </div>
        {selected && (
          <ViewportZoomControls
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            className="bottom-[14px] right-[16px]"
          />
        )}
      </div>

      {/* Info panel (bottom right) — name, date, journal, edit + delete.
          Two-vector outline matches Figma 2006:75. */}
      <div className="absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px] overflow-hidden">
        <img
          alt=""
          src="/assets/info-vector2.svg"
          className="pointer-events-none absolute inset-[0.13%] block size-full"
        />
        <div className="pointer-events-none absolute" style={{ inset: "0.96% 98.1% 0.97% 0.13%" }}>
          <div className="absolute" style={{ inset: "0 -7.08%" }}>
            <img alt="" src="/assets/info-vector1.svg" className="block size-full max-w-none" />
          </div>
        </div>

        {/* Name + date — flex column so long names wrap. */}
        <div className="absolute left-[20px] right-[20px] top-[15px] flex flex-col items-center text-center">
          <h2 className="m-0 max-w-full break-words text-[36px] leading-[1.05] text-black font-(family-name:--font-fancy)">
            {selected?.name ?? t("panel.empty_name")}
          </h2>
          <span className="mt-[2px] text-[18px] font-bold leading-none text-black">
            {selected?.dateISO ?? "—"}
          </span>
        </div>

        <div className="scroll-fade-vertical absolute left-[26px] right-[18px] top-[110px] bottom-[58px] flex flex-col items-center overflow-y-auto overflow-x-hidden">
          <div className="w-full text-[20px] font-bold leading-normal text-black">
            {selected ? (
              selected.journalText ? (
                selected.journalText.split(/\n\n+/).map((para, i, arr) => (
                  <p key={i} className={i === arr.length - 1 ? "" : "mb-0"}>
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-black/50">
                  {t("panel.no_journal_manual")}
                </p>
              )
            ) : (
              <p className="text-black/40">
                {t("panel.pick_from_calendar")}
              </p>
            )}
          </div>
        </div>

        {/* Download button (Figma 2098:137) */}
        <button
          type="button"
          onClick={() => selected && downloadCreaturePng(selected)}
          disabled={!selected}
          className={`absolute left-[13px] bottom-[19px] block h-[27px] w-[112px] overflow-visible bg-transparent p-0 transition-transform ${
            selected
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <img
            alt=""
            src="/assets/uploaded-box.svg"
            className="absolute inset-0 block size-full"
          />
          <span
            className="absolute flex items-center justify-center text-center text-[24px] font-bold leading-[normal] text-black"
            style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
          >
            {t("action.download")}
          </span>
        </button>

        {/* Edit button */}
        <button
          type="button"
          onClick={handleEdit}
          disabled={!selected}
          className={`absolute right-[107px] bottom-[14.54px] block h-[30.83px] w-[49.41px] overflow-visible bg-transparent p-0 transition-transform ${
            selected
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <img
            alt=""
            src="/assets/edit-button.svg"
            className="absolute inset-0 block size-full"
          />
          <span className="absolute inset-0 flex items-center justify-center text-[20px] font-bold leading-none text-black">
            {t("action.edit")}
          </span>
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={!selected}
          className={`absolute right-[12.8px] bottom-[10px] block h-[40.58px] w-[88.56px] overflow-visible bg-transparent p-0 transition-transform ${
            selected
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <div className="absolute" style={{ inset: "0 3.3% 19.51% 4.4%" }}>
            <div className="absolute" style={{ inset: "-1.53% -0.61% -1.53% -2.94%" }}>
              <img alt="" src="/assets/delete-vector.svg" className="block size-full max-w-none" />
            </div>
          </div>
          <p
            className="absolute m-0 text-center text-[24px] font-bold leading-[normal] text-black"
            style={{ inset: "12.2% 0 0 0" }}
          >
            {t("action.delete")}
          </p>
        </button>
      </div>
    </div>
  );
}
