"use client";

import Link from "next/link";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { EMOTION_LIST } from "@/lib/emotions";
import { uploadCreature, findCreatureById } from "@/lib/ecosystem";
import { emotionByKey, randomCreatureName, type CreatureSpec } from "@/lib/creature";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import ManualCanvas, { type ManualCanvasHandle } from "@/app/_components/ManualCanvas";
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

export default function CreateManuallyPage() {
  return (
    <Suspense fallback={null}>
      <CreateManuallyPageInner />
    </Suspense>
  );
}

function CreateManuallyPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const editId = searchParams.get("edit");

  const [creature, setCreature] = useState<CreatureSpec | null>(null);
  const [uploadStatus, setUploadStatus] = useState<"idle" | "uploaded">("idle");
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState<Date>(() => new Date());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [journalText, setJournalText] = useState("");
  // User-editable creature name. Auto-filled on Generate; restored on edit.
  const [name, setName] = useState("");
  const canvasHandle = useRef<ManualCanvasHandle | null>(null);
  // Ref to the journal textarea — read DOM value directly to bypass any
  // controlled-input state-sync timing issues.
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Hydrate state + canvas from ?edit=<id> on mount.
  useEffect(() => {
    if (!editId) return;
    const existing = findCreatureById(editId);
    if (!existing) return;
    setEditingId(existing.id);
    setCreature(existing);
    if (existing.dateISO) setSelectedDate(fromISO(existing.dateISO));
    if (existing.journalText) setJournalText(existing.journalText);
    if (existing.name) setName(existing.name);
    // Wait a tick so the canvas mounts before we hand it blocks.
    requestAnimationFrame(() => {
      canvasHandle.current?.loadCreature(existing.blocks);
    });
  }, [editId]);

  const dateLabel = `${selectedDate.getFullYear()} ${MONTHS_FULL[selectedDate.getMonth()]} ${selectedDate.getDate()}`;
  // Figma date text is 32px (24:241). Long months like "September" can push
  // text past the 265px span and overlap the ▽ button — shrink for those.
  const dateFontSize =
    dateLabel.length <= 14 ? 32 : Math.max(22, Math.floor((32 * 14) / dateLabel.length));

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
      alert("Please add at least one block to the canvas first.");
      return;
    }
    // Preserve id when editing so the upload replaces in place.
    if (editingId) spec.id = editingId;
    setCreature(spec);
    setName(randomCreatureName(spec.emotions[0]?.displayName));
    setUploadStatus("idle");
  };

  const handleUpload = () => {
    // One-click flow: if the user hasn't clicked Generate yet, build the
    // creature from whatever's currently on the canvas.
    let toUpload = creature;
    if (!toUpload) {
      const spec = canvasHandle.current?.toCreatureSpec();
      if (!spec) {
        alert("Please add at least one block to the canvas first.");
        return;
      }
      if (editingId) spec.id = editingId;
      toUpload = spec;
      setCreature(spec);
    }

    // Read the latest journal text from DOM to bypass state-sync timing issues
    const currentText = (textareaRef.current?.value ?? journalText).trim();

    const dominant = toUpload.emotions[0]?.displayName;
    const finalName =
      name.trim() || randomCreatureName(dominant) || "Creature";
    const enriched: CreatureSpec = {
      ...toUpload,
      name: finalName,
      journalText: currentText,
      dateISO: toISO(selectedDate),
      source: "manually",
    };
    uploadCreature(enriched);
    setUploadStatus("uploaded");
  };

  const handleDelete = () => {
    canvasHandle.current?.clear();
    setCreature(null);
    setName("");
    setUploadStatus("idle");
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

      {/* Sub-nav: Generate | Manually (Manually active) */}
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

      {/* Main canvas box (decorative outline) */}
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* ── Left: interactive drawing canvas ─────────────────────────────── */}
      <div className="absolute left-[55px] top-[185px] h-[590px] w-[592px]">
        {/* Hand-drawn border overlay */}
        <img
          alt=""
          src="/assets/create-manual-box.svg"
          className="pointer-events-none absolute inset-0 z-10 block size-full"
        />
        {/* Interactive canvas inset from border */}
        <div className="absolute inset-[18px] z-0">
          <ManualCanvas handleRef={canvasHandle} />
        </div>
      </div>

      {/* ── Center-right: Journal display ─────────────────────────────────── */}

      {/* "Journal for:" label — Figma 24:242 (x=726 y=186 w=164 h=30) */}
      <span className="absolute left-[726px] top-[186px] flex h-[30px] w-[164px] flex-col justify-center text-center text-[24px] font-bold leading-[normal] text-black">
        Journal for:
      </span>

      {/* Date display — Figma 24:241 (x=675 y=210 w=265 h=51, text-[32px]).
          Font auto-shrinks for unusually long dates so the text never
          extends past the 265px span into the ▽ button. */}
      <span
        className="absolute left-[675px] top-[210px] flex h-[51px] w-[265px] flex-col justify-center overflow-hidden whitespace-nowrap text-center font-bold leading-[normal] tracking-tight text-black"
        style={{ fontSize: `${dateFontSize}px` }}
      >
        {dateLabel}
      </span>

      {/* Date dropdown ▽ — Figma 24:243 (x=928 y=231 w=17.49 h=17.08) */}
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        aria-expanded={pickerOpen}
        className="absolute left-[928px] top-[231px] z-[10] block h-[17.08px] w-[17.49px] cursor-pointer bg-transparent p-0 transition-transform active:scale-90"
      >
        <img
          alt="pick date"
          src="/assets/date-button.svg"
          className="absolute inset-0 block size-full"
        />
      </button>

      {/* Date picker popup */}
      {pickerOpen && (
        <div className="absolute left-[675px] top-[260px] z-[300]">
          <DatePicker
            value={selectedDate}
            onChange={setSelectedDate}
            onClose={() => setPickerOpen(false)}
          />
        </div>
      )}

      {/* Right text box (4-piece outline) — journal entry for the selected date */}
      <div className="absolute left-[662px] top-[281px] h-[493px] w-[303px]">
        {/* Bottom edge */}
        <div className="absolute" style={{ inset: "99.76% 2.44% 0 0" }}>
          <div className="absolute" style={{ inset: "-41.41% 0" }}>
            <img alt="" src="/assets/text-box-m-v1.svg" className="block size-full max-w-none" />
          </div>
        </div>
        {/* Left edge */}
        <div className="absolute" style={{ inset: "1.27% 98.76% 0.24% 0.17%" }}>
          <div className="absolute" style={{ inset: "0 -15.46%" }}>
            <img alt="" src="/assets/text-box-m-v2.svg" className="block size-full max-w-none" />
          </div>
        </div>
        {/* Top edge */}
        <div className="absolute" style={{ inset: "0 0 98.91% 0.76%" }}>
          <div className="absolute" style={{ inset: "-9.29% 0" }}>
            <img alt="" src="/assets/text-box-m-v3.svg" className="block size-full max-w-none" />
          </div>
        </div>
        {/* Right edge */}
        <div className="absolute" style={{ inset: "0.4% 0.68% 0.24% 97.62%" }}>
          <div className="absolute" style={{ inset: "0 -9.72%" }}>
            <img alt="" src="/assets/text-box-m-v4.svg" className="block size-full max-w-none" />
          </div>
        </div>

        {/* Editable journal textarea — same scroll region as the original
            static text. Stored in journalText and uploaded with the creature. */}
        <textarea
          ref={textareaRef}
          value={journalText}
          onChange={(e) => setJournalText(e.target.value)}
          placeholder="What happened today? Describe events and feelings…"
          spellCheck={false}
          className="absolute left-[7px] top-[10px] block h-[473px] w-[289px] resize-none overflow-y-auto bg-transparent text-[20px] font-bold leading-normal text-black outline-none placeholder:text-black/40 font-(family-name:--font-casual)"
        />
      </div>

      {/* ── Bottom controls ───────────────────────────────────────────────── */}

      {/* Generate button */}
      <button
        type="button"
        onClick={handleGenerate}
        className="absolute left-[754px] top-[786px] block h-[31px] w-[120px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95"
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

      {/* Edit button */}
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
          commits the latest state (date / journal / canvas blocks) to the
          ecosystem before routing home. */}
      <button
        type="button"
        onClick={() => {
          if (editingId) {
            // Pull latest blocks from the canvas in case the user edited it.
            const liveSpec = canvasHandle.current?.toCreatureSpec() ?? creature;
            if (liveSpec) {
              if (editingId) liveSpec.id = editingId;
              const dominant = liveSpec.emotions[0]?.displayName;
              const text = (textareaRef.current?.value ?? journalText).trim();
              const finalName =
                name.trim() || liveSpec.name || randomCreatureName(dominant) || "Creature";
              uploadCreature({
                ...liveSpec,
                name: finalName,
                journalText: text,
                dateISO: toISO(selectedDate),
                source: "manually",
              });
            }
            router.push("/");
            return;
          }
          handleDelete();
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

      {/* ── Upload to Ecosystem / Uploaded button (Figma 2065:53) ────────── */}
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

      {/* ── Creature viewport (top right) — pointer-events-none so the
          Upload button below stays clickable through this container. The
          name input opts back into pointer-events for editability. ──────── */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        {/* Editable creature name — auto-filled with a whimsical random
            name on Generate; click to rewrite. */}
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name"
          className="pointer-events-auto absolute left-1/2 top-[8px] z-[5] block h-[40px] w-[300px] -translate-x-1/2 bg-transparent text-center text-[28px] leading-normal text-black outline-none placeholder:text-black/30 font-(family-name:--font-fancy)"
        />
        {/* Creature canvas — pushed below the name input. */}
        <div className="absolute left-[20px] right-[20px] top-[52px] bottom-[56px]">
          <CreatureCanvas creature={creature} blockSize={140} padding={8} />
        </div>
      </div>

      {/* ── Info panel (bottom right) — 31 energy blocks + search.
          Two-vector outline matches Figma 2006:75. ──────────────────────── */}
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

        {/* Search input */}
        <div className="absolute left-[14px] top-[14px] h-[33.47px] w-[222.64px]">
          <img
            alt=""
            src="/assets/manual-search.svg"
            className="pointer-events-none absolute inset-0 block size-full"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="absolute inset-0 bg-transparent px-[10px] text-[14px] font-bold text-black outline-none placeholder:text-black/35 font-(family-name:--font-casual)"
          />
        </div>

        {/* Block count hint */}
        <span className="absolute right-[14px] top-[20px] text-[12px] font-bold text-black/40">
          {filteredBlocks.length} / {EMOTION_LIST.length}
        </span>

        {/* Scrollable block grid */}
        <div className="absolute left-[8px] right-[6px] top-[56px] bottom-[8px] overflow-y-auto overflow-x-hidden pr-[2px]">
          {filteredBlocks.length === 0 ? (
            <div className="flex h-full items-center justify-center text-[13px] text-black/40">
              No results
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-[6px]">
              {filteredBlocks.map((emotion) => (
                <div
                  key={emotion.key}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData(
                      "application/bokbok-block",
                      JSON.stringify({
                        emotionKey: emotion.key,
                        imagePath: emotion.imagePath,
                      }),
                    );
                  }}
                  onClick={() =>
                    canvasHandle.current?.addBlock(emotion.key, emotion.imagePath)
                  }
                  className="flex cursor-pointer flex-col items-center gap-[4px] rounded-[6px] p-[4px] transition-colors hover:bg-black/10 active:scale-95"
                >
                  <img
                    src={emotion.imagePath}
                    alt={emotion.displayName}
                    className="h-[52px] w-[52px] select-none object-contain"
                    draggable={false}
                  />
                  <span className="w-full text-center text-[10px] font-bold leading-tight text-black">
                    {emotion.displayName}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Creature info — shown below blocks when creature exists */}
        {creature && (
          <div className="absolute inset-x-[10px] bottom-[8px] flex items-center gap-[6px] overflow-x-auto">
            {creature.emotions.map(({ key, displayName }) => {
              const e = emotionByKey(key);
              return (
                <div key={key} className="flex flex-none flex-col items-center gap-[2px]">
                  <img
                    alt=""
                    src={e?.imagePath}
                    className="h-[20px] w-[20px] rounded-full object-cover"
                  />
                  <span className="text-[9px] font-bold text-black/70">{displayName}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
