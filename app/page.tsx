"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import MainViewport, { type FocusTarget, type ResetTrigger } from "./_components/MainViewport";
import { creaturePositions } from "./_components/EcosystemCreatures";
import { deleteCreatureById, loadEcosystem, matchesCreatureQuery } from "@/lib/ecosystem";
import { emotionByKey, type CreatureSpec } from "@/lib/creature";
import { downloadCreaturePng } from "@/lib/downloadCreature";

export default function MainPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [query, setQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [resetTrigger, setResetTrigger] = useState<ResetTrigger | null>(null);

  const handleResetView = () => {
    setResetTrigger({ ts: Date.now() });
    setSelected(null);
    setQuery("");
  };

  // Selection from a 3D click — the creature reports its CURRENT live
  // position (since creatures wander/jump around the scene).
  const handleSelect = (
    c: CreatureSpec,
    pos: [number, number, number],
  ) => {
    setSelected(c);
    setFocusTarget({ position: pos, ts: Date.now() });
  };

  const focusOnQuery = async () => {
    const text = query.trim();
    if (!text) return;
    const eco = await loadEcosystem();
    const match = eco.find((c) => matchesCreatureQuery(c, text));
    if (!match) return;
    // Read the creature's current live position from the registry. Falls
    // back to origin if it hasn't been registered yet (very early frame).
    const pos = creaturePositions.get(match.id) ?? ([0, 0, 0] as [number, number, number]);
    setFocusTarget({ position: pos, ts: Date.now() });
    setSelected(match);
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

      {/* Search box — type a name or date and press Enter to zoom the
          camera onto the matching creature. z-[20] so it sits above the
          3D Canvas (which spans the whole main-box area). */}
      <div className="absolute left-[42px] top-[111px] z-[20] h-[44px] w-[225px] overflow-hidden">
        <img
          alt=""
          src="/assets/vector-search.svg"
          className="pointer-events-none absolute inset-0 block size-full"
        />
        <img
          alt=""
          src="/assets/magnifier.svg"
          className="pointer-events-none absolute left-[7px] top-[10.5px] block h-[23px] w-[20px]"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              focusOnQuery();
            }
          }}
          placeholder="Name or date"
          className="absolute left-[33.3px] top-[9.2px] block h-[28.7px] w-[180px] bg-transparent text-[20px] font-bold text-black outline-none placeholder:text-black/35"
        />
      </div>

      {/* Main canvas box — 3D viewport with click-to-select on creatures.
          Click also zooms the camera onto the selected creature. */}
      <MainViewport
        onCreatureSelect={handleSelect}
        selectedCreatureId={selected?.id ?? null}
        focusTarget={focusTarget}
        resetTrigger={resetTrigger}
      />

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
    </div>
  );
}
