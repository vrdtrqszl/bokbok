"use client";

// 3D scene that hosts a SINGLE creature — used by the encyclopedia
// detail box (and reusable anywhere a "focused creature, no flock"
// view is needed). Similar setup to MainViewport but stripped down:
//   • No EcosystemCreatures wander loop — one EnergyCreature pinned
//     at origin via `selected={true}` so the same breathing / squash
//     animations play but the creature doesn't drift out of frame.
//   • OrbitControls allow drag-to-rotate; the parent passes a ref to
//     drive zoom in / out from external buttons.
//   • Camera distance is sized to the creature's focus bbox so it
//     fills the canvas without clipping or empty bands.

import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls } from "@react-three/drei";
import {
  Suspense,
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from "react";
import { Vector3 } from "three";
import { EnergyCreature } from "./EcosystemCreatures";
import { creatureFocusBox, type CreatureSpec } from "@/lib/creature";

export type SingleCreatureSceneHandle = {
  zoomIn: () => void;
  zoomOut: () => void;
};

const BIRDS_EYE_DIR = new Vector3(0, 14, 6).normalize();

/** Camera distance sized to fit the creature's bbox. */
function fitDistance(creature: CreatureSpec): number {
  const bbox = creatureFocusBox(creature);
  // Same math as MainViewport.handleSelect: FOV=45 gives
  //   vertical fit:   d = halfH / tan(FOV/2) = halfH / 0.414
  //   horizontal fit: d = halfW / (tan(FOV/2)*aspect) ≈ halfW / 0.6
  // (aspect ≈ 1.14 for the 633×555 detail box → 0.4142*1.14 ≈ 0.472)
  // 1.25 padding so the creature has visible breathing space inside
  // the box rather than hugging the edges.
  const PAD = 1.25;
  const d_h = (bbox.halfWidth * PAD) / 0.472;
  const d_v = (bbox.halfHeight * PAD) / 0.4142;
  return Math.max(2.5, d_h, d_v);
}

/** Camera target = creature's bbox center (so asymmetric creatures
 *  sit visually centred in the frame). */
function fitTargetOffset(creature: CreatureSpec): Vector3 {
  const bbox = creatureFocusBox(creature);
  // Same projection as MainViewport: target Y offsets into the
  // camera-up plane (0, 0.394, -0.919) — derived from the BIRDS_EYE
  // direction. We only really need Y > 0 to compensate for the
  // creature's vertical centroid.
  return new Vector3(
    bbox.centerX,
    bbox.centerY * 0.394,
    bbox.centerY * -0.919,
  );
}

function CameraBridge({
  apiRef,
  creature,
}: {
  apiRef: React.RefObject<SingleCreatureSceneHandle | null>;
  creature: CreatureSpec;
}) {
  const controlsRef = useRef<any>(null);
  // Animate camera to initial position when creature changes.
  const animRef = useRef<{ target: Vector3; position: Vector3 } | null>(null);
  useEffect(() => {
    const target = fitTargetOffset(creature);
    const distance = fitDistance(creature);
    const position = target.clone().add(BIRDS_EYE_DIR.clone().multiplyScalar(distance));
    animRef.current = { target, position };
  }, [creature]);

  useFrame(() => {
    const a = animRef.current;
    const c = controlsRef.current;
    if (!a || !c) return;
    c.target.lerp(a.target, 0.18);
    c.object.position.lerp(a.position, 0.18);
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

  // Expose zoom in / out — multiply / divide the camera-to-target
  // distance, snapping the position along the existing look vector.
  useImperativeHandle(apiRef, () => ({
    zoomIn: () => {
      const c = controlsRef.current;
      if (!c) return;
      const offset = c.object.position.clone().sub(c.target).multiplyScalar(0.8);
      c.object.position.copy(c.target).add(offset);
      c.update();
    },
    zoomOut: () => {
      const c = controlsRef.current;
      if (!c) return;
      const offset = c.object.position.clone().sub(c.target).multiplyScalar(1.25);
      c.object.position.copy(c.target).add(offset);
      c.update();
    },
  }));

  return (
    <OrbitControls
      ref={controlsRef}
      makeDefault
      enablePan={false}
      enableDamping
      dampingFactor={0.1}
      // Lock vertical tilt so the user can spin around but can't tip
      // the camera past horizon (no upside-down creature).
      minPolarAngle={0.1}
      maxPolarAngle={Math.PI / 2 - 0.05}
    />
  );
}

export default forwardRef<SingleCreatureSceneHandle, { creature: CreatureSpec }>(
  function SingleCreatureScene({ creature }, ref) {
    const apiRef = useRef<SingleCreatureSceneHandle | null>(null);
    useImperativeHandle(ref, () => apiRef.current!);
    // Compute initial camera position synchronously so the very first
    // paint shows a properly-framed view (no jump after mount).
    const initialPosition = useMemo(() => {
      const target = fitTargetOffset(creature);
      const distance = fitDistance(creature);
      return target.clone().add(BIRDS_EYE_DIR.clone().multiplyScalar(distance));
    }, [creature]);
    return (
      <Canvas
        camera={{
          position: [initialPosition.x, initialPosition.y, initialPosition.z],
          fov: 45,
        }}
        resize={{ offsetSize: true }}
        style={{ background: "transparent" }}
      >
        <ambientLight intensity={0.85} />
        <directionalLight position={[5, 5, 5]} intensity={0.55} />
        <directionalLight position={[-3, -2, -4]} intensity={0.2} />
        {/* No ground plane — the detail-box card has its own beige
            background, so an extra ground would just make the canvas
            look heavier. */}
        <Suspense fallback={null}>
          {/* Selected={true} keeps the creature at origin (no wander),
              with its native breathing / squash animation still
              running for life. Click handlers no-op here. */}
          <EnergyCreature
            creature={creature}
            position={[0, 0, 0]}
            selected
          />
        </Suspense>
        <CameraBridge apiRef={apiRef} creature={creature} />
      </Canvas>
    );
  },
);
