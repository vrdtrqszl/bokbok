"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { loadEcosystem, deleteCreatureById, matchesCreatureQuery, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
import type { CreatureSpec } from "@/lib/creature";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import CreatureThumbnail from "@/app/_components/CreatureThumbnail";
import ViewportZoomControls from "@/app/_components/ViewportZoomControls";

export default function BokBokpediaPage() {
  const router = useRouter();
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [query, setQuery] = useState("");
  const [viewportZoom, setViewportZoom] = useState(1);
  const zoomIn = () => setViewportZoom((z) => Math.min(3, z * 1.2));
  const zoomOut = () => setViewportZoom((z) => Math.max(0.4, z / 1.2));
  useEffect(() => {
    setViewportZoom(1);
  }, [selected?.id]);
  const filtered = query.trim()
    ? creatures.filter((c) => matchesCreatureQuery(c, query))
    : creatures;

  // Live ecosystem load + cross-tab/in-tab sync + Supabase realtime
  // (no-op when in local mode).
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
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
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
            Calendar      (2102:153)  x=115 y=51 w=151
            BokBokpedia  (2102:157)  x=255 y=51 w=151
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
        Calendar
      </Link>

      {/* Active tab indicator behind BokBokpedia — shifted +3px with the label. */}
      <div className="absolute left-[255px] top-[44px] h-[53.89px] w-[152.19px]">
        <img
          alt=""
          src="/assets/encyclopedia-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        BokBokpedia
      </span>

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

      {/* Search box — filters the encyclopedia grid by name or date. */}
      <div className="absolute left-[42px] top-[111px] h-[44px] w-[225px] overflow-hidden">
        <img
          alt=""
          src="/assets/search-box-icon.svg"
          className="pointer-events-none absolute inset-0 block size-full"
        />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Name or date"
          className="absolute left-[33.3px] top-[9.2px] block h-[28.7px] w-[180px] bg-transparent text-[20px] font-bold text-black outline-none placeholder:text-black/35"
        />
      </div>

      {/* Main canvas box */}
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* Creature boxes grid — Figma exact values:
            container 895.6×697 at (70, 172)
            4 columns of 211.15-px boxes, 17-px column gap
            rows of 213.27-px boxes, 15-px row gap
          Both grid-template-columns AND grid-auto-rows set explicitly so
          every row matches the box height even when a row has fewer than
          four creatures (the implicit auto would shrink incomplete rows). */}
      <div
        className="absolute left-[70px] top-[172px] grid h-[697px] w-[895.6px] gap-x-[17px] gap-y-[15px] overflow-x-clip overflow-y-auto"
        style={{
          gridTemplateColumns: "repeat(4, 211.15px)",
          gridAutoRows: "213.27px",
        }}
      >
        {creatures.length === 0 ? (
          <div className="col-span-4 mt-12 flex flex-col items-center gap-3 text-center text-[18px] font-bold leading-relaxed text-black/40">
            <span>No creatures yet.</span>
            <Link href="/create" className="cursor-pointer text-black/70 underline">
              Create your first one →
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-4 mt-12 text-center text-[16px] font-bold text-black/40">
            No matches for &ldquo;{query}&rdquo;.
          </div>
        ) : (
          filtered.map((c, i) => {
            const isSelected = selected?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  // Play the creature's giggle on click — same audio
                  // signature it gets when first generated on the
                  // Create page. `force: true` routes through the
                  // always-on output so this fires even when the
                  // global Sound Off toggle is on; pressing a creature
                  // here means you want to hear it.
                  unlockAudio();
                  playCreatureGiggle(c.blocks, { force: true });
                  setSelected(c);
                }}
                className="relative h-[213.27px] w-[211.15px] shrink-0 cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:scale-[1.01]"
              >
                {/* Decorative box outline (cycles through the 24 hand-drawn variants) */}
                <img
                  alt=""
                  src={`/assets/creature-box-${i % 24}.svg`}
                  className="pointer-events-none absolute inset-0 block size-full"
                />
                {/* Date label — top of the box (compact YYYYMMDD per Figma 2102:239) */}
                <span className="pointer-events-none absolute left-1/2 top-[4px] flex h-[14px] w-[120px] -translate-x-1/2 items-center justify-center whitespace-nowrap text-center text-[13px] font-bold leading-[normal] text-black">
                  {c.dateISO ? c.dateISO.replace(/-/g, "") : ""}
                </span>
                {/* Creature thumbnail centered between the labels */}
                <div className="pointer-events-none absolute inset-[18px]">
                  <CreatureThumbnail creature={c} blockSize={92} />
                </div>
                {/* Name + optional text-box outline (Figma 2102:241).
                    Wrapped in an inline-flex container so the box's width
                    follows the text — a short "Mimi" gets a small box, a
                    long "Bouncing Joyfulness" gets a wider one. The
                    outline (same uploaded-box.svg as the /create
                    "Uploaded" button) only renders when this tile is the
                    selected one. Position: bottom-[6px] keeps the visible
                    text vertical-center close to its old position
                    (previously bottom-[8px] h-[20px], now bottom-[6px]
                    h-[28px] = same baseline). max-w-[195px] keeps the
                    longest names from overflowing the 211 px tile. */}
                <div
                  className="pointer-events-none absolute left-1/2 bottom-[6px] inline-flex h-[28px] -translate-x-1/2 items-center justify-center px-[14px] max-w-[195px]"
                >
                  {isSelected && (
                    <img
                      alt=""
                      src="/assets/uploaded-box.svg"
                      className="pointer-events-none absolute inset-0 block size-full"
                    />
                  )}
                  <span className="relative truncate whitespace-nowrap text-center text-[20px] font-normal leading-[normal] text-black font-(family-name:--font-casual)">
                    {c.name ?? "Creature"}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Creature view (top right) — same as main page */}
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
              BokBokpedia to view it
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

        <div className="scroll-fade-vertical absolute left-[26px] right-[18px] top-[96px] bottom-[58px] flex flex-col items-center overflow-y-auto overflow-x-hidden">
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
                Pick a creature from the encyclopedia to read its journal entry.
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
