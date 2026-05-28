"use client";

// Trash bin page — mirrors the encyclopedia layout (same wavy main box,
// same 4-col creature grid, same right-side viewfinder + info panel)
// but displays only creatures that have been soft-deleted from THIS
// browser. Everything in the grid + the right-side preview canvas is
// rendered with `filter: grayscale(100%)` so the trash visually reads
// as "memories that are no longer active".
//
// Actions:
//   • Click a trash creature → preview it (with its journal).
//   • Permanent-delete button → purges from the trash bin (no undo).
//
// Currently no "restore to ecosystem" affordance; the design intent
// from the user request was just to keep a viewable archive.

import { useEffect, useState } from "react";
import {
  loadTrash,
  purgeTrashCreature,
  uploadCreature,
  matchesCreatureQuery,
  type TrashEntry,
} from "@/lib/ecosystem";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
import { nameHighlightDataUrl } from "@/lib/nameHighlight";
import { useT } from "@/lib/i18n";
import { useIsMobile } from "@/lib/useIsMobile";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import CreatureThumbnail from "@/app/_components/CreatureThumbnail";
import ViewportZoomControls from "@/app/_components/ViewportZoomControls";
import BokBokLogo from "@/app/_components/BokBokLogo";
import MobileTrashPage from "@/app/_components/MobileTrashPage";

export default function TrashPage() {
  const isMobile = useIsMobile();
  if (isMobile) return <MobileTrashPage />;
  return <DesktopTrashPage />;
}

function DesktopTrashPage() {
  const t = useT();
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [selected, setSelected] = useState<TrashEntry | null>(null);
  const [query, setQuery] = useState("");
  const [viewportZoom, setViewportZoom] = useState(1);
  const zoomIn = () => setViewportZoom((z) => Math.min(3, z * 1.2));
  const zoomOut = () => setViewportZoom((z) => Math.max(0.4, z / 1.2));
  useEffect(() => {
    setViewportZoom(1);
  }, [selected?.id]);
  const filtered = query.trim()
    ? trash.filter((c) => matchesCreatureQuery(c, query))
    : trash;

  // Load trash on mount + re-load whenever the in-tab "trash:changed"
  // custom event fires (the storage hook in lib/ecosystem dispatches
  // it on writes). Also respond to cross-tab `storage` events.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadTrash().then((list) => {
        if (!cancelled) setTrash(list);
      });
    };
    refresh();
    window.addEventListener("trash:changed", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("trash:changed", refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const handleRevive = async () => {
    if (!selected) return;
    // Re-upload the creature into the active ecosystem (Supabase row
    // or localStorage entry, depending on mode). Strip the TrashEntry-
    // only deletedAt field so the restored creature looks identical
    // to a freshly-uploaded one. Then remove it from the trash.
    const { deletedAt: _deletedAt, ...creature } = selected;
    await uploadCreature(creature);
    purgeTrashCreature(selected.id);
    setSelected(null);
  };

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* BokBok logo / Home link */}
      <a
        href="/"
        aria-label="BokBok home"
        className="absolute block cursor-pointer transition-transform active:scale-95 hover:scale-[1.02]"
        style={{ left: 1152, top: -27 }}
      >
        <BokBokLogo />
      </a>

      {/* Top nav */}
      <a
        href="/create"
        className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.create")}
      </a>
      <a
        href="/calender"
        className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.calendar")}
      </a>

      {/* BokBokpedia tab — still highlighted as active since the trash
          is a sub-view of the encyclopedia. Same hand-drawn box outline
          as the encyclopedia page so the user knows where they are. */}
      <div className="absolute left-[255px] top-[44px] h-[53.89px] w-[152.19px]">
        <img
          alt=""
          src="/assets/encyclopedia-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <a
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.encyclopedia")}
      </a>

      <a
        href="/energy-blocks"
        className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.energy_blocks")}
      </a>
      <a
        href="/about"
        className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.about")}
      </a>

      {/* Back button (Figma 2303:117) — sits in the × close button's
          slot at (957, 107). On the trash page there's no separate
          "home" affordance up top; back is the primary action, and
          home is reachable via the BokBok wordmark in the corner. */}
      <a
        href="/encyclopedia"
        aria-label="Back to BokBokpedia"
        title="Back to BokBokpedia"
        className="absolute z-[30] block cursor-pointer transition-transform active:scale-95 hover:scale-105"
        style={{ left: 957, top: 107, width: 32.12, height: 32.5 }}
      >
        <div className="absolute" style={{ inset: "-1.54% -1.56%" }}>
          <img
            alt=""
            src="/assets/back-button.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </a>

      {/* Search box — filters the trash grid by name or date. Same
          design + position as on the other top-level pages. */}
      <div className="absolute left-[776.64px] top-[53.99px] h-[30.66px] w-[219.71px]">
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
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* Trash grid — same layout as the encyclopedia grid (4 columns,
          211×213 boxes) but every thumbnail is rendered in grayscale so
          the page reads as "archive of past creatures". */}
      <div
        className="absolute left-[70px] top-[172px] grid h-[697px] w-[895.6px] gap-x-[17px] gap-y-[15px] overflow-x-clip overflow-y-auto"
        style={{
          gridTemplateColumns: "repeat(4, 211.15px)",
          gridAutoRows: "213.27px",
        }}
      >
        {trash.length === 0 ? (
          <div className="col-span-4 mt-12 flex flex-col items-center gap-3 text-center text-[18px] font-bold leading-relaxed text-black/40">
            <span>The trash is empty.</span>
            <a href="/encyclopedia" className="cursor-pointer text-black/70 underline">
              Back to BokBokpedia →
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-4 mt-12 text-center text-[16px] font-bold text-black/40">
            {t("enc.no_matches")} &ldquo;{query}&rdquo;.
          </div>
        ) : (
          filtered.map((c, i) => {
            const isSelected = selected?.id === c.id;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  unlockAudio();
                  playCreatureGiggle(c.blocks, { force: true });
                  setSelected(c);
                }}
                className="relative h-[213.27px] w-[211.15px] shrink-0 cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:scale-[1.01]"
              >
                <img
                  alt=""
                  src={`/assets/creature-box-${i % 24}.svg`}
                  className="pointer-events-none absolute inset-0 block size-full"
                />
                <span className="pointer-events-none absolute left-1/2 top-[4px] flex h-[14px] w-[120px] -translate-x-1/2 items-center justify-center whitespace-nowrap text-center text-[13px] font-bold leading-[normal] text-black/60">
                  {c.dateISO ? c.dateISO.replace(/-/g, "") : ""}
                </span>
                {/* Grayscale wrapper around the thumbnail. The box
                    outline + date + name stay full colour (black ink
                    on beige) so the page is still readable; only the
                    creature artwork itself is desaturated. */}
                <div
                  className="pointer-events-none absolute inset-[18px]"
                  style={{ filter: "grayscale(100%) opacity(0.75)" }}
                >
                  <CreatureThumbnail creature={c} blockSize={92} />
                </div>
                <div
                  className="pointer-events-none absolute left-1/2 bottom-[6px] flex h-[28px] -translate-x-1/2 items-center justify-center"
                >
                  <span
                    className="whitespace-nowrap px-[4px] text-center text-[20px] font-normal leading-[normal] text-black/70 font-(family-name:--font-casual)"
                    style={{
                      maxWidth: "195px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      // Selection highlight in GRAYSCALE so it matches
                      // the rest of the trash page's monochrome look —
                      // a mid-gray instead of the per-creature accent
                      // colour the encyclopedia uses.
                      ...(isSelected
                        ? {
                            backgroundImage: nameHighlightDataUrl("#888888"),
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 20px",
                            backgroundPosition: "center",
                          }
                        : null),
                    }}
                  >
                    {c.name ?? "Creature"}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Creature viewport (top right) — preview the selected trash
          creature in grayscale. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt="creature"
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        <div className="scroll-fade pointer-events-auto absolute left-[8px] right-[8px] top-[10px] bottom-[16px]">
          {selected ? (
            <div className="size-full" style={{ filter: "grayscale(100%) opacity(0.85)" }}>
              <CreatureCanvas
                creature={selected}
                blockSize={140}
                padding={8}
                zoom={viewportZoom}
              />
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
              Click a creature in the trash
              <br />
              to view it
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

      {/* Info panel (bottom right) — name, dates (created + deleted),
          journal, permanent-delete button. Same outline as the
          encyclopedia info panel. */}
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

        {/* Name + date(s) — flex column so long names wrap. */}
        <div className="absolute left-[20px] right-[20px] top-[15px] flex flex-col items-center text-center">
          <h2 className="m-0 max-w-full break-words text-[36px] leading-[1.05] text-black/80 font-(family-name:--font-fancy)">
            {selected?.name ?? "—"}
          </h2>
          <span className="mt-[2px] text-[18px] font-bold leading-none text-black/70">
            {selected?.dateISO ?? "—"}
            {selected?.deletedAt ? (
              <span className="ml-2 text-black/40">
                · deleted {selected.deletedAt.slice(0, 10)}
              </span>
            ) : null}
          </span>
        </div>

        <div className="scroll-fade-vertical absolute left-[26px] right-[18px] top-[110px] bottom-[58px] flex flex-col items-center overflow-y-auto overflow-x-hidden">
          <div className="w-full text-[20px] font-bold leading-normal text-black/80">
            {selected ? (
              selected.journalText ? (
                selected.journalText.split(/\n\n+/).map((para, i, arr) => (
                  <p key={i} className={i === arr.length - 1 ? "" : "mb-0"}>
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-black/40">{t("panel.no_journal_manual")}</p>
              )
            ) : (
              <p className="text-black/40">
                Pick a creature from the trash to read its entry.
              </p>
            )}
          </div>
        </div>

        {/* Revive — restores the selected trash creature back into the
            active ecosystem (uploadCreature) and removes it from the
            trash (purgeTrashCreature). Sits in the same slot the
            permanent-delete button used to occupy, reusing the same
            delete-vector outline so the layout/weight stays familiar
            — just relabelled. Download + permanent-delete buttons
            removed per design: trash is now a recovery-only view. */}
        <button
          type="button"
          onClick={handleRevive}
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
            {t("action.revive")}
          </p>
        </button>
      </div>
    </div>
  );
}
