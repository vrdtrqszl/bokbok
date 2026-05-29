"use client";

import { Canvas, useFrame, useLoader, useThree } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Plane, Raycaster, RepeatWrapping, TextureLoader, Vector2, Vector3 } from "three";
import EcosystemCreatures, { setEcosystemZoomDistance, pinsetTarget } from "./EcosystemCreatures";
import CreaturesErrorBoundary from "./CreaturesErrorBoundary";
import SoundToggle from "./SoundToggle";
import type { CreatureSpec } from "@/lib/creature";

// Match ViewportFit's design canvas. Used to compute the fullscreen
// wrapper's expanded design-space dimensions so it visually fills the
// actual viewport.
const DESIGN_W = 1440;
const DESIGN_H = 900;

type CameraApi = {
  zoomIn: () => void;
  zoomOut: () => void;
};

export type FocusTarget = {
  /** Where to look (creature world position) */
  position: [number, number, number];
  /** Bumped each search so the same creature can be re-focused */
  ts: number;
  /** Camera distance from target. Falls back to FOCUS_DISTANCE when omitted.
   *  Pass a creature-sized value so big creatures don't get clipped. */
  distance?: number;
  /** World-space offset added to `position` to recenter the camera on the
   *  creature's visual bbox center (instead of its group origin). */
  targetOffset?: [number, number, number];
};

export type ResetTrigger = {
  /** Bumped to re-fire a reset-to-initial-view animation. */
  ts: number;
};

// Slightly tilted bird's-eye default view (high angle, not full top-down).
// Camera is locked to this direction — only zoom in/out is allowed. Distance
// matches the original layout the user signed off on.
// Default camera position. Distance from the target (origin) = √(16² + 7²)
// = √305 ≈ 17.46 world units. Bumped up from the previous (0, 14, 6)
// (≈ 15.23 units) to give the room slightly more breathing space — the
// flock now reads as "creatures in a wider garden" instead of filling
// the frame edge-to-edge. Keep this value in sync with
// DEFAULT_CAMERA_DISTANCE inside EcosystemCreatures.tsx so the zoom-
// scaled wandering radius treats THIS position as zoomFactor = 1.
const INITIAL_CAMERA_POSITION = new Vector3(0, 16, 7);
const INITIAL_CAMERA_TARGET = new Vector3(0, 0, 0);
// Normalised look direction. Reused when focusing on a clicked creature so
// the angle stays consistent (only the distance changes).
const BIRDS_EYE_DIR = INITIAL_CAMERA_POSITION.clone().normalize();
const FOCUS_DISTANCE = 2.5;

function ControlsBridge({
  apiRef,
  focusTarget,
  resetTrigger,
}: {
  apiRef: React.RefObject<CameraApi | null>;
  focusTarget?: FocusTarget | null;
  resetTrigger?: ResetTrigger | null;
}) {
  // OrbitControls' underlying instance type isn't exported cleanly across drei versions; use loose typing.
  const controlsRef = useRef<any>(null);

  // Animation: lerp camera + target toward `animRef.current` each frame.
  const animRef = useRef<{ target: Vector3; position: Vector3 } | null>(null);

  // Ambient camera drift — slowly orbits + bobs the polar angle when
  // the user isn't actively interacting and no focus/reset tween is
  // running. Tracks last interaction so we can pause for a few
  // seconds after the user touches the camera before resuming.
  const interactingRef = useRef(false);
  const lastInteractionMsRef = useRef(0);
  // Polar wobble velocity (rad/sec). Bounces between PHI_MIN and
  // PHI_MAX so the drift always continues smoothly from whatever
  // polar angle the user / focus animation left the camera at — the
  // sign of this velocity carries the current direction across
  // interaction pauses, no phase reset / snap.
  const phiVelocityRef = useRef(0.012);

  // WASD / arrow-key pan — translates the OrbitControls target AND
  // the camera together along the ground plane (XZ). Forward is the
  // camera→target direction projected to XZ, so the keys move "into
  // the scene" regardless of how the user has rotated the view. Speed
  // scales with current zoom distance so panning feels equally
  // responsive whether you're zoomed in tight on a creature or pulled
  // way out to see the whole ecosystem.
  //
  // The Set holds normalised direction names ("forward" / "backward" /
  // "left" / "right") rather than raw keys, so W and ArrowUp share a
  // slot — pressing both doesn't double-count.
  const keysDownRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    const isTypingTarget = (el: EventTarget | null): boolean => {
      if (!(el instanceof HTMLElement)) return false;
      if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") return true;
      if (el.isContentEditable) return true;
      return false;
    };
    const directionOf = (e: KeyboardEvent): string | null => {
      const k = e.key.toLowerCase();
      if (k === "w" || k === "arrowup") return "forward";
      if (k === "s" || k === "arrowdown") return "backward";
      if (k === "a" || k === "arrowleft") return "left";
      if (k === "d" || k === "arrowright") return "right";
      return null;
    };
    const onDown = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target)) return;
      // Skip shortcuts (Cmd+S, Ctrl+A, ...) so we don't fight the OS.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const d = directionOf(e);
      if (!d) return;
      keysDownRef.current.add(d);
    };
    const onUp = (e: KeyboardEvent) => {
      const d = directionOf(e);
      if (!d) return;
      keysDownRef.current.delete(d);
    };
    // Window blur (alt-tab, focus to another app) can swallow the
    // keyup, leaving a key "stuck" pressed forever. Clear everything
    // on blur as a safety net.
    const onBlur = () => keysDownRef.current.clear();
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onDown);
      window.removeEventListener("keyup", onUp);
      window.removeEventListener("blur", onBlur);
    };
  }, []);

  useEffect(() => {
    const c = controlsRef.current;
    if (!c) return;
    // Track interaction state purely for the AMBIENT DRIFT logic:
    // pause drift while the user is dragging the camera and for 30 s
    // after they let go. We no longer try to cancel in-flight focus /
    // reset tweens — the cancel logic was misfiring on plain creature
    // clicks (which also bubble pointerdown through OrbitControls),
    // breaking click-to-zoom. The focus animation is brief enough
    // that briefly fighting it during a drag is acceptable; users can
    // re-click the focused creature to fully release.
    const onStart = () => {
      interactingRef.current = true;
    };
    const onEnd = () => {
      interactingRef.current = false;
      lastInteractionMsRef.current = performance.now();
    };
    c.addEventListener("start", onStart);
    c.addEventListener("end", onEnd);
    return () => {
      c.removeEventListener("start", onStart);
      c.removeEventListener("end", onEnd);
    };
  }, []);

  useFrame((_, dt) => {
    const c = controlsRef.current;
    // Feed the current camera-to-target distance into the ecosystem
    // wanderer every frame so the wandering radius scales with zoom
    // level: zooming out pushes creatures further apart so they fill
    // the wider view; zooming back in toward default contracts them.
    // Zooming PAST default doesn't shrink below the base radius — the
    // ecosystem reads as appropriately dense at default zoom already.
    if (c) {
      setEcosystemZoomDistance(c.object.position.distanceTo(c.target));
    }

    const a = animRef.current;
    if (a && c) {
      // WASD overrides any in-flight focus / reset tween — the user
      // is taking manual control, don't fight them.
      if (keysDownRef.current.size > 0) {
        animRef.current = null;
      } else {
        c.target.lerp(a.target, 0.12);
        c.object.position.lerp(a.position, 0.12);
        c.update();
        if (
          c.target.distanceTo(a.target) < 0.005 &&
          c.object.position.distanceTo(a.position) < 0.005
        ) {
          c.target.copy(a.target);
          c.object.position.copy(a.position);
          animRef.current = null;
        }
        // While the focus/reset tween is running, skip ambient drift.
        return;
      }
    }

    // WASD / arrow-key pan. Runs every frame; if any direction key is
    // held, translate the camera + target together along the ground
    // plane. Cancels any in-flight tween (user is taking control) and
    // bumps the interaction timestamp so ambient drift stays paused
    // for ~30 s after the last key release.
    if (c && keysDownRef.current.size > 0) {
      // Camera→target direction projected onto the ground plane = forward.
      const camOffset = c.object.position.clone().sub(c.target);
      const forward = new Vector3(-camOffset.x, 0, -camOffset.z);
      if (forward.lengthSq() > 1e-8) {
        forward.normalize();
        // right = forward × worldUp = (-forward.z, 0, forward.x).
        const right = new Vector3(-forward.z, 0, forward.x);

        const delta = new Vector3();
        const k = keysDownRef.current;
        if (k.has("forward")) delta.add(forward);
        if (k.has("backward")) delta.sub(forward);
        if (k.has("right")) delta.add(right);
        if (k.has("left")) delta.sub(right);

        if (delta.lengthSq() > 1e-8) {
          // Speed scales with zoom — panning feels the same near and
          // far. Floor at 2 u/s so even tight zooms move noticeably.
          const distance = camOffset.length();
          const speedPerSec = Math.max(2, distance * 0.6);
          delta.normalize().multiplyScalar(speedPerSec * dt);
          c.target.add(delta);
          c.object.position.add(delta);
          c.update();
          lastInteractionMsRef.current = performance.now();
          return; // skip ambient drift while panning
        }
      }
    }

    // Ambient drift — only when the user isn't dragging AND it's been
    // ~30 seconds since they last released the camera. Long pause so a
    // deliberate "I want to look at this angle" hold doesn't immediately
    // get pulled away by the drift.
    if (!c) return;
    if (interactingRef.current) return;
    if (performance.now() - lastInteractionMsRef.current < 30000) return;

    // Read current spherical coords from actual camera position so
    // the drift always continues smoothly from where the user (or a
    // focus / reset tween) left off — no phase reset, no snap.
    const offset = c.object.position.clone().sub(c.target);
    const r = offset.length();
    // Polar (phi): 0 = straight up, π/2 = horizon.
    const currentPhi = Math.acos(Math.max(-1, Math.min(1, offset.y / r)));
    // Azimuth (theta): around the y-axis.
    const currentTheta = Math.atan2(offset.x, offset.z);

    // Azimuth drift: monotonic ~0.045 rad/sec → full lap in ~140 s.
    const nextTheta = currentTheta + dt * 0.045;

    // Polar drift: linear at phiVelocityRef rad/sec, bouncing between
    // PHI_MIN and PHI_MAX. The sign of the velocity carries direction
    // across interaction pauses so resume continues smoothly from
    // wherever the user left off, in whatever direction the wobble
    // was going. ~0.012 rad/sec ≈ one full PHI_MIN→PHI_MAX traversal
    // every ~100 s.
    const PHI_MIN = Math.PI / 12;            // ~15°  (lifted, near top-down)
    const PHI_MAX = Math.PI / 2 - 0.08;      // ~85°  (near horizon)
    let nextPhi = currentPhi + phiVelocityRef.current * dt;
    if (nextPhi > PHI_MAX) {
      nextPhi = PHI_MAX;
      phiVelocityRef.current = -Math.abs(phiVelocityRef.current);
    } else if (nextPhi < PHI_MIN) {
      nextPhi = PHI_MIN;
      phiVelocityRef.current = Math.abs(phiVelocityRef.current);
    }

    // Convert spherical → cartesian. Three.js convention here:
    //   x = r * sin(phi) * sin(theta)
    //   y = r * cos(phi)
    //   z = r * sin(phi) * cos(theta)
    // Matches atan2(offset.x, offset.z) used above.
    const sinPhi = Math.sin(nextPhi);
    c.object.position.set(
      c.target.x + r * sinPhi * Math.sin(nextTheta),
      c.target.y + r * Math.cos(nextPhi),
      c.target.z + r * sinPhi * Math.cos(nextTheta),
    );
    c.update();
  });

  // When focusTarget changes (search Enter or 3D click), kick off a smooth
  // zoom to it. The caller passes a distance sized to the creature's bbox
  // and an optional targetOffset to recenter the camera on the visible
  // creature center (vs the group origin) so asymmetric creatures fill the
  // box without empty bands on one side.
  useEffect(() => {
    if (!focusTarget) return;
    const target = new Vector3(...focusTarget.position);
    if (focusTarget.targetOffset) {
      target.x += focusTarget.targetOffset[0];
      target.y += focusTarget.targetOffset[1];
      target.z += focusTarget.targetOffset[2];
    }
    const distance = focusTarget.distance ?? FOCUS_DISTANCE;
    const offset = BIRDS_EYE_DIR.clone().multiplyScalar(distance);
    const position = target.clone().add(offset);
    animRef.current = { target, position };
  }, [focusTarget?.ts]);

  // Reset View button — smoothly return the camera to its initial pose.
  useEffect(() => {
    if (!resetTrigger) return;
    animRef.current = {
      target: INITIAL_CAMERA_TARGET.clone(),
      position: INITIAL_CAMERA_POSITION.clone(),
    };
  }, [resetTrigger?.ts]);

  useEffect(() => {
    apiRef.current = {
      zoomIn: () => {
        const c = controlsRef.current;
        if (!c) return;
        const offset = c.object.position.clone().sub(c.target);
        offset.multiplyScalar(1 / 1.2);
        c.object.position.copy(c.target).add(offset);
        c.update();
      },
      zoomOut: () => {
        const c = controlsRef.current;
        if (!c) return;
        const offset = c.object.position.clone().sub(c.target);
        offset.multiplyScalar(1.2);
        c.object.position.copy(c.target).add(offset);
        c.update();
      },
    };
  }, [apiRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      // Free camera — rotate / pan / zoom. Constraints keep the view
      // reasonable: don't flip past horizon (no underground view) and
      // don't rotate so high overhead that we lose all spatial cues.
      enableRotate
      enablePan
      enableZoom
      minDistance={2}
      maxDistance={50}
      minPolarAngle={Math.PI / 12}
      maxPolarAngle={Math.PI / 2 - 0.08}
      rotateSpeed={0.6}
      panSpeed={0.6}
      zoomSpeed={0.6}
    />
  );
}

export default function MainViewport({
  onCreatureSelect,
  selectedCreatureId,
  query,
  focusTarget,
  resetTrigger,
  fullscreen = false,
  petMode = false,
  candyMode = false,
  pinsetMode = false,
  heldId = null,
  ballMode = false,
  whistleMode = false,
  onPinsetGrab,
  onPinsetRelease,
  onPetComplete,
  onCandyClick,
  onEmptyGroundClick,
  onCreatureHover,
  mobile = false,
}: {
  onCreatureSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selectedCreatureId?: string | null;
  query?: string;
  focusTarget?: FocusTarget | null;
  resetTrigger?: ResetTrigger | null;
  /** When true, expand to fill the whole window regardless of aspect ratio.
   *  The browser's native Fullscreen API handles Esc to exit; the page's
   *  fullscreenchange listener updates this flag back to false. */
  fullscreen?: boolean;
  /** When true, clicking a creature pets it (makes it shake) instead of focusing the camera. */
  petMode?: boolean;
  /** When true, clicking the ground plane fires onCandyClick(x, z) so
   *  the page can summon creatures to that point + play the candy rustle. */
  candyMode?: boolean;
  /** When true, the pinset (tweezers) is active. Clicking a creature
   *  fires onPinsetGrab; the cursor follows it and the creature snaps to
   *  the cursor's world-XZ until released. */
  pinsetMode?: boolean;
  /** Id of the currently-held creature (only meaningful while
   *  pinsetMode). Passed to EcosystemCreatures so the held creature
   *  overrides its wander to follow the cursor. */
  heldId?: string | null;
  /** Fires when a creature is tapped while pinsetMode is on AND no
   *  creature is currently held — i.e. the "grab" action. */
  onPinsetGrab?: (id: string) => void;
  /** Fires when the user releases (taps empty ground / presses Escape).
   *  Currently page-level state handles release directly; kept here for
   *  future per-frame release affordances. */
  onPinsetRelease?: () => void;
  /** Ball-throw mode — clicking the ground fires `onCandyClick(x, z)`
   *  (re-used as a generic scene-tap channel) so the page can throw
   *  the ball at that point. */
  ballMode?: boolean;
  /** Whistle mode — clicking the ground fires `onCandyClick(x, z)` so
   *  the page can summon the whole flock to that point. */
  whistleMode?: boolean;
  /** Fires after the user pets a creature (pet mode click). Lets the
   *  page auto-exit pet mode so the cursor returns to default — same
   *  single-shot UX as the candy/whistle/ball tools. */
  onPetComplete?: () => void;
  /** Fires with world-space XZ when the user clicks the ground (or any
   *  open scene area) while candy mode is on. */
  onCandyClick?: (x: number, z: number) => void;
  /** Fires on a tap (not drag) anywhere on empty ground when NO mode
   *  is active. Used by the page to reset the camera back to default
   *  — handy after deleting a creature you'd zoomed in on. */
  onEmptyGroundClick?: () => void;
  /** Fires with the hovered creature on enter, null on leave. */
  onCreatureHover?: (creature: CreatureSpec | null) => void;
  /** When true, fill the parent container instead of using the fixed Figma
   *  coords (27, 85, 974.69, 789.67). Drops the wavy outline + zoom buttons
   *  + sound toggle — mobile layouts host those affordances elsewhere. */
  mobile?: boolean;
} = {}) {
  const apiRef = useRef<CameraApi | null>(null);

  // Track the actual window size so the fullscreen box can expand in design
  // space to compensate for ViewportFit's letterboxing. The result is a box
  // that *visually* fills the entire window regardless of aspect ratio.
  const [winSize, setWinSize] = useState<{ w: number; h: number }>({
    w: DESIGN_W,
    h: DESIGN_H,
  });
  useEffect(() => {
    if (!fullscreen) return;
    const update = () =>
      setWinSize({ w: window.innerWidth, h: window.innerHeight });
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [fullscreen]);

  // In normal mode, the box sits at its Figma position inside the design
  // canvas. In fullscreen, expand it (in design coords) so that — after the
  // ViewportFit transform — it visually fills 100% of the window. In mobile
  // mode, the wrapper fills its parent (the mobile layout sizes the parent
  // container itself, e.g. to 55vh).
  const wrapperStyle = (() => {
    if (mobile) {
      return { left: 0, top: 0, right: 0, bottom: 0 } as const;
    }
    if (!fullscreen) {
      return { left: 27, top: 85, width: 974.69, height: 789.67 };
    }
    // ViewportFit applies scale s = min(W/DESIGN_W, H/DESIGN_H). The viewport,
    // expressed in design coords, is W/s × H/s — which is ≥ 1440 × 900 in at
    // least one dimension. With the wavy outline removed, the wrapper can
    // fill the whole window edge-to-edge.
    const s = Math.min(winSize.w / DESIGN_W, winSize.h / DESIGN_H);
    const dw = winSize.w / s;
    const dh = winSize.h / s;
    return {
      left: (DESIGN_W - dw) / 2,
      top: (DESIGN_H - dh) / 2,
      width: dw,
      height: dh,
    };
  })();

  return (
    <div className="absolute" style={wrapperStyle}>
      {/* 3D viewport wrapper — uses Tailwind utilities for explicit pixel
          width/height. Inline style + spread didn't size react-three-fiber's
          Canvas correctly (it kept rendering at the HTML canvas default
          ~300×150 in the top-left). Tailwind generates `width: 945px;
          height: 769px` directly in stylesheet rules, which the Canvas's
          ResizeObserver picks up reliably. */}
      <div
        className={`scroll-fade ${
          fullscreen || mobile
            ? "absolute inset-0"
            : "absolute left-[18px] top-[10px] h-[769px] w-[945px]"
        }`}
      >
        <Canvas
          camera={{
            position: [
              INITIAL_CAMERA_POSITION.x,
              INITIAL_CAMERA_POSITION.y,
              INITIAL_CAMERA_POSITION.z,
            ],
            fov: 45,
          }}
          // CRITICAL: offsetSize uses offsetWidth/offsetHeight (pre-transform)
          // instead of getBoundingClientRect (post-transform). Without this,
          // ViewportFit's CSS scale() makes r3f measure half-size, the canvas
          // gets sized to that half value, and then the transform scales the
          // rendered canvas AGAIN — double scaling, canvas ends up rendering
          // only in the top-left of the wrapper.
          resize={{ offsetSize: true }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 5, 5]} intensity={0.6} />
          <directionalLight position={[-3, -2, -4]} intensity={0.2} />

          {/* Soft beige fog gives the free camera some depth perception —
              creatures far from the camera fade toward the ground color
              so the flat plane doesn't read as an infinite sticker board. */}
          <fog attach="fog" args={["#dfd9c9", 22, 80]} />

          {/* Flat ground plane — tiled with the SAME bg-grain.jpg
              texture the page background uses (over the same #dfd9c9
              base colour), so the 3D ground reads as a continuation
              of the surrounding page instead of a brighter solid slab.
              Solid #dfd9c9 alone looked too light against the page
              because the grain JPG darkens the page's average pixel
              value. Suspense above (around the creatures) already
              handles the texture-load delay; ground falls back to
              transparent for the one frame before the image lands. */}
          <Suspense fallback={null}>
            <GroundPlane
              onCandyClick={
                candyMode || ballMode || whistleMode ? onCandyClick : undefined
              }
              onEmptyClick={
                candyMode || petMode || ballMode || whistleMode
                  ? undefined
                  : onEmptyGroundClick
              }
            />
          </Suspense>

          {/* Garden decorations (leaves / flowers / clovers / mushrooms)
              removed. The scene now reads as creatures floating over a
              clean grain-textured ground; if we want to bring the
              decorations back, the GardenDecorations component is
              still in app/_components/. */}

          <CreaturesErrorBoundary>
            <Suspense fallback={null}>
              <EcosystemCreatures
                onSelect={onCreatureSelect}
                selectedId={selectedCreatureId}
                query={query}
                petMode={petMode}
                candyMode={candyMode}
                ballMode={ballMode}
                whistleMode={whistleMode}
                pinsetMode={pinsetMode}
                heldId={heldId}
                onPinsetGrab={onPinsetGrab}
                onPinsetRelease={onPinsetRelease}
                onPetComplete={onPetComplete}
                onCandyClick={onCandyClick}
                onHover={onCreatureHover}
              />
            </Suspense>
          </CreaturesErrorBoundary>
          <ControlsBridge
            apiRef={apiRef}
            focusTarget={focusTarget}
            resetTrigger={resetTrigger}
          />
          {/* Mouse-to-ground tracker — when pinsetMode is on, each
              pointermove projects the cursor onto the y=0 ground plane
              and stores the world XZ in `pinsetTarget`. The held
              creature reads from that ref in its useFrame and snaps to
              the cursor every frame, giving a "pick up + move with
              tweezers" feel without any per-frame React state churn. */}
          <PinsetCursorTracker active={pinsetMode && !!heldId} />
        </Canvas>
      </div>

      {/* Hand-drawn outline — only in normal desktop mode. Removed in
          fullscreen + mobile per design (cleaner look, 3D scene fills
          edge-to-edge; the wavy outline only reads well at desktop scale). */}
      {!fullscreen && !mobile && (
        <img
          alt=""
          src="/assets/main-box.svg"
          className="pointer-events-none absolute inset-0 block size-full"
        />
      )}

      {/* Exit fullscreen button removed — browser's native Fullscreen
          API exits on Esc anyway. The page-level fullscreenchange
          listener picks up the state change and the UI re-renders. */}

      {/* Tools — sound on/off, zoom in/out. Hidden in fullscreen + mobile
          modes (the design omits them; double-click / pinch a creature to
          zoom). Sound toggle self-positions at the Figma frame coords
          (2238:1390 / 2238:1396); on/off icons have different bbox sizes
          so the component swaps its own left/top/width/height when state
          flips. */}
      {!fullscreen && !mobile && (
        <>
          <SoundToggle />
          {/* + / − zoom buttons: resized to 32.12 × 32.5 (same footprint
              as the × close button and the resized fullscreen button)
              and shifted to wrapper left=930 (=page x=957) so all four
              corner buttons share the same vertical axis on the right
              side of the main box. tops 701 / 737 give the lower
              button ~21 px breathing room from the main box's bottom
              wavy edge — not too tight (original 7 px) and not too
              floating (earlier 38 px). */}
          <button
            type="button"
            onClick={() => apiRef.current?.zoomIn()}
            title="Zoom in"
            className="absolute cursor-pointer bg-transparent p-0 opacity-80 hover:opacity-100"
            style={{ left: 930, top: 701, width: 32.12, height: 32.5 }}
          >
            <img alt="zoom in" src="/assets/zoom-in.svg" className="block size-full" />
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.zoomOut()}
            title="Zoom out"
            className="absolute cursor-pointer bg-transparent p-0 opacity-80 hover:opacity-100"
            style={{ left: 930, top: 737, width: 32.12, height: 32.5 }}
          >
            <img alt="zoom out" src="/assets/zoom-out.svg" className="block size-full" />
          </button>
        </>
      )}
    </div>
  );
}

/**
 * Listens for window pointermove while pinset-mode is "holding" a
 * creature. On each move, raycast from the camera through the cursor
 * into the y=0 ground plane and write the world XZ into the shared
 * `pinsetTarget` ref so the held creature's useFrame can snap to it.
 *
 * Lives INSIDE the <Canvas> so useThree() gives us the actual r3f
 * camera + canvas element (not the OrbitControls camera, which can
 * lag). Doing the math here per-pointer-move (rather than per-frame)
 * keeps the held creature's cursor-tracking instant without burning
 * cycles when the cursor isn't moving.
 */
function PinsetCursorTracker({ active }: { active: boolean }) {
  const { camera, gl, pointer } = useThree();
  // Stable scratch objects — avoid allocating per pointermove.
  const ndc = useRef(new Vector2()).current;
  const raycaster = useRef(new Raycaster()).current;
  const ground = useRef(new Plane(new Vector3(0, 1, 0), 0)).current;
  const out = useRef(new Vector3()).current;

  useEffect(() => {
    if (!active) {
      pinsetTarget.active = false;
      return;
    }
    pinsetTarget.active = true;

    // Initial projection from r3f's current pointer NDC so the
    // grabbed creature snaps to wherever the cursor IS right now,
    // not (0, 0), before the first pointermove fires.
    raycaster.setFromCamera(pointer, camera);
    if (raycaster.ray.intersectPlane(ground, out)) {
      pinsetTarget.x = out.x;
      pinsetTarget.z = out.z;
    }

    const canvas = gl.domElement;
    const onMove = (e: PointerEvent) => {
      const rect = canvas.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      if (raycaster.ray.intersectPlane(ground, out)) {
        pinsetTarget.x = out.x;
        pinsetTarget.z = out.z;
      }
    };
    window.addEventListener("pointermove", onMove);
    return () => {
      window.removeEventListener("pointermove", onMove);
      pinsetTarget.active = false;
    };
  }, [active, camera, gl, pointer]);

  return null;
}

/**
 * Flat ground plane tiled with the same `bg-grain.jpg` texture the page
 * `.bg-grain` background uses. Keeping the same texture (and the same
 * #dfd9c9 base colour the grain JPG sits on in CSS) means the 3D ground
 * blends seamlessly into the surrounding page — no visible seam at the
 * canvas edge.
 *
 * `RepeatWrapping` + a generous repeat count makes the grain pattern
 * dense enough that the viewer never sees a single stretched tile when
 * the camera is at default zoom. The plane itself is 200×200 world
 * units (big enough that wandering creatures never run off the edge).
 *
 * Lives outside the main component so `useLoader` can suspend cleanly
 * inside the parent `<Suspense>` boundary.
 */
function GroundPlane({
  onCandyClick,
  onEmptyClick,
}: {
  /** Set by the parent only when candy mode is on. When defined, ground
   *  clicks fire this with the world-space XZ so the page can summon
   *  creatures to that point. When undefined the ground is a passive
   *  visual — clicks pass through to OrbitControls as usual. */
  onCandyClick?: (x: number, z: number) => void;
  /** Set by the parent when no special mode is active. Fires on a TRUE
   *  TAP (pointer barely moved between down and up). We can't use
   *  r3f's onClick directly here — the ground plane is a giant 200×200
   *  mesh so even a long OrbitControls drag ends with the pointerup
   *  still on it, which onClick treats as a click and would cause an
   *  unintended camera reset. Tracking screen-space movement instead
   *  lets us suppress drag-end events. */
  onEmptyClick?: () => void;
} = {}) {
  const texture = useLoader(TextureLoader, "/assets/bg-grain.jpg");
  // Configure tiling once when the texture lands. 40×40 repeats over a
  // 200-unit plane gives ~5 world-units per tile — the texture grain
  // ends up at roughly the same visual density as it appears on the
  // surrounding page, regardless of camera zoom level.
  useMemo(() => {
    texture.wrapS = RepeatWrapping;
    texture.wrapT = RepeatWrapping;
    texture.repeat.set(40, 40);
    texture.needsUpdate = true;
  }, [texture]);

  // Tap detection: remember the screen-space pointer position on
  // pointerdown and compare against pointerup. If the cursor moved
  // more than TAP_MOVE_PX pixels, treat it as a drag (no tap fired).
  const tapDownRef = useRef<{ x: number; y: number; id: number } | null>(null);
  const TAP_MOVE_PX = 5;

  return (
    <mesh
      rotation={[-Math.PI / 2, 0, 0]}
      position={[0, -0.02, 0]}
      onPointerDown={
        onCandyClick
          ? (e) => {
              // Candy mode: pointerdown → summon. Stop propagation
              // so OrbitControls doesn't also start a drag.
              e.stopPropagation();
              onCandyClick(e.point.x, e.point.z);
            }
          : onEmptyClick
          ? (e) => {
              // Empty-tap detection: record the down position; do
              // NOT stop propagation, so OrbitControls still gets
              // the event and can start a rotate / pan drag.
              tapDownRef.current = {
                x: e.clientX,
                y: e.clientY,
                id: e.pointerId,
              };
            }
          : undefined
      }
      onPointerUp={
        !onCandyClick && onEmptyClick
          ? (e) => {
              const down = tapDownRef.current;
              tapDownRef.current = null;
              if (!down || down.id !== e.pointerId) return;
              const dx = e.clientX - down.x;
              const dy = e.clientY - down.y;
              // Was the pointer essentially stationary? → fire tap.
              // Otherwise the user was dragging OrbitControls and we
              // stay out of it.
              if (Math.hypot(dx, dy) <= TAP_MOVE_PX) onEmptyClick();
            }
          : undefined
      }
    >
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial map={texture} color="#dfd9c9" />
    </mesh>
  );
}
