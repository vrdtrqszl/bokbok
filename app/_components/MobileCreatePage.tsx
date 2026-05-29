"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import MobileTopBar from "./MobileTopBar";
import CreatureCanvas from "./CreatureCanvas";
import { extractEmotions } from "@/lib/emotions";
import {
  generateCreature,
  emotionByKey,
  type CreatureSpec,
} from "@/lib/creature";
import {
  uploadCreature,
  findCreatureById,
  deleteCreatureById,
} from "@/lib/ecosystem";
import { playCreatureGiggle } from "@/lib/audio";
import { useT } from "@/lib/i18n";

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/**
 * Mobile /create — "generate from journal" flow.
 *
 * Desktop has a 524-px wide journal textarea in the center, a custom
 * hand-drawn date picker popup, the Generate button below the textarea,
 * a creature preview canvas on the right with name input + emotion list,
 * and the Upload button alongside.
 *
 * Mobile collapses to a single vertical column:
 *   1. MobileTopBar (active=create)
 *   2. Date picker (native <input type="date"> — much better mobile UX
 *      than rebuilding the desktop popup at phone scale)
 *   3. Journal textarea (full-width, autosized)
 *   4. Generate button
 *   5. Creature preview (square aspect)
 *   6. Name input
 *   7. Emotion list
 *   8. Upload / Uploaded + Reset/Delete action row
 *
 * Wrapped in Suspense for useSearchParams (?edit=<id>) — mirrors desktop.
 */
export default function MobileCreatePage() {
  return (
    <Suspense fallback={null}>
      <MobileCreateInner />
    </Suspense>
  );
}

function MobileCreateInner() {
  const router = useRouter();
  const t = useT();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [journalText, setJournalText] = useState("");
  const [creature, setCreature] = useState<CreatureSpec | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploaded">("idle");
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hydrate from ?edit=<id> — identical to desktop.
  useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    findCreatureById(editId).then((existing) => {
      if (cancelled || !existing) return;
      setEditingId(existing.id);
      setCreature(existing);
      if (existing.journalText) setJournalText(existing.journalText);
      if (existing.dateISO) setSelectedDate(fromISO(existing.dateISO));
      if (existing.name) setName(existing.name);
    });
    return () => {
      cancelled = true;
    };
  }, [editId]);

  const currentJournalText = () =>
    (textareaRef.current?.value ?? journalText).trim();

  const handleGenerate = () => {
    const text = currentJournalText();
    if (!text) {
      alert(t("create.alert_write_journal"));
      return;
    }
    const scores = extractEmotions(text, 3);
    const c = generateCreature(scores);
    if (editingId) c.id = editingId;
    setCreature(c);
    setUploadStatus("idle");
    playCreatureGiggle(c.blocks);
  };

  const handleUpload = async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert(t("create.alert_creature_name"));
      return;
    }
    const text = currentJournalText();
    let toUpload = creature;
    if (!toUpload) {
      if (!text) {
        alert(t("create.alert_write_journal"));
        return;
      }
      const scores = extractEmotions(text, 3);
      toUpload = generateCreature(scores);
      if (editingId) toUpload.id = editingId;
      setCreature(toUpload);
      playCreatureGiggle(toUpload.blocks);
    }
    const enriched: CreatureSpec = {
      ...toUpload,
      name: trimmedName,
      journalText: text,
      dateISO: toISO(selectedDate),
      source: "generate",
    };
    // AWAIT — see desktop create page for why this matters.
    await uploadCreature(enriched);
    setUploadStatus("uploaded");
    // EDIT-mode shortcut: navigate straight back to the main 3D world
    // with the camera zoomed onto the edited creature. Mirrors desktop.
    if (editingId) {
      router.push(`/?focus=${encodeURIComponent(enriched.id)}`);
    }
  };

  const handleReset = () => {
    if (editingId) {
      void deleteCreatureById(editingId);
      router.push("/");
      return;
    }
    setJournalText("");
    if (textareaRef.current) textareaRef.current.value = "";
    setCreature(null);
    setName("");
    setUploadStatus("idle");
    setSelectedDate(new Date());
  };

  return (
    <div className="relative min-h-screen w-full font-(family-name:--font-casual)">
      <MobileTopBar active="create" />

      <main className="mx-auto flex max-w-[520px] flex-col gap-5 px-4 pb-12 pt-5">
        {/* Sub-nav: Generate (active) | Manually */}
        <div className="flex items-center justify-center gap-6 text-[18px] font-bold">
          <span className="border-b-2 border-black pb-1 text-black">
            {t("create.generate")}
          </span>
          <Link
            href="/create/manually"
            className="cursor-pointer pb-1 text-black/50"
          >
            {t("create.manually")}
          </Link>
        </div>

        {/* Date picker — native input on mobile. iOS/Android both have
            great built-in date pickers that beat a custom popup for thumb
            navigation. value/onChange marshaled through Date objects so
            the rest of the flow matches desktop. */}
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

        {/* Journal textarea — hand-drawn text-box.svg as the background
            so the box matches desktop. The textarea itself sits absolutely
            inside the wrapper with comfortable padding. */}
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
            rows={8}
            className="relative block w-full resize-none bg-transparent px-5 py-5 text-[16px] font-bold leading-snug text-black outline-none placeholder:text-black/40 font-(family-name:--font-casual)"
            style={{ minHeight: 220 }}
          />
        </div>

        {/* Generate button — hand-drawn generate-button.svg */}
        <button
          type="button"
          onClick={handleGenerate}
          className="relative mx-auto block h-[40px] w-[150px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
        >
          <img
            alt=""
            src="/assets/generate-button.svg"
            className="absolute inset-0 block size-full"
          />
          <span className="absolute inset-0 flex items-center justify-center text-[20px] font-bold leading-none text-black">
            {t("create.generate")}
          </span>
        </button>

        {/* Creature preview — square canvas, only when a creature exists
            (or when editing — same behaviour as desktop's right panel). */}
        {creature && (
          <div className="aspect-square w-full overflow-hidden">
            <CreatureCanvas creature={creature} blockSize={120} padding={6} />
          </div>
        )}

        {/* Name input (Fancy font, centered — matches desktop info panel) */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t("create.placeholder_name")}
          className="block w-full bg-transparent text-center text-[28px] leading-none text-black outline-none placeholder:text-black/35 font-(family-name:--font-fancy)"
        />

        {/* Emotion list — same row layout as desktop's info-panel scroll. */}
        {creature && creature.emotions.length > 0 && (
          <ul className="m-0 flex flex-col gap-2 p-0 text-[15px] font-bold leading-tight text-black">
            {creature.emotions.map(({ key, displayName, score }) => {
              const e = emotionByKey(key);
              return (
                <li key={key} className="flex items-center gap-3">
                  <img
                    alt=""
                    src={e?.imagePath}
                    className="block h-7 w-7 flex-none rounded-full object-cover"
                  />
                  <span className="flex-1">{displayName}</span>
                  {score >= 2 && (
                    <span className="text-[12px] text-black/60">
                      ×{Math.round(score)}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* Action row — Upload (or Uploaded + go-to-ecosystem) + Reset/Delete */}
        <div className="flex h-12 items-stretch gap-2">
          {uploadStatus === "uploaded" ? (
            <>
              <button
                type="button"
                disabled
                className="relative block h-full cursor-default overflow-visible bg-transparent p-0"
                style={{ flexBasis: "70%" }}
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
                  {t("create.uploaded")}
                </span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (!creature?.id) return;
                  router.push(`/?focus=${encodeURIComponent(creature.id)}`);
                }}
                title={t("create.go_to_ecosystem")}
                aria-label={t("create.go_to_ecosystem")}
                className="flex h-full cursor-pointer items-center justify-center bg-transparent p-0 transition-transform active:scale-95"
                style={{ flexBasis: "30%" }}
              >
                <img
                  alt=""
                  src="/assets/go-to-ecosystem.svg"
                  className="block h-7 w-7"
                />
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={handleUpload}
              disabled={!name.trim()}
              className={`relative block h-full overflow-visible bg-transparent p-0 transition-transform ${
                name.trim()
                  ? "cursor-pointer active:scale-95"
                  : "cursor-not-allowed opacity-40"
              }`}
              style={{ flexBasis: "70%" }}
            >
              <img
                alt=""
                src="/assets/upload-box.svg"
                className="absolute inset-0 block size-full"
              />
              <span
                className="absolute flex items-center justify-center text-center text-[18px] font-bold leading-[normal] text-black"
                style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
              >
                {t("create.upload")}
              </span>
            </button>
          )}
          {/* Reset / Delete — uses delete-vector.svg, same nested inset
              pattern as desktop. */}
          <button
            type="button"
            onClick={handleReset}
            className="relative block h-full cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
            style={{ flexBasis: uploadStatus === "uploaded" ? "30%" : "30%" }}
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
              {editingId ? t("create.delete") : t("create.delete")}
            </p>
          </button>
        </div>
      </main>
    </div>
  );
}
