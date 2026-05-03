"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import { Vector3 } from "three";
import EcosystemCreatures from "./EcosystemCreatures";
import type { CreatureSpec } from "@/lib/creature";

// Match ViewportFit's design canvas. Used to compute the fullscreen box's
// expanded design-space dimensions so it visually fills the actual viewport.
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
};

export type ResetTrigger = {
  /** Bumped to re-fire a reset-to-initial-view animation. */
  ts: number;
};

// Slightly tilted bird's-eye default view (high angle, not full top-down).
// Camera is locked to this direction — only zoom in/out is allowed. Pulled
// far back so every creature on the radius-4 circle is visible at once.
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
  // zoom to it. We preserve the bird's-eye angle by using the same direction
  // as the initial camera, only varying distance.
  useEffect(() => {
    if (!focusTarget) return;
    const target = new Vector3(...focusTarget.position);
    const offset = BIRDS_EYE_DIR.clone().multiplyScalar(FOCUS_DISTANCE);
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
      // Camera is locked to the bird's-eye angle — only zoom is allowed.
      enableRotate={false}
      enablePan={false}
      enableZoom
      minDistance={2}
      maxDistance={30}
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
  // ViewportFit transform — it visually fills 100% of the window.
  const wrapperStyle = (() => {
    if (!fullscreen) {
      return { left: 27, top: 85, width: 974.69, height: 789.67 };
    }
    // ViewportFit applies scale s = min(W/DESIGN_W, H/DESIGN_H). The viewport,
    // expressed in design coords, is W/s × H/s — which is ≥ 1440 × 900 in at
    // least one dimension.
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
      {/* 3D viewport — fills the box, behind decorative outline and gizmo/tools */}
      <div className="absolute inset-[12px]">
        <Canvas
          camera={{
            position: [
              INITIAL_CAMERA_POSITION.x,
              INITIAL_CAMERA_POSITION.y,
              INITIAL_CAMERA_POSITION.z,
            ],
            fov: 45,
          }}
          style={{ background: "transparent" }}
        >
          <ambientLight intensity={0.8} />
          <directionalLight position={[5, 5, 5]} intensity={0.6} />
          <directionalLight position={[-3, -2, -4]} intensity={0.2} />
          <Suspense fallback={null}>
            <EcosystemCreatures
              onSelect={onCreatureSelect}
              selectedId={selectedCreatureId}
              query={query}
            />
          </Suspense>
          <ControlsBridge
            apiRef={apiRef}
            focusTarget={focusTarget}
            resetTrigger={resetTrigger}
          />
        </Canvas>
      </div>

      {/* Hand-drawn outline — decorative only. Different SVG for fullscreen
          since the hand-drawn waves are sized for the larger frame. */}
      <img
        alt=""
        src={fullscreen ? "/assets/fullscreen-box.svg" : "/assets/main-box.svg"}
        className="pointer-events-none absolute inset-0 block size-full"
      />

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

      {/* Tools — zoom in/out. Hidden in fullscreen mode (the design omits
          them; double-click a creature to zoom). Camera angle is locked to
          the bird's-eye view, so axis-snap and pan are gone. */}
      {!fullscreen && (
        <>
          <button
            type="button"
            onClick={() => apiRef.current?.zoomIn()}
            title="Zoom in"
            className="absolute left-[929px] top-[713px] h-[29.86px] w-[34.4px] cursor-pointer bg-transparent p-0 opacity-80 hover:opacity-100"
          >
            <img alt="zoom in" src="/assets/zoom-in.svg" className="block size-full" />
          </button>
          <button
            type="button"
            onClick={() => apiRef.current?.zoomOut()}
            title="Zoom out"
            className="absolute left-[929px] top-[747px] h-[31.13px] w-[34.33px] cursor-pointer bg-transparent p-0 opacity-80 hover:opacity-100"
          >
            <img alt="zoom out" src="/assets/zoom-out.svg" className="block size-full" />
          </button>
        </>
      )}
    </div>
  );
}
