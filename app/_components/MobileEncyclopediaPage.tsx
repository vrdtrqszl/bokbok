"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEffect, useState } from "react";
import MobileTopBar from "./MobileTopBar";
import CreatureCanvas from "./CreatureCanvas";
import CreatureThumbnail from "./CreatureThumbnail";
import {
  loadEcosystem,
  deleteCreatureById,
  matchesCreatureQuery,
  subscribeRemoteEcosystem,
} from "@/lib/ecosystem";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
import { nameHighlightDataUrl, creatureHighlightColor } from "@/lib/nameHighlight";
import { useT } from "@/lib/i18n";
import type { CreatureSpec } from "@/lib/creature";

/**
 * Mobile Encyclopedia (BokBokpedia).
 *
 * Desktop is a 4-column grid of hand-drawn creature boxes inside the wavy
 * frame, with a search box top-left, a creature view (drag-to-rotate
 * canvas) top-right, and an info panel (name + journal + edit/delete)
 * bottom-right. Mobile flattens to:
 *   1. MobileTopBar
 *   2. Search input (full-width, hand-drawn icon)
 *   3. 2-column creature grid — each tile keeps the rotating
 *      `creature-box-N.svg` outline + thumbnail + name
 *   4. Bottom sheet (fixed overlay) when a creature is tapped — shows
 *      the live CreatureCanvas preview, name, date, journal text, and
 *      the hand-drawn Download/Edit/Delete action row.
 */
export default function MobileEncyclopediaPage() {
  const router = useRouter();
  const t = useT();
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? creatures.filter((c) => matchesCreatureQuery(c, query))
    : creatures;

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

  // Lock body scroll while the sheet is open so the user can scroll the
  // sheet content (long journal text) without the grid drifting behind.
  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

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
      <MobileTopBar active="encyclopedia" />

      {/* Search row + trash entry. The search input reuses the hand-
          drawn search-box-icon SVG so it matches desktop. The trash
          icon sits to its right at a 36×36 footprint — small enough to
          read as a secondary affordance, big enough to comfortably tap.
          Tapping routes to /encyclopedia/trash where MobileTrashPage
          handles the soft-deleted archive. */}
      <div className="flex items-center gap-2 px-4 pb-2 pt-5">
        <div className="relative h-[44px] flex-1">
          <img
            alt=""
            src="/assets/search-box-icon.svg"
            className="pointer-events-none absolute inset-0 block size-full"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("enc.search_placeholder")}
            className="absolute left-[56px] top-[10px] block h-[24px] w-[calc(100%-72px)] bg-transparent text-[18px] font-bold text-black outline-none placeholder:text-black/35"
          />
        </div>
        <a
          href="/encyclopedia/trash"
          aria-label="View deleted creatures"
          title="Trash"
          className="block h-9 w-9 shrink-0 cursor-pointer transition-transform active:scale-95"
        >
          <img
            alt=""
            src="/assets/trash-button.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </a>
      </div>

      {/* 2-col creature grid. Each tile keeps the hand-drawn creature-box-N
          outline cycling through the 24 variants so the page reads like
          a sticker book on mobile too. */}
      <section className="px-3 pb-12 pt-3">
        {creatures.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-3 text-center text-[16px] font-bold leading-relaxed text-black/40">
            <span>{t("enc.empty_no_creatures")}</span>
            <Link href="/create" className="cursor-pointer text-black/70 underline">
              {t("enc.empty_create_first")}
            </Link>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-12 text-center text-[14px] font-bold text-black/40">
            {t("enc.no_matches")} &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((c, i) => (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  unlockAudio();
                  playCreatureGiggle(c.blocks, { force: true });
                  setSelected(c);
                }}
                className="relative block aspect-square w-full cursor-pointer bg-transparent p-0 transition-transform active:scale-95"
              >
                <img
                  alt=""
                  src={`/assets/creature-box-${i % 24}.svg`}
                  className="pointer-events-none absolute inset-0 block size-full"
                />
                <span className="pointer-events-none absolute left-1/2 top-[4px] flex h-[12px] w-[100px] -translate-x-1/2 items-center justify-center whitespace-nowrap text-center text-[11px] font-bold leading-[normal] text-black">
                  {c.dateISO ? c.dateISO.replace(/-/g, "") : ""}
                </span>
                {/* Thumbnail area shrinks slightly (top:18, bottom:36) so
                    the name strip below has room for up to two lines
                    without the creature overlapping. */}
                <div className="pointer-events-none absolute inset-x-[16px] top-[18px] bottom-[36px]">
                  <CreatureThumbnail creature={c} blockSize={56} />
                </div>
                {/* Name area — wraps to TWO lines at most so long names
                    like "Bouncing Joyfulness" stay visible. line-clamp-2
                    adds the ellipsis only after the second line, which
                    almost never triggers at 13px on the ~150-px-wide
                    card. break-words handles single ultra-long tokens
                    by breaking them mid-word as a last resort. */}
                <div className="pointer-events-none absolute inset-x-[8px] bottom-[4px] flex h-[30px] items-end justify-center">
                  <span
                    className="block w-full overflow-hidden text-center text-[13px] font-normal leading-[14px] text-black break-words"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical" as const,
                    }}
                  >
                    {c.name ?? "Creature"}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </section>

      {/* ── Bottom sheet — selected creature ───────────────────────── */}
      {selected && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/40"
            onClick={() => setSelected(null)}
            aria-hidden
          />
          <div className="fixed inset-x-0 bottom-0 z-50 max-h-[90vh] overflow-y-auto bg-[#dfd9c9] px-4 pb-6 pt-3 shadow-[0_-4px_16px_rgba(0,0,0,0.15)]">
            {/* Drag handle + close */}
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
              <span
                className="inline-block px-1"
                style={{
                  backgroundImage: nameHighlightDataUrl(
                    creatureHighlightColor(selected),
                  ),
                  backgroundRepeat: "no-repeat",
                  backgroundSize: "100% 20px",
                  backgroundPosition: "center",
                }}
              >
                {selected.name ?? "Creature"}
              </span>
            </h2>
            <p className="mt-1 text-[14px] font-bold text-black/60">
              {selected.dateISO ?? "—"}
            </p>

            {/* Live CreatureCanvas — drag-to-rotate preserved. Aspect-square
                container at full available width keeps creature centred. */}
            <div className="mt-4 aspect-square w-full overflow-hidden">
              <CreatureCanvas creature={selected} blockSize={100} padding={6} />
            </div>

            {/* Journal text */}
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

            {/* Hand-drawn action row — same SVG set as desktop. */}
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
