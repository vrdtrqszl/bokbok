"use client";

import { Billboard } from "@react-three/drei";
import { useFrame, useLoader } from "@react-three/fiber";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  SRGBColorSpace,
  TextureLoader,
  Vector3,
  type Group,
  type Mesh,
  type MeshBasicMaterial,
  type Texture,
} from "three";
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
// time the CLOSEST visible creature is chosen as the first fetcher — they
// stop wandering, head to the ball and pick it up. From there the flock
// plays keep-away: whoever holds the ball cradles it for a moment, then
// tosses it (a little airborne arc) to another nearby creature, who
// catches it and becomes the new holder. After a handful of passes the
// last creature winds up and hucks the ball in one big arc far off the
// edge of the scene, where it leaves play.
//
// Multiple balls can be in the air at once — every throw adds a new ball
// to the live `balls` array (nothing is replaced), and each ball runs its
// own independent state machine.
//
// Phases:
//   • 'bouncing'  (~1.4 s)  — ball arcs from sky down to the ground
//   • 'sitting'             — first fetcher creature en route to it
//   • 'holding'             — a creature has it, cradling before a pass
//   • 'passing'             — ball in flight between two creatures
//   • 'leaving'             — passes done; final long pass off-screen,
//                             then the ball is removed from play

export type BallPhase =
  | 'bouncing'
  | 'sitting'
  | 'holding'
  | 'passing'
  | 'leaving';
export type BallState = {
  id: number; // unique per throw, used as React key + lookup
  x: number;
  z: number;
  // y is computed each frame by FetchBall component (bounce / toss arc).
  phase: BallPhase;
  carrierId: string | null;
  spawnMs: number; // for the bounce-arc clock
  phaseStartMs: number; // for holding / passing / leaving clocks
  passCount: number; // passes completed so far
  passesTarget: number; // passes to play before leaving (randomised)
  passToId: string | null; // receiver of the in-flight pass
  passFromX: number; // start of the in-flight pass / leave arc
  passFromY: number;
  passFromZ: number;
  leaveToX: number; // off-screen target of the final long pass
  leaveToZ: number;
};
let balls: BallState[] = [];
let ballIdSeq = 0;
const ballListeners = new Set<() => void>();
const BALL_BOUNCE_MS = 1400;
const BALL_PICKUP_RADIUS = 0.45;
const BALL_HOLD_MS = 650; // cradle time before tossing the ball on
const BALL_PASS_MS = 520; // ball flight time between two creatures
const BALL_LEAVE_MS = 1100; // flight time of the final off-screen pass
const BALL_HOVER_Y = 1.0; // ball hover height above a carrier
const BALL_TOSS_ARC = 1.3; // extra arc height at the midpoint of a pass
const BALL_LEAVE_ARC = 4.0; // big arc on the final off-screen launch
const BALL_PASS_MIN = 1.2; // preferred pass distance (world units)
const BALL_PASS_MAX = 7.0;

/** Notify subscribers that the ball list changed (add / remove / phase). */
function notifyBalls(): void {
  ballListeners.forEach((l) => l());
}

/** Throw a NEW ball into the scene at (cx, cz). Picks the CLOSEST creature
 *  to (cx, cz) as the first fetcher — feels naturally "the nearest one
 *  noticed first". Adds to any balls already in play (does not replace). */
export function triggerBallThrow(
  cx: number,
  cz: number,
  availableIds: string[],
): void {
  if (availableIds.length === 0) return;
  let closestId: string | null = null;
  let closestDist = Infinity;
  for (const id of availableIds) {
    const pos = creaturePositions.get(id);
    if (!pos) continue;
    const dx = pos[0] - cx;
    const dz = pos[2] - cz;
    const d = Math.hypot(dx, dz);
    if (d < closestDist) {
      closestDist = d;
      closestId = id;
    }
  }
  if (!closestId) return;
  const now = performance.now();
  balls = [
    ...balls,
    {
      id: ++ballIdSeq,
      x: cx,
      z: cz,
      phase: 'bouncing',
      carrierId: closestId,
      spawnMs: now,
      phaseStartMs: now,
      passCount: 0,
      passesTarget: 3 + Math.floor(Math.random() * 3), // 3–5 passes
      passToId: null,
      passFromX: cx,
      passFromY: 0,
      passFromZ: cz,
      leaveToX: cx,
      leaveToZ: cz,
    },
  ];
  notifyBalls();
}

function setBallPhase(ball: BallState, next: BallPhase): void {
  ball.phase = next;
  ball.phaseStartMs = performance.now();
  notifyBalls();
}

/** Pick the next creature to receive a pass — prefers one a comfortable
 *  toss away (BALL_PASS_MIN..MAX) from the current holder, falls back to
 *  any other creature, and returns null if the holder is alone. */
function pickPassReceiver(
  fromId: string | null,
  fromX: number,
  fromZ: number,
): string | null {
  const others: string[] = [];
  for (const id of creaturePositions.keys()) {
    if (id !== fromId) others.push(id);
  }
  if (others.length === 0) return null;
  const inRange = others.filter((id) => {
    const p = creaturePositions.get(id);
    if (!p) return false;
    const d = Math.hypot(p[0] - fromX, p[2] - fromZ);
    return d >= BALL_PASS_MIN && d <= BALL_PASS_MAX;
  });
  const pool = inRange.length > 0 ? inRange : others;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** Begin (or resume) cradling the ball at the current carrier. */
function startBallHold(ball: BallState): void {
  setBallPhase(ball, 'holding');
}

/** Toss the ball from (fromX,fromY,fromZ) to a freshly chosen receiver.
 *  If nobody is available to catch, the game ends with the off-screen
 *  launch instead. */
function startBallPass(
  ball: BallState,
  fromX: number,
  fromY: number,
  fromZ: number,
): void {
  const receiver = pickPassReceiver(ball.carrierId, fromX, fromZ);
  if (!receiver) {
    startBallLeave(ball, fromX, fromY, fromZ);
    return;
  }
  ball.passToId = receiver;
  ball.passFromX = fromX;
  ball.passFromY = fromY;
  ball.passFromZ = fromZ;
  setBallPhase(ball, 'passing');
}

/** Hand the ball to the receiver, then cradle it. The holding phase clock
 *  decides whether the next move is another pass or the off-screen launch
 *  (once passesTarget has been reached). */
function completeBallPass(ball: BallState): void {
  ball.carrierId = ball.passToId;
  ball.passToId = null;
  ball.passCount += 1;
  startBallHold(ball);
}

/** Final move: the last holder hucks the ball in one big arc toward a
 *  point well past the edge of the scene, heading outward from the centre.
 *  Once it reaches that off-screen target the ball is removed from play. */
function startBallLeave(
  ball: BallState,
  fromX: number,
  fromY: number,
  fromZ: number,
): void {
  let dirX = fromX;
  let dirZ = fromZ;
  const mag = Math.hypot(dirX, dirZ);
  if (mag < 0.001) {
    // Holder is right at the centre — pick a random outward heading.
    const a = Math.random() * Math.PI * 2;
    dirX = Math.cos(a);
    dirZ = Math.sin(a);
  } else {
    dirX /= mag;
    dirZ /= mag;
  }
  // Aim comfortably past the hard wander radius so it clears the frame.
  const dist = HOME_HARD_RADIUS * 2.2 + 8;
  ball.passFromX = fromX;
  ball.passFromY = fromY;
  ball.passFromZ = fromZ;
  ball.passToId = null;
  ball.leaveToX = fromX + dirX * dist;
  ball.leaveToZ = fromZ + dirZ * dist;
  setBallPhase(ball, 'leaving');
}

function setBallPosition(ball: BallState, x: number, z: number): void {
  ball.x = x;
  ball.z = z;
  // Don't broadcast — high-frequency position changes are read
  // directly each frame by consumers without re-renders.
}

function clearBall(ball: BallState): void {
  balls = balls.filter((b) => b.id !== ball.id);
  notifyBalls();
}

function useBalls(): BallState[] {
  const [list, setList] = useState<BallState[]>(() => balls.slice());
  useEffect(() => {
    // Fresh array each notify so add / remove / phase changes re-render
    // (the ball objects themselves are mutated in place by useFrame).
    const update = () => setList(balls.slice());
    ballListeners.add(update);
    update(); // sync immediately in case a ball was added before mount
    return () => {
      ballListeners.delete(update);
    };
  }, []);
  return list;
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
  ballMode,
  whistleMode,
  pinsetMode,
  held,
  onPinsetGrab,
  onPinsetRelease,
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
  /** When true, clicking the creature throws a ball at its world XZ
   *  (routed through onCandyClick → the page's mode dispatcher) instead
   *  of focusing the camera. */
  ballMode?: boolean;
  /** When true, clicking the creature whistles the flock to its world XZ
   *  instead of focusing the camera. */
  whistleMode?: boolean;
  onCandyClick?: (x: number, z: number) => void;
  /** When true, the tweezers are active. A click on the creature fires
   *  onPinsetGrab to take it into hand. */
  pinsetMode?: boolean;
  /** True iff THIS creature is currently held by the tweezers. Its
   *  wander is overridden to follow the cursor's world-XZ via
   *  `pinsetTarget` each frame. */
  held?: boolean;
  onPinsetGrab?: (id: string) => void;
  /** Fires when the user clicks THIS creature while THIS one is held —
   *  the natural "drop right here" gesture. The page handler clears
   *  heldId and exits pinset mode. */
  onPinsetRelease?: () => void;
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
    // When true, the in-flight motion is a FREE FALL (pinset release)
    // rather than the standard up-and-down jump arc. Quadratic y curve
    // from `from.y` down to 0 — no upward peak.
    dropping: false,
  });

  // Detect held → released transition so we can kick off the drop
  // animation. Comparing `prevHeldRef` to `held` inside an effect
  // (rather than per-frame in useFrame) means we only trigger the
  // drop ONCE per release, not every frame.
  const prevHeldRef = useRef(false);
  useEffect(() => {
    const wasHeld = prevHeldRef.current;
    prevHeldRef.current = !!held;
    if (!wasHeld || held) return; // not a release transition
    const w = wander.current;
    if (w.pos.y < 0.05) return; // already grounded — nothing to drop
    w.from.copy(w.pos);
    w.to.set(w.pos.x, 0, w.pos.z);
    w.progress = 0;
    w.jumpDuration = 0.34; // ~340 ms fall — heavy enough to read
    w.dropping = true;
  }, [held]);

  useFrame((_, delta) => {
    const g = groupRef.current;
    if (!g) return;
    const t = (g.userData.t = (g.userData.t ?? 0) + delta);
    const phase = seedPhase * Math.PI * 2;
    const w = wander.current;

    if (held && pinsetTarget.active) {
      // Pinset-held: snap the wander position to the cursor's world-XZ
      // projection. We tween toward the target rather than hard-set so
      // a fast cursor sweep doesn't feel teleport-y. Y rises to
      // HOLD_HEIGHT so the creature is visibly LIFTED by the tweezers
      // — letting it fall when released communicates "I dropped it."
      const HOLD_HEIGHT = 1.2;
      const snap = 0.4; // 0..1; higher = stickier to cursor
      w.pos.x += (pinsetTarget.x - w.pos.x) * snap;
      w.pos.z += (pinsetTarget.z - w.pos.z) * snap;
      w.pos.y += (HOLD_HEIGHT - w.pos.y) * 0.22;
      w.from.copy(w.pos);
      w.to.copy(w.pos);
      w.progress = 1;
      // Clear any prior drop state so a re-grab while still falling
      // doesn't keep ticking the fall.
      w.dropping = false;
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
        // Scan every ball in play; a creature might be the fetcher of one
        // and the receiver of another. Priority:
        //   • A ball I'm fetching that's sitting on the ground (walkBall)
        //     → aim hops at its XZ to go pick it up.
        //   • Otherwise a ball I'm holding/tossing/launching, or one whose
        //     pass is headed to me (playBall) → little excited hops in
        //     place (playing, not wandering off). The ball itself flies on
        //     its own arc; the FetchBall useFrame drives the handoffs.
        let walkBall: BallState | null = null;
        let playBall: BallState | null = null;
        for (const b of balls) {
          const amCarrier = b.carrierId === creature.id;
          const amReceiver = b.passToId === creature.id;
          if (amCarrier && b.phase === 'sitting') {
            walkBall = b;
            break;
          }
          if (
            (amCarrier &&
              (b.phase === 'holding' ||
                b.phase === 'passing' ||
                b.phase === 'leaving')) ||
            (amReceiver && b.phase === 'passing')
          ) {
            playBall = b;
          }
        }
        if (walkBall) {
          const dxB = walkBall.x - w.pos.x;
          const dzB = walkBall.z - w.pos.z;
          const distB = Math.hypot(dxB, dzB);
          dir =
            Math.atan2(dzB, dxB) + (Math.random() - 0.5) * Math.PI * 0.08;
          step = Math.min(distB, HOP_MAX_STEP * 1.4);
        } else if (playBall) {
          // Excited little hops in place while the ball is in play.
          dir = Math.random() * Math.PI * 2;
          step = 0.08 + Math.random() * 0.16;
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

      if (w.dropping) {
        // Pinset-release free fall — quadratic curve from from.y → 0,
        // no upward arc. Reads as actual gravity instead of a jump.
        const u = 1 - w.progress;
        w.pos.y = w.from.y * u * u;
      } else {
        // Standard wander jump — symmetric up-and-down arc peaking
        // at the midpoint.
        const arc = 4 * w.progress * (1 - w.progress); // peaks at p=0.5
        w.pos.y = w.maxHeight * arc;
      }

      if (w.progress >= 1) {
        w.pos.y = 0;
        if (w.dropping) {
          // Drop landings get a heavier, slightly longer squash so the
          // "thump" reads — it's the visual confirmation of release.
          w.squashUntil = t + 0.20;
          w.nextJumpAt = t + 0.45 + Math.random() * 0.6;
          w.dropping = false;
        } else {
          // Trigger a short landing-squash phase so the impact reads.
          w.squashUntil = t + 0.14;
          // Brief rest before the next hop — shorter than before so the
          // overall cadence stays quick and busy.
          w.nextJumpAt = t + 0.12 + Math.random() * 0.32;
        }
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
          // Pinset (tweezers):
          //   • If THIS creature is already held → tapping it again is
          //     the "drop right here" gesture. Fire onPinsetRelease so
          //     the page clears heldId + exits pinset mode (the grab+
          //     drop counts as one operation, single-shot UX).
          //   • Otherwise (nothing held, or someone ELSE is held) →
          //     grab this one. Page state replaces the previous heldId
          //     if any (swap semantics for back-to-back picks).
          if (held) {
            onPinsetRelease?.();
          } else {
            onPinsetGrab?.(creature.id);
          }
          return;
        }
        if (candyMode || ballMode || whistleMode) {
          // Candy / ball / whistle cursor — clicking a creature is treated
          // exactly like clicking the ground at that creature's XZ. The
          // page's scene-tap dispatcher (onCandyClick = handleSceneClick)
          // routes by the active mode: sprinkle candy, throw a ball, or
          // whistle the flock to that point. Crucially this RETURNS before
          // onSelect, so an active tool never zooms the camera in — the
          // interaction fires in place. (User stays in the tool after a
          // candy tap; ball/whistle are single-shot and auto-exit.)
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
  ballMode,
  whistleMode,
  pinsetMode,
  heldId,
  onPinsetGrab,
  onPinsetRelease,
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
  /** When true, clicking a creature throws a ball at its XZ (via
   *  onCandyClick, which the page routes by active mode) instead of
   *  focusing the camera. */
  ballMode?: boolean;
  /** When true, clicking a creature whistles the flock to its XZ
   *  instead of focusing the camera. */
  whistleMode?: boolean;
  onCandyClick?: (x: number, z: number) => void;
  /** When true, the tweezers are active — clicking a creature grabs it
   *  (fires onPinsetGrab); the held creature snaps to pinsetTarget on
   *  every frame instead of wandering. */
  pinsetMode?: boolean;
  /** Id of the creature currently held by the tweezers (if any). */
  heldId?: string | null;
  onPinsetGrab?: (id: string) => void;
  /** Fires when the user clicks the currently-held creature again
   *  (re-tap = drop in place). Page-level state clears heldId + exits
   *  pinset mode. */
  onPinsetRelease?: () => void;
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
            ballMode={ballMode}
            whistleMode={whistleMode}
            pinsetMode={pinsetMode}
            held={heldId === c.id}
            onPinsetGrab={onPinsetGrab}
            onPinsetRelease={onPinsetRelease}
            onPetComplete={onPetComplete}
            onCandyClick={onCandyClick}
            onHover={onHover}
          />
        );
      })}
      {/* Candy treats sitting on the ground until a creature eats them.
          Re-rendered when the candy list changes (spawn / consume). */}
      <CandyParticles />
      {/* Every active fetch-ball. Each throw adds one; they animate their
          own bounce-in + keep-away + off-screen exit independently. */}
      <FetchBalls />
    </Suspense>
  );
}

// ---- Candy + Ball meshes --------------------------------------------

/** Renders the current candy particle list as billboarded planes
 *  textured with the hand-drawn candy-button SVG so the treats on the
 *  ground share the visual language of the toolbar icon. Size is
 *  small — roughly 0.42 wide so a creature reads as several times
 *  larger than a single candy. */
function CandyParticles() {
  const candies = useCandyParticles();
  // Re-use the candy button SVG as the ground texture. Shared via
  // useLoader so all particles point at the same GPU texture.
  const texture = useLoader(TextureLoader, "/assets/candy-button.svg");
  // sRGB so the sprinkled candies render the SVG's literal fill, matching
  // the toolbar candy button (same fix as the fetch ball).
  texture.colorSpace = SRGBColorSpace;
  // candy-button.svg aspect ratio: 66.43 / 35.26 ≈ 1.884
  const CANDY_W = 0.42;
  const CANDY_H = CANDY_W * (35.26 / 66.43);
  if (candies.length === 0) return null;
  return (
    <>
      {candies.map((c) => (
        <Billboard key={c.id} position={[c.x, 0.14, c.z]}>
          <mesh>
            <planeGeometry args={[CANDY_W, CANDY_H]} />
            <meshBasicMaterial map={texture} transparent depthWrite={false} />
          </mesh>
        </Billboard>
      ))}
    </>
  );
}

/** Renders every fetch ball currently in play. Loads the ball-button SVG
 *  once (shared GPU texture) and mounts one <FetchBallInstance> per ball;
 *  each instance runs its own bounce / pass / leave state machine. The
 *  list re-renders whenever a ball is added or removed (or changes phase).
 */
const BALL_REST_Y = 0.31; // ball centre height when sitting on the ground
// ball-button.svg aspect: 44.547 / 46.6364 ≈ 0.955 (near-square).
const BALL_W = 0.62;
const BALL_H = BALL_W * (46.6364 / 44.547);

function FetchBalls() {
  const list = useBalls();
  const texture = useLoader(TextureLoader, "/assets/ball-button.svg");
  // Tag the texture sRGB so the renderer (sRGB output) reproduces the
  // SVG's literal #D4CDB8 fill exactly — matching the toolbar <img>.
  // Without this the texture is treated as linear and renders lighter.
  texture.colorSpace = SRGBColorSpace;
  if (list.length === 0) return null;
  return (
    <>
      {list.map((b) => (
        <FetchBallInstance
          key={b.id}
          ballId={b.id}
          phase={b.phase}
          texture={texture}
        />
      ))}
    </>
  );
}

/** A single ball. The outer `<group>` is positioned by the useFrame each
 *  tick; the inner `<Billboard>` keeps the plane facing the camera; the
 *  inner mesh just shows the texture.
 *
 *  Phases: bouncing → sitting → holding → passing → … → leaving. The
 *  first fetcher walks to the landed ball, the flock plays keep-away
 *  (holding/passing) for a few rounds, then the last holder hucks it in
 *  one big arc far off-screen and the ball leaves play.
 */
function FetchBallInstance({
  ballId,
  phase,
  texture,
}: {
  ballId: number;
  phase: BallPhase;
  texture: Texture;
}) {
  const groupRef = useRef<Group | null>(null);
  const shadowRef = useRef<Mesh | null>(null);

  useFrame(() => {
    const ball = balls.find((b) => b.id === ballId);
    if (!ball || !groupRef.current) return;
    const g = groupRef.current;
    const ph = ball.phase;
    const t = (performance.now() - ball.spawnMs) / 1000;

    if (ph === 'bouncing') {
      // Bouncy-ball drop: an initial fall followed by three decaying
      // bounces. Each segment is its own parabola, and segment durations
      // scale with sqrt(height) so the cadence reads like real gravity —
      // a big slow drop, then progressively quicker, shorter hops.
      const dur = BALL_BOUNCE_MS / 1000;
      const u = Math.min(1, t / dur);
      // [dropStartHeight, bounce1Peak, bounce2Peak, bounce3Peak]
      const peaks = [6, 1.9, 0.75, 0.28];
      // Segment 0 is a half-parabola (fall only); the bounces are full
      // up-and-down arcs, so their time-weight counts the round trip.
      const units = [
        Math.sqrt(peaks[0]),
        2 * Math.sqrt(peaks[1]),
        2 * Math.sqrt(peaks[2]),
        2 * Math.sqrt(peaks[3]),
      ];
      const total = units[0] + units[1] + units[2] + units[3];
      let acc = 0;
      let h = 0;
      for (let i = 0; i < peaks.length; i++) {
        const frac = units[i] / total;
        if (u <= acc + frac || i === peaks.length - 1) {
          const pc = Math.min(1, Math.max(0, frac > 0 ? (u - acc) / frac : 1));
          h =
            i === 0
              ? peaks[0] * (1 - pc) * (1 - pc) // fall from peak to ground
              : peaks[i] * 4 * pc * (1 - pc); // bounce up then back down
          break;
        }
        acc += frac;
      }
      g.position.set(ball.x, 0.31 + h, ball.z);
      if (t >= dur) {
        setBallPhase(ball, 'sitting');
      }
    } else if (ph === 'sitting') {
      g.position.set(ball.x, 0.31, ball.z);
      // Transition to holding when the fetcher actually touches the
      // ball. Watch the live creature position; flip on contact.
      const carrierId = ball.carrierId;
      const pos = carrierId ? creaturePositions.get(carrierId) : undefined;
      if (pos) {
        const dx = pos[0] - ball.x;
        const dz = pos[2] - ball.z;
        if (Math.hypot(dx, dz) < BALL_PICKUP_RADIUS) {
          startBallHold(ball);
        }
      }
    } else if (ph === 'holding') {
      // Cradle the ball above the current carrier's head. The carrier
      // writes its world position into creaturePositions each frame —
      // read from there so the ball tracks the holder while they do
      // little excited hops in place.
      const carrierId = ball.carrierId;
      const pos = carrierId ? creaturePositions.get(carrierId) : undefined;
      if (pos) {
        g.position.set(pos[0], pos[1] + BALL_HOVER_Y, pos[2]);
        setBallPosition(ball, pos[0], pos[2]);
        // After the cradle beat, either pass it on, or — once the flock
        // has had its fun — huck it off-screen.
        const held = performance.now() - ball.phaseStartMs;
        if (held >= BALL_HOLD_MS) {
          if (ball.passCount >= ball.passesTarget) {
            startBallLeave(ball, g.position.x, g.position.y, g.position.z);
          } else {
            startBallPass(ball, g.position.x, g.position.y, g.position.z);
          }
        }
      }
    } else if (ph === 'passing') {
      // Ball in flight between two creatures: lerp from the toss origin
      // to the receiver's LIVE position (they may still be hopping) and
      // add a parabolic toss arc that peaks at the midpoint.
      const toId = ball.passToId;
      const to = toId ? creaturePositions.get(toId) : undefined;
      const passT = performance.now() - ball.phaseStartMs;
      const p = Math.min(1, passT / BALL_PASS_MS);
      const toX = to ? to[0] : ball.passFromX;
      const toY = to ? to[1] + BALL_HOVER_Y : ball.passFromY;
      const toZ = to ? to[2] : ball.passFromZ;
      const x = ball.passFromX + (toX - ball.passFromX) * p;
      const z = ball.passFromZ + (toZ - ball.passFromZ) * p;
      const baseY = ball.passFromY + (toY - ball.passFromY) * p;
      const arc = BALL_TOSS_ARC * 4 * p * (1 - p);
      g.position.set(x, baseY + arc, z);
      setBallPosition(ball, x, z);
      if (p >= 1) {
        completeBallPass(ball);
      }
    } else if (ph === 'leaving') {
      // Final move: the last holder hucks the ball in one big arc toward a
      // fixed point well past the edge of the scene. It's already invisible
      // (off-frame) by the time the arc lands; clear it then.
      const leaveT = performance.now() - ball.phaseStartMs;
      const p = Math.min(1, leaveT / BALL_LEAVE_MS);
      const x = ball.passFromX + (ball.leaveToX - ball.passFromX) * p;
      const z = ball.passFromZ + (ball.leaveToZ - ball.passFromZ) * p;
      const arc = BALL_LEAVE_ARC * 4 * p * (1 - p);
      g.position.set(x, ball.passFromY + arc, z);
      setBallPosition(ball, x, z);
      if (p >= 1) {
        clearBall(ball);
      }
    }

    // Ground shadow — gives the ball contrast against the same-coloured
    // ground (its fill matches the toolbar button, so it would otherwise
    // blend in) and sells the bounce: the shadow shrinks and fades as the
    // ball rises, tightens and darkens as it nears the ground.
    const sh = shadowRef.current;
    if (sh) {
      const height = Math.max(0, g.position.y - BALL_REST_Y);
      const k = Math.min(1, height / 3); // 0 on ground → 1 when high up
      const scale = 1 - 0.55 * k; // shrink to ~45% at the apex
      sh.position.set(g.position.x, 0.02, g.position.z);
      sh.scale.set(scale, scale, scale);
      const mat = sh.material as MeshBasicMaterial;
      mat.opacity = 0.28 * (1 - 0.7 * k); // fade as it lifts off
    }
  });

  // While a creature has the ball in play (holding, passing or leaving),
  // draw it on top of everything (high renderOrder + depthTest off) so it
  // doesn't disappear behind a creature's billboard. While bouncing in or
  // sitting on the ground it sorts normally with the scene.
  const onTop = phase === 'holding' || phase === 'passing' || phase === 'leaving';
  const ball = balls.find((b) => b.id === ballId);
  const startX = ball ? ball.x : 0;
  const startZ = ball ? ball.z : 0;
  return (
    <>
      {/* Soft drop shadow on the ground, driven each frame by useFrame. */}
      <mesh
        ref={shadowRef}
        position={[startX, 0.02, startZ]}
        rotation={[-Math.PI / 2, 0, 0]}
        renderOrder={-1}
      >
        <circleGeometry args={[BALL_W * 0.5, 24]} />
        <meshBasicMaterial
          color="#2b2620"
          transparent
          opacity={0.28}
          depthWrite={false}
        />
      </mesh>
      <group ref={groupRef} position={[startX, BALL_REST_Y, startZ]}>
        <Billboard>
          <mesh renderOrder={onTop ? 999 : 0}>
            <planeGeometry args={[BALL_W, BALL_H]} />
            <meshBasicMaterial
              map={texture}
              transparent
              depthWrite={false}
              depthTest={!onTop}
            />
          </mesh>
        </Billboard>
      </group>
    </>
  );
}
