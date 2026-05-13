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
// Tuned so the wandering cluster stays well inside the visible frustum on
// the default bird's-eye camera AND survives the user rotating the free
// camera slightly without creatures clipping past the wavy-frame edges.
// (Previously 5.0; reduced to 3.5 after user reported creatures looking
// cut off at the canvas corners.)
const WANDER_MAX_RADIUS = 3.5;
// Per-hop step distance — large enough for the creatures to actually
// traverse the scene (vs. fidgeting in place), small enough that each
// hop is still a discrete cartoon "boing" rather than a long flight.
const HOP_MIN_STEP = 0.30;
const HOP_MAX_STEP = 0.85;
// Global render scale for ecosystem creatures. The wandering view in the
// main scene reads as a populated landscape rather than a few large
// creatures, so we shrink each group uniformly. Camera/focus math in the
// page uses the unscaled bbox; the resulting zoom-view margin is on
// purpose (the creature sits a bit inside its viewfinder rather than
// hugging the edges).
const ECOSYSTEM_SCALE = 0.7;

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
  petMode,
  onHover,
}: {
  creature: CreatureSpec;
  position: [number, number, number];
  onSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selected?: boolean;
  /** When true, clicking pets the creature (shake) instead of selecting. */
  petMode?: boolean;
  /** Fires when the pointer enters/leaves a creature. Pass null on leave. */
  onHover?: (creature: CreatureSpec | null) => void;
}) {
  const groupRef = useRef<Group | null>(null);
  const [hovered, setHovered] = useState(false);
  // Timestamp (seconds, perf clock) until which this creature should shake
  // wildly because it's being petted. Stored as a ref so updating it doesn't
  // trigger re-renders — we just sample it inside useFrame.
  const shakeUntilRef = useRef(0);
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
    // Time (in scene seconds) at which the post-landing squash ends. A
    // brief squash on impact reads as cartoon weight + rebound.
    squashUntil: 0,
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
        // Cartoony jumps: snappy (0.30–0.55 s) and bouncy — short steps
        // get the same kind of high arcs you'd see in a cartoon, so the
        // creatures look pop-y rather than measured.
        w.jumpDuration = 0.30 + Math.random() * 0.25;
        const heightFromStep = 0.65 + step * 0.5; // 0.80 (min step) – 1.08 (max)
        w.maxHeight = heightFromStep + Math.random() * 0.25;
      }
    } else {
      // Mid-jump — xz interpolates linearly, y on a parabolic arc.
      w.progress = Math.min(1, w.progress + delta / w.jumpDuration);
      w.pos.x = w.from.x + (w.to.x - w.from.x) * w.progress;
      w.pos.z = w.from.z + (w.to.z - w.from.z) * w.progress;
      const arc = 4 * w.progress * (1 - w.progress); // peaks at p=0.5
      w.pos.y = w.maxHeight * arc;

      if (w.progress >= 1) {
        w.pos.y = 0;
        // Trigger a short landing-squash phase so the impact reads.
        w.squashUntil = t + 0.14;
        // Brief rest before the next hop — shorter than before so the
        // overall cadence stays quick and busy.
        w.nextJumpAt = t + 0.12 + Math.random() * 0.32;
      }
    }

    g.position.copy(w.pos);
    // Make this creature's current position queryable by the page (search
    // focus, click handler, etc.). We register the BASE wander position
    // before adding the shake offset, so other code (like camera focus)
    // doesn't chase the rapid jitter.
    creaturePositions.set(creature.id, [w.pos.x, w.pos.y, w.pos.z]);

    // Pet shake — overlay a fast random jitter on position+rotation while
    // the creature is being petted. Decays toward the end of the shake
    // window so the stop feels organic (settle, don't snap).
    const now = performance.now() / 1000;
    if (now < shakeUntilRef.current) {
      const remaining = shakeUntilRef.current - now;
      const intensity = Math.min(1, remaining / 0.4); // ramp down in last 0.4s
      const amp = 0.35 * intensity;
      g.position.x += (Math.random() - 0.5) * 2 * amp;
      g.position.y += (Math.random() - 0.5) * 2 * amp;
      g.position.z += (Math.random() - 0.5) * 2 * amp;
    }

    // Body tilt — exaggerated during the jump arc so the cartoon hop reads,
    // gentle idle sway when grounded, violent random spin when being petted.
    const inAir = !selected && w.progress < 1;
    if (now < shakeUntilRef.current) {
      const remaining = shakeUntilRef.current - now;
      const intensity = Math.min(1, remaining / 0.4);
      g.rotation.z = (Math.random() - 0.5) * 0.6 * intensity;
    } else if (inAir) {
      // Lean into the direction of travel during the rise, lean back on the
      // descent — same shape as a tossed pancake. Sin(progress·π) peaks at
      // the apex but we want max tilt at takeoff and landing, so use cos.
      const travelDir = Math.sign(w.to.x - w.from.x || 1);
      const tiltPhase = Math.cos(w.progress * Math.PI); // 1 → 0 → -1
      g.rotation.z = tiltPhase * 0.30 * travelDir;
    } else {
      g.rotation.z = Math.sin(t * 0.6 + phase) * 0.03;
    }

    // Breathing pulse + hover scale bump. NO selection bump — the camera
    // zoom is the visual feedback for selection, and an extra 1.15× bump
    // forces the focus camera to pull back further than necessary.
    const targetScale = hovered && !selected ? 1.08 : 1.0;
    const breath = 1 + Math.sin(t * 1.3 + phase) * 0.04;
    const baseCur = g.userData.baseScale ?? 1.0;
    const baseNext = baseCur + (targetScale - baseCur) * 0.15;
    g.userData.baseScale = baseNext;

    // Cartoon squash-and-stretch. Vertical-only — X/Z stay locked at the
    // base scale so the body never visibly widens, only tall⇄short:
    //   • In-flight stretch: tall at the apex of every jump, eased back
    //     down toward takeoff and landing.
    //   • Landing squash: short ~140 ms phase right after touch-down where
    //     the body squishes flat then springs back to neutral.
    // Amplitudes are bumped vs. the old volume-preserving version since
    // there's no horizontal counter-squish smoothing the read.
    let stretchY = 1;
    if (inAir) {
      const arc = Math.sin(w.progress * Math.PI); // 0 → 1 → 0
      stretchY = 1 + arc * 0.40; // up to +40% taller at apex
    } else if (t < w.squashUntil) {
      const SQUASH_DURATION = 0.14;
      const phase01 = 1 - (w.squashUntil - t) / SQUASH_DURATION; // 0 → 1
      // Strongest squash at start of phase, easing back to 1 by phase01 = 1.
      stretchY = 1 - (1 - phase01) * 0.40; // 0.40 squash, decays over 140 ms
    }

    const finalBase = baseNext * breath * ECOSYSTEM_SCALE;
    g.scale.set(finalBase, finalBase * stretchY, finalBase);
  });

  return (
    <Billboard
      ref={groupRef}
      position={position}
      onClick={(e) => {
        e.stopPropagation();
        if (petMode) {
          // Pet the creature — shake for ~1.4 seconds. Click again to
          // re-shake (the timestamp just gets bumped).
          shakeUntilRef.current = performance.now() / 1000 + 1.4;
          return;
        }
        const g = groupRef.current;
        const pos: [number, number, number] = g
          ? [g.position.x, g.position.y, g.position.z]
          : [position[0], position[1], position[2]];
        onSelect?.(creature, pos);
      }}
      onPointerOver={(e) => {
        e.stopPropagation();
        setHovered(true);
        // Don't override the page-level cursor — the global hand-drawn
        // arrow (or pet-mode hand) wins via inheritance. Setting
        // body.style.cursor = "pointer" used to clobber it with the
        // standard browser pointer.
        onHover?.(creature);
      }}
      onPointerOut={() => {
        setHovered(false);
        onHover?.(null);
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
  petMode,
  onHover,
}: {
  onSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selectedId?: string | null;
  query?: string;
  /** When true, clicking a creature pets it (shake) instead of selecting. */
  petMode?: boolean;
  /** Fires with the hovered creature on enter, null on leave. */
  onHover?: (creature: CreatureSpec | null) => void;
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
        // While a creature is focused, hide every OTHER creature so the
        // zoomed-in view isn't cluttered with neighbours wandering past
        // the camera edges. The focused creature stays mounted with its
        // current world position, so the camera doesn't lose it; the
        // others unmount and re-spawn at their original angle/radius
        // when focus is cleared. Ambient chatter still plays for
        // unmounted creatures (it reads from loadEcosystem, not the
        // rendered list), so the room still sounds inhabited.
        if (selectedId && c.id !== selectedId) return null;

        const angle = (i / visible.length) * Math.PI * 2;
        const radius = visible.length === 1 ? 0 : 3;
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
            petMode={petMode}
            onHover={onHover}
          />
        );
      })}
    </Suspense>
  );
}
