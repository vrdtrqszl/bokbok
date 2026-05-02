"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import { Suspense, useEffect, useRef, useState } from "react";
import { MOUSE, Vector3 } from "three";
import EcosystemCreatures from "./EcosystemCreatures";
import type { CreatureSpec } from "@/lib/creature";

type CameraApi = {
  zoomIn: () => void;
  zoomOut: () => void;
  viewAxis: (axis: "x" | "y" | "z") => void;
};

export type FocusTarget = {
  /** Where to look (creature world position) */
  position: [number, number, number];
  /** Bumped each search so the same creature can be re-focused */
  ts: number;
};

function ControlsBridge({
  apiRef,
  panMode,
  focusTarget,
}: {
  apiRef: React.RefObject<CameraApi | null>;
  panMode: boolean;
  focusTarget?: FocusTarget | null;
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

  // When focusTarget changes (search Enter), kick off a smooth zoom to it.
  useEffect(() => {
    if (!focusTarget) return;
    const target = new Vector3(...focusTarget.position);
    // Camera offset: close-in, slightly above and to the side of the target.
    const offset = new Vector3(
      target.x + 1.6,
      target.y + 0.8,
      target.z + 1.6,
    );
    animRef.current = { target, position: offset };
  }, [focusTarget?.ts]);

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
      // World-space: snap to the world x/y/z axis (camera at target ± distance
      // along that axis), independent of any object rotation.
      viewAxis: (axis) => {
        const c = controlsRef.current;
        if (!c) return;
        const distance = c.object.position.distanceTo(c.target);
        const t = c.target;
        if (axis === "x") c.object.position.set(t.x + distance, t.y, t.z);
        if (axis === "y") c.object.position.set(t.x, t.y + distance, t.z);
        if (axis === "z") c.object.position.set(t.x, t.y, t.z + distance);
        c.object.up.set(0, 1, 0);
        c.update();
      },
    };
  }, [apiRef]);

  return (
    <OrbitControls
      ref={controlsRef}
      mouseButtons={{
        LEFT: panMode ? MOUSE.PAN : MOUSE.ROTATE,
        MIDDLE: MOUSE.DOLLY,
        RIGHT: MOUSE.PAN,
      }}
      minDistance={2}
      maxDistance={20}
    />
  );
}

export default function MainViewport({
  onCreatureSelect,
  selectedCreatureId,
  query,
  focusTarget,
}: {
  onCreatureSelect?: (c: CreatureSpec) => void;
  selectedCreatureId?: string | null;
  query?: string;
  focusTarget?: FocusTarget | null;
} = {}) {
  const apiRef = useRef<CameraApi | null>(null);
  const [panMode, setPanMode] = useState(false);

  const axisBtn = (axis: "x" | "y" | "z") => () => apiRef.current?.viewAxis(axis);

  return (
    <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
      {/* 3D viewport — fills the box, behind decorative outline and gizmo/tools */}
      <div className="absolute inset-[12px]">
        <Canvas
          camera={{ position: [3, 2, 5], fov: 45 }}
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
          <ControlsBridge apiRef={apiRef} panMode={panMode} focusTarget={focusTarget} />
        </Canvas>
      </div>

      {/* Hand-drawn outline — decorative only */}
      <img
        alt=""
        src="/assets/main-box.svg"
        className="pointer-events-none absolute inset-0 block size-full"
      />

      {/* Gizmo — x/y/z buttons snap camera to that axis view */}
      <div className="pointer-events-none absolute left-[866.59px] top-[37px] h-[89.17px] w-[81.06px]">
        <div className="absolute" style={{ inset: "24.54% 46.25% 16.54% 52.38%" }}>
          <div className="absolute" style={{ inset: "-0.1% -44.65% 0 -44.91%" }}>
            <img alt="" src="/assets/gizmo-v4.svg" className="block size-full max-w-none" />
          </div>
        </div>

        <div
          className="absolute flex items-center justify-center"
          style={{ inset: "34.7% 25.12% 25.77% 21.31%", containerType: "size" }}
        >
          <div
            className="flex-none"
            style={{
              height: "hypot(8.30944cqw, 86.6598cqh)",
              width: "hypot(91.6906cqw, -13.3402cqh)",
              transform: "rotate(-6.74deg)",
            }}
          >
            <div className="relative size-full">
              <div className="absolute" style={{ inset: "-1.41% -2.73% -1.92% -0.62%" }}>
                <img alt="" src="/assets/gizmo-v5.svg" className="block size-full max-w-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute" style={{ inset: "35.39% 22.23% 27.4% 23.32%" }}>
          <div className="absolute" style={{ inset: "-1.86% -3.21% -1.18% -0.7%" }}>
            <img alt="" src="/assets/gizmo-v6.svg" className="block size-full max-w-none" />
          </div>
        </div>

        <div className="absolute" style={{ inset: "18.79% 0 58.98% 76.62%" }}>
          <div className="absolute" style={{ inset: "-2.52% -2.64%" }}>
            <img alt="" src="/assets/gizmo-v7.svg" className="block size-full max-w-none" />
          </div>
        </div>

        <div
          className="absolute flex items-center justify-center"
          style={{ inset: "22.72% 74.58% 54.69% 0", containerType: "size" }}
        >
          <div
            className="flex-none"
            style={{
              height: "hypot(10.2975cqw, 89.1643cqh)",
              width: "hypot(89.7025cqw, -10.8357cqh)",
              transform: "rotate(-6.74deg)",
            }}
          >
            <div className="relative size-full">
              <div className="absolute" style={{ inset: "-2.71% -2.69%" }}>
                <img alt="" src="/assets/gizmo-v8.svg" className="block size-full max-w-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute" style={{ inset: "69.73% 74.3% 14.74% 4.43%" }}>
          <div className="absolute" style={{ inset: "-3.74% -2.9% -3.61% -2.9%" }}>
            <img alt="" src="/assets/gizmo-v9.svg" className="block size-full max-w-none" />
          </div>
        </div>

        <div className="absolute" style={{ inset: "82.85% 34.94% 0 42.45%" }}>
          <div className="absolute" style={{ inset: "-2.91% -2.73% -3.27% -2.73%" }}>
            <img alt="" src="/assets/gizmo-v10.svg" className="block size-full max-w-none" />
          </div>
        </div>

        <div
          className="absolute flex items-center justify-center"
          style={{ inset: "61.91% 2.75% 12.95% 71.56%", containerType: "size" }}
        >
          <div
            className="flex-none"
            style={{
              height: "hypot(11.4773cqw, 90.2853cqh)",
              width: "hypot(88.5227cqw, -9.71466cqh)",
              transform: "rotate(-6.74deg)",
            }}
          >
            <div className="relative size-full">
              <div className="absolute" style={{ inset: "-2.45% -2.69%" }}>
                <img alt="" src="/assets/gizmo-v11.svg" className="block size-full max-w-none" />
              </div>
            </div>
          </div>
        </div>

        <div className="absolute" style={{ inset: "5.04% 35.36% 74.74% 40.1%" }}>
          <div className="absolute" style={{ inset: "-2.77% -2.51%" }}>
            <img alt="" src="/assets/gizmo-v12.svg" className="block size-full max-w-none" />
          </div>
        </div>

        <button
          type="button"
          onClick={axisBtn("x")}
          className="pointer-events-auto absolute flex cursor-pointer flex-col items-center justify-center bg-transparent p-0 text-center text-[16px] font-bold leading-none text-black hover:text-red-700"
          style={{ inset: "0 37.81% 74.21% 41.22%" }}
        >
          x
        </button>
        <button
          type="button"
          onClick={axisBtn("y")}
          className="pointer-events-auto absolute flex cursor-pointer flex-col items-center justify-center bg-transparent p-0 text-center text-[16px] font-bold leading-none text-black hover:text-green-700"
          style={{ inset: "15.7% 2.03% 58.51% 77%" }}
        >
          y
        </button>
        <button
          type="button"
          onClick={axisBtn("z")}
          className="pointer-events-auto absolute flex cursor-pointer flex-col items-center justify-center bg-transparent p-0 text-center text-[16px] font-bold leading-none text-black hover:text-blue-700"
          style={{ inset: "60.61% 4.73% 13.59% 74.29%" }}
        >
          z
        </button>
      </div>

      {/* Tools — hand toggles pan mode, zoom in/out steps camera distance */}
      <button
        type="button"
        aria-pressed={panMode}
        onClick={() => setPanMode((p) => !p)}
        title={panMode ? "Pan mode (active)" : "Pan mode (click to enable)"}
        className={`absolute left-[930px] top-[677px] h-[31.96px] w-[32.62px] cursor-pointer bg-transparent p-0 transition-opacity ${
          panMode ? "opacity-100" : "opacity-60 hover:opacity-90"
        }`}
      >
        <img alt="hand (pan mode)" src="/assets/hand.svg" className="block size-full" />
      </button>
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
    </div>
  );
}
