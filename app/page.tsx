"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import MainViewport, { type FocusTarget, type ResetTrigger } from "./_components/MainViewport";
import BokBokLogo from "./_components/BokBokLogo";
import CandyButton from "./_components/CandyButton";
import {
  creaturePositions,
  triggerEcosystemGather,
  triggerCandySprinkle,
  triggerBallThrow,
} from "./_components/EcosystemCreatures";
import { useT } from "@/lib/i18n";
import { deleteCreatureById, loadEcosystem, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { creatureFocusBox, emotionByKey, type CreatureSpec } from "@/lib/creature";
import {
  creatureHighlightColor,
  hoverNameHighlightUrl,
  hoverDateHighlightUrl,
} from "@/lib/nameHighlight";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playBallBounce, playCandyRustle, playGlitter, playPinsetGrab, playPinsetRelease, playWhistle, unlockAudio } from "@/lib/audio";
import { ambientChatter } from "@/lib/ambientChatter";

export default function MainPage() {
  // The dedicated mobile layout (MobileMainPage) is currently paused.
  // Every viewport renders the desktop 1440×900 layout; ViewportFit
  // scales it to fit and shows a "rotate your phone" prompt instead on
  // portrait-phone viewports where the design becomes uncomfortably
  // cramped.
  return <DesktopMainPage />;
}

function DesktopMainPage() {
  const router = useRouter();
  const t = useT();
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [focusTarget, setFocusTarget] = useState<FocusTarget | null>(null);
  const [resetTrigger, setResetTrigger] = useState<ResetTrigger | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Pet mode: when on, the cursor becomes a hand and clicking a creature
  // makes it shake wildly instead of opening the focus view.
  const [petMode, setPetMode] = useState(false);
  // Candy mode: when on, the cursor becomes a small candy icon and
  // clicking anywhere in the 3D scene makes creatures gather to that
  // point + replays the plastic-bag rustle. Mutually exclusive with
  // pet mode (activating one exits the other).
  const [candyMode, setCandyMode] = useState(false);
  // Pinset mode: cursor becomes the hand-drawn tweezers. Clicking a
  // creature "grabs" it (heldId set, cursor swaps to pinset-close,
  // creature snaps to the cursor's world-XZ each frame). Another click
  // (or Escape) releases. Mutually exclusive with pet / candy modes.
  const [pinsetMode, setPinsetMode] = useState(false);
  const [heldId, setHeldId] = useState<string | null>(null);
  // After a pinset release the cursor briefly shows pinset-open as a
  // visual "I dropped it" cue before reverting to the default arrow.
  // Without this flash the cursor flips instantly from pinset-close
  // (gripping) to default — the user has no confirmation the release
  // landed. ~280 ms is long enough to register, short enough not to
  // feel sticky.
  const [pinsetReleaseFlash, setPinsetReleaseFlash] = useState(false);
  const pinsetReleaseFlashTimerRef = useRef<number | null>(null);
  const flashPinsetReleased = () => {
    // 놓는 소리 — fires from every release path (drop-in-place, empty
    // ground, off-canvas click, Escape), since they all funnel here.
    playPinsetRelease();
    if (pinsetReleaseFlashTimerRef.current !== null) {
      clearTimeout(pinsetReleaseFlashTimerRef.current);
    }
    setPinsetReleaseFlash(true);
    pinsetReleaseFlashTimerRef.current = window.setTimeout(() => {
      setPinsetReleaseFlash(false);
      pinsetReleaseFlashTimerRef.current = null;
    }, 280);
  };
  // Ball mode: cursor becomes the ball icon. Clicking the ground throws
  // the ball at that XZ (bounces in, random creature fetches it and
  // brings it back to origin). Mutually exclusive with other modes.
  const [ballMode, setBallMode] = useState(false);
  // Whistle mode: cursor becomes the whistle icon. Clicking the ground
  // makes the WHOLE flock gather to that point — the previous "candy
  // button" behaviour now lives under the whistle. Mutually exclusive.
  const [whistleMode, setWhistleMode] = useState(false);
  // Shooting star: a ONE-SHOT action (not a mode — no cursor, no scene
  // click). Pressing the 별똥별 button streaks a star across the top of
  // the viewport while every creature freezes in place and looks up to
  // watch. Auto-clears after the animation; re-press is ignored while
  // one is already in flight.
  const [stargazing, setStargazing] = useState(false);
  const starTimerRef = useRef<number | null>(null);
  // Search query — filters which creatures render in the 3D scene
  // (via EcosystemCreatures' `query` prop, which already supports
  // matchesCreatureQuery). Empty string = show everything.
  const [query, setQuery] = useState("");
  // Hover tooltip state: the creature currently under the cursor (if any)
  // and the cursor position in design pixels.
  const [hoveredCreature, setHoveredCreature] = useState<CreatureSpec | null>(null);
  const [hoverPos, setHoverPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const pageRef = useRef<HTMLDivElement | null>(null);

  // Track the browser's actual fullscreen state so the button reflects it
  // even when the user exits via Escape.
  useEffect(() => {
    const onChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // Ambient chatter — continuous low-volume voice noise from every creature
  // in the ecosystem, with the focused creature popping out at high volume.
  // Only runs on the main page (this useEffect lives here, not in layout),
  // and only after the user's first pointerdown (browser autoplay policy
  // blocks audio before any user gesture). The ecosystem subscription
  // re-feeds creatures into the loop whenever the store changes.
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

    // Try to unlock audio IMMEDIATELY on mount — in browsers that have
    // media engagement with the site (e.g., returning visitors on
    // Chrome), this succeeds without any user gesture and ambient
    // chatter starts the moment the page loads. In stricter browsers
    // the AudioContext gets created but stays suspended; the gesture
    // listeners below resume() it on the first interaction.
    const tryStart = () => {
      if (unlockAudio()) ambientChatter.start();
    };
    tryStart();

    // Browser autoplay policy requires a user-initiated gesture to
    // resume a suspended AudioContext. Listen to a BROAD set of events
    // (pointer, touch, mouse, keyboard) on the capture phase so even
    // the very first click on a specific button (e.g., the Sound
    // Toggle itself) triggers the unlock before that button's own
    // onClick runs. All listeners share the same handler, which is a
    // no-op once the context is live.
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

  // Push selection changes into the chatter loop so the focused creature
  // becomes the loud voice and the rest fall back to ambient amp.
  useEffect(() => {
    ambientChatter.setSelected(selected?.id ?? null);
  }, [selected?.id]);

  // Hush the flock while the shooting star passes — everyone watches in
  // silence. Muting (vs. stopping) keeps the chatter cadence so it resumes
  // seamlessly the moment `stargazing` flips back off.
  useEffect(() => {
    ambientChatter.setMuted(stargazing);
  }, [stargazing]);

  // Exit any active mode on Escape — feels natural for "I'm done".
  // Pinset Escape also drops any held creature so the user isn't stuck
  // with a stranded creature glued to a hidden cursor.
  useEffect(() => {
    if (!petMode && !candyMode && !pinsetMode && !ballMode && !whistleMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (petMode) setPetMode(false);
      if (candyMode) setCandyMode(false);
      if (pinsetMode) {
        if (heldId) flashPinsetReleased();
        setPinsetMode(false);
        setHeldId(null);
      }
      if (ballMode) setBallMode(false);
      if (whistleMode) setWhistleMode(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [petMode, candyMode, pinsetMode, ballMode, whistleMode]);

  // Right-click cancels whatever tool is active and returns to the default
  // cursor — a natural "never mind" gesture that mirrors Escape. We only
  // attach the listener (and swallow the browser context menu) WHILE a mode
  // is active, so normal right-click behaviour is untouched everywhere else.
  // Exiting the mode reverts the per-mode cursor style back to the default
  // arrow automatically, so there's nothing extra to restore.
  useEffect(() => {
    if (!petMode && !candyMode && !pinsetMode && !ballMode && !whistleMode) return;
    const onContextMenu = (e: MouseEvent) => {
      e.preventDefault();
      if (petMode) setPetMode(false);
      if (candyMode) setCandyMode(false);
      if (pinsetMode) {
        if (heldId) flashPinsetReleased();
        setPinsetMode(false);
        setHeldId(null);
      }
      if (ballMode) setBallMode(false);
      if (whistleMode) setWhistleMode(false);
    };
    window.addEventListener("contextmenu", onContextMenu);
    return () => window.removeEventListener("contextmenu", onContextMenu);
  }, [petMode, candyMode, pinsetMode, ballMode, whistleMode, heldId]);

  // While holding a creature with the pinset, ANY click that lands
  // outside the 3D canvas drops the creature AND exits pinset mode —
  // clicking the info panel, a nav link, the search box, the Pet/
  // Candy/Ball/Whistle buttons, anywhere off-scene all count as "I'm
  // done holding this" and end the pinset operation. Clicks INSIDE
  // the canvas are handled by r3f directly (GroundPlane onEmptyClick
  // releases + exits; tapping a different creature swaps the grab to
  // that one without ending the mode) so we skip those here.
  useEffect(() => {
    if (!pinsetMode || !heldId) return;
    const onWindowClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && t.closest("canvas")) return;
      flashPinsetReleased();
      setHeldId(null);
      setPinsetMode(false);
    };
    window.addEventListener("click", onWindowClick);
    return () => window.removeEventListener("click", onWindowClick);
  }, [pinsetMode, heldId]);

  // Activating one mode exits the others so we never have two custom
  // cursors fighting for the click.
  const exitAllModes = () => {
    setPetMode(false);
    setCandyMode(false);
    setPinsetMode(false);
    setHeldId(null);
    setBallMode(false);
    setWhistleMode(false);
  };
  const toggleCandyMode = () => {
    const next = !candyMode;
    exitAllModes();
    setCandyMode(next);
  };
  const togglePetMode = () => {
    const next = !petMode;
    exitAllModes();
    setPetMode(next);
    // Spin up the AudioContext inside the button's click gesture so the
    // synthesized pet purr can fire immediately on the first creature tap.
    if (next) {
      unlockAudio();
    }
  };
  const togglePinsetMode = () => {
    const next = !pinsetMode;
    exitAllModes();
    setPinsetMode(next);
  };
  const toggleBallMode = () => {
    const next = !ballMode;
    exitAllModes();
    setBallMode(next);
  };
  const toggleWhistleMode = () => {
    const next = !whistleMode;
    exitAllModes();
    setWhistleMode(next);
  };

  // Shooting star — fire-and-forget. Flip `stargazing` on (which streaks
  // the overlay star and freezes the flock to watch), then clear it after
  // the CSS fly animation (~2.2 s) finishes. Guarded so spamming the
  // button doesn't stack overlapping stars or extend the freeze forever.
  const triggerShootingStar = () => {
    if (stargazing) return;
    unlockAudio();
    playGlitter();
    setStargazing(true);
    if (starTimerRef.current !== null) clearTimeout(starTimerRef.current);
    starTimerRef.current = window.setTimeout(() => {
      setStargazing(false);
      starTimerRef.current = null;
    }, 2400);
  };

  // Called by EcosystemCreatures when a creature is clicked while in
  // pinset mode AND nothing is currently held. The creature becomes
  // "grabbed": its wander logic is overridden to follow the cursor's
  // world-XZ projection until released.
  const handlePinsetGrab = (id: string) => {
    // 잡는 소리 — the pinch on pick-up (also covers swapping the grab
    // from one creature straight to another).
    playPinsetGrab();
    setHeldId(id);
  };
  // Click on empty ground (or pinset button again, or Escape) releases.
  const handlePinsetRelease = () => {
    setHeldId(null);
  };

  // The single shared "ground tap with a mode" dispatcher — MainViewport
  // forwards GroundPlane clicks here, and we dispatch based on which
  // mode is currently active. Each mode does something different at the
  // tapped world-XZ AND auto-exits the mode after firing once, so the
  // cursor returns to default. Re-press the button to use the tool
  // again — feels more game-like and prevents accidental re-triggers.
  //   • Candy   — sprinkle a small cluster of treats; creatures within
  //               attract radius come over and eat them.
  //   • Whistle — summon the WHOLE flock to that point (the legacy
  //               candy gather behaviour).
  //   • Ball    — throw a ball there; the nearest creature fetches it,
  //               then the flock passes it around for a bit before the
  //               last holder hucks it far off-screen. Throw as many as
  //               you like — every press adds another ball to the scene.
  const handleSceneClick = (x: number, z: number) => {
    unlockAudio();
    if (candyMode) {
      playCandyRustle();
      triggerCandySprinkle(x, z);
      setCandyMode(false);
      return;
    }
    if (whistleMode) {
      playWhistle();
      triggerEcosystemGather({ x, z });
      setWhistleMode(false);
      return;
    }
    if (ballMode) {
      // Real bouncy-ball recording (ball.mp3 from 4.0 s), timed to land
      // with the three-bounce drop animation.
      playBallBounce();
      // Eligible fetchers = whatever's currently rendered (a creature
      // outside the viewport could still pick up the ball but the user
      // wouldn't see them; restricting to known positions keeps the
      // play legible). Falls back to no-op if scene is empty.
      const ids = Array.from(creaturePositions.keys());
      triggerBallThrow(x, z, ids);
      setBallMode(false);
      return;
    }
  };

  // Called by EcosystemCreatures right after a creature shake completes
  // in pet mode. Lets us auto-exit pet mode after one pet so the cursor
  // returns to default — same single-shot UX the candy/whistle/ball
  // tools use.
  const handlePetComplete = () => {
    setPetMode(false);
  };

  // Track cursor position in DESIGN pixels (relative to the 1440×900 page)
  // while a creature is hovered. clientX/Y are in actual viewport pixels;
  // we convert through the page's bounding rect so the tooltip lands at
  // the cursor regardless of ViewportFit's scale.
  useEffect(() => {
    if (!hoveredCreature) return;
    const onMove = (e: MouseEvent) => {
      const rect = pageRef.current?.getBoundingClientRect();
      if (!rect || rect.width === 0 || rect.height === 0) return;
      setHoverPos({
        x: ((e.clientX - rect.left) / rect.width) * 1440,
        y: ((e.clientY - rect.top) / rect.height) * 900,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, [hoveredCreature]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen?.();
    } else {
      document.documentElement.requestFullscreen?.();
    }
  };

  // Selection from a 3D click — toggles between zoom-in and zoom-out:
  // clicking a creature focuses on it; clicking the same creature again
  // (now selected) zooms back out to the initial bird's-eye view. Replaces
  // the dedicated Reset View button.
  //
  // Focus distance is sized dimension-by-dimension so the creature fills
  // the box without clipping and without empty bands:
  //   horizontal fit: d ≥ halfWidth  / (tan(FOV/2) × aspect) = halfWidth  / 0.514
  //   vertical fit:   d ≥ halfHeight /  tan(FOV/2)           = halfHeight / 0.414
  // PEAK = 1.06 covers the ±4% breathing peak with a 2% safety margin.
  // targetOffset recenters the camera on the creature's visible bbox center
  // (not its group origin); camera-up post-billboard ≈ (0, 0.394, -0.919),
  // so the bbox-Y offset projects onto world (Y, Z) by those factors.
  const handleSelect = (
    c: CreatureSpec,
    pos: [number, number, number],
  ) => {
    // Toggle: clicking the currently-focused creature zooms back out.
    if (selected?.id === c.id) {
      setSelected(null);
      setResetTrigger({ ts: Date.now() });
      return;
    }
    setSelected(c);
    const bbox = creatureFocusBox(c);
    const PEAK = 1.06;
    const d_h = (bbox.halfWidth  * PEAK) / 0.514;
    const d_v = (bbox.halfHeight * PEAK) / 0.414;
    const distance = Math.max(2.0, d_h, d_v);
    const targetOffset: [number, number, number] = [
      bbox.centerX,
      bbox.centerY * 0.394,
      bbox.centerY * -0.919,
    ];
    setFocusTarget({ position: pos, ts: Date.now(), distance, targetOffset });
  };

  // Optional focus from /?focus=<id> — set when the user clicks "Go to
  // Ecosystem" on the Create page after upload (or when edit-mode auto-
  // navigates back). Two-stage wait:
  //
  //   1. WAIT FOR THE CREATURE TO LAND IN THE ECOSYSTEM.
  //      Previously this re-fetched loadEcosystem every 100 ms up to
  //      60 times — in shared mode each fetch is a Supabase round-trip,
  //      so 60 polls = up to 30 s of network spam and a visibly laggy
  //      arrival. Now: subscribe to the `ecosystem:changed` event the
  //      upload + realtime channels dispatch, AND do a single immediate
  //      check (covers the common case where the creature is already
  //      in the page's main load on arrival).
  //
  //   2. WAIT FOR THE 3D POSITION TO REGISTER.
  //      Once the creature is in the list, EcosystemCreatures renders
  //      it and the wander useFrame writes into `creaturePositions`
  //      within ~1-2 frames. Polling that Map is essentially free —
  //      no network — so we tick every 60 ms until it's there.
  //
  //   3. STILL nothing after 8 s total → give up silently. The URL gets
  //      stripped either way so a refresh starts clean.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const focusId = params.get("focus");
    if (!focusId) return;

    let cancelled = false;
    let positionPollId: number | null = null;
    let giveUpTimerId: number | null = null;

    const finishFocus = (c: CreatureSpec, pos: [number, number, number]) => {
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

    const waitForPosition = (c: CreatureSpec) => {
      if (cancelled) return;
      const pos = creaturePositions.get(focusId);
      if (pos) {
        finishFocus(c, pos);
        return;
      }
      // Cheap Map lookup — poll every 60 ms until r3f has rendered
      // the creature and its useFrame has written the position.
      positionPollId = window.setTimeout(() => waitForPosition(c), 60);
    };

    const tryFocusWithList = (list: CreatureSpec[]) => {
      if (cancelled) return false;
      const c = list.find((x) => x.id === focusId);
      if (!c) return false;
      waitForPosition(c);
      return true;
    };

    const onEcosystemChanged = () => {
      loadEcosystem().then((list) => {
        if (cancelled) return;
        if (tryFocusWithList(list)) {
          window.removeEventListener("ecosystem:changed", onEcosystemChanged);
        }
      });
    };

    // Phase 1: try immediately with whatever the ecosystem currently
    // holds (most edit flows have already awaited the upload by the
    // time we mount, so this catches them on the first call).
    loadEcosystem().then((list) => {
      if (cancelled) return;
      if (tryFocusWithList(list)) return;
      // Not there yet → listen for the next change event.
      window.addEventListener("ecosystem:changed", onEcosystemChanged);
    });

    // Hard ceiling — bail and clean up even if the creature never lands.
    giveUpTimerId = window.setTimeout(() => {
      window.removeEventListener("ecosystem:changed", onEcosystemChanged);
      if (positionPollId !== null) {
        clearTimeout(positionPollId);
        positionPollId = null;
      }
      // Strip the now-stale focus URL so a refresh doesn't re-attempt.
      window.history.replaceState(null, "", "/");
    }, 8000);

    return () => {
      cancelled = true;
      window.removeEventListener("ecosystem:changed", onEcosystemChanged);
      if (positionPollId !== null) clearTimeout(positionPollId);
      if (giveUpTimerId !== null) clearTimeout(giveUpTimerId);
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
    // Camera was zoomed in on the now-gone creature — pull it back to
    // the default bird's-eye view so the user isn't left staring at
    // empty space where the creature used to be.
    setResetTrigger({ ts: Date.now() });
  };

  // Click on empty 3D ground.
  //   • In PINSET mode, an empty-ground click DROPS whatever's held
  //     and ALSO exits pinset mode (the grab+drop counts as one
  //     pinset "operation" → single-shot UX). If nothing was held,
  //     the tap is a no-op; we stay in pinset mode so the user can
  //     keep aiming.
  //   • Otherwise: clear selection + reset the camera back to default.
  //     Catches the lingering "I deleted a creature and missed the
  //     auto-reset" case, plus any time the user has drifted the
  //     camera and wants to recenter.
  const handleEmptyGroundClick = () => {
    if (pinsetMode) {
      if (heldId) {
        flashPinsetReleased();
        setPinsetMode(false);
      }
      setHeldId(null);
      return;
    }
    setSelected(null);
    setResetTrigger({ ts: Date.now() });
  };

  // Pinset release-in-place — fired when the user clicks the held
  // creature itself (signalling "drop right here"). Mirrors the
  // empty-ground release: clears heldId + exits pinset mode so the
  // operation completes and the cursor briefly flashes pinset-open
  // before reverting to default.
  const handleHeldClickRelease = () => {
    flashPinsetReleased();
    setHeldId(null);
    setPinsetMode(false);
  };

  return (
    <div
      ref={pageRef}
      className={`relative mx-auto h-[900px] w-[1440px] font-(family-name:--font-casual) ${
        // In fullscreen, MainViewport expands beyond 1440×900 in design
        // coords to fill the actual window — so the page must NOT clip.
        isFullscreen ? "overflow-visible" : "overflow-hidden"
      }`}
      // Custom cursor per active mode:
      //  • Pet     — bokbok-blob cursor, matching the toolbar pet button.
      //  • Candy   — filled candy cursor, matching the candy button.
      //  • Pinset  — tweezers; open by default, closed while holding.
      //              Hotspot at the pinch point.
      //  • Ball    — ball icon; hotspot ≈ centre so the throw lands
      //              where you click.
      //  • Whistle — whistle icon; same gather behaviour candy used to
      //              have. Hotspot ≈ the bell of the whistle.
      // Modes are mutually exclusive so the first match wins.
      // pinsetReleaseFlash falls LAST — only kicks in when no other
      // mode is active (i.e., we just released and dropped back to
      // default). Briefly shows pinset-open as a "released" cue.
      style={
        petMode
          ? { cursor: "url(/assets/pet-cursor.svg) 14 13, pointer" }
          : candyMode
          ? { cursor: "url(/assets/candy-cursor.svg) 22 12, crosshair" }
          : pinsetMode
          ? heldId
            ? { cursor: "url(/assets/pinset-close-cursor.svg) 12 8, grabbing" }
            : { cursor: "url(/assets/pinset-open-cursor.svg) 17 8, grab" }
          : ballMode
          ? { cursor: "url(/assets/ball-cursor.svg) 15 16, crosshair" }
          : whistleMode
          ? { cursor: "url(/assets/whistle-cursor.svg) 12 14, crosshair" }
          : pinsetReleaseFlash
          ? { cursor: "url(/assets/pinset-open-cursor.svg) 17 8, default" }
          : undefined
      }
    >
      {/* Top bar / nav / right panels — hidden in fullscreen mode (Figma 2114:265
          shows just the wavy frame + 3D scene + exit button). */}
      {!isFullscreen && (
        <>
          {/* BokBok logo / Home link — hand-drawn wordmark (Figma 2287:82).
              Placed at the original Figma frame coords (1152, -27); the
              ~31% empty top of the frame bleeds above the page's y=0 and
              clips naturally against the page's overflow-hidden. */}
          <a
            href="/"
            aria-label="BokBok home"
            className="absolute block cursor-pointer transition-transform active:scale-95 hover:scale-[1.02]"
            style={{ left: 1152, top: -27 }}
          >
            <BokBokLogo />
          </a>

          {/* Top nav — Figma values per node, with the row stair-stepping
              slightly down across the bar:
                Create        (2102:152)  x=35  y=48 w=91
                Calendar      (2102:153)  x=115 y=51 w=151
                BokBokpedia  (2102:157)  x=255 y=51 w=151
              Energy Blocks and About (further right) sit at y=54. */}
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
          <a
            href="/encyclopedia"
            className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
          >
            {t("nav.encyclopedia")}
          </a>

          {/* Energy Blocks (Figma 2109:248) — at x=418, y=54, w=151. */}
          <a
            href="/energy-blocks"
            className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
          >
            {t("nav.energy_blocks")}
          </a>

          {/* About (Figma 2109:250) — at x=581, y=54, w=76. */}
          <a
            href="/about"
            className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
          >
            {t("nav.about")}
          </a>

          {/* Search box (Figma 2303:149) — filters the 3D scene. Sits
              in the TOP NAV STRIP between the About link and the
              BokBok logo, not on the main canvas. The SVG renders
              slightly outside its bbox (inner -1.63% −0.23% inset)
              to compensate for stroke overflow. */}
          <div className="absolute left-[776.64px] top-[53.99px] z-[5] h-[30.66px] w-[219.71px]">
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

          {/* Enter fullscreen — top-right inside the main box. Resized
              from the original Figma 2114:258 dimensions (39.52×42.19)
              to match the × close-to-home button's 32.12×32.5 footprint
              so the two buttons (which occupy the same visual slot, on
              different pages) read at the same weight. The SVG uses
              preserveAspectRatio="none" so a slight aspect change is
              harmless. Position aligned with the × button at (957, 107)
              page coords (= Figma hidden frame 2288:47). */}
          <button
            type="button"
            onClick={toggleFullscreen}
            title="Enter full screen"
            className="tool-hit absolute z-[20] block cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:opacity-80"
            style={{ left: 957, top: 107, width: 32.12, height: 32.5 }}
          >
            <img
              alt=""
              src="/assets/full-screen-button.svg"
              className="block size-full"
            />
          </button>

          {/* Reset View removed: clicking the currently-focused creature
              again now zooms back out (toggle behavior in handleSelect). */}

          {/* BokBok button (Figma 2127:147) — hand-shaped button.
              Toggles "pet mode": when on, the cursor becomes a hand and
              clicking a creature makes it shake wildly. Press again (or
              Escape) to exit pet mode.
              Position/size/inner-text inset come straight from Figma:
              frame (131, 813), 52 × 49, BokBok text 13 px in the lower
              half (40.24% from top). Lives in the bottom-left button
              row alongside Candy + Pinset. */}
          <button
            type="button"
            onClick={togglePetMode}
            aria-pressed={petMode}
            className="tool-hit tool-mode absolute left-[131px] top-[813px] z-[20] block h-[49px] w-[52px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
          >
            {/* The vector slightly overflows the frame by -1.02%/-0.96%
                (Figma 2127:147 export) so the stroke isn't clipped.
                The fill colour is baked into the SVG (#BFB5A0) so we
                no longer need a separate bg-grain overlay behind it. */}
            <div
              className="absolute"
              style={{ inset: "-1.02% -0.96%" }}
            >
              <img
                alt=""
                src="/assets/bokbok-button.svg"
                className="block size-full max-w-none"
              />
            </div>
            <span
              className="absolute flex items-center justify-center text-center text-[13px] font-bold leading-[normal] text-black"
              style={{ inset: "40.24% 3.83% 21.04% 5.15%" }}
            >
              {t("main.bokbok_button")}
            </span>
          </button>

          {/* Pinset button (Figma 2379:16 open / 2379:17 close) — sits
              right of the BokBok button. Toggles "pinset mode": cursor
              becomes the open-tweezers SVG, and clicking a creature
              "grabs" it (cursor swaps to closed tweezers, creature
              follows the pointer until you click again to release or
              press Escape).
              Position + size from Figma frame: (195.24, 813), 40.27 ×
              50.06. */}
          <button
            type="button"
            onClick={togglePinsetMode}
            aria-pressed={pinsetMode}
            title={pinsetMode ? "Exit pinset" : "Pinset — pick up a creature"}
            className="tool-hit tool-mode absolute z-[20] block cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
            style={{ left: 195.24, top: 813, width: 40.27, height: 50.06 }}
          >
            <img
              alt=""
              src={pinsetMode && heldId ? "/assets/pinset-close.svg" : "/assets/pinset-open.svg"}
              className="block size-full max-w-none"
              draggable={false}
            />
          </button>

          {/* Ball button (Figma 2380:52) — toggles ball mode. Clicking
              the ground throws the ball at that XZ; a random visible
              creature picks it up and brings it back to origin.
              Position + size from Figma frame: (253, 816), 43.55 × 45.64. */}
          <button
            type="button"
            onClick={toggleBallMode}
            aria-pressed={ballMode}
            title={ballMode ? "Exit ball" : "Ball — throw to play fetch"}
            className="tool-hit tool-mode absolute z-[20] block cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
            style={{ left: 253, top: 816, width: 43.55, height: 45.64 }}
          >
            <img
              alt=""
              src="/assets/ball-button.svg"
              className="block size-full max-w-none"
              draggable={false}
            />
          </button>

          {/* Whistle button (Figma 2380:57) — toggles whistle mode.
              Clicking the ground summons the whole flock to that point
              (the legacy candy gather behaviour now lives here).
              Position + size from Figma frame: (314, 820), 59.84 × 41.57. */}
          <button
            type="button"
            onClick={toggleWhistleMode}
            aria-pressed={whistleMode}
            title={whistleMode ? "Exit whistle" : "Whistle — summon the flock"}
            className="tool-hit tool-mode absolute z-[20] block cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
            style={{ left: 314, top: 820, width: 59.84, height: 41.57 }}
          >
            <img
              alt=""
              src="/assets/whistle-button.svg"
              className="block size-full max-w-none"
              draggable={false}
            />
          </button>

          {/* Shooting-star button (Figma 2404:224) — sits right of the
              whistle. ONE-SHOT: pressing it streaks a star across the top
              of the 3D viewport while every creature freezes in place and
              looks up to watch. Not a mode (no cursor / no scene click),
              so it never enters exitAllModes. Disabled while a star is
              already in flight so rapid presses don't stack. Bottom-
              aligned (~861) with the whistle; ~17 px gap to its right. */}
          <button
            type="button"
            onClick={triggerShootingStar}
            disabled={stargazing}
            title="Shooting star — everyone stops to watch"
            className={`tool-hit absolute z-[20] block overflow-visible bg-transparent p-0 transition-transform ${
              stargazing
                ? "cursor-default opacity-50"
                : "cursor-pointer hover:opacity-90 active:scale-95"
            }`}
            style={{ left: 391, top: 814, width: 42, height: 47 }}
          >
            <img
              alt=""
              src="/assets/shootingstar-button.svg"
              className="block size-full max-w-none"
              draggable={false}
            />
          </button>

          {/* Candy button (Figma 2239:1401) — bottom-left of the main
              page. Toggles candy mode: cursor becomes a candy icon and
              clicking the ground sprinkles treats; creatures nearby
              come over and eat them. Pressing again (or Escape) leaves
              candy mode. */}
          <CandyButton active={candyMode} onToggle={toggleCandyMode} />
        </>
      )}

      {/* Main canvas box — 3D viewport with click-to-select on creatures.
          In fullscreen mode it stretches (in design coords) to fill the
          actual window regardless of aspect ratio. Canvas instance is
          retained so the 3D scene state survives the toggle. */}
      <MainViewport
        onCreatureSelect={handleSelect}
        selectedCreatureId={selected?.id ?? null}
        query={query}
        focusTarget={focusTarget}
        resetTrigger={resetTrigger}
        fullscreen={isFullscreen}
        petMode={petMode}
        candyMode={candyMode}
        pinsetMode={pinsetMode}
        heldId={heldId}
        ballMode={ballMode}
        whistleMode={whistleMode}
        stargazing={stargazing}
        onPinsetGrab={handlePinsetGrab}
        onPinsetRelease={handleHeldClickRelease}
        onCandyClick={handleSceneClick}
        onEmptyGroundClick={handleEmptyGroundClick}
        onCreatureHover={setHoveredCreature}
        onPetComplete={handlePetComplete}
      />

      {/* Hover tooltip (Figma 2130:272) — name on top, date YYYYMMDD below.
          Position offsets clear the hand-drawn cursor: the SVG cursor is
          22×27 px with hotspot (4, 0), so its body extends from (x-4, y)
          to (x+18, y+27). Tooltip top is set to y+32 (5 px gap past the
          cursor's bottom edge) and left to x+14 (just right of the cursor
          shaft) so the two never overlap. z-[200] keeps it above the
          right-side panels and the wavy main-box overlay. */}
      {hoveredCreature && !petMode && (() => {
        // Per-creature accent for both highlight strokes — same id-hash
        // pick the BokBokpedia / Calendar selections use, so a creature
        // keeps the same accent everywhere. Opacity is baked into the
        // hover SVGs (0.3, the design's published value).
        const hoverColor = creatureHighlightColor(hoveredCreature);
        const bg = (url: string) => ({
          backgroundImage: url,
          backgroundRepeat: "no-repeat" as const,
          backgroundSize: "100% 11px",
          backgroundPosition: "center",
        });
        return (
          <div
            className="pointer-events-none absolute z-[200] whitespace-nowrap text-center text-[16px] font-bold leading-normal text-black font-(family-name:--font-casual)"
            style={{ left: hoverPos.x + 14, top: hoverPos.y + 32 }}
          >
            <p className="m-0">
              {/* inline-block so the background-image hugs the text bbox
                  instead of spanning the wider <p>. px-1 gives a small
                  overhang so the marker stroke reads as a swipe past the
                  glyphs, matching the BokBokpedia / Calendar treatments. */}
              <span className="inline-block px-1" style={bg(hoverNameHighlightUrl(hoverColor))}>
                {hoveredCreature.name ?? "Creature"}
              </span>
            </p>
            <p className="m-0">
              <span className="inline-block px-1" style={bg(hoverDateHighlightUrl(hoverColor))}>
                {hoveredCreature.dateISO?.replace(/-/g, "") ?? ""}
              </span>
            </p>
          </div>
        );
      })()}

      {/* Right-side panels — hidden in fullscreen mode. */}
      {!isFullscreen && (
      <>
      {/* Right viewport — energy blocks composition (Figma 2096:102).
          A 2-column grid of block thumbnails with name labels below. */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        <div className="scroll-fade-vertical pointer-events-auto absolute inset-[14px] overflow-y-auto overflow-x-hidden">
          {selected ? (
            <div className="grid grid-cols-2 gap-x-[36px] gap-y-[18px] px-[26px] pt-[3px] pb-[10px]">
              {selected.emotions.map(({ key, displayName }) => {
                const e = emotionByKey(key);
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center gap-[3px]"
                  >
                    <img
                      alt=""
                      src={e?.imagePath}
                      className="block h-[135px] w-[135px] select-none object-contain"
                      draggable={false}
                    />
                    <span className="text-center text-[16px] font-bold leading-normal text-black">
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
              {t("panel.click_creature")}
              <br />
              {t("panel.bokbokpedia_to_view")}
            </div>
          )}
        </div>
      </div>

      {/* Info panel (bottom right) — name, date, journal entry, edit */}
      <div className="absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px] overflow-hidden">
        {/* Box border */}
        <img
          alt=""
          src="/assets/info-vector2.svg"
          className="pointer-events-none absolute inset-[0.13%] block size-full"
        />
        {/* Left edge squiggly line */}
        <div className="pointer-events-none absolute" style={{ inset: "0.96% 98.1% 0.97% 0.13%" }}>
          <div className="absolute" style={{ inset: "0 -7.08%" }}>
            <img
              alt=""
              src="/assets/info-vector1.svg"
              className="block size-full max-w-none"
            />
          </div>
        </div>

        {/* Name + date — flex column so long names wrap and push the
            date down naturally instead of overflowing the wavy frame. */}
        <div className="absolute left-[20px] right-[20px] top-[15px] flex flex-col items-center text-center">
          <h2 className="m-0 max-w-full break-words text-[36px] leading-[1.05] text-black font-(family-name:--font-fancy)">
            {selected?.name ?? t("panel.empty_name")}
          </h2>
          <span className="mt-[2px] text-[18px] font-bold leading-none text-black">
            {selected?.dateISO ?? "—"}
          </span>
        </div>

        {/* Diary text — scrollable */}
        <div className="scroll-fade-vertical absolute left-[26px] right-[18px] top-[110px] bottom-[58px] flex flex-col items-center overflow-y-auto overflow-x-hidden">
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
                  {t("panel.no_journal_manual")}
                </p>
              )
            ) : (
              <p className="text-black/40">
                {t("panel.pick_from_bokbokpedia")}
              </p>
            )}
          </div>
        </div>

        {/* Download button (Figma 2098:137) — saves the selected creature as PNG. */}
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

        {/* Edit button — routes to the page that originally created the
            creature, with ?edit=<id> so that page can hydrate state. */}
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

        {/* Delete button — removes the selected creature from the ecosystem. */}
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
      </>
      )}
    </div>
  );
}
