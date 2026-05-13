// Render a creature to a PNG file and trigger a browser download.
// Uses an offscreen canvas: each block is drawn with its position, rotation,
// and scale (mirroring CreatureCanvas's layout) at the creature's baseline
// (no breathing/jumping animation captured — the saved file is the canonical
// portrait, not a snapshot of a frame).

import type { CreatureSpec } from "./creature";

const CANVAS_SIZE = 1024;
// Base block diameter in pixels when block.scale = 1. The creature-space
// coordinates (block.x / block.y) are in units of "blockSize", so this same
// number is used to convert them to pixels.
const BLOCK_PX = 240;

function safeFilename(s: string): string {
  return (
    s
      .replace(/[\\/:*?"<>|]+/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "creature"
  );
}

async function loadImage(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  img.src = src;
  // Both `decode` and the `load` event are supported; use load fallback for
  // any browsers/edge cases where decode rejects despite the image painting.
  try {
    await img.decode();
  } catch {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error(`failed: ${src}`));
    });
  }
  return img;
}

export async function downloadCreaturePng(creature: CreatureSpec): Promise<void> {
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Load every block image (parallel, deduped by URL so we don't refetch).
  const uniqueSrcs = Array.from(new Set(creature.blocks.map((b) => b.imagePath)));
  const imageMap = new Map<string, HTMLImageElement>();
  await Promise.all(
    uniqueSrcs.map(async (src) => {
      try {
        imageMap.set(src, await loadImage(src));
      } catch {
        /* skip missing block */
      }
    }),
  );

  // Draw blocks back-to-front so later (higher zIndex) sit on top.
  const ordered = [...creature.blocks].sort((a, b) => a.zIndex - b.zIndex);
  const cx = CANVAS_SIZE / 2;
  const cy = CANVAS_SIZE / 2;

  for (const block of ordered) {
    const img = imageMap.get(block.imagePath);
    if (!img) continue;
    ctx.save();
    ctx.translate(cx + block.x * BLOCK_PX, cy + block.y * BLOCK_PX);
    ctx.rotate((block.rotation * Math.PI) / 180);
    // Honour the per-block mirror flags from the manual canvas via
    // negative scale on the matching axis.
    const sx = (block.flipH ? -1 : 1) * block.scale;
    const sy = (block.flipV ? -1 : 1) * block.scale;
    ctx.scale(sx, sy);
    ctx.drawImage(img, -BLOCK_PX / 2, -BLOCK_PX / 2, BLOCK_PX, BLOCK_PX);
    ctx.restore();
  }

  // Convert to PNG blob and trigger download.
  await new Promise<void>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve();
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const datePart = creature.dateISO ?? "";
      const namePart = safeFilename(creature.name ?? "creature");
      a.download = datePart ? `${namePart}-${datePart}.png` : `${namePart}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      resolve();
    }, "image/png");
  });
}
