"use client";

import type { CreatureSpec } from "@/lib/creature";

/**
 * Lightweight static rendering of a creature for grids/lists. No breathing
 * animation (cheap to render lots of these on the calendar). Block positions
 * are in creature-space units, mapped to pixels by `blockSize`.
 */
export default function CreatureThumbnail({
  creature,
  blockSize = 36,
  className,
}: {
  creature: CreatureSpec;
  blockSize?: number;
  className?: string;
}) {
  return (
    <div
      className={`pointer-events-none relative h-full w-full overflow-hidden ${className ?? ""}`}
    >
      {creature.blocks.map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            left: `calc(50% + ${b.x * blockSize}px)`,
            top: `calc(50% + ${b.y * blockSize}px)`,
            width: `${blockSize}px`,
            height: `${blockSize}px`,
            transform: `translate(-50%, -50%) rotate(${b.rotation}deg) scale(${b.scale})`,
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
