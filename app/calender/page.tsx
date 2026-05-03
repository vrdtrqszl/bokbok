"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { loadEcosystem, deleteCreatureById, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import type { CreatureSpec } from "@/lib/creature";
import CreatureThumbnail from "@/app/_components/CreatureThumbnail";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import ViewportZoomControls from "@/app/_components/ViewportZoomControls";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
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
}: {
  year: number;
  monthIndex: number;
  id?: string;
  creaturesByDate: Map<string, CreatureSpec[]>;
  onSelect?: (c: CreatureSpec) => void;
  selectedId?: string | null;
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
        {year} {MONTHS[monthIndex]}
      </p>

      {DAY_LABELS.map((label, i) => (
        <p
          key={label}
          className="absolute text-[24px] font-bold leading-normal text-black"
          style={{ left: COL_X[i], top: 112, width: CELL_WIDTH, height: CELL_HEIGHT }}
        >
          {label}
        </p>
      ))}

      {Array.from({ length: days }, (_, i) => {
        const date = i + 1;
        const weekday = (startDow + i) % 7;
        const weekIndex = Math.floor((startDow + i) / 7);
        const dateISO = `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(date).padStart(2, "0")}`;
        const cellCreatures = creaturesByDate.get(dateISO);
        const showCreature = cellCreatures && cellCreatures.length > 0
          ? cellCreatures[0]
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
              {date}
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

export default function CalenderPage() {
  const router = useRouter();
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
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

  // Live ecosystem load + cross-tab sync + Supabase realtime (no-op in
  // local mode).
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

  // Index by ISO date so each MonthGrid cell can lookup in O(1).
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

  // On mount, scroll the month list so today's month is at the top of the
  // visible area (clamped to the available year range).
  useEffect(() => {
    const today = new Date();
    const year = Math.min(YEAR_END, Math.max(YEAR_START, today.getFullYear()));
    const targetId = `month-${year}-${today.getMonth()}`;
    const target = document.getElementById(targetId);
    const container = scrollRef.current;
    if (!target || !container) return;
    // Position target at the top of the scroll container.
    const containerTop = container.getBoundingClientRect().top;
    const targetTop = target.getBoundingClientRect().top;
    container.scrollTop += targetTop - containerTop;
  }, []);

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden bg-[#dfd9c9] font-(family-name:--font-casual)">
      {/* BokBok logo / Home link */}
      <Link
        href="/"
        className="absolute left-[591px] top-[17px] block h-[72px] w-[257px] cursor-pointer whitespace-nowrap text-center text-[64px] leading-normal text-black font-(family-name:--font-fancy)"
      >
        BokBok
      </Link>

      {/* Top nav */}
      <Link
        href="/create"
        className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        Create
      </Link>

      {/* Active tab indicator behind Calender */}
      <div className="absolute left-[133px] top-[42px] h-[53px] w-[122px]">
        <img
          alt=""
          src="/assets/calender-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[190.5px] top-[48px] block h-[36px] w-[151px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        Calender
      </span>

      <Link
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[48px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        Encyclopedia
      </Link>

      {/* Login icon */}
      <div className="absolute left-[1381px] top-[40px] h-[35.67px] w-[24.91px]">
        <img alt="login" src="/assets/login.svg" className="block size-full" />
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
        className="absolute left-[82px] top-[95px] flex h-[771px] w-[863px] flex-col items-center gap-[150px] overflow-y-auto overflow-x-clip text-center text-black"
      >
        {YEARS.flatMap((year) =>
          MONTHS.map((_, monthIdx) => (
            <MonthGrid
              key={`${year}-${monthIdx}`}
              id={`month-${year}-${monthIdx}`}
              year={year}
              monthIndex={monthIdx}
              creaturesByDate={creaturesByDate}
              onSelect={setSelected}
              selectedId={selected?.id ?? null}
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
        <div className="absolute left-[20px] right-[20px] top-[20px] bottom-[28px]">
          {selected ? (
            <CreatureCanvas
              creature={selected}
              blockSize={140}
              padding={8}
              zoom={viewportZoom}
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
              Click a creature in the
              <br />
              calendar to view it
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

        <h2 className="absolute left-1/2 top-[15px] -translate-x-1/2 whitespace-nowrap text-center text-[36px] text-black font-(family-name:--font-fancy)">
          {selected?.name ?? "Name"}
        </h2>
        <span className="absolute left-1/2 top-[57px] -translate-x-1/2 text-center text-[18px] font-bold text-black">
          {selected?.dateISO ?? "—"}
        </span>

        <div className="absolute left-[26px] right-[18px] top-[96px] bottom-[58px] flex flex-col items-center overflow-y-auto overflow-x-hidden">
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
                  No journal entry — this creature was made in the manual studio.
                </p>
              )
            ) : (
              <p className="text-black/40">
                Pick a creature from the calendar to read its journal entry.
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
            Download
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
            Edit
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
            Delete
          </p>
        </button>
      </div>
    </div>
  );
}
