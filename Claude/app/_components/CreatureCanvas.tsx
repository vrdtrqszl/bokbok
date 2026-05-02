"use client";

import { useEffect, useRef, useState } from "react";
import type { CreatureSpec } from "@/lib/creature";

type Props = {
  creature: CreatureSpec | null;
  // Maximum block diameter in pixels. The creature is auto-scaled DOWN from
  // this size if needed to fit within the container.
  blockSize?: number;
  // Inner padding (px) that the creature should not cross.
  padding?: number;
  // User-controlled zoom multiplier on top of fit scale. 1 = normal.
  zoom?: number;
  className?: string;
};

/**
 * Renders a creature inside a relatively-positioned container. The creature is
 * auto-scaled to fit (never enlarged), and overflow is clipped so blocks can
 * never bleed past the container — preserves the framed look of the viewport.
 */
export default function CreatureCanvas({
  creature,
  blockSize = 180,
  padding = 12,
  zoom = 1,
  className,
}: Props) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [fitScale, setFitScale] = useState(1);

  blockRefs.current = blockRefs.current.slice(0, creature?.blocks.length ?? 0);

  // Recompute fit-scale whenever the creature changes or the container resizes.
  useEffect(() => {
    if (!creature || !containerRef.current) return;
    const el = containerRef.current;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(0, rect.width - padding * 2);
      const availH = Math.max(0, rect.height - padding * 2);
      if (!availW || !availH) return;

      // Find the farthest extent (in normalized creature-space units) of any
      // block edge from origin. Each block extends ~0.5 * scale around its
      // center on each side.
      let halfExtentX = 0;
      let halfExtentY = 0;
      for (const b of creature.blocks) {
        const r = 0.5 * b.scale;
        // Slight pad for rotation: a rotated unit square's worst-case half
        // extent is sqrt(2)/2 ≈ 0.707 of its side. We use 0.6 as a softer
        // approximation since creature blocks are mostly soft gradients.
        const rPad = r * 0.6;
        halfExtentX = Math.max(halfExtentX, Math.abs(b.x) + r + rPad);
        halfExtentY = Math.max(halfExtentY, Math.abs(b.y) + r + rPad);
      }
      const requiredW = 2 * halfExtentX * blockSize;
      const requiredH = 2 * halfExtentY * blockSize;
      // Only shrink — don't blow small creatures up.
      const fit = Math.min(availW / requiredW, availH / requiredH, 1);
      setFitScale(Number.isFinite(fit) && fit > 0 ? fit : 1);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [creature, blockSize, padding]);

  // Per-frame "alive body" animation. All blocks share the same motion so the
  // creature moves as a single connected body — like a small animal/insect
  // breathing and shifting weight, not loose blocks drifting in space.
  useEffect(() => {
    if (!creature) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = (now - start) / 1000;
      // Whole-body breathing pulse (scale).
      const breath = 1 + Math.sin(t * 1.4) * 0.035;
      // Slight body sway / weight shift.
      const swayX = Math.sin(t * 0.8) * 3.5;
      const swayY = Math.cos(t * 1.1) * 2.5;
      // Subtle body tilt.
      const tilt = Math.sin(t * 0.5) * 1.5;
      for (let i = 0; i < creature.blocks.length; i++) {
        const el = blockRefs.current[i];
        if (!el) continue;
        const b = creature.blocks[i];
        // Tiny per-block wiggle traveling through the body so it doesn't feel
        // rigid — like a faint ripple of muscle. Amplitude is small enough
        // that the body still reads as one connected mass.
        const wave = Math.sin(t * 2.2 + b.phase * Math.PI * 2) * 0.6;
        el.style.transform = `translate(calc(-50% + ${swayX + wave}px), calc(-50% + ${swayY}px)) rotate(${b.rotation + tilt}deg) scale(${b.scale * breath})`;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [creature]);

  if (!creature) {
    return (
      <div
        ref={containerRef}
        className={`relative flex h-full w-full items-center justify-center overflow-hidden text-[14px] text-black/40 ${className ?? ""}`}
      >
        Type below and press Generate
      </div>
    );
  }

  // Combined fit-to-container × user-zoom. User zoom > 1 lets the creature
  // overflow the box (clipped by overflow:hidden); zoom < 1 shrinks below fit.
  const effectiveBlockSize = blockSize * fitScale * zoom;

  return (
    <div
      ref={containerRef}
      className={`relative h-full w-full overflow-hidden ${className ?? ""}`}
    >
      {creature.blocks.map((b, i) => {
        const left = `calc(50% + ${b.x * effectiveBlockSize}px)`;
        const top = `calc(50% + ${b.y * effectiveBlockSize}px)`;
        return (
          <div
            key={i}
            ref={(el) => {
              blockRefs.current[i] = el;
            }}
            className="pointer-events-none absolute"
            style={{
              left,
              top,
              width: `${effectiveBlockSize}px`,
              height: `${effectiveBlockSize}px`,
              zIndex: b.zIndex,
              transform: `translate(-50%, -50%) rotate(${b.rotation}deg) scale(${b.scale})`,
              transformOrigin: "center",
              willChange: "transform",
            }}
          >
            <img
              alt=""
              src={b.imagePath}
              className="block h-full w-full select-none"
              style={{ objectFit: "contain" }}
              draggable={false}
            />
          </div>
        );
      })}
    </div>
  );
}
