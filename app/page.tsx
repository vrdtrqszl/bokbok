"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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

  // Track the browser's actual fullscreen state so the button reflects it
  // even when the user exits via Escape.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  const handleResetView = () => {
    setResetTrigger({ ts: Date.now() });
    setSelected(null);
  };

  // Selection from a 3D click — the creature reports its CURRENT live
  // position (since creatures wander/jump around the scene). We size the
  // focus camera to the creature's visible bbox AND recenter the target
  // on the bbox center so asymmetric creatures (most of them) fill the
  // box edge-to-edge instead of sitting offset with empty bands.
  //
  // Multiplier 2.05 = 1.96 (horizontal fit at canvas aspect ~1.234, FOV 45°)
  // + tiny margin for the ±4% breathing pulse. With the selection scale
  // bump removed, this is enough — the creature at peak breath fills ~99%
  // of the box width.
  //
  // Camera-up direction (post-billboard rotation) ≈ (0, 0.394, -0.919), so
  // the bbox-Y offset projects onto world (Y, Z) by those factors.
  const handleSelect = (
    c: CreatureSpec,
    pos: [number, number, number],
  ) => {
    setSelected(c);
    const bbox = creatureFocusBox(c);
    const halfExtent = Math.max(bbox.halfWidth, bbox.halfHeight);
    const distance = Math.max(2.0, halfExtent * 2.05);
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
      className={`relative mx-auto h-[900px] w-[1440px] bg-[#dfd9c9] font-(family-name:--font-casual) ${
        // In fullscreen, MainViewport expands beyond 1440×900 in design
        // coords to fill the actual window — so the page must NOT clip.
        isFullscreen ? "overflow-visible" : "overflow-hidden"
      }`}
    >
      {/* Top bar / nav / right panels — hidden in fullscreen mode (Figma 2114:265
          shows just the wavy frame + 3D scene + exit button). */}
      {!isFullscreen && (
        <>
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
          <Link
            href="/calender"
            className="absolute left-[190.5px] top-[48px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
          >
            Calender
          </Link>
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

          {/* Reset View button (Figma 2096:131) — animates the camera back to
              the initial pose and clears the current selection. */}
          <button
            type="button"
            onClick={handleResetView}
            className="absolute left-[434px] top-[827px] z-[20] block h-[31px] w-[156px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
          >
            <img
              alt=""
              src="/assets/reset-view-box.svg"
              className="absolute inset-0 block size-full"
            />
            <span className="absolute inset-0 flex items-center justify-center text-center text-[24px] font-bold leading-[normal] text-black">
              Reset View
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
      />

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
