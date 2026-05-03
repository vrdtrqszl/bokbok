"use client";

import Link from "next/link";
import { Suspense, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { extractEmotions } from "@/lib/emotions";
import { generateCreature, emotionByKey, randomCreatureName, type CreatureSpec } from "@/lib/creature";
import { uploadCreature, findCreatureById } from "@/lib/ecosystem";
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
    const existing = findCreatureById(editId);
    if (!existing) return;
    setEditingId(existing.id);
    setCreature(existing);
    if (existing.journalText) setJournalText(existing.journalText);
    if (existing.dateISO) setSelectedDate(fromISO(existing.dateISO));
    if (existing.name) setName(existing.name);
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
    const scores = extractEmotions(text, 5);
    const c = generateCreature(scores);
    if (editingId) c.id = editingId;
    setCreature(c);
    // Auto-fill a whimsical random name; the user can rewrite it before upload.
    setName(randomCreatureName(c.emotions[0]?.displayName));
    setUploadStatus("idle");
  };

  const handleUpload = () => {
    const text = currentJournalText();
    // One-click flow: if the user hasn't clicked Generate yet, build the
    // creature now from the journal text.
    let toUpload = creature;
    if (!toUpload) {
      if (!text) {
        alert("Please write your journal entry first.");
        return;
      }
      const scores = extractEmotions(text, 5);
      toUpload = generateCreature(scores);
      if (editingId) toUpload.id = editingId;
      setCreature(toUpload);
    }

    const dominant = toUpload.emotions[0]?.displayName;
    // Use the (possibly user-edited) name; if blank, fall back to a random one.
    const finalName =
      name.trim() || randomCreatureName(dominant) || "Creature";
    const enriched: CreatureSpec = {
      ...toUpload,
      name: finalName,
      journalText: text,
      dateISO: toISO(selectedDate),
      source: "generate",
    };
    uploadCreature(enriched);
    setUploadStatus("uploaded");
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

      {/* Login icon */}
      <div className="absolute left-[1381px] top-[40px] h-[35.67px] w-[24.91px]">
        <img alt="login" src="/assets/login.svg" className="block size-full" />
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

      {/* Date display — Figma 24:241 (x=381 y=210 w=265 h=51, text-[32px]).
          Font auto-shrinks for long dates so they never reach the ▽ button. */}
      <span
        className="absolute left-[381px] top-[210px] flex h-[51px] w-[265px] flex-col justify-center overflow-hidden whitespace-nowrap text-center font-bold leading-[normal] tracking-tight text-black"
        style={{ fontSize: `${dateFontSize}px` }}
      >
        {dateLabel}
      </span>

      {/* Date dropdown ▽ — Figma position (x=634 y=231 w=17.49 h=17.08) */}
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-expanded={pickerOpen}
        className="absolute left-[634px] top-[231px] z-[10] block h-[17.08px] w-[17.49px] cursor-pointer bg-transparent p-0 transition-transform active:scale-90"
      >
        <img
          alt="pick date"
          src="/assets/date-button.svg"
          className="absolute inset-0 block size-full"
        />
      </button>

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

      {/* Edit button (bottom of main area) */}
      <button
        type="button"
        className="absolute left-[853px] top-[829px] block h-[30.83px] w-[49.41px] cursor-pointer overflow-visible bg-transparent p-0"
      >
        <img
          alt=""
          src="/assets/edit-vector.svg"
          className="absolute inset-0 block size-full"
        />
        <span className="absolute inset-0 flex items-center justify-center text-[20px] font-bold leading-none text-black">
          Edit
        </span>
      </button>

      {/* Delete (new mode) / Done (edit mode) button. In edit mode "Done"
          first commits any pending edits (date / journal text changes) to
          the ecosystem, then routes back to the home page. */}
      <button
        type="button"
        onClick={() => {
          if (editingId) {
            // Persist current state (which may include a new date, edited
            // journal text, or renamed creature) — replaces in place by id.
            if (creature) {
              const text = currentJournalText();
              const dominant = creature.emotions[0]?.displayName;
              const finalName =
                name.trim() || creature.name || randomCreatureName(dominant) || "Creature";
              uploadCreature({
                ...creature,
                name: finalName,
                journalText: text,
                dateISO: toISO(selectedDate),
                source: creature.source ?? "generate",
              });
            }
            router.push("/");
            return;
          }
          setCreature(null);
          setName("");
          setUploadStatus("idle");
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
          {editingId ? "Done" : "Delete"}
        </p>
      </button>

      {/* Upload to Ecosystem / Uploaded button. After successful upload the
          button swaps to the narrower Figma "Uploaded" variant (2065:53). */}
      {uploadStatus === "uploaded" ? (
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
      ) : (
        <button
          type="button"
          onClick={handleUpload}
          className="absolute left-[1104px] top-[433px] block h-[27px] w-[227px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
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
        <div className="absolute left-[20px] right-[20px] top-[20px] bottom-[56px]">
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
          <div className="absolute left-[26px] right-[18px] top-[96px] bottom-[60px] overflow-y-auto overflow-x-hidden">
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
                    {score > 0.5 && (
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
