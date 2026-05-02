"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MainViewport, { type FocusTarget } from "./_components/MainViewport";
import CreatureCanvas from "./_components/CreatureCanvas";
import ViewportZoomControls from "./_components/ViewportZoomControls";
import { deleteCreatureById, loadEcosystem, matchesCreatureQuery } from "@/lib/ecosystem";
import type { CreatureSpec } from "@/lib/creature";

export default function MainPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [query, setQuery] = useState("");
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  // Viewport zoom — multiplies the creature's fit scale in the right preview.
  // Resets to 1 each time a different creature is selected.
  const [viewportZoom, setViewportZoom] = useState(1);
  const zoomIn = () => setViewportZoom((z) => Math.min(3, z * 1.2));
  const zoomOut = () => setViewportZoom((z) => Math.max(0.4, z / 1.2));
  // Reset zoom whenever the user picks a different creature.
  useEffect(() => {
    setViewportZoom(1);
  }, [selected?.id]);

  // Compute the same circular layout EcosystemCreatures uses so we can map
  // a matching creature to its world position for the camera focus.
  const focusOnQuery = () => {
    const text = query.trim();
    if (!text) return;
    const eco = loadEcosystem();
    const idx = eco.findIndex((c) => matchesCreatureQuery(c, text));
    if (idx < 0) return;
    const match = eco[idx];
    const angle = (idx / eco.length) * Math.PI * 2;
    const radius = eco.length === 1 ? 0 : 4;
    setFocusTarget({
      position: [Math.cos(angle) * radius, 0, Math.sin(angle) * radius],
      ts: Date.now(),
    });
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

      {/* Main canvas box — 3D viewport with click-to-select on creatures */}
      <MainViewport
        onCreatureSelect={setSelected}
        selectedCreatureId={selected?.id ?? null}
        focusTarget={focusTarget}
      />

      {/* Creature view (top right) — shows selected creature with breathing
          animation. Empty viewport hint when nothing is selected. */}
      <div className="absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt="creature"
          src="/assets/creature-view.svg"
          className="pointer-events-none absolute inset-0 block size-full"
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
              ecosystem to view it
            </div>
          )}
        </div>
        {/* Zoom controls (Figma 2084:88 / 2084:85) — bottom-right of viewport */}
        {selected && (
          <ViewportZoomControls
            onZoomIn={zoomIn}
            onZoomOut={zoomOut}
            className="bottom-[14px] right-[16px]"
          />
        )}
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
