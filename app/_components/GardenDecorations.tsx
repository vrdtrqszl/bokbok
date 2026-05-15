"use client";

import { useMemo } from "react";
import { Billboard } from "@react-three/drei";
import { useLoader } from "@react-three/fiber";
import { TextureLoader } from "three";

// Garden decorations — hand-drawn leaf / flower / clover / mushroom
// SVGs scattered across the ground plane (Figma 2250:1476 / 1479 /
// 1488 / 1494). Each illustration is upright (drawn with its stem at
// the bottom), so we billboard them to keep facing the camera and
// place them so the SVG's bottom edge sits on y=0 — they read as
// "rooted in the ground" instead of floating.
//
// Positions are deterministic from a seeded RNG so the garden stays
// in the same arrangement across refreshes (no jitter, no localStorage
// needed). Density is uniform across a disk via sqrt(r) sampling, with
// a small inner gap so decorations don't pile directly under the
// initial camera focus point at origin.

const GARDEN_ASSETS = [
  // baseHeight is in world units; aspect = width / height of the viewBox.
  { src: "/assets/garden-leaf.svg",     baseHeight: 0.55, aspect: 37.28 / 51.84 },
  { src: "/assets/garden-flower.svg",   baseHeight: 0.95, aspect: 45.64 / 83.79 },
  { src: "/assets/garden-clover.svg",   baseHeight: 0.65, aspect: 31.73 / 58.03 },
  { src: "/assets/garden-mushroom.svg", baseHeight: 0.50, aspect: 47.97 / 63.36 },
] as const;

const DECO_COUNT = 70;       // total decoration count
const OUTER_RADIUS = 17;     // disk radius decorations are sampled inside
const INNER_HOLE = 0.6;      // tiny gap around origin so the first creature isn't buried

// Mulberry32 — small deterministic PRNG. We seed with a fixed value so
// the garden looks the same across every load instead of reshuffling.
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export default function GardenDecorations({
  hidden = false,
}: {
  /** When true, the whole garden is skipped — used by MainViewport to
   *  declutter the zoomed-in view when a creature is selected. The
   *  textures stay preloaded so re-showing the garden is instant. */
  hidden?: boolean;
} = {}) {
  // Preload all four textures upfront — small SVGs, cheap.
  const srcs = useMemo(() => GARDEN_ASSETS.map((a) => a.src), []);
  const textures = useLoader(TextureLoader, srcs as unknown as string[]);

  const decorations = useMemo(() => {
    const rand = makeRng(0xb0b0b0b0);
    return Array.from({ length: DECO_COUNT }, (_, i) => {
      const typeIdx = Math.floor(rand() * GARDEN_ASSETS.length);
      const asset = GARDEN_ASSETS[typeIdx];

      // Uniform-area sampling inside a disk: r is mapped through sqrt
      // so equal area bands get equal counts. Plus a small inner hole
      // so the very centre stays clear.
      const angle = rand() * Math.PI * 2;
      const r = INNER_HOLE + Math.sqrt(rand()) * (OUTER_RADIUS - INNER_HOLE);
      const x = Math.cos(angle) * r;
      const z = Math.sin(angle) * r;

      // ±25 % size jitter so the garden has natural variety.
      const scale = 0.75 + rand() * 0.5;
      const height = asset.baseHeight * scale;
      const width = height * asset.aspect;

      return { id: i, typeIdx, x, z, width, height };
    });
  }, []);

  // When zoomed in on a single creature, the garden becomes visual
  // noise and competes with the focused subject. Skip rendering all
  // the decoration meshes entirely until selection clears.
  if (hidden) return null;

  return (
    <>
      {decorations.map((d) => (
        <Billboard
          key={d.id}
          // Y = height / 2 places the plane's BOTTOM exactly on y=0 — so
          // the stems/bases read as planted on the ground instead of
          // floating mid-air.
          position={[d.x, d.height / 2, d.z]}
        >
          <mesh>
            <planeGeometry args={[d.width, d.height]} />
            <meshBasicMaterial
              map={textures[d.typeIdx]}
              transparent
              depthWrite={false}
            />
          </mesh>
        </Billboard>
      ))}
    </>
  );
}
