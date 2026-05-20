"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MainViewport, { type FocusTarget, type ResetTrigger } from "./MainViewport";
import MobileTopBar from "./MobileTopBar";
import { creaturePositions, triggerEcosystemGather } from "./EcosystemCreatures";
import { useT } from "@/lib/i18n";
import { deleteCreatureById, loadEcosystem, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { creatureFocusBox, emotionByKey, type CreatureSpec } from "@/lib/creature";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playCandyRustle, unlockAudio } from "@/lib/audio";
import { ambientChatter } from "@/lib/ambientChatter";

/**
 * Mobile-only layout for the main (/) page.
 *
 * Desktop fits everything into a 1440×900 canvas with the 3D viewport on
 * the left, two side panels on the right (creature emotions grid + info),
 * a top nav bar, plus pet-mode and candy floating buttons. None of that
 * fits a portrait phone.
 *
 * Mobile rearranges into a single column:
 *   1. Sticky top bar — BokBok logo + hamburger
 *   2. 3D canvas — fills width, 55vh tall
 *   3. Floating action buttons (pet + candy) bottom-right over the canvas
 *   4. Selected-creature panel below the canvas (only shown when something
 *      is selected) — name, date, emotions grid, journal text, action row
 *
 * Nav drawer slides in from the right when the hamburger is tapped,
 * with the five page links + a backdrop that closes on tap-outside.
 */
export default function MobileMainPage() {
  const router = useRouter();
  const t = useT();
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [resetTrigger, setResetTrigger] = useState<ResetTrigger | null>(null);
  const [petMode, setPetMode] = useState(false);

  // Ambient chatter loop — same lifecycle as desktop main page.
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadEcosystem().then((list) => {
        if (!cancelled) ambientChatter.setCreatures(list);
      });
    };
    refresh();
    window.addEventListener("ecosystem:changed", refresh);
    window.addEventListener("storage", refresh);
    const unsubscribeRemote = subscribeRemoteEcosystem(refresh);

    // Try to unlock audio immediately on mount (succeeds on browsers
    // with site engagement, e.g. returning Chrome visitors). On stricter
    // browsers the AudioContext is created suspended and resumes on
    // the first user gesture — see broad listener set below.
    const tryStart = () => {
      if (unlockAudio()) ambientChatter.start();
    };
    tryStart();

    let unlocked = false;
    const onAnyGesture = () => {
      if (unlocked) return;
      if (unlockAudio()) {
        unlocked = true;
        ambientChatter.start();
        gestureEvents.forEach((ev) =>
          window.removeEventListener(ev, onAnyGesture, true),
        );
      }
    };
    const gestureEvents = [
      "pointerdown",
      "pointerup",
      "mousedown",
      "touchstart",
      "touchend",
      "keydown",
      "click",
    ] as const;
    gestureEvents.forEach((ev) =>
      window.addEventListener(ev, onAnyGesture, { capture: true }),
    );

    return () => {
      cancelled = true;
      window.removeEventListener("ecosystem:changed", refresh);
      window.removeEventListener("storage", refresh);
      gestureEvents.forEach((ev) =>
        window.removeEventListener(ev, onAnyGesture, true),
      );
      unsubscribeRemote();
      ambientChatter.stop();
    };
  }, []);

  useEffect(() => {
    ambientChatter.setSelected(selected?.id ?? null);
  }, [selected?.id]);

  // Same toggle-on-reselect + camera focus math as desktop. Distance is
  // sized to fit the creature's bbox (h or v, whichever is wider).
  const handleSelect = (c: CreatureSpec, pos: [number, number, number]) => {
    if (selected?.id === c.id) {
      setSelected(null);
      setResetTrigger({ ts: Date.now() });
      return;
    }
    setSelected(c);
    const bbox = creatureFocusBox(c);
    const PEAK = 1.06;
    const d_h = (bbox.halfWidth * PEAK) / 0.514;
    const d_v = (bbox.halfHeight * PEAK) / 0.414;
    const distance = Math.max(2.0, d_h, d_v);
    const targetOffset: [number, number, number] = [
      bbox.centerX,
      bbox.centerY * 0.394,
      bbox.centerY * -0.919,
    ];
    setFocusTarget({ position: pos, ts: Date.now(), distance, targetOffset });
  };

  // /?focus=<id> deep-link handling — identical to desktop.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get("focus");
    if (!focusId) return;

    let cancelled = false;
    let attempts = 0;
    const tryFocus = async () => {
      if (cancelled) return;
      const list = await loadEcosystem();
      const c = list.find((x) => x.id === focusId);
      if (!c) {
        attempts++;
        if (attempts > 60) return;
        window.setTimeout(tryFocus, 100);
        return;
      }
      const pos = creaturePositions.get(focusId);
      if (!pos) {
        attempts++;
        if (attempts > 60) return;
        window.setTimeout(tryFocus, 100);
        return;
      }
      if (cancelled) return;
      setSelected(c);
      const bbox = creatureFocusBox(c);
      const PEAK = 1.06;
      const d_h = (bbox.halfWidth * PEAK) / 0.514;
      const d_v = (bbox.halfHeight * PEAK) / 0.414;
      const distance = Math.max(2.0, d_h, d_v);
      const targetOffset: [number, number, number] = [
        bbox.centerX,
        bbox.centerY * 0.394,
        bbox.centerY * -0.919,
      ];
      setFocusTarget({ position: pos, ts: Date.now(), distance, targetOffset });
      window.history.replaceState(null, "", "/");
    };
    tryFocus();
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape closes pet mode. (MobileTopBar manages its own Esc for the nav drawer.)
  useEffect(() => {
    if (!petMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPetMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [petMode]);

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
    <div
      className="relative min-h-screen w-full font-(family-name:--font-casual)"
      style={petMode ? { cursor: "url(/assets/hand-cursor.svg) 16 16, pointer" } : undefined}
    >
      <MobileTopBar active="home" />

      {/* ── 3D viewport ────────────────────────────────────────────── */}
      <div className="relative h-[55vh] w-full">
        <MainViewport
          mobile
          onCreatureSelect={handleSelect}
          selectedCreatureId={selected?.id ?? null}
          focusTarget={focusTarget}
          resetTrigger={resetTrigger}
          petMode={petMode}
        />

        {/* Floating action buttons — bottom-right of the canvas area.
            Stacked vertically so they don't crowd a thumb in landscape.
            Uses the original hand-drawn SVG assets (bokbok-button + candy-
            button) at their natural aspect ratios — no circular chip
            wrappers — so the mobile floating controls match the desktop
            artwork exactly. The pet button keeps the "BokBok" text baked
            inside the hand silhouette (same as desktop's Figma 2127:147). */}
        <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col items-end gap-3">
          <button
            type="button"
            onClick={() => setPetMode((p) => !p)}
            aria-pressed={petMode}
            className={`pointer-events-auto relative block h-[78px] w-[83px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform active:scale-95 ${
              petMode ? "drop-shadow-[0_0_4px_rgba(0,0,0,0.5)]" : "hover:opacity-90"
            }`}
            title={t("main.bokbok_button")}
          >
            {/* Same -0.54%/-0.51% overflow as desktop so the hand-drawn
                stroke isn't clipped at the bbox edge. */}
            <div className="absolute" style={{ inset: "-0.54% -0.51%" }}>
              <img
                alt=""
                src="/assets/bokbok-button.svg"
                className="block size-full max-w-none"
                draggable={false}
              />
            </div>
            <span
              className="absolute flex items-center justify-center text-center text-[18px] font-bold leading-[normal] text-black"
              style={{ inset: "40.24% 3.83% 21.04% 5.15%" }}
            >
              {t("main.bokbok_button")}
            </span>
          </button>
          {/* Candy "call creatures back" button — recreates the desktop
              CandyButton's behavior inline so we don't have to refactor it
              for a different fixed-coords layout. Natural Figma aspect is
              66.43 × 35.26 → scaled to 80 × 42 for thumb-comfortable
              tapping without distorting the wrapped-candy artwork. */}
          <CandyButtonMobile />
        </div>
      </div>

      {/* ── Selected creature panel ────────────────────────────────── */}
      {selected ? (
        <section className="relative px-4 pb-10 pt-5">
          <button
            type="button"
            onClick={() => {
              setSelected(null);
              setResetTrigger({ ts: Date.now() });
            }}
            aria-label="Close creature"
            className="absolute right-3 top-3 flex h-9 w-9 cursor-pointer items-center justify-center bg-transparent text-[20px] font-bold text-black active:scale-95"
          >
            ×
          </button>

          <h2 className="whitespace-nowrap text-[32px] leading-none text-black font-(family-name:--font-fancy)">
            {selected.name ?? t("panel.empty_name")}
          </h2>
          <p className="mt-1 text-[16px] font-bold text-black/70">
            {selected.dateISO ?? "—"}
          </p>

          {/* Emotion thumbnails — 3-up on phones, hand-drawn images per
              emotion. Touch-friendly tap targets at 90×90 each. */}
          {selected.emotions.length > 0 && (
            <div className="mt-5 grid grid-cols-3 gap-3">
              {selected.emotions.map(({ key, displayName }) => {
                const e = emotionByKey(key);
                return (
                  <div key={key} className="flex flex-col items-center gap-1">
                    <img
                      alt=""
                      src={e?.imagePath}
                      className="block h-[90px] w-[90px] select-none object-contain"
                      draggable={false}
                    />
                    <span className="text-center text-[13px] font-bold leading-tight text-black">
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Journal text. Same paragraph-splitting as desktop. */}
          <div className="mt-5 text-[16px] font-bold leading-relaxed text-black">
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

          {/* Action row — Download / Edit / Delete reusing the same
              hand-drawn box SVGs the desktop info panel uses (uploaded-
              box, edit-button, delete-vector). All three SVGs declare
              preserveAspectRatio="none", so we can stretch them to any
              aspect ratio without distorting the hand-drawn stroke
              intent. Widths are split using the natural Figma aspect
              ratios (112 : 49.41 : 88.56 ≈ 45% : 20% : 35%) so each
              button keeps roughly the same shape as on desktop, just
              taller for touch-comfortable tapping. */}
          <div className="mt-6 flex h-12 items-stretch gap-2">
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
                draggable={false}
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
                draggable={false}
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
              {/* Same nested-inset structure as desktop: outer inset
                  reserves the bottom 19.51% for the label, inner adds
                  the tiny stroke-overflow margin (-1.53% etc) so the
                  hand-drawn outline isn't clipped. */}
              <div className="absolute" style={{ inset: "0 3.3% 19.51% 4.4%" }}>
                <div className="absolute" style={{ inset: "-1.53% -0.61% -1.53% -2.94%" }}>
                  <img
                    alt=""
                    src="/assets/delete-vector.svg"
                    className="block size-full max-w-none"
                    draggable={false}
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
        </section>
      ) : (
        <section className="px-6 pb-10 pt-6 text-center">
          <p className="m-0 text-[16px] font-bold leading-relaxed text-black/50">
            {t("panel.click_creature")}
            <br />
            {t("panel.bokbokpedia_to_view")}
          </p>
        </section>
      )}

    </div>
  );
}

/**
 * Mobile candy button — calls creatures back toward the centre via the
 * same `triggerEcosystemGather()` API the desktop CandyButton uses.
 * Inlined (instead of reusing CandyButton) because the desktop version
 * uses fixed Figma absolute coords incompatible with a flex floating-
 * action-button layout. Renders the same hand-drawn candy-button.svg
 * with no background chip — the original artwork stands on its own at
 * thumb-comfortable size (80 × 42, natural aspect 66.43 : 35.26).
 */
function CandyButtonMobile() {
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio();
        // Plastic-bag crinkle cue — same as the desktop CandyButton.
        playCandyRustle();
        triggerEcosystemGather();
      }}
      aria-label="Call creatures back to the centre"
      title="Call creatures back to the centre"
      className="pointer-events-auto block h-[42px] w-[80px] cursor-pointer bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
    >
      <img
        alt=""
        src="/assets/candy-button.svg"
        className="block size-full"
        draggable={false}
      />
    </button>
  );
}
