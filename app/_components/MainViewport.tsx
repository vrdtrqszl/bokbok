"use client";

import { Canvas, useFrame, useLoader } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { RepeatWrapping, TextureLoader, Vector3 } from "three";
import EcosystemCreatures from "./EcosystemCreatures";
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
const INITIAL_CAMERA_POSITION = new Vector3(0, 14, 6);
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

  useFrame(() => {
    const a = animRef.current;
    const c = controlsRef.current;
    if (!a || !c) return;
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
  onExitFullscreen,
  petMode = false,
  onCreatureHover,
  mobile = false,
}: {
  onCreatureSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selectedCreatureId?: string | null;
  query?: string;
  focusTarget?: FocusTarget | null;
  resetTrigger?: ResetTrigger | null;
  /** When true, expand to fill the whole window regardless of aspect ratio. */
  fullscreen?: boolean;
  /** Called when the user clicks the exit-fullscreen button (only rendered in fullscreen). */
  onExitFullscreen?: () => void;
  /** When true, clicking a creature pets it (makes it shake) instead of focusing the camera. */
  petMode?: boolean;
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
            <GroundPlane />
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
                onHover={onCreatureHover}
              />
            </Suspense>
          </CreaturesErrorBoundary>
          <ControlsBridge
            apiRef={apiRef}
            focusTarget={focusTarget}
            resetTrigger={resetTrigger}
          />
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

      {/* Exit fullscreen button (Figma 2114:317) — top-right of the box,
          using right/top so it auto-follows the box as it stretches with
          the window. Offsets are derived from the original 1428×885 design
          (button at 1367.85, 15.94 inside the box). */}
      {fullscreen && onExitFullscreen && (
        <button
          type="button"
          onClick={onExitFullscreen}
          title="Exit full screen"
          className="absolute right-[21.94px] top-[15.94px] z-[20] block h-[41.15px] w-[38.53px] cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:opacity-80"
        >
          <img
            alt=""
            src="/assets/exit-fullscreen-button.svg"
            className="block size-full"
          />
        </button>
      )}

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
function GroundPlane() {
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
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.02, 0]}>
      <planeGeometry args={[200, 200]} />
      <meshBasicMaterial map={texture} color="#dfd9c9" />
    </mesh>
  );
}
