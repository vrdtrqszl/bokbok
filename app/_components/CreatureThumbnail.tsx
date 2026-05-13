"use client";

import { useEffect, useRef, useState } from "react";
import type { CreatureSpec } from "@/lib/creature";

/**
 * Lightweight static rendering of a creature for grids/lists. No breathing
 * animation (cheap to render lots of these on the calendar/encyclopedia).
 *
 * Block positions are in creature-space units, mapped to pixels by an
 * effective `blockSize` that auto-shrinks to fit the container. The provided
 * `blockSize` prop acts as a *maximum* — small creatures aren't blown up.
 */
export default function CreatureThumbnail({
  creature,
  blockSize = 36,
  padding = 4,
  className,
}: {
  creature: CreatureSpec;
  /** Maximum block side in pixels. Creature shrinks below this to fit. */
  blockSize?: number;
  /** Inner padding (px) the creature should never cross. */
  padding?: number;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [fitScale, setFitScale] = useState(1);

  // Recompute fit-scale whenever the creature changes or the container resizes.
  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const compute = () => {
      const rect = el.getBoundingClientRect();
      const availW = Math.max(0, rect.width - padding * 2);
      const availH = Math.max(0, rect.height - padding * 2);
      if (!availW || !availH) return;

      // Farthest extent (in normalized creature-space units) of any block edge
      // from origin. Each block extends ~0.5 * scale around its center, plus
      // a slack factor for rotation and the soft gradient halo bleeding out
      // beyond the block plane.
      let halfExtentX = 0;
      let halfExtentY = 0;
      for (const b of creature.blocks) {
        const r = 0.5 * b.scale;
        const rPad = r * 0.6;
        halfExtentX = Math.max(halfExtentX, Math.abs(b.x) + r + rPad);
        halfExtentY = Math.max(halfExtentY, Math.abs(b.y) + r + rPad);
      }
      const requiredW = 2 * halfExtentX * blockSize;
      const requiredH = 2 * halfExtentY * blockSize;
      // Only shrink — don't blow small creatures up past blockSize.
      const fit = Math.min(availW / requiredW, availH / requiredH, 1);
      setFitScale(Number.isFinite(fit) && fit > 0 ? fit : 1);
    };

    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(el);
    return () => ro.disconnect();
  }, [creature, blockSize, padding]);

  const effectiveBlockSize = blockSize * fitScale;

  return (
    <div
      ref={containerRef}
      className={`pointer-events-none relative h-full w-full overflow-hidden ${className ?? ""}`}
    >
      {creature.blocks.map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `calc(50% + ${b.x * effectiveBlockSize}px)`,
            top: `calc(50% + ${b.y * effectiveBlockSize}px)`,
            width: `${effectiveBlockSize}px`,
            height: `${effectiveBlockSize}px`,
            // Mirror flags honoured via scale(-1) on the matching axis,
            // so thumbnails match the canvas exactly.
            transform: `translate(-50%, -50%) rotate(${b.rotation}deg) scale(${(b.flipH ? -1 : 1) * b.scale}, ${(b.flipV ? -1 : 1) * b.scale})`,
            transformOrigin: "center",
            zIndex: b.zIndex,
          }}
        >
          <img
            src={b.imagePath}
            alt=""
            className="block size-full select-none"
            style={{ objectFit: "contain" }}
            draggable={false}
          />
        </div>
      ))}
    </div>
  );
}
