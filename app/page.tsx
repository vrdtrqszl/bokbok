"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MainViewport, { type FocusTarget, type ResetTrigger } from "./_components/MainViewport";
import { deleteCreatureById } from "@/lib/ecosystem";
import { creatureFocusBox, emotionByKey, type CreatureSpec } from "@/lib/creature";
import { downloadCreaturePng } from "@/lib/downloadCreature";

export default function MainPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [resetTrigger, setResetTrigger] = useState<ResetTrigger | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Pet mode: when on, the cursor becomes a hand and clicking a creature
  // makes it shake wildly instead of opening the focus view.
  const [petMode, setPetMode] = useState(false);
  // Hover tooltip state: the creature currently under the cursor (if any)
  // and the cursor position in design pixels.
  const [hoveredCreature, setHoveredCreature] = useState<CreatureSpec | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pageRef = useRef<HTMLDivElement | null>(null);

  // Track the browser's actual fullscreen state so the button reflects it
  // even when the user exits via Escape.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Exit pet mode on Escape — feels natural for "I'm done petting".
  useEffect(() => {
    if (!petMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPetMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [petMode]);

  // Track cursor position in DESIGN pixels (relative to the 1440×900 page)
  // while a creature is hovered. clientX/Y are in actual viewport pixels;
  // we convert through the page's bounding rect so the tooltip lands at
  // the cursor regardless of ViewportFit's scale.
  useEffect(() => {
    if (!hoveredCreature) return;
    const onMove = (e: MouseEvent) => {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      setHoverPos({
        x: ((e.clientX - rect.left) / rect.width) * 1440,
        y: ((e.clientY - rect.top) / rect.height) * 900,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [hoveredCreature]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  // Selection from a 3D click — toggles between zoom-in and zoom-out:
  // clicking a creature focuses on it; clicking the same creature again
  // (now selected) zooms back out to the initial bird's-eye view. Replaces
  // the dedicated Reset View button.
  //
  // Focus distance is sized dimension-by-dimension so the creature fills
  // the box without clipping and without empty bands:
  //   horizontal fit: d ≥ halfWidth  / (tan(FOV/2) × aspect) = halfWidth  / 0.514
  //   vertical fit:   d ≥ halfHeight /  tan(FOV/2)           = halfHeight / 0.414
  // PEAK = 1.06 covers the ±4% breathing peak with a 2% safety margin.
  // targetOffset recenters the camera on the creature's visible bbox center
  // (not its group origin); camera-up post-billboard ≈ (0, 0.394, -0.919),
  // so the bbox-Y offset projects onto world (Y, Z) by those factors.
  const handleSelect = (
    c: CreatureSpec,
    pos: [number, number, number],
  ) => {
    // Toggle: clicking the currently-focused creature zooms back out.
    if (selected?.id === c.id) {
      setSelected(null);
      setResetTrigger({ ts: Date.now() });
      return;
    }
    setSelected(c);
    const bbox = creatureFocusBox(c);
    const PEAK = 1.06;
    const d_h = (bbox.halfWidth  * PEAK) / 0.514;
    const d_v = (bbox.halfHeight * PEAK) / 0.414;
    const distance = Math.max(2.0, d_h, d_v);
    const targetOffset: [number, number, number] = [
      bbox.centerX,
      bbox.centerY * 0.394,
      bbox.centerY * -0.919,
    ];
    setFocusTarget({ position: pos, ts: Date.now(), distance, targetOffset });
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
    <div
      ref={pageRef}
      className={`relative mx-auto h-[900px] w-[1440px] bg-[#dfd9c9] font-(family-name:--font-casual) ${
        // In fullscreen, MainViewport expands beyond 1440×900 in design
        // coords to fill the actual window — so the page must NOT clip.
        isFullscreen ? "overflow-visible" : "overflow-hidden"
      }`}
      // Hand cursor while pet mode is active. The 16,16 hotspot is the
      // hand's center — close enough to the index-finger area for the
      // "tap on creature to pet" interaction to feel natural.
      style={
        petMode
          ? { cursor: "url(/assets/hand-cursor.svg) 16 16, pointer" }
          : undefined
      }
    >
      {/* Top bar / nav / right panels — hidden in fullscreen mode (Figma 2114:265
          shows just the wavy frame + 3D scene + exit button). */}
      {!isFullscreen && (
        <>
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
              Energy Blocks and About (further right) sit at y=54. */}
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

          {/* Energy Blocks (Figma 2109:248) — at x=418, y=54, w=151. */}
          <Link
            href="/energy-blocks"
            className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
          >
            Energy Blocks
          </Link>

          {/* About (Figma 2109:250) — at x=581, y=54, w=76. */}
          <Link
            href="/about"
            className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
          >
            About
          </Link>

          {/* Enter fullscreen (Figma 2114:258) — child of the main box, so its
              page-absolute position is (27+926, 85+22) = (953, 107). */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Enter full screen"
            className="absolute left-[953px] top-[107px] z-[20] block h-[42.19px] w-[39.52px] cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:opacity-80"
          >
            <img
              alt=""
              src="/assets/full-screen-button.svg"
              className="block size-full"
            />
          </button>

          {/* Reset View removed: clicking the currently-focused creature
              again now zooms back out (toggle behavior in handleSelect). */}

          {/* BokBok button (Figma 2127:147) — hand-shaped button.
              Toggles "pet mode": when on, the cursor becomes a hand and
              clicking a creature makes it shake wildly. Press again (or
              Escape) to exit pet mode.
              Position/size/inner-text inset come straight from Figma. */}
          <button
            type="button"
            onClick={() => setPetMode((p) => !p)}
            aria-pressed={petMode}
            className="absolute left-[469px] top-[766px] z-[20] block h-[92.03px] w-[97.29px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
          >
            {/* The vector slightly overflows the frame by -0.54%/-0.51% so the
                stroke isn't clipped. */}
            <div
              className="absolute"
              style={{ inset: "-0.54% -0.51%" }}
            >
              <img
                alt=""
                src="/assets/bokbok-button.svg"
                className="block size-full max-w-none"
              />
            </div>
            <span
              className="absolute flex items-center justify-center text-center text-[24px] font-bold leading-[normal] text-black"
              style={{ inset: "40.24% 3.83% 21.04% 5.15%" }}
            >
              BokBok
            </span>
          </button>
        </>
      )}

      {/* Main canvas box — 3D viewport with click-to-select on creatures.
          In fullscreen mode it stretches (in design coords) to fill the
          actual window regardless of aspect ratio. Canvas instance is
          retained so the 3D scene state survives the toggle. */}
      <MainViewport
        onCreatureSelect={handleSelect}
        selectedCreatureId={selected?.id ?? null}
        focusTarget={focusTarget}
        resetTrigger={resetTrigger}
        fullscreen={isFullscreen}
        onExitFullscreen={toggleFullscreen}
        petMode={petMode}
        onCreatureHover={setHoveredCreature}
      />

      {/* Hover tooltip (Figma 2130:272) — name on top, date YYYYMMDD below.
          Position offsets clear the hand-drawn cursor: the SVG cursor is
          22×27 px with hotspot (4, 0), so its body extends from (x-4, y)
          to (x+18, y+27). Tooltip top is set to y+32 (5 px gap past the
          cursor's bottom edge) and left to x+14 (just right of the cursor
          shaft) so the two never overlap. z-[200] keeps it above the
          right-side panels and the wavy main-box overlay. */}
      {hoveredCreature && !petMode && (
        <div
          className="pointer-events-none absolute z-[200] whitespace-nowrap text-center text-[16px] font-bold leading-normal text-black font-(family-name:--font-casual)"
          style={{ left: hoverPos.x + 14, top: hoverPos.y + 32 }}
        >
          <p className="m-0">{hoveredCreature.name ?? "Creature"}</p>
          <p className="m-0">
            {hoveredCreature.dateISO?.replace(/-/g, "") ?? ""}
          </p>
        </div>
      )}

      {/* Right-side panels — hidden in fullscreen mode. */}
      {!isFullscreen && (
      <>
      {/* Right viewport — energy blocks composition (Figma 2096:102).
          A 2-column grid of block thumbnails with name labels below. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        <div className="pointer-events-auto absolute inset-[14px] overflow-y-auto overflow-x-hidden">
          {selected ? (
            <div className="grid grid-cols-2 gap-x-[36px] gap-y-[18px] px-[26px] pt-[3px] pb-[10px]">
              {selected.emotions.map(({ key, displayName }) => {
                const e = emotionByKey(key);
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center gap-[3px]"
                  >
                    <img
                      alt=""
                      src={e?.imagePath}
                      className="block h-[135px] w-[135px] select-none object-contain"
                      draggable={false}
                    />
                    <span className="text-center text-[16px] font-bold leading-normal text-black">
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
              Click a creature in the
              <br />
              ecosystem to see its
              <br />
              energy blocks
            </div>
          )}
        </div>
      </div>

      {/* Info panel (bottom right) — name, date, journal entry, edit */}
      <div className="absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px] overflow-hidden">
        {/* Box border */}
        <img
          alt=""
          src="/assets/info-vector2.svg"
          className="pointer-events-none absolute inset-[0.13%] block size-full"
        />
        {/* Left edge squiggly line */}
        <div className="pointer-events-none absolute" style={{ inset: "0.96% 98.1% 0.97% 0.13%" }}>
          <div className="absolute" style={{ inset: "0 -7.08%" }}>
            <img
              alt=""
              src="/assets/info-vector1.svg"
              className="block size-full max-w-none"
            />
          </div>
        </div>

        <h2 className="absolute left-1/2 top-[15px] -translate-x-1/2 whitespace-nowrap text-center text-[36px] text-black font-(family-name:--font-fancy)">
          {selected?.name ?? "Name"}
        </h2>
        <span className="absolute left-1/2 top-[57px] -translate-x-1/2 text-center text-[18px] font-bold text-black">
          {selected?.dateISO ?? "—"}
        </span>

        {/* Diary text — scrollable */}
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
                  No journal entry — this creature was made in the manual
                  studio.
                </p>
              )
            ) : (
              <p className="text-black/40">
                Pick a creature from the ecosystem to read its journal entry.
              </p>
            )}
          </div>
        </div>

        {/* Download button (Figma 2098:137) — saves the selected creature as PNG. */}
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

        {/* Edit button — routes to the page that originally created the
            creature, with ?edit=<id> so that page can hydrate state. */}
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

        {/* Delete button — removes the selected creature from the ecosystem. */}
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
      </>
      )}
    </div>
  );
}
