"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractEmotions } from "@/lib/emotions";
import { generateCreature, emotionByKey, randomCreatureName, type CreatureSpec } from "@/lib/creature";
import { uploadCreature, findCreatureById, deleteCreatureById } from "@/lib/ecosystem";
import { playCreatureGiggle } from "@/lib/audio";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import DatePicker from "@/app/_components/DatePicker";

const MONTHS_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function fromISO(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export default function CreatePage() {
  // useSearchParams requires a Suspense boundary for App Router static gen.
  return (
    <Suspense fallback={null}>
      <CreatePageInner />
    </Suspense>
  );
}

function CreatePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [journalText, setJournalText] = useState("");
  const [creature, setCreature] = useState<CreatureSpec | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploaded">("idle");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  // Tracks the creature id we're editing so Upload replaces it instead of
  // creating a new entry. null = new creation.
  const [editingId, setEditingId] = useState<string | null>(null);
  // User-editable creature name. Auto-filled when a creature is generated;
  // restored from existing creature when editing; freely overrideable.
  const [name, setName] = useState("");
  // Ref to the textarea so we can read its current value directly. Working
  // around React 19/Next 15 cases where controlled-input state can lag.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // On mount, hydrate state from ?edit=<id> if present.
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

  const dateLabel = `${selectedDate.getFullYear()} ${MONTHS_FULL[selectedDate.getMonth()]} ${selectedDate.getDate()}`;
  // Figma date text is 32px (24:241). Auto-shrink for long dates so they
  // never extend past the 265px span into the ▽ button.
  const dateFontSize =
    dateLabel.length <= 14 ? 32 : Math.max(22, Math.floor((32 * 14) / dateLabel.length));

  // Reads the current journal text from the DOM ref, falling back to React
  // state. This is robust against any controlled-input timing quirks.
  const currentJournalText = () =>
    (textareaRef.current?.value ?? journalText).trim();

  const handleGenerate = () => {
    const text = currentJournalText();
    if (!text) {
      alert("Please write your journal entry first.");
      return;
    }
    const scores = extractEmotions(text, 3);
    const c = generateCreature(scores);
    if (editingId) c.id = editingId;
    setCreature(c);
    // Name is NOT auto-filled — the user has to type one before upload.
    setUploadStatus("idle");
    // Play the assembled "giggle" so the user hears the creature the moment
    // it comes into being. Fire-and-forget — failures inside the audio
    // module degrade silently (no audio just means no audio).
    playCreatureGiggle(c.blocks);
  };

  const handleUpload = () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      alert("Please give your creature a name first.");
      return;
    }
    const text = currentJournalText();
    // One-click flow: if the user hasn't clicked Generate yet, build the
    // creature now from the journal text.
    let toUpload = creature;
    if (!toUpload) {
      if (!text) {
        alert("Please write your journal entry first.");
        return;
      }
      const scores = extractEmotions(text, 3);
      toUpload = generateCreature(scores);
      if (editingId) toUpload.id = editingId;
      setCreature(toUpload);
      // One-click flow generated this creature for the first time — give it
      // its giggle. (Already handled by handleGenerate when the user
      // followed the two-step path, so we only play it on the synthesize-
      // here branch.)
      playCreatureGiggle(toUpload.blocks);
    }

    const enriched: CreatureSpec = {
      ...toUpload,
      name: trimmedName,
      journalText: text,
      dateISO: toISO(selectedDate),
      source: "generate",
    };
    uploadCreature(enriched);
    setUploadStatus("uploaded");
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
      <div className="absolute left-[27px] top-[45px] h-[48px] w-[104px]">
        <img
          alt=""
          src="/assets/create-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        Create
      </span>
      <Link
        href="/calender"
        className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        Calendar
      </Link>
      <Link
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        BokBokpedia
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

      {/* Sub-nav: Generate | Manually */}
      <div className="absolute left-[31px] top-[90px] h-[38px] w-[227px] overflow-hidden">
        <div className="absolute" style={{ inset: "91.86% 0.61% 1.27% 0.03%" }}>
          <div className="absolute" style={{ inset: "-19.15% 0" }}>
            <img alt="" src="/assets/subnav-bottom.svg" className="block size-full max-w-none" />
          </div>
        </div>
        <div className="absolute" style={{ inset: "5.26% 0.49% 5.26% 99.01%" }}>
          <div className="absolute" style={{ inset: "0 -44.71% -1.43% -44.71%" }}>
            <img alt="" src="/assets/subnav-left.svg" className="block size-full max-w-none" />
          </div>
        </div>
        <div className="absolute" style={{ inset: "0 50.28% 8.17% 48.44%" }}>
          <div className="absolute" style={{ inset: "0 -17.19%" }}>
            <img alt="" src="/assets/subnav-divider.svg" className="block size-full max-w-none" />
          </div>
        </div>
        <Link
          href="/create"
          className="absolute flex cursor-pointer flex-col justify-center text-center text-[24px] font-bold leading-none text-black"
          style={{ inset: "-2.63% 43.94% 7.89% -7.49%" }}
        >
          Generate
        </Link>
        <Link
          href="/create/manually"
          className="absolute flex cursor-pointer flex-col justify-center text-center text-[24px] font-bold leading-none text-black"
          style={{ inset: "-2.63% -6.28% 7.89% 42.73%" }}
        >
          Manually
        </Link>
      </div>

      {/* Main canvas box */}
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* "Journal for:" label — Figma position (x=432 y=186 w=164 h=30) */}
      <span className="absolute left-[432px] top-[186px] flex h-[30px] w-[164px] flex-col justify-center text-center text-[24px] font-bold leading-[normal] text-black">
        Journal for:
      </span>

      {/* Date row — text + ▽ button laid out as a flex group so the button
          always sits right next to the text. The whole group is centered in
          the same 265-px slot the text used to occupy alone; the row's gap
          (~8 px) is what the user sees between the date and the ▽ icon.
          Font auto-shrinks (dateFontSize) so the row never overflows the
          slot — that's how we keep the button from being pushed under the
          text or past the slot edge for very long dates like
          "2026 September 30". */}
      <div className="absolute left-[381px] top-[210px] flex h-[51px] w-[265px] items-center justify-center gap-[8px] overflow-hidden whitespace-nowrap">
        <span
          className="font-bold leading-[normal] tracking-tight text-black"
          style={{ fontSize: `${dateFontSize}px` }}
        >
          {dateLabel}
        </span>
        <button
          type="button"
          onClick={() => setPickerOpen((v) => !v)}
          aria-expanded={pickerOpen}
          className="z-[10] block h-[17.08px] w-[17.49px] shrink-0 cursor-pointer bg-transparent p-0 transition-transform active:scale-90"
        >
          <img
            alt="pick date"
            src="/assets/date-button.svg"
            className="block size-full"
          />
        </button>
      </div>

      {/* Date picker popup */}
      {pickerOpen && (
        <div className="absolute left-[381px] top-[260px] z-[300]">
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      {/* Text box (journal area background) */}
      <div className="pointer-events-none absolute left-[252px] top-[283px] h-[394px] w-[524px]">
        <img
          alt=""
          src="/assets/text-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* Editable journal textarea inside the text box */}
      <textarea
        ref={textareaRef}
        value={journalText}
        onChange={(e) => setJournalText(e.target.value)}
        placeholder="What happened today? Describe events and feelings…"
        spellCheck={false}
        className="absolute left-[272px] top-[297px] block h-[371px] w-[482px] resize-none overflow-y-auto bg-transparent text-[20px] font-bold leading-normal text-black outline-none placeholder:text-black/40 font-(family-name:--font-casual)"
      />

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        className="absolute left-[454px] top-[699px] block h-[31px] w-[120px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
      >
        <img
          alt=""
          src="/assets/generate-button.svg"
          className="absolute inset-0 block size-full"
        />
        <span className="absolute inset-0 flex items-center justify-center text-[24px] font-bold leading-none text-black">
          Generate
        </span>
      </button>

      {/* Cancel button (edit mode only). In NEW mode the left slot is
          empty — there's nothing to cancel when you're starting fresh.
          Width 78 fits the 6-letter label inside the hand-drawn outline. */}
      {editingId && (
        <button
          type="button"
          onClick={() => {
            // Cancel — leave the store untouched, navigate home.
            router.push("/");
          }}
          className="absolute left-[824px] top-[829px] block h-[30.83px] w-[78px] cursor-pointer overflow-visible bg-transparent p-0"
        >
          <img
            alt=""
            src="/assets/edit-vector.svg"
            className="absolute inset-0 block size-full"
          />
          <span className="absolute inset-0 flex items-center justify-center text-[20px] font-bold leading-none text-black">
            Cancel
          </span>
        </button>
      )}

      {/* Right button — "Delete" in both modes.
            • NEW mode  → resets the whole in-progress draft (journal
              textarea, creature name, generated creature preview, date
              back to today, and upload status).
            • EDIT mode → removes the creature being edited from the
              ecosystem and routes back home. */}
      <button
        type="button"
        onClick={() => {
          if (editingId) {
            // Edit-mode delete — remove the creature, then leave.
            // Fire-and-forget: the navigation doesn't depend on the
            // network round-trip, and the store re-syncs on the next
            // ecosystem subscription tick.
            void deleteCreatureById(editingId);
            router.push("/");
            return;
          }
          // New-mode delete = full reset of everything the user has
          // been working on: journal text (state + DOM ref in case the
          // controlled value lagged), name, generated creature preview,
          // upload status, and the date back to today.
          setJournalText("");
          if (textareaRef.current) textareaRef.current.value = "";
          setCreature(null);
          setName("");
          setUploadStatus("idle");
          setSelectedDate(new Date());
        }}
        className="absolute left-[904.19px] top-[827px] block h-[40.58px] w-[88.56px] cursor-pointer overflow-visible bg-transparent p-0"
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

      {/* Upload to Ecosystem / Uploaded button. After successful upload the
          button swaps to the narrower Figma "Uploaded" variant (2065:53). */}
      {uploadStatus === "uploaded" ? (
        <>
          <button
            type="button"
            disabled
            className="absolute left-[1158px] top-[433px] block h-[27px] w-[112px] cursor-default overflow-visible bg-transparent p-0"
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
              Uploaded
            </span>
          </button>
          {/* Go to Ecosystem (Figma 2130:299) — appears once uploaded. Sends
              the user back to the main page with ?focus=<id> so the camera
              zooms straight onto the new creature. */}
          <button
            type="button"
            onClick={() => {
              if (!creature?.id) return;
              router.push(`/?focus=${encodeURIComponent(creature.id)}`);
            }}
            title="Go to ecosystem"
            className="absolute left-[1277px] top-[436px] block h-[23px] w-[22px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:scale-110 active:scale-95"
          >
            <img
              alt="Go to ecosystem"
              src="/assets/go-to-ecosystem.svg"
              className="block size-full"
              style={{ transform: "scale(1.045)", transformOrigin: "center" }}
            />
          </button>
        </>
      ) : (
        <button
          type="button"
          onClick={handleUpload}
          disabled={!name.trim()}
          title={!name.trim() ? "Give your creature a name first" : undefined}
          className={`absolute left-[1104px] top-[433px] block h-[27px] w-[227px] overflow-visible bg-transparent p-0 transition-transform ${
            name.trim()
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <img
            alt=""
            src="/assets/upload-box.svg"
            className="absolute inset-0 block size-full"
          />
          <span
            className="absolute flex items-center justify-center text-center text-[24px] font-bold leading-[normal] text-black"
            style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
          >
            Upload to Ecosystem
          </span>
        </button>
      )}

      {/* Creature view (top right) — SVG outline behind, creature canvas inside.
          The container is `pointer-events-none` so the Upload button below
          (which sits inside this container's bbox y range) stays clickable. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        {/* pointer-events-auto re-enables hit-testing on just the canvas
            area inside the (pointer-events-none) frame so the drag-to-
            rotate gesture on CreatureCanvas actually receives events. */}
        <div className="pointer-events-auto absolute left-[20px] right-[20px] top-[20px] bottom-[56px]">
          <CreatureCanvas creature={creature} blockSize={140} padding={8} />
        </div>
      </div>

      {/* Info panel (bottom right) — emotion list when creature exists.
          Two-vector outline matches Figma 2006:75 (box + left squiggly line). */}
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

        {/* Creature name — auto-filled with a whimsical random name on
            generate; click to rewrite it before uploading. */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="absolute left-1/2 top-[15px] block h-[44px] w-[300px] -translate-x-1/2 bg-transparent text-center text-[36px] leading-normal text-black outline-none placeholder:text-black/35 font-(family-name:--font-fancy)"
        />
        <span className="absolute left-1/2 top-[57px] -translate-x-1/2 text-center text-[18px] font-bold text-black">
          {creature
            ? `${creature.emotions.length} emotions · ${creature.blocks.length} blocks`
            : "2026-05-01"}
        </span>

        {/* Emotion list — fills the same scroll region as the original diary block */}
        {creature && (
          <div className="scroll-fade-vertical absolute left-[26px] right-[18px] top-[96px] bottom-[60px] overflow-y-auto overflow-x-hidden">
            <ul className="flex flex-col gap-[10px] text-[18px] font-bold leading-tight text-black">
              {creature.emotions.map(({ key, displayName, score }) => {
                const e = emotionByKey(key);
                return (
                  <li key={key} className="flex items-center gap-[10px]">
                    <img
                      alt=""
                      src={e?.imagePath}
                      className="block h-[28px] w-[28px] flex-none rounded-full object-cover"
                    />
                    <span className="flex-1">{displayName}</span>
                    {/* Only show the keyword-match count when the emotion was
                        matched 2+ times — a "×1" badge for single matches is
                        noise. */}
                    {score >= 2 && (
                      <span className="text-[14px] text-black/60">×{Math.round(score)}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
