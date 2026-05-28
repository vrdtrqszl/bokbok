"use client";

import { useEffect, useState } from "react";
import MobileTopBar from "./MobileTopBar";
import CreatureCanvas from "./CreatureCanvas";
import CreatureThumbnail from "./CreatureThumbnail";
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

/**
 * Mobile counterpart to /encyclopedia/trash (DesktopTrashPage).
 *
 * Mirrors MobileEncyclopediaPage's structure (top bar → search → 2-col
 * creature grid → bottom sheet) but:
 *   • Everything creature-rendered (thumbnail + canvas preview) is
 *     wrapped in `filter: grayscale(100%)` so the page reads as an
 *     "archive of past creatures", same convention as desktop trash.
 *   • Selected-name highlight uses fixed #888888 (gray) instead of the
 *     creature's accent colour, matching desktop trash's monochrome
 *     palette.
 *   • The bottom sheet's action row replaces Download/Edit/Delete with
 *     a single Revive button — restores the creature to the active
 *     ecosystem and purges from trash. (No permanent-delete affordance:
 *     trash is intentionally recovery-only, same as desktop.)
 *   • A back arrow above the search returns the user to the live
 *     /encyclopedia grid; the top bar still highlights encyclopedia as
 *     the active section.
 */
export default function MobileTrashPage() {
  const t = useT();
  const [trash, setTrash] = useState<TrashEntry[]>([]);
  const [selected, setSelected] = useState<TrashEntry | null>(null);
  const [query, setQuery] = useState("");

  const filtered = query.trim()
    ? trash.filter((c) => matchesCreatureQuery(c, query))
    : trash;

  // Load trash on mount + re-load whenever the in-tab "trash:changed"
  // custom event fires (lib/ecosystem dispatches it on writes). Also
  // respond to cross-tab `storage` events.
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

  // Lock body scroll while the sheet is open so the user can scroll
  // long journal text without the grid drifting behind.
  useEffect(() => {
    if (!selected) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [selected]);

  const handleRevive = async () => {
    if (!selected) return;
    // Re-upload the creature into the active ecosystem, strip the
    // TrashEntry-only deletedAt field, then purge from the trash —
    // mirrors DesktopTrashPage handleRevive exactly.
    const { deletedAt: _deletedAt, ...creature } = selected;
    await uploadCreature(creature);
    purgeTrashCreature(selected.id);
    setSelected(null);
  };

  return (
    <div className="relative min-h-screen w-full font-(family-name:--font-casual)">
      <MobileTopBar active="encyclopedia" />

      {/* Back row + search. The back link returns to the live
          encyclopedia grid; the top bar still says "encyclopedia" is
          active so the user knows where they are in the site. */}
      <div className="px-4 pt-5">
        <a
          href="/encyclopedia"
          className="inline-block cursor-pointer text-[14px] font-bold text-black/60 active:scale-95"
        >
          ← {t("nav.encyclopedia")}
        </a>
      </div>

      <div className="px-4 pb-2 pt-2">
        <div className="relative h-[44px] w-full">
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
      </div>

      {/* 2-col grayscale grid — same dimensions as the encyclopedia
          mobile grid so trash feels like a sibling view. */}
      <section className="px-3 pb-12 pt-3">
        {trash.length === 0 ? (
          <div className="mt-12 flex flex-col items-center gap-3 text-center text-[16px] font-bold leading-relaxed text-black/40">
            <span>The trash is empty.</span>
            <a href="/encyclopedia" className="cursor-pointer text-black/70 underline">
              Back to BokBokpedia →
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="mt-12 text-center text-[14px] font-bold text-black/40">
            {t("enc.no_matches")} &ldquo;{query}&rdquo;.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filtered.map((c, i) => {
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
                  className="relative block aspect-square w-full cursor-pointer bg-transparent p-0 transition-transform active:scale-95"
                >
                  <img
                    alt=""
                    src={`/assets/creature-box-${i % 24}.svg`}
                    className="pointer-events-none absolute inset-0 block size-full"
                  />
                  <span className="pointer-events-none absolute left-1/2 top-[4px] flex h-[12px] w-[100px] -translate-x-1/2 items-center justify-center whitespace-nowrap text-center text-[11px] font-bold leading-[normal] text-black/60">
                    {c.dateISO ? c.dateISO.replace(/-/g, "") : ""}
                  </span>
                  {/* Grayscale wrapper around the thumbnail — box outline
                      + text stay full colour (black ink on beige) so the
                      page is still readable; only the creature art is
                      desaturated. */}
                  <div
                    className="pointer-events-none absolute inset-x-[16px] top-[18px] bottom-[36px]"
                    style={{ filter: "grayscale(100%) opacity(0.75)" }}
                  >
                    <CreatureThumbnail creature={c} blockSize={56} />
                  </div>
                  <div className="pointer-events-none absolute inset-x-[8px] bottom-[4px] flex h-[30px] items-end justify-center">
                    <span
                      className="block w-full overflow-hidden text-center text-[13px] font-normal leading-[14px] text-black/70 break-words"
                      style={{
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical" as const,
                        // Grayscale highlight to match desktop trash —
                        // a mid-gray instead of the per-creature accent.
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
            })}
          </div>
        )}
      </section>

      {/* ── Bottom sheet — selected trash creature ─────────────────── */}
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

            <h2 className="m-0 text-[28px] leading-none text-black/80 font-(family-name:--font-fancy)">
              <span
                className="inline-block px-1"
                style={{
                  // Always gray on the trash sheet too — matches the
                  // desktop trash info panel's monochrome treatment.
                  backgroundImage: nameHighlightDataUrl("#888888"),
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
              {selected.deletedAt ? (
                <span className="ml-2 text-black/40">
                  · deleted {selected.deletedAt.slice(0, 10)}
                </span>
              ) : null}
            </p>

            {/* Grayscale CreatureCanvas preview — drag-to-rotate
                preserved, just desaturated. */}
            <div
              className="mt-4 aspect-square w-full overflow-hidden"
              style={{ filter: "grayscale(100%) opacity(0.85)" }}
            >
              <CreatureCanvas creature={selected} blockSize={100} padding={6} />
            </div>

            <div className="mt-4 text-[15px] font-bold leading-relaxed text-black/80">
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

            {/* Revive — only action on trash sheet. Reuses the hand-
                drawn delete-vector frame just like desktop. */}
            <div className="mt-5 flex h-12 items-stretch">
              <button
                type="button"
                onClick={handleRevive}
                className="relative block h-full w-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
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
                  {t("action.revive")}
                </p>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
