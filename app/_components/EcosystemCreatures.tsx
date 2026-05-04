"use client";

import { Billboard } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { TextureLoader, Vector3, type Group } from "three";
import { loadEcosystem, matchesCreatureQuery, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import type { CreatureBlock, CreatureSpec } from "@/lib/creature";
import { EMOTION_LIST } from "@/lib/emotions";

// Load all 31 energy block textures up front. They're modest (~few hundred KB
// each at 2048², compressed) and the catalog is bounded, so this avoids
// per-creature suspense thrash.
const TEXTURE_PATHS = EMOTION_LIST.map((e) => e.imagePath);

// Live registry of creature world positions, updated each frame by the
// wandering animation. Used by the page-level focus/search to know where a
// creature actually IS at any given moment.
export const creaturePositions = new Map<string, [number, number, number]>();

// Outer bound on the XZ plane — creatures bounce back if they'd jump past it.
// Matches the original layout. At camera (0, 14, 6) FOV 45° aspect ~1.234,
// the visible y=0 region is x ±7.83, z ∈ [-8.34, 5.83]; radius 4.5 keeps
// creature bodies inside the close-side z+ edge with a small halo margin.
const WANDER_MAX_RADIUS = 4.5;
// Per-hop step distance — small so creatures look like they're hopping in
// place rather than flying around the scene.
const HOP_MIN_STEP = 0.15;
const HOP_MAX_STEP = 0.55;

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
  onSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selected?: boolean;
}) {
  const groupRef = useRef<Group | null>(null);
  const [hovered, setHovered] = useState(false);
  // Per-creature random phase derived from id so the whole-body breath is
  // out of sync between creatures.
  const seedPhase = useMemo(() => {
    let h = 0;
    for (let i = 0; i < creature.id.length; i++) h = (h * 31 + creature.id.charCodeAt(i)) | 0;
    return ((h >>> 0) % 1000) / 1000;
  }, [creature.id]);

  // Wander state — the creature jumps from `from` to `to` over `jumpDuration`
  // seconds, lifts on a parabolic arc, then rests until `nextJumpAt`.
  const wander = useRef({
    pos: new Vector3(position[0], position[1], position[2]),
    from: new Vector3(position[0], position[1], position[2]),
    to: new Vector3(position[0], position[1], position[2]),
    progress: 1,
    jumpDuration: 1,
    // Stagger first jumps so creatures don't all leap together at t=0.
    nextJumpAt: 0.4 + Math.random() * 1.6,
    maxHeight: 1,
  });

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = (g.userData.t = (g.userData.t ?? 0) + delta);
    const phase = seedPhase * Math.PI * 2;
    const w = wander.current;

    if (selected) {
      // Selected creature pauses in place so the focused camera can stay on
      // it. Settle gently to the ground if mid-air.
      w.pos.y += (0 - w.pos.y) * 0.15;
      w.progress = 1;
    } else if (w.progress >= 1) {
      // Resting — pick a new target a SHORT step away from current position
      // so the creature looks like it's hopping in place, drifting slowly.
      if (t >= w.nextJumpAt) {
        w.from.copy(w.pos);
        const dir = Math.random() * Math.PI * 2;
        const step =
          HOP_MIN_STEP + Math.random() * (HOP_MAX_STEP - HOP_MIN_STEP);
        let nx = w.pos.x + Math.cos(dir) * step;
        let nz = w.pos.z + Math.sin(dir) * step;
        // Bounce back toward origin if the next hop would leave the bounds.
        if (Math.hypot(nx, nz) > WANDER_MAX_RADIUS) {
          const back = Math.atan2(-w.pos.z, -w.pos.x);
          nx = w.pos.x + Math.cos(back) * step;
          nz = w.pos.z + Math.sin(back) * step;
        }
        w.to.set(nx, 0, nz);
        w.progress = 0;
        w.jumpDuration = 0.45 + Math.random() * 0.25; // 0.45–0.7s — quick hops
        w.maxHeight = 0.25 + Math.random() * 0.35; // 0.25–0.6 — modest height
      }
    } else {
      // Mid-jump — interpolate xz linearly, y on a parabolic arc.
      w.progress = Math.min(1, w.progress + delta / w.jumpDuration);
      w.pos.x = w.from.x + (w.to.x - w.from.x) * w.progress;
      w.pos.z = w.from.z + (w.to.z - w.from.z) * w.progress;
      const arc = 4 * w.progress * (1 - w.progress); // peaks at p=0.5
      w.pos.y = w.maxHeight * arc;

      if (w.progress >= 1) {
        w.pos.y = 0;
        // Short rest before the next hop — quicker pacing makes it feel
        // like in-place hopping rather than long-range jumps.
        w.nextJumpAt = t + 0.1 + Math.random() * 0.35;
      }
    }

    g.position.copy(w.pos);
    // Make this creature's current position queryable by the page (search
    // focus, click handler, etc.).
    creaturePositions.set(creature.id, [w.pos.x, w.pos.y, w.pos.z]);

    // Subtle body tilt while in the air (looks dynamic).
    const inAir = !selected && w.progress < 1;
    g.rotation.z = inAir
      ? Math.sin(w.progress * Math.PI) * 0.08 * Math.sign(w.to.x - w.from.x || 1)
      : Math.sin(t * 0.6 + phase) * 0.03;

    // Breathing pulse + hover scale bump. NO selection bump — the camera
    // zoom is the visual feedback for selection, and an extra 1.15× bump
    // forces the focus camera to pull back further than necessary.
    const targetScale = hovered && !selected ? 1.08 : 1.0;
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
        const g = groupRef.current;
        const pos: [number, number, number] = g
          ? [g.position.x, g.position.y, g.position.z]
          : [position[0], position[1], position[2]];
        onSelect?.(creature, pos);
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

/**
 * Loads creatures from localStorage and renders them in 3D space. Each
 * creature wanders/jumps around inside a bounded XZ region. Renders nothing
 * when the ecosystem is empty (no placeholder).
 */
export default function EcosystemCreatures({
  onSelect,
  selectedId,
  query,
}: {
  onSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selectedId?: string | null;
  query?: string;
} = {}) {
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);

  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadEcosystem().then((list) => {
        if (!cancelled) setCreatures(list);
      });
    };
    refresh();
    const onChange = () => refresh();
    window.addEventListener("ecosystem:changed", onChange);
    window.addEventListener("storage", onChange);
    // In shared mode, subscribe to Supabase realtime so other clients'
    // uploads/edits/deletes propagate. No-op in local mode.
    const unsubscribeRemote = subscribeRemoteEcosystem(refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecosystem:changed", onChange);
      window.removeEventListener("storage", onChange);
      unsubscribeRemote();
    };
  }, []);

  // Preload all textures so suspense fires once at mount, not per creature.
  useLoader(TextureLoader, TEXTURE_PATHS);

  // Filter by search query — only matching creatures are placed in the scene.
  const visible = (query ?? "").trim()
    ? creatures.filter((c) => matchesCreatureQuery(c, query!))
    : creatures;

  if (visible.length === 0) {
    // Empty ecosystem — render nothing in the 3D scene.
    return null;
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
