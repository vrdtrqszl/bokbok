"use client";

import { Billboard } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { TextureLoader, type Group } from "three";
import { loadEcosystem, matchesCreatureQuery } from "@/lib/ecosystem";
import type { CreatureBlock, CreatureSpec } from "@/lib/creature";
import { EMOTION_LIST } from "@/lib/emotions";

// Load all 31 energy block textures up front. They're modest (~few hundred KB
// each at 2048², compressed) and the catalog is bounded, so this avoids
// per-creature suspense thrash.
const TEXTURE_PATHS = EMOTION_LIST.map((e) => e.imagePath);

function EnergyBlock({ block }: { block: CreatureBlock }) {
  const texture = useLoader(TextureLoader, block.imagePath);
  // Static placement — the BLOCK itself doesn't animate. The whole creature
  // group breathes and sways together (see EnergyCreature) so the body stays
  // connected like an animal, not a cluster of drifting orbs.
  return (
    <mesh
      position={[block.x, -block.y, block.zIndex * 0.001]}
      scale={block.scale}
      rotation={[0, 0, (block.rotation * Math.PI) / 180]}
      renderOrder={block.zIndex}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

function EnergyCreature({
  creature,
  position,
  onSelect,
  selected,
}: {
  creature: CreatureSpec;
  position: [number, number, number];
  onSelect?: (c: CreatureSpec) => void;
  selected?: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  const [hovered, setHovered] = useState(false);
  // Slow whole-creature drift: floats up and down + rotates very gently. Phase
  // is derived from the creature id so each one is on its own beat.
  const seedPhase = useMemo(() => {
    let h = 0;
    for (let i = 0; i < creature.id.length; i++) h = (h * 31 + creature.id.charCodeAt(i)) | 0;
    return ((h >>> 0) % 1000) / 1000;
  }, [creature.id]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = (g.userData.t = (g.userData.t ?? 0) + delta);
    const phase = seedPhase * Math.PI * 2;
    // Body moves as one connected creature — not loose floating blocks.
    g.position.y = position[1] + Math.sin(t * 0.8 + phase) * 0.18;
    g.position.x = position[0] + Math.sin(t * 0.5 + phase * 1.3) * 0.08;
    // Slight body tilt (z-roll) like a creature shifting weight.
    g.rotation.z = Math.sin(t * 0.6 + phase) * 0.04;
    // Breathing pulse on top of hover/select bump.
    const targetScale = selected ? 1.15 : hovered ? 1.08 : 1.0;
    const breath = 1 + Math.sin(t * 1.3 + phase) * 0.04;
    const cur = g.scale.x / (g.userData.lastBreath || 1);
    const next = cur + (targetScale - cur) * 0.15;
    g.scale.setScalar(next * breath);
    g.userData.lastBreath = breath;
  });

  return (
    <Billboard
      ref={groupRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        onSelect?.(creature);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        document.body.style.cursor = "pointer";
      }}
      onPointerOut={() => {
        setHovered(false);
        document.body.style.cursor = "";
      }}
    >
      {creature.blocks.map((b, i) => (
        <EnergyBlock key={i} block={b} />
      ))}
    </Billboard>
  );
}

function FallbackBox() {
  return (
    <mesh rotation={[0.4, 0.6, 0]}>
      <boxGeometry args={[2, 2, 2]} />
      <meshStandardMaterial color="#8b6f47" roughness={0.6} />
    </mesh>
  );
}

/**
 * Loads creatures from localStorage and renders them in 3D space, arranged on
 * a circle around the origin so the camera can orbit and see all of them.
 * Falls back to a placeholder cube while empty so the viewport isn't blank.
 */
export default function EcosystemCreatures({
  onSelect,
  selectedId,
  query,
}: {
  onSelect?: (c: CreatureSpec) => void;
  selectedId?: string | null;
  query?: string;
} = {}) {
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);

  useEffect(() => {
    setCreatures(loadEcosystem());
    const onChange = () => setCreatures(loadEcosystem());
    window.addEventListener("ecosystem:changed", onChange);
    // Cross-tab sync via the standard storage event
    window.addEventListener("storage", onChange);
    return () => {
      window.removeEventListener("ecosystem:changed", onChange);
      window.removeEventListener("storage", onChange);
    };
  }, []);

  // Preload all textures so suspense fires once at mount, not per creature.
  useLoader(TextureLoader, TEXTURE_PATHS);

  // Filter by search query — only matching creatures are placed in the scene.
  const visible = (query ?? "").trim()
    ? creatures.filter((c) => matchesCreatureQuery(c, query!))
    : creatures;

  if (visible.length === 0) {
    return <FallbackBox />;
  }

  return (
    <Suspense fallback={null}>
      {visible.map((c, i) => {
        const angle = (i / visible.length) * Math.PI * 2;
        const radius = visible.length === 1 ? 0 : 4;
        const pos: [number, number, number] = [
          Math.cos(angle) * radius,
          0,
          Math.sin(angle) * radius,
        ];
        return (
          <EnergyCreature
            key={c.id}
            creature={c}
            position={pos}
            onSelect={onSelect}
            selected={selectedId === c.id}
          />
        );
      })}
    </Suspense>
  );
}
