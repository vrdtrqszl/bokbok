"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MobileTopBar from "./MobileTopBar";
import CreatureCanvas from "./CreatureCanvas";
import ManualCanvas, { type ManualCanvasHandle } from "./ManualCanvas";
import { EMOTION_LIST } from "@/lib/emotions";
import {
  uploadCreature,
  findCreatureById,
  deleteCreatureById,
} from "@/lib/ecosystem";
import { playCreatureGiggle } from "@/lib/audio";
import { useT, emotionName, useLanguage } from "@/lib/i18n";
import { type CreatureSpec } from "@/lib/creature";

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Mobile /create/manually — manual block-building flow.
 *
 * Desktop is a four-quadrant layout: drawing canvas on the left, journal
 * textarea + date picker top-right, creature preview top-far-right, search
 * + emotion grid bottom-right, action row at the bottom. None of that fits
 * a portrait phone, so mobile collapses to a single vertical column:
 *
 *   1. MobileTopBar (active=create)
 *   2. Sub-nav: Generate | Manually (Manually active)
 *   3. Date (native <input type="date">)
 *   4. Name input
 *   5. Drawing canvas (full-width, fixed height) — tap an emotion below
 *      to add a block; existing tap-to-add path already works without
 *      drag-drop. Move/rotate/resize manipulation uses mouse events on
 *      desktop; on mobile only basic tap-to-add is reliable (touch-to-
 *      mouse emulation gives the user enough to assemble a creature
 *      even without true touch manipulation).
 *   6. Journal textarea
 *   7. Search input + 3-col emotion grid (denser than desktop's 4-col
 *      because the row width is smaller; tiles stay readable at ~100 px)
 *   8. Creature preview (after Generate)
 *   9. Action row: Generate / Upload / Delete (same hand-drawn SVGs)
 *
 * Wrapped in Suspense for useSearchParams (?edit=<id>) — mirrors desktop.
 */
export default function MobileCreateManuallyPage() {
  return (
    <Suspense fallback={null}>
      <MobileCreateManuallyInner />
    </Suspense>
  );
}

function MobileCreateManuallyInner() {
  const router = useRouter();
  const t = useT();
  const lang = useLanguage();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [creature, setCreature] = useState<CreatureSpec | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploaded">("idle");
  const [search, setSearch] = useState("");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [journalText, setJournalText] = useState("");
  const [name, setName] = useState("");
  const canvasHandle = useRef<ManualCanvasHandle | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hydrate from ?edit=<id> — identical lifecycle to desktop.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    findCreatureById(editId).then((existing) => {
      if (cancelled || !existing) return;
      setEditingId(existing.id);
      setCreature(existing);
      if (existing.dateISO) setSelectedDate(fromISO(existing.dateISO));
      if (existing.journalText) setJournalText(existing.journalText);
      if (existing.name) setName(existing.name);
      requestAnimationFrame(() => {
        canvasHandle.current?.loadCreature(existing.blocks);
      });
    });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const filteredBlocks = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return EMOTION_LIST;
    return EMOTION_LIST.filter((e) =>
      e.displayName.toLowerCase().includes(q) ||
      e.key.toLowerCase().includes(q),
    );
  }, [search]);

  const handleGenerate = () => {
    const spec = canvasHandle.current?.toCreatureSpec();
    if (!spec) {
      alert(t("create.alert_add_block"));
      return;
    }
    if (editingId) spec.id = editingId;
    setCreature(spec);
    setUploadStatus("idle");
  };

  const handleUpload = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert(t("create.alert_creature_name"));
      return;
    }
    // Always re-read the canvas at upload time so any post-Generate
    // tweaks land in the saved creature (same fix as desktop).
    const liveSpec = canvasHandle.current?.toCreatureSpec();
    if (!liveSpec) {
      alert(t("create.alert_add_block"));
      return;
    }
    if (editingId) liveSpec.id = editingId;
    setCreature(liveSpec);

    const currentText = (textareaRef.current?.value ?? journalText).trim();
    const enriched: CreatureSpec = {
      ...liveSpec,
      name: trimmedName,
      journalText: currentText,
      dateISO: toISO(selectedDate),
      source: "manually",
    };
    // AWAIT — see desktop create page for why this matters.
    await uploadCreature(enriched);
    setUploadStatus("uploaded");
    if (!editingId) playCreatureGiggle(enriched.blocks);
    // EDIT-mode shortcut: hop straight back to the main 3D world with
    // the camera zoomed onto the saved creature. Mirrors desktop.
    if (editingId) {
      router.push(`/?focus=${encodeURIComponent(enriched.id)}`);
    }
  };

  const handleDelete = () => {
    if (editingId) {
      void deleteCreatureById(editingId);
      router.push("/");
      return;
    }
    canvasHandle.current?.clear();
    setCreature(null);
    setName("");
    setJournalText("");
    if (textareaRef.current) textareaRef.current.value = "";
    setUploadStatus("idle");
    setSearch("");
    setSelectedDate(new Date());
  };

  return (
    <div className="relative min-h-screen w-full font-(family-name:--font-casual)">
      <MobileTopBar active="create" />

      <main className="mx-auto flex max-w-[520px] flex-col gap-5 px-4 pb-12 pt-5">
        {/* Sub-nav: Generate | Manually (Manually active) */}
        <div className="flex items-center justify-center gap-6 text-[18px] font-bold">
          <Link
            href="/create"
            className="cursor-pointer pb-1 text-black/50"
          >
            {t("create.generate")}
          </Link>
          <span className="border-b-2 border-black pb-1 text-black">
            {t("create.manually")}
          </span>
        </div>

        {/* Date — native picker */}
        <label className="flex items-center justify-between gap-3 text-[18px] font-bold text-black">
          <span>Journal for:</span>
          <input
            type="date"
            value={toISO(selectedDate)}
            onChange={(e) => {
              if (e.target.value) setSelectedDate(fromISO(e.target.value));
            }}
            className="cursor-pointer border-b border-black/50 bg-transparent py-1 text-[18px] font-bold text-black outline-none"
          />
        </label>

        {/* Name input (Fancy font, centered, matches desktop creature view) */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("create.placeholder_name")}
          className="block w-full bg-transparent text-center text-[28px] leading-none text-black outline-none placeholder:text-black/35 font-(family-name:--font-fancy)"
        />

        {/* Drawing canvas — same ManualCanvas component, wrapped in the
            hand-drawn create-manual-box outline like desktop. Tap an
            emotion in the grid below to add a block. Block manipulation
            (move / rotate / resize) uses mouse events on desktop;
            mobile touch-to-mouse emulation gives most of that for free
            but is not 100% reliable — tap-to-add is the primary mobile
            workflow. */}
        <div className="relative aspect-square w-full">
          <img
            alt=""
            src="/assets/create-manual-box.svg"
            className="pointer-events-none absolute inset-0 z-10 block size-full"
          />
          <div className="absolute inset-[12px] z-0">
            <ManualCanvas handleRef={canvasHandle} />
          </div>
        </div>

        {/* Journal textarea — hand-drawn 4-piece outline simplified to
            text-box.svg for mobile (the 4-vector composition is a
            desktop-only nicety). */}
        <div className="relative w-full">
          <img
            alt=""
            src="/assets/text-box.svg"
            className="pointer-events-none absolute inset-0 block h-full w-full"
          />
          <textarea
            ref={textareaRef}
            value={journalText}
            onChange={(e) => setJournalText(e.target.value)}
            placeholder={t("create.placeholder_journal")}
            spellCheck={false}
            rows={6}
            className="relative block w-full resize-none bg-transparent px-5 py-5 text-[16px] font-bold leading-snug text-black outline-none placeholder:text-black/40 font-(family-name:--font-casual)"
            style={{ minHeight: 180 }}
          />
        </div>

        {/* Block search + count hint */}
        <div className="flex items-baseline justify-between">
          <span className="text-[16px] font-bold text-black">Blocks</span>
          <span className="text-[12px] font-bold text-black/40">
            {filteredBlocks.length} / {EMOTION_LIST.length}
          </span>
        </div>
        <div className="relative h-[44px] w-full">
          <img
            alt=""
            src="/assets/manual-search.svg"
            className="pointer-events-none absolute inset-0 block h-full w-full"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t("create.placeholder_search_blocks")}
            className="absolute inset-0 bg-transparent pl-[44px] pr-3 text-[16px] font-bold text-black outline-none placeholder:text-black/35 font-(family-name:--font-casual)"
          />
        </div>

        {/* 3-col emotion grid — tap to add to canvas. (Desktop uses
            drag-drop too; the click path also exists there and is the
            only one that works reliably across touch devices.) */}
        {filteredBlocks.length === 0 ? (
          <div className="py-8 text-center text-[14px] text-black/40">
            No results
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-2">
            {filteredBlocks.map((emotion) => (
              <button
                key={emotion.key}
                type="button"
                onClick={() =>
                  canvasHandle.current?.addBlock(
                    emotion.key,
                    emotion.imagePath,
                  )
                }
                className="flex flex-col items-center gap-1 bg-transparent p-2 transition-transform active:scale-95"
              >
                <img
                  src={emotion.imagePath}
                  alt={emotionName(emotion.key, lang)}
                  className="block h-[64px] w-[64px] select-none object-contain"
                  draggable={false}
                />
                <span className="block w-full truncate text-center text-[12px] font-bold leading-tight text-black">
                  {emotionName(emotion.key, lang)}
                </span>
              </button>
            ))}
          </div>
        )}

        {/* Creature preview — only shows after Generate (or when editing
            an existing creature loaded from ?edit=<id>). */}
        {creature && (
          <div className="aspect-square w-full overflow-hidden">
            <CreatureCanvas creature={creature} blockSize={120} padding={6} />
          </div>
        )}

        {/* Action row: Generate / Upload / Delete (or Uploaded + go-to-
            ecosystem after a successful upload). Same hand-drawn SVGs as
            every other mobile page so the visual language is consistent. */}
        <div className="flex h-12 items-stretch gap-2">
          <button
            type="button"
            onClick={handleGenerate}
            className="relative block h-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
            style={{ flexBasis: "30%" }}
          >
            <img
              alt=""
              src="/assets/generate-button.svg"
              className="absolute inset-0 block size-full"
            />
            <span className="absolute inset-0 flex items-center justify-center text-[16px] font-bold leading-none text-black">
              {t("create.generate")}
            </span>
          </button>
          {uploadStatus === "uploaded" ? (
            <>
              <button
                type="button"
                disabled
                className="relative block h-full cursor-default overflow-visible bg-transparent p-0"
                style={{ flexBasis: "45%" }}
              >
                <img
                  alt=""
                  src="/assets/uploaded-box.svg"
                  className="absolute inset-0 block size-full"
                />
                <span
                  className="absolute flex items-center justify-center text-center text-[16px] font-bold leading-[normal] text-black"
                  style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
                >
                  {t("create.uploaded")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!creature?.id) return;
                  router.push(`/?focus=${encodeURIComponent(creature.id)}`);
                }}
                aria-label={t("create.go_to_ecosystem")}
                className="flex h-full cursor-pointer items-center justify-center bg-transparent p-0 transition-transform active:scale-95"
                style={{ flexBasis: "25%" }}
              >
                <img
                  alt=""
                  src="/assets/go-to-ecosystem.svg"
                  className="block h-7 w-7"
                />
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleUpload}
                disabled={!name.trim()}
                className={`relative block h-full overflow-visible bg-transparent p-0 transition-transform ${
                  name.trim()
                    ? "cursor-pointer active:scale-95"
                    : "cursor-not-allowed opacity-40"
                }`}
                style={{ flexBasis: "45%" }}
              >
                <img
                  alt=""
                  src="/assets/upload-box.svg"
                  className="absolute inset-0 block size-full"
                />
                <span
                  className="absolute flex items-center justify-center text-center text-[16px] font-bold leading-[normal] text-black"
                  style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
                >
                  {t("create.upload")}
                </span>
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="relative block h-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
                style={{ flexBasis: "25%" }}
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
                  className="absolute m-0 text-center text-[16px] font-bold leading-[normal] text-black"
                  style={{ inset: "12.2% 0 0 0" }}
                >
                  {t("create.delete")}
                </p>
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
