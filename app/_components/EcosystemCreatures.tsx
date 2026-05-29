"use client";

import { Billboard } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { TextureLoader, Vector3, type Group } from "three";
import { loadEcosystem, matchesCreatureQuery, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { creatureFocusBox, type CreatureBlock, type CreatureSpec } from "@/lib/creature";
import { EMOTION_LIST } from "@/lib/emotions";

// Load all 31 energy block textures up front. They're modest (~few hundred KB
// each at 2048², compressed) and the catalog is bounded, so this avoids
// per-creature suspense thrash.
const TEXTURE_PATHS = EMOTION_LIST.map((e) => e.imagePath);

// Live registry of creature world positions, updated each frame by the
// wandering animation. Used by the page-level focus/search to know where a
// creature actually IS at any given moment.
export const creaturePositions = new Map<string, [number, number, number]>();

// Pinset (tweezers) target — the cursor's world-XZ projection onto the
// ground plane. Updated by MainViewport's PinsetCursorTracker on every
// pointermove while a creature is held. The held EnergyCreature reads
// this on each useFrame tick and snaps to it, so the grabbed creature
// follows the cursor in real time without per-frame React state churn.
//
// `active` flips true only while a creature is held; clears any stale
// target state and lets EnergyCreature skip the snap branch cheaply
// when nothing is being dragged.
export const pinsetTarget: { x: number; z: number; active: boolean } = {
  x: 0,
  z: 0,
  active: false,
};

// ---- Ecosystem-level "gather" command --------------------------------
// When the candy button on the main page is pressed, the flock cycles
// through three phases:
//   1. Gather phase   — every creature aims at its personal gather spot
//                       (annulus near origin). Lasts long enough that
//                       even the furthest creature reaches its spot
//                       AND has a beat of idle hops to "settle".
//   2. Pause          — the tail of the gather window where creatures
//                       are already at their spots; small idle hops.
//   3. Scatter phase  — kicks in once gather ends. Every creature picks
//                       a random direction with a generous step, soft
//                       homing is bypassed, so the cluster actively
//                       explodes outward. Normal wandering resumes
//                       after the scatter window closes.
//
// Phases 1+2 share `gatherUntilMs`; phase 3 has its own `scatterUntilMs`.
const GATHER_DURATION_SEC = 4.7; // ~3 s travel + ~1.7 s settle at the cluster
const SCATTER_DURATION_SEC = 3; // ~3 s active spread back outward
let gatherUntilMs = 0;
let scatterUntilMs = 0;
// Where the flock is summoned to. (0, 0) when the candy button gathers
// to origin (legacy behaviour); a user-clicked XZ when the candy
// cursor drops a "treat" somewhere else in the scene. Each creature's
// personal annulus spot is translated by this centre.
let gatherCenter: { x: number; z: number } = { x: 0, z: 0 };
/** Trigger the gather/scatter cycle. With no `target` the flock heads
 *  to origin (legacy behaviour); with a target {x, z} the cluster
 *  forms at that world-space point instead — used by the candy
 *  cursor's "drop treat here" click. */
export function triggerEcosystemGather(target?: { x: number; z: number }): void {
  const now = performance.now();
  gatherUntilMs = now + GATHER_DURATION_SEC * 1000;
  scatterUntilMs = gatherUntilMs + SCATTER_DURATION_SEC * 1000;
  gatherCenter = target ? { x: target.x, z: target.z } : { x: 0, z: 0 };
}

// ---- Candy sprinkle particles ---------------------------------------
// The candy button (treats mode) sprinkles a handful of small candy
// objects around the clicked world-XZ. Each particle sits on the
// ground until a creature reaches it; on contact the particle is
// "eaten" (removed from the list, listeners refresh the React render).
//
// Creatures detect nearby candies inside their wander pick — if a
// candy is within ATTRACT_RADIUS the next hop targets it instead of
// the random direction. The closest creature wins each tick (no
// shared targeting because every creature picks independently); the
// candy disappears the moment one creature is within EAT_RADIUS.
//
// State lives at module scope so creature useFrames + the React
// <CandyParticles> mesh both read from the same source of truth
// without prop drilling.

export type CandyParticle = { id: string; x: number; z: number };
const candyParticles: CandyParticle[] = [];
const candyListeners = new Set<() => void>();
let candyCounter = 0;
const CANDY_SPRINKLE_COUNT_MIN = 6;
const CANDY_SPRINKLE_COUNT_MAX = 9;
const CANDY_SPRINKLE_RADIUS = 1.4;
const CANDY_ATTRACT_RADIUS = 4.5; // creatures within this aim for the nearest candy
const CANDY_EAT_RADIUS = 0.35;    // when a creature lands within this, the candy is eaten

/** Drop a small cluster of candies on the ground at (cx, cz). Used by
 *  the candy button's "sprinkle treats" click. */
export function triggerCandySprinkle(cx: number, cz: number): void {
  const count =
    CANDY_SPRINKLE_COUNT_MIN +
    Math.floor(Math.random() * (CANDY_SPRINKLE_COUNT_MAX - CANDY_SPRINKLE_COUNT_MIN + 1));
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = Math.sqrt(Math.random()) * CANDY_SPRINKLE_RADIUS;
    candyParticles.push({
      id: `c${candyCounter++}`,
      x: cx + Math.cos(angle) * r,
      z: cz + Math.sin(angle) * r,
    });
  }
  candyListeners.forEach((l) => l());
}

function findNearestCandy(x: number, z: number, maxRadius: number): CandyParticle | undefined {
  let best: CandyParticle | undefined;
  let bestDist = maxRadius;
  for (const c of candyParticles) {
    const dx = c.x - x;
    const dz = c.z - z;
    const d = Math.hypot(dx, dz);
    if (d < bestDist) {
      best = c;
      bestDist = d;
    }
  }
  return best;
}

function consumeCandy(id: string): void {
  const idx = candyParticles.findIndex((c) => c.id === id);
  if (idx >= 0) {
    candyParticles.splice(idx, 1);
    candyListeners.forEach((l) => l());
  }
}

function useCandyParticles(): CandyParticle[] {
  const [list, setList] = useState<CandyParticle[]>(() => candyParticles.slice());
  useEffect(() => {
    const update = () => setList(candyParticles.slice());
    candyListeners.add(update);
    return () => {
      candyListeners.delete(update);
    };
  }, []);
  return list;
}

// ---- Fetch ball ------------------------------------------------------
// The ball button throws a ball into the scene. The ball arcs in from
// above the click point (bouncing phase) and lands at (x, z). At spawn
// time a random visible creature is chosen as the "fetcher" — they
// stop wandering, head to the ball, pick it up, then carry it back
// toward the world origin (the camera's gaze when at default zoom).
// On delivery the ball + assignment clear and the creature resumes
// normal wandering.
//
// Phases:
//   • 'bouncing'  (0..0.9 s)   — ball arcs from sky down to ground
//   • 'sitting'                 — fetcher creature en route to it
//   • 'carrying'                — fetcher has it, walking back
//   • 'delivered'               — at origin, ball + state cleared next tick

export type BallPhase = 'bouncing' | 'sitting' | 'carrying' | 'delivered';
export type BallState = {
  x: number;
  z: number;
  // y is computed each frame by FetchBall component (bounce arc).
  phase: BallPhase;
  carrierId: string | null;
  spawnMs: number;
};
let ballState: BallState | null = null;
const ballListeners = new Set<() => void>();
const BALL_BOUNCE_MS = 900;
const BALL_PICKUP_RADIUS = 0.45;
const BALL_DELIVER_RADIUS = 1.4;
const BALL_DELIVER_TARGET = { x: 0, z: 0 }; // origin — camera looks here at default zoom

/** Throw a ball into the scene at (cx, cz). Picks a random `availableIds`
 *  creature as the fetcher. Replaces any in-flight ball. */
export function triggerBallThrow(
  cx: number,
  cz: number,
  availableIds: string[],
): void {
  if (availableIds.length === 0) return;
  const fetcherId = availableIds[Math.floor(Math.random() * availableIds.length)];
  ballState = {
    x: cx,
    z: cz,
    phase: 'bouncing',
    carrierId: fetcherId,
    spawnMs: performance.now(),
  };
  ballListeners.forEach((l) => l());
}

/** Read current ball state. Returns null if no ball is active. */
export function getBallState(): BallState | null {
  return ballState;
}

function setBallPhase(next: BallPhase): void {
  if (!ballState) return;
  ballState.phase = next;
  ballListeners.forEach((l) => l());
}

function setBallPosition(x: number, z: number): void {
  if (!ballState) return;
  ballState.x = x;
  ballState.z = z;
  // Don't broadcast — high-frequency position changes are read
  // directly each frame by consumers without re-renders.
}

function clearBall(): void {
  ballState = null;
  ballListeners.forEach((l) => l());
}

function useBallState(): BallState | null {
  const [state, setState] = useState<BallState | null>(() => ballState);
  useEffect(() => {
    const update = () => setState(ballState ? { ...ballState } : null);
    ballListeners.add(update);
    return () => {
      ballListeners.delete(update);
    };
  }, []);
  return state;
}

// No hard radius wall — creatures hop freely on the flat ground plane.
// We still want them to stay roughly inside the camera frustum though
// (otherwise random-walk variance pulls the whole flock off-screen over
// a few minutes). A soft "homing" bias kicks in past HOME_SOFT_RADIUS:
// the random direction has an increasing probability of being replaced
// by a toward-origin direction with small jitter; by HOME_HARD_RADIUS
// every hop heads back. Feels like wandering, not a fenced ring.
//
// Radii are module-level mutable and updated each frame by the
// ControlsBridge based on camera-to-target distance: at the default
// camera distance the radii sit at BASE values, and they scale UP as
// the user zooms out (so creatures spread to fill the wider view).
// Zooming back in toward default contracts them again. Zooming PAST
// default (closer than default) doesn't shrink below the base — the
// design feels right at default density already.
const BASE_SOFT_RADIUS = 7;
const BASE_HARD_RADIUS = 11;
const BASE_SPAWN_RADIUS = 7;
// Default OrbitControls distance is the initial camera (0, 16, 7) to
// origin = sqrt(256 + 49) = √305 ≈ 17.464. Must stay in sync with
// MainViewport's INITIAL_CAMERA_POSITION — they describe the same
// view from two angles: this constant tells the wander loop "this
// distance counts as zoomFactor = 1", and the MainViewport sets the
// camera there on first load.
const DEFAULT_CAMERA_DISTANCE = Math.sqrt(305);
let HOME_SOFT_RADIUS = BASE_SOFT_RADIUS;
let HOME_HARD_RADIUS = BASE_HARD_RADIUS;
let SPAWN_RADIUS_CURRENT = BASE_SPAWN_RADIUS;
/** Update the wandering / spawn radii to match the current camera zoom.
 *  Called from ControlsBridge.useFrame on every tick. `distance` is the
 *  Euclidean distance from camera to its target (OrbitControls). */
export function setEcosystemZoomDistance(distance: number): void {
  const zoomFactor = Math.max(1, distance / DEFAULT_CAMERA_DISTANCE);
  HOME_SOFT_RADIUS = BASE_SOFT_RADIUS * zoomFactor;
  HOME_HARD_RADIUS = BASE_HARD_RADIUS * zoomFactor;
  SPAWN_RADIUS_CURRENT = BASE_SPAWN_RADIUS * zoomFactor;
}
// Per-hop step distance — large enough for the creatures to actually
// traverse the scene (vs. fidgeting in place), small enough that each
// hop is still a discrete cartoon "boing" rather than a long flight.
const HOP_MIN_STEP = 0.35;
const HOP_MAX_STEP = 1.10;
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
  // Honour the per-block mirror flags from the manual canvas (CreatureBlock
  // .flipH / .flipV). Negative scale on an axis flips the plane on that axis;
  // we leave the Z scale at +1 so the texture still faces the camera.
  const sx = (block.flipH ? -1 : 1) * block.scale;
  const sy = (block.flipV ? -1 : 1) * block.scale;
  // Rotation direction needs to be NEGATED relative to the canvas's stored
  // value. The canvas uses CSS conventions: +Y down, positive rotation =
  // clockwise. The 3D scene uses Three.js conventions: +Y up, positive
  // rotation around Z = counter-clockwise (right-hand rule from camera).
  // Since we already flip the Y position (`-block.y`) to translate "down in
  // canvas" into "down in 3D", we have to flip the rotation too — otherwise
  // every tilted block ends up tilted in the OPPOSITE direction in the
  // ecosystem vs. how the user placed it in the manual canvas.
  return (
    <mesh
      position={[block.x, -block.y, block.zIndex * 0.001]}
      scale={[sx, sy, block.scale]}
      rotation={[0, 0, -(block.rotation * Math.PI) / 180]}
      renderOrder={block.zIndex}
    >
      <planeGeometry args={[1, 1]} />
      <meshBasicMaterial map={texture} transparent depthWrite={false} />
    </mesh>
  );
}

export function EnergyCreature({
  creature,
  position,
  onSelect,
  selected,
  petMode,
  candyMode,
  pinsetMode,
  held,
  onPinsetGrab,
  onPetComplete,
  onCandyClick,
  onHover,
}: {
  creature: CreatureSpec;
  position: [number, number, number];
  onSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selected?: boolean;
  /** When true, clicking pets the creature (shake) instead of selecting. */
  petMode?: boolean;
  /** When true, clicking the creature gathers the flock to its world XZ
   *  (treating the creature as just another point in the scene under
   *  the candy cursor). */
  candyMode?: boolean;
  onCandyClick?: (x: number, z: number) => void;
  /** When true, the tweezers are active. A click on the creature fires
   *  onPinsetGrab to take it into hand. */
  pinsetMode?: boolean;
  /** True iff THIS creature is currently held by the tweezers. Its
   *  wander is overridden to follow the cursor's world-XZ via
   *  `pinsetTarget` each frame. */
  held?: boolean;
  onPinsetGrab?: (id: string) => void;
  /** Fires once the shake has been triggered (pet mode click). Page
   *  auto-exits pet mode in response. */
  onPetComplete?: () => void;
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

  // Personal "gather spot" — when the candy button fires gather mode, this
  // is the XZ point each creature aims for (instead of literally 0,0).
  // Spreading targets around an annulus prevents the whole flock from
  // piling into one stack at origin. Angle is the seedPhase * 2π (stable
  // per-creature), and radius is a separate hash so two creatures with
  // similar seedPhases don't end up at the same distance from origin too.
  const gatherSpot = useMemo(() => {
    let h = 0x811c9dc5;
    for (let i = 0; i < creature.id.length; i++) {
      h ^= creature.id.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    const radiusJitter = ((h >>> 0) % 1000) / 1000; // 0..1
    const angle = seedPhase * Math.PI * 2;
    // Spread the flock over a 0.9–2.4-unit annulus so the cluster reads
    // as a "group" but creatures aren't stacked on top of each other.
    const radius = 0.9 + radiusJitter * 1.5;
    return { x: Math.cos(angle) * radius, z: Math.sin(angle) * radius };
  }, [creature.id, seedPhase]);

  // Vertical offset that lifts the creature so its bbox BOTTOM sits on the
  // ground plane (y = 0) instead of its centroid being on the ground.
  // Without this, every creature has roughly half its blocks at negative
  // local Y — once the ground plane is opaque, those blocks get occluded
  // and the creature reads as "cut in half" from the camera's angle.
  //
  // Math: the local Y of a block render position is -b.y (see EnergyBlock).
  // The most-negative local Y is `centerY - halfHeight` from focusBox. We
  // shift the group up by `-(centerY - halfHeight)` (in local units), then
  // scale by ECOSYSTEM_SCALE to convert to world units.
  const baseGroundOffset = useMemo(() => {
    const box = creatureFocusBox(creature);
    return -(box.centerY - box.halfHeight) * ECOSYSTEM_SCALE;
  }, [creature]);

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

    if (held && pinsetTarget.active) {
      // Pinset-held: snap the wander position to the cursor's world-XZ
      // projection. We tween toward the target rather than hard-set so
      // a fast cursor sweep doesn't feel teleport-y. Y settles to 0 so
      // the creature reads as "pinched" — no lift-off arc.
      const snap = 0.4; // 0..1; higher = stickier to cursor
      w.pos.x += (pinsetTarget.x - w.pos.x) * snap;
      w.pos.z += (pinsetTarget.z - w.pos.z) * snap;
      w.pos.y += (0 - w.pos.y) * 0.25;
      w.from.copy(w.pos);
      w.to.copy(w.pos);
      w.progress = 1;
      // Reset jump timer so the moment the user drops the creature, it
      // doesn't immediately spring off in some stale direction.
      w.nextJumpAt = t + 0.5 + Math.random() * 0.8;
    } else if (selected) {
      // Selected creature pauses in place so the focused camera can stay on
      // it. Settle gently to the ground if mid-air.
      w.pos.y += (0 - w.pos.y) * 0.15;
      w.progress = 1;
    } else if (w.progress >= 1) {
      // Resting — pick a new target a SHORT step away from current position
      // so the creature looks like it's hopping in place, drifting slowly.
      if (t >= w.nextJumpAt) {
        w.from.copy(w.pos);
        const dist = Math.hypot(w.pos.x, w.pos.z);
        let dir: number;
        let step: number;
        // Hoisted so the separation step below (line ~580) can see them.
        // Only the normal-wander branch sets these to true.
        let gathering = false;
        let scattering = false;

        // Fetch-ball override (takes priority over everything else).
        //   • If I'm the chosen fetcher AND the ball is sitting → aim
        //     hops at the ball's XZ.
        //   • If carrying → aim hops at BALL_DELIVER_TARGET (origin).
        // The FetchBall component's useFrame handles phase transitions
        // (sitting→carrying when I touch the ball; carrying→delivered
        // when I reach the deliver target).
        const ball = ballState;
        const amCarrier = ball && ball.carrierId === creature.id;
        if (amCarrier && ball && ball.phase === 'sitting') {
          const dxB = ball.x - w.pos.x;
          const dzB = ball.z - w.pos.z;
          const distB = Math.hypot(dxB, dzB);
          dir =
            Math.atan2(dzB, dxB) + (Math.random() - 0.5) * Math.PI * 0.08;
          step = Math.min(distB, HOP_MAX_STEP * 1.4);
        } else if (amCarrier && ball && ball.phase === 'carrying') {
          const dxD = BALL_DELIVER_TARGET.x - w.pos.x;
          const dzD = BALL_DELIVER_TARGET.z - w.pos.z;
          const distD = Math.hypot(dxD, dzD);
          dir =
            Math.atan2(dzD, dxD) + (Math.random() - 0.5) * Math.PI * 0.08;
          step = Math.min(distD, HOP_MAX_STEP * 1.4);
        } else {
        // Candy treat attract — if a candy particle is within
        // CANDY_ATTRACT_RADIUS of me, head to it (overriding the
        // random wander but BELOW the ball-fetch + gather priorities).
        const candy = findNearestCandy(w.pos.x, w.pos.z, CANDY_ATTRACT_RADIUS);
        if (candy) {
          const dxC = candy.x - w.pos.x;
          const dzC = candy.z - w.pos.z;
          const distC = Math.hypot(dxC, dzC);
          if (distC < CANDY_EAT_RADIUS) {
            // Already on top of it — eat in place. Tiny celebration hop.
            consumeCandy(candy.id);
            dir = Math.random() * Math.PI * 2;
            step = 0.08 + Math.random() * 0.15;
          } else {
            dir =
              Math.atan2(dzC, dxC) +
              (Math.random() - 0.5) * Math.PI * 0.15;
            // Stride toward the candy; don't overshoot.
            step = Math.min(distC, HOP_MAX_STEP * 1.3);
          }
        } else {

        // Candy-button gather/scatter override.
        //   • While `gatherUntilMs` is in the future → aim at the
        //     creature's personal cluster spot (annulus near origin).
        //   • Otherwise, if `scatterUntilMs` is still in the future →
        //     the gather window just ended and we're in the explode-out
        //     phase: random direction, bigger step, no soft-homing.
        // After both windows close, fall through to the normal wander
        // pick below.
        const now = performance.now();
        gathering = now < gatherUntilMs;
        scattering = !gathering && now < scatterUntilMs;
        if (gathering) {
          // Translate the creature's personal annulus spot to whatever
          // centre the gather was fired against (origin by default,
          // or the user's candy-cursor click point).
          const spotX = gatherCenter.x + gatherSpot.x;
          const spotZ = gatherCenter.z + gatherSpot.z;
          const dxToSpot = spotX - w.pos.x;
          const dzToSpot = spotZ - w.pos.z;
          const distToSpot = Math.hypot(dxToSpot, dzToSpot);
          if (distToSpot < 0.3) {
            // Already at the personal spot — tiny random hops in place
            // so the creature still feels alive without drifting out.
            dir = Math.random() * Math.PI * 2;
            step = 0.08 + Math.random() * 0.15;
          } else {
            dir =
              Math.atan2(dzToSpot, dxToSpot) +
              (Math.random() - 0.5) * Math.PI * 0.18;
            // Cover most of the remaining distance per hop, bounded so
            // a far creature doesn't teleport across the scene.
            step = Math.min(distToSpot * 0.6 + 0.2, HOP_MAX_STEP * 1.8);
          }
        } else if (scattering) {
          // Scatter: random direction, generous step. Soft-homing is
          // bypassed (we skip the normal-wander branch entirely) so
          // the cluster actually explodes apart rather than getting
          // pulled back by the homing bias near origin.
          dir = Math.random() * Math.PI * 2;
          step = 0.9 + Math.random() * 1.0;
        } else {
          // Soft homing: past HOME_SOFT_RADIUS, increasing probability that
          // the random direction is replaced by a toward-origin one (with
          // ±36° spread so it doesn't look perfectly radial). At and past
          // HOME_HARD_RADIUS every hop is biased back.
          const homingT =
            dist <= HOME_SOFT_RADIUS
              ? 0
              : Math.min(
                  1,
                  (dist - HOME_SOFT_RADIUS) /
                    (HOME_HARD_RADIUS - HOME_SOFT_RADIUS),
                );
          if (homingT > 0 && Math.random() < homingT) {
            dir =
              Math.atan2(-w.pos.z, -w.pos.x) +
              (Math.random() - 0.5) * Math.PI * 0.4;
          } else {
            dir = Math.random() * Math.PI * 2;
          }
          step =
            HOP_MIN_STEP + Math.random() * (HOP_MAX_STEP - HOP_MIN_STEP);
        }
        } // end candy-attract else branch
        } // end ball-fetch else branch
        let nx = w.pos.x + Math.cos(dir) * step;
        let nz = w.pos.z + Math.sin(dir) * step;

        // Separation — only during normal wandering (NOT gather, which
        // intentionally clusters via the per-creature annulus spot,
        // and NOT scatter, which intentionally explodes outward).
        // Looks at every OTHER creature's current XZ; if the chosen
        // target is closer than MIN_SEPARATION to any of them, retry
        // with a direction biased AWAY from the nearest crowder. A
        // handful of retries usually finds open space; if all retries
        // still collide we just take the last try (better to overlap
        // briefly than to freeze in place).
        if (!gathering && !scattering) {
          const MIN_SEPARATION = 1.4;
          for (let attempt = 0; attempt < 4; attempt++) {
            let nearest: {
              dx: number;
              dz: number;
              d: number;
            } | null = null;
            for (const [otherId, pos] of creaturePositions) {
              if (otherId === creature.id) continue;
              const dx = nx - pos[0];
              const dz = nz - pos[2];
              const d = Math.hypot(dx, dz);
              if (d < MIN_SEPARATION && (!nearest || d < nearest.d)) {
                nearest = { dx, dz, d };
              }
            }
            if (!nearest) break;
            // Aim AWAY from the crowder, with a small jitter so two
            // creatures repelling each other don't pick the exact
            // mirrored angle and oscillate.
            const away = Math.atan2(nearest.dz, nearest.dx);
            dir = away + (Math.random() - 0.5) * Math.PI * 0.3;
            nx = w.pos.x + Math.cos(dir) * step;
            nz = w.pos.z + Math.sin(dir) * step;
          }
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
    // Lift the creature so its bbox bottom sits on the ground plane —
    // wander.pos.y of 0 means "grounded", >0 means mid-jump, but the
    // group's local origin is the creature's centroid, so we need an
    // extra +baseGroundOffset to put the FEET on y=0 (not the centroid).
    g.position.y = w.pos.y + baseGroundOffset;
    // Make this creature's current position queryable by the page (search
    // focus, click handler, etc.). We register the BASE wander position
    // before adding the shake offset, so other code (like camera focus)
    // doesn't chase the rapid jitter.
    creaturePositions.set(creature.id, [w.pos.x, w.pos.y + baseGroundOffset, w.pos.z]);

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
      // Stop pointerdown / pointerup propagation so the GroundPlane
      // behind the creature DOESN'T see them. Without this the ground's
      // tap-to-reset handler fires when you click a creature (the
      // pointer is also "on the ground" along the ray), which queues a
      // setResetTrigger that immediately overrides the click's
      // setFocusTarget → camera never zooms in.
      onPointerDown={(e) => e.stopPropagation()}
      onPointerUp={(e) => e.stopPropagation()}
      onClick={(e) => {
        e.stopPropagation();
        if (pinsetMode) {
          // Pinset (tweezers) — grab this creature. If something else
          // is already held the parent state machine will replace it.
          // Releasing happens via an empty-ground click or Escape (both
          // handled at the page level) so we don't toggle here.
          onPinsetGrab?.(creature.id);
          return;
        }
        if (candyMode) {
          // Candy cursor — clicking a creature is treated the same as
          // clicking the ground at that creature's XZ: the flock will
          // converge on it. (User is still in candy mode after; press
          // the candy button again or Escape to exit.)
          const g = groupRef.current;
          const x = g ? g.position.x : position[0];
          const z = g ? g.position.z : position[2];
          onCandyClick?.(x, z);
          return;
        }
        if (petMode) {
          // Pet the creature — shake for ~1.4 seconds, then notify the
          // page so it can auto-exit pet mode (single-shot UX).
          shakeUntilRef.current = performance.now() / 1000 + 1.4;
          onPetComplete?.();
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
  candyMode,
  pinsetMode,
  heldId,
  onPinsetGrab,
  onPetComplete,
  onCandyClick,
  onHover,
}: {
  onSelect?: (c: CreatureSpec, position: [number, number, number]) => void;
  selectedId?: string | null;
  query?: string;
  /** When true, clicking a creature pets it (shake) instead of selecting. */
  petMode?: boolean;
  /** When true, clicking a creature gathers the flock to its XZ
   *  instead of focusing the camera. */
  candyMode?: boolean;
  onCandyClick?: (x: number, z: number) => void;
  /** When true, the tweezers are active — clicking a creature grabs it
   *  (fires onPinsetGrab); the held creature snaps to pinsetTarget on
   *  every frame instead of wandering. */
  pinsetMode?: boolean;
  /** Id of the creature currently held by the tweezers (if any). */
  heldId?: string | null;
  onPinsetGrab?: (id: string) => void;
  /** Fires once a creature has been pet (shake initiated). The page
   *  uses this to auto-exit pet mode for single-shot UX. */
  onPetComplete?: () => void;
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

        // Random initial spawn position — derived from the creature.id so
        // each creature lands in the same spot every refresh, but the
        // overall layout is a scattered cloud rather than the old evenly-
        // spaced ring. Two independent FNV-1a hashes pick angle and
        // radius; radius uses sqrt() to convert a uniform-[0,1] sample
        // into a uniform-AREA disk distribution (no center clustering).
        let ah = 0x811c9dc5;
        let rh = 0x9dc5811c;
        for (let k = 0; k < c.id.length; k++) {
          ah ^= c.id.charCodeAt(k);
          ah = Math.imul(ah, 0x01000193);
          rh ^= c.id.charCodeAt(k);
          rh = Math.imul(rh, 0x85ebca6b);
        }
        const angle = ((ah >>> 0) % 10000) / 10000 * Math.PI * 2;
        // Spawn radius mirrors the current zoom-scaled bound. New
        // creatures appear distributed across the visible plane
        // regardless of how far the camera is zoomed out.
        const radius = Math.sqrt(((rh >>> 0) % 10000) / 10000) * SPAWN_RADIUS_CURRENT;
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
            candyMode={candyMode}
            pinsetMode={pinsetMode}
            held={heldId === c.id}
            onPinsetGrab={onPinsetGrab}
            onPetComplete={onPetComplete}
            onCandyClick={onCandyClick}
            onHover={onHover}
          />
        );
      })}
      {/* Candy treats sitting on the ground until a creature eats them.
          Re-rendered when the candy list changes (spawn / consume). */}
      <CandyParticles />
      {/* Active fetch-ball (zero or one). Animates the bounce-in arc
          + carries with the assigned fetcher creature. */}
      <FetchBall />
    </Suspense>
  );
}

// ---- Candy + Ball meshes --------------------------------------------

/** Renders the current candy particle list as small ground-hugging
 *  spheres. Position is static per-particle — creatures move to them,
 *  not vice versa. Sphere segments kept low (8/6) since dozens may
 *  spawn at once. */
function CandyParticles() {
  const candies = useCandyParticles();
  return (
    <>
      {candies.map((c) => (
        <mesh key={c.id} position={[c.x, 0.18, c.z]}>
          <sphereGeometry args={[0.16, 8, 6]} />
          <meshBasicMaterial color="#ff5b88" />
        </mesh>
      ))}
    </>
  );
}

/** Renders the fetch ball (when present). Handles the bounce-in arc
 *  in the `bouncing` phase, then sits on the ground in `sitting`,
 *  follows the fetcher creature in `carrying`, then despawns in
 *  `delivered`. */
function FetchBall() {
  const state = useBallState();
  const meshRef = useRef<import("three").Mesh | null>(null);

  useFrame(() => {
    if (!ballState || !meshRef.current) return;
    const m = meshRef.current;
    const phase = ballState.phase;
    const t = (performance.now() - ballState.spawnMs) / 1000;

    if (phase === 'bouncing') {
      // Parabolic arc from y=6 down to y=0.25 (ball radius). Two small
      // bounces give it cartoon weight before settling.
      const dur = BALL_BOUNCE_MS / 1000;
      const u = Math.min(1, t / dur);
      // Composite curve: drops down (1-u) + sin overlay for two pop-ups.
      const dropY = 6 * (1 - u) * (1 - u);
      const bounce = 0.6 * Math.max(0, Math.sin(u * Math.PI * 2));
      m.position.set(ballState.x, 0.25 + dropY + bounce, ballState.z);
      if (t >= dur) {
        setBallPhase('sitting');
      }
    } else if (phase === 'sitting') {
      m.position.set(ballState.x, 0.25, ballState.z);
      // Transition to carrying when the fetcher actually touches the
      // ball. Watch the live creature position; flip on contact.
      const carrierId = ballState.carrierId;
      const pos = carrierId ? creaturePositions.get(carrierId) : undefined;
      if (pos) {
        const dx = pos[0] - ballState.x;
        const dz = pos[2] - ballState.z;
        if (Math.hypot(dx, dz) < BALL_PICKUP_RADIUS) {
          setBallPhase('carrying');
        }
      }
    } else if (phase === 'carrying') {
      // Hover slightly above the carrier's wander position. The carrier
      // creature writes its world position into creaturePositions each
      // frame — read from there so the ball tracks the held creature.
      const carrierId = ballState.carrierId;
      const pos = carrierId ? creaturePositions.get(carrierId) : undefined;
      if (pos) {
        // Lift the ball above the creature's head (rough height).
        m.position.set(pos[0], pos[1] + 1.0, pos[2]);
        // Mirror the live position back into ballState so external
        // checks know where the ball currently is while in transit.
        setBallPosition(pos[0], pos[2]);
        // Delivered when the carrier reaches the deliver target.
        const dx = pos[0] - BALL_DELIVER_TARGET.x;
        const dz = pos[2] - BALL_DELIVER_TARGET.z;
        if (Math.hypot(dx, dz) < BALL_DELIVER_RADIUS) {
          setBallPhase('delivered');
        }
      }
    } else if (phase === 'delivered') {
      // Frame-after-delivery: clear so the mesh unmounts cleanly.
      clearBall();
    }
  });

  if (!state) return null;
  return (
    <mesh ref={meshRef} position={[state.x, 0.25, state.z]}>
      <sphereGeometry args={[0.28, 14, 12]} />
      <meshBasicMaterial color="#ffe28a" />
    </mesh>
  );
}
