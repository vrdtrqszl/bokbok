"use client";

import { Fragment, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EMOTIONS, type EmotionKey } from "@/lib/emotions";
import type { CreatureSpec, CreatureBlock } from "@/lib/creature";
import SelectionBox from "./SelectionBox";
import FunctionBoxOutline from "./FunctionBoxOutline";

// ─── types ────────────────────────────────────────────────────────────────────

type CanvasBlock = {
  id: string;
  emotionKey: EmotionKey;
  imagePath: string;
  /** Pixel offset from canvas center */
  x: number;
  y: number;
  rotation: number; // degrees
  scale: number;
  flipH: boolean;
  flipV: boolean;
  zIndex: number;
  phase: number;
};

type DragState = {
  type: "move" | "resize" | "rotate";
  blockId: string;
  startMouseX: number;
  startMouseY: number;
  startBlockX: number;
  startBlockY: number;
  startScale: number;
  startRotation: number;
  /** Block center in screen coords (for rotate) */
  blockScreenCx: number;
  blockScreenCy: number;
  startAngle: number;
};

export type ManualCanvasHandle = {
  addBlock: (emotionKey: EmotionKey, imagePath: string) => void;
  toCreatureSpec: () => CreatureSpec | null;
  clear: () => void;
  /** Replace canvas contents with the blocks from an existing creature. */
  loadCreature: (blocks: CreatureBlock[]) => void;
};

// Base display size (px) for one block at scale=1.
const BASE_PX = 110;

// ─── component ────────────────────────────────────────────────────────────────

export default function ManualCanvas({
  handleRef,
}: {
  handleRef: React.RefObject<ManualCanvasHandle | null>;
}) {
  const canvasEl = useRef<HTMLDivElement | null>(null);
  const [blocks, setBlocks] = useState<CanvasBlock[]>([]);
  const blocksRef = useRef<CanvasBlock[]>([]);
  blocksRef.current = blocks;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const clipboardRef = useRef<CanvasBlock | null>(null);
  const nextZ = useRef(0);
  const dragRef = useRef<DragState | null>(null);
  // Right-click context menu — null when closed, canvas-local coords when open.
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    blockId: string;
  } | null>(null);

  // ── imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(
    handleRef,
    () => ({
      addBlock: (emotionKey, imagePath) => {
        const id = uid();
        setBlocks((prev) => [
          ...prev,
          {
            id,
            emotionKey,
            imagePath,
            x: (Math.random() - 0.5) * 80,
            y: (Math.random() - 0.5) * 80,
            rotation: 0,
            scale: 1,
            flipH: false,
            flipV: false,
            zIndex: nextZ.current++,
            phase: Math.random(),
          },
        ]);
        setSelectedId(id);
      },

      toCreatureSpec: () => {
        const current = blocksRef.current;
        if (current.length === 0) return null;
        const creatureBlocks: CreatureBlock[] = current.map((b) => ({
          emotionKey: b.emotionKey,
          imagePath: b.imagePath,
          x: b.x / BASE_PX,
          y: b.y / BASE_PX,
          rotation: b.rotation,
          scale: b.scale,
          zIndex: b.zIndex,
          phase: b.phase,
        }));
        // Center the cluster
        const cx = creatureBlocks.reduce((s, b) => s + b.x, 0) / creatureBlocks.length;
        const cy = creatureBlocks.reduce((s, b) => s + b.y, 0) / creatureBlocks.length;
        for (const b of creatureBlocks) {
          b.x -= cx;
          b.y -= cy;
        }
        const seen = new Set<EmotionKey>();
        const emotions: CreatureSpec["emotions"] = [];
        for (const b of current) {
          if (!seen.has(b.emotionKey)) {
            seen.add(b.emotionKey);
            // Fall back to the raw key if the catalog doesn't know it —
            // can happen when a creature was made under an older catalog.
            const meta = EMOTIONS[b.emotionKey];
            emotions.push({
              key: b.emotionKey,
              displayName: meta?.displayName ?? String(b.emotionKey),
              score: 1,
            });
          }
        }
        return {
          id: `creature-manual-${Date.now()}`,
          createdAt: Date.now(),
          blocks: creatureBlocks,
          emotions,
        };
      },

      clear: () => {
        setBlocks([]);
        setSelectedId(null);
      },

      loadCreature: (creatureBlocks) => {
        // Convert CreatureBlock[] (creature-space coords) → CanvasBlock[] (px).
        const next: CanvasBlock[] = creatureBlocks.map((b, i) => ({
          id: uid(),
          emotionKey: b.emotionKey,
          imagePath: b.imagePath,
          x: b.x * BASE_PX,
          y: b.y * BASE_PX,
          rotation: b.rotation,
          scale: b.scale,
          flipH: false,
          flipV: false,
          zIndex: i,
          phase: b.phase,
        }));
        nextZ.current = next.length;
        setBlocks(next);
        setSelectedId(null);
      },
    }),
    // stable refs only — no stale-closure risk
    [],
  );

  // ── drag-from-info-panel drop ──────────────────────────────────────────────

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const raw = e.dataTransfer.getData("application/bokbok-block");
    if (!raw) return;
    const { emotionKey, imagePath } = JSON.parse(raw) as {
      emotionKey: EmotionKey;
      imagePath: string;
    };
    const rect = canvasEl.current?.getBoundingClientRect();
    if (!rect) return;
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top - rect.height / 2;
    const id = uid();
    setBlocks((prev) => [
      ...prev,
      {
        id,
        emotionKey,
        imagePath,
        x,
        y,
        rotation: 0,
        scale: 1,
        flipH: false,
        flipV: false,
        zIndex: nextZ.current++,
        phase: Math.random(),
      },
    ]);
    setSelectedId(id);
  };

  // ── block pointer interaction ──────────────────────────────────────────────

  const startDrag = (
    e: React.MouseEvent,
    blockId: string,
    type: DragState["type"],
  ) => {
    e.stopPropagation();
    e.preventDefault();

    const block = blocksRef.current.find((b) => b.id === blockId);
    if (!block || !canvasEl.current) return;

    const rect = canvasEl.current.getBoundingClientRect();
    const blockScreenCx = rect.left + rect.width / 2 + block.x;
    const blockScreenCy = rect.top + rect.height / 2 + block.y;
    const startAngle = Math.atan2(
      e.clientY - blockScreenCy,
      e.clientX - blockScreenCx,
    );

    dragRef.current = {
      type,
      blockId,
      startMouseX: e.clientX,
      startMouseY: e.clientY,
      startBlockX: block.x,
      startBlockY: block.y,
      startScale: block.scale,
      startRotation: block.rotation,
      blockScreenCx,
      blockScreenCy,
      startAngle,
    };

    setSelectedId(blockId);
    // Bring to front
    setBlocks((prev) =>
      prev.map((b) => (b.id === blockId ? { ...b, zIndex: nextZ.current++ } : b)),
    );

    const onMove = (ev: MouseEvent) => {
      const ds = dragRef.current;
      if (!ds) return;
      const dx = ev.clientX - ds.startMouseX;
      const dy = ev.clientY - ds.startMouseY;

      setBlocks((prev) =>
        prev.map((b) => {
          if (b.id !== ds.blockId) return b;
          if (ds.type === "move") {
            return { ...b, x: ds.startBlockX + dx, y: ds.startBlockY + dy };
          }
          if (ds.type === "resize") {
            const signed = Math.hypot(dx, dy) * Math.sign(dx + dy);
            const newScale = Math.max(0.2, ds.startScale + signed / (BASE_PX * 2));
            return { ...b, scale: newScale };
          }
          if (ds.type === "rotate") {
            const angle = Math.atan2(
              ev.clientY - ds.blockScreenCy,
              ev.clientX - ds.blockScreenCx,
            );
            const delta = (angle - ds.startAngle) * (180 / Math.PI);
            return { ...b, rotation: ds.startRotation + delta };
          }
          return b;
        }),
      );
    };

    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // ── keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      const sel = blocksRef.current.find((b) => b.id === selectedId);

      if (e.key === "Delete" || e.key === "Backspace") {
        if (!selectedId) return;
        setBlocks((prev) => prev.filter((b) => b.id !== selectedId));
        setSelectedId(null);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        if (sel) clipboardRef.current = { ...sel };
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const clip = clipboardRef.current;
        if (!clip) return;
        const id = uid();
        setBlocks((prev) => [
          ...prev,
          { ...clip, id, x: clip.x + 20, y: clip.y + 20, zIndex: nextZ.current++ },
        ]);
        setSelectedId(id);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (!sel) return;
        const id = uid();
        setBlocks((prev) => [
          ...prev,
          { ...sel, id, x: sel.x + 20, y: sel.y + 20, zIndex: nextZ.current++ },
        ]);
        setSelectedId(id);
      }
      if (e.key === "Escape" && contextMenu) {
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, contextMenu]);

  // ── toolbar actions ────────────────────────────────────────────────────────

  const flipH = () =>
    selectedId &&
    setBlocks((p) =>
      p.map((b) => (b.id === selectedId ? { ...b, flipH: !b.flipH } : b)),
    );
  const flipV = () =>
    selectedId &&
    setBlocks((p) =>
      p.map((b) => (b.id === selectedId ? { ...b, flipV: !b.flipV } : b)),
    );
  const copy = () => {
    const b = blocksRef.current.find((b) => b.id === selectedId);
    if (b) clipboardRef.current = { ...b };
  };
  const paste = () => {
    const clip = clipboardRef.current;
    if (!clip) return;
    const id = uid();
    setBlocks((p) => [
      ...p,
      { ...clip, id, x: clip.x + 20, y: clip.y + 20, zIndex: nextZ.current++ },
    ]);
    setSelectedId(id);
  };
  const del = () => {
    if (!selectedId) return;
    setBlocks((p) => p.filter((b) => b.id !== selectedId));
    setSelectedId(null);
  };
  // Context-menu actions (Figma 2129:214). All operate on the currently-
  // selected block — handleBlockContextMenu sets selectedId before opening
  // the menu, so this works for the right-clicked block.
  const duplicate = () => {
    const sel = blocksRef.current.find((b) => b.id === selectedId);
    if (!sel) return;
    const id = uid();
    setBlocks((p) => [
      ...p,
      { ...sel, id, x: sel.x + 20, y: sel.y + 20, zIndex: nextZ.current++ },
    ]);
    setSelectedId(id);
  };
  const rotate = () =>
    selectedId &&
    setBlocks((p) =>
      p.map((b) =>
        b.id === selectedId ? { ...b, rotation: (b.rotation + 90) % 360 } : b,
      ),
    );
  const bringToFront = () =>
    selectedId &&
    setBlocks((p) =>
      p.map((b) => (b.id === selectedId ? { ...b, zIndex: nextZ.current++ } : b)),
    );
  const bringToBack = () => {
    if (!selectedId) return;
    const minZ = Math.min(...blocksRef.current.map((b) => b.zIndex));
    setBlocks((p) =>
      p.map((b) => (b.id === selectedId ? { ...b, zIndex: minZ - 1 } : b)),
    );
  };
  const originalPosition = () =>
    selectedId &&
    setBlocks((p) =>
      p.map((b) =>
        b.id === selectedId
          ? { ...b, x: 0, y: 0, rotation: 0, scale: 1, flipH: false, flipV: false }
          : b,
      ),
    );

  // Right-click on a block: open context menu at the cursor (in canvas-local
  // design pixels, not actual pixels — the menu is rendered inside the
  // ViewportFit-scaled tree, so it gets scaled along with the rest).
  // The position is clamped to the canvas bounds so the menu never extends
  // past the edges and gets clipped (previously a right-click near the
  // bottom of the canvas would chop off the lower menu items).
  const openContextMenu = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(blockId);
    const rect = canvasEl.current?.getBoundingClientRect();
    const offsetW = canvasEl.current?.offsetWidth ?? 1;
    const offsetH = canvasEl.current?.offsetHeight ?? 1;
    if (!rect) return;
    const scale = rect.width / offsetW; // ViewportFit scale (post-transform / pre)
    const localX = (e.clientX - rect.left) / scale;
    const localY = (e.clientY - rect.top) / scale;
    // Menu dimensions in design pixels (must match the JSX h-[220px] w-[124px]).
    const MENU_W = 124;
    const MENU_H = 220;
    const PAD = 4;
    const clampedX = Math.max(PAD, Math.min(localX, offsetW - MENU_W - PAD));
    const clampedY = Math.max(PAD, Math.min(localY, offsetH - MENU_H - PAD));
    setContextMenu({ x: clampedX, y: clampedY, blockId });
  };

  const hasSelected = !!blocks.find((b) => b.id === selectedId);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative size-full select-none">
      {/* Toolbar removed — all of these actions are reachable through
          the right-click context menu (Figma 2129:214) and keyboard
          shortcuts (Cmd/Ctrl+C/V, Delete). */}

      {/* Canvas */}
      <div
        ref={canvasEl}
        className="absolute inset-0 overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        // Clear selection only when clicking the bare canvas, NOT when a
        // block-click bubbles up. (Without this guard, clicking a block
        // would select it via mousedown, then immediately deselect via the
        // bubbled click — the build-box flashed for a frame and vanished.)
        onClick={(e) => {
          if (e.target === e.currentTarget) setSelectedId(null);
        }}
      >
        {blocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[13px] leading-relaxed text-black/30">
            Drag blocks from the panel
            <br />
            or click them to add
          </div>
        )}

        {[...blocks]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((block) => {
            const isSelected = block.id === selectedId;
            const scX = block.flipH ? -1 : 1;
            const scY = block.flipV ? -1 : 1;
            return (
              <Fragment key={block.id}>
                {/* The block itself — CSS-scaled. The image scales with
                    block.scale; everything else (selection box, handles)
                    lives in a sibling wrapper below so it doesn't inherit
                    the scale transform. */}
                <div
                  className="block-grab-cursor absolute"
                  style={{
                    left: `calc(50% + ${block.x}px)`,
                    top: `calc(50% + ${block.y}px)`,
                    width: `${BASE_PX}px`,
                    height: `${BASE_PX}px`,
                    transform: `translate(-50%, -50%) rotate(${block.rotation}deg) scale(${block.scale * scX}, ${block.scale * scY})`,
                    transformOrigin: "center",
                    zIndex: block.zIndex,
                  }}
                  onMouseDown={(e) => startDrag(e, block.id, "move")}
                  onContextMenu={(e) => openContextMenu(e, block.id)}
                >
                  <img
                    src={block.imagePath}
                    alt={block.emotionKey}
                    className="block size-full"
                    style={{ objectFit: "contain" }}
                    draggable={false}
                  />
                </div>

                {/* Selection wrapper — sized to match the VISUALLY-scaled
                    block (BASE_PX × scale), but with NO CSS scale transform
                    of its own. Pulling SelectionBox out of the block's scale
                    is what actually keeps the stroke at 1 CSS pixel: the
                    SVG renders at the wrapper's literal pixel size and
                    vector-effect=non-scaling-stroke pins stroke width to
                    user-space (1 device pixel) — no CSS-transform multiplier. */}
                {isSelected && (
                  <div
                    className="absolute"
                    style={{
                      left: `calc(50% + ${block.x}px)`,
                      top: `calc(50% + ${block.y}px)`,
                      width: `${BASE_PX * block.scale}px`,
                      height: `${BASE_PX * block.scale}px`,
                      transform: `translate(-50%, -50%) rotate(${block.rotation}deg)`,
                      transformOrigin: "center",
                      zIndex: block.zIndex,
                      pointerEvents: "none",
                    }}
                  >
                    {/* Hand-drawn selection box (Figma 2129:230). */}
                    <SelectionBox />

                    {/* Rotate handle — fixed-size circle visual + click
                        area at top-center of wrapper. The visible circle
                        SVG is 14×14 px regardless of block.scale; the
                        outer div is 28×28 px so there's plenty of hover
                        slop. The visible circle is centered inside via
                        flex. */}
                    <div
                      className="cursor-rotate-arc absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                      style={{
                        top: "-22px",
                        width: "32px",
                        height: "28px",
                        pointerEvents: "auto",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, block.id, "rotate");
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="95 0 22 22"
                        style={{ pointerEvents: "none" }}
                      >
                        <path
                          d="M106.59 0.500059C103.69 0.543651 102.567 1.09059 100.174 2.50006C98.2168 3.66251 96.6743 6.50006 96.1743 9.00006C96.1743 10.8313 96.5293 12.5205 96.6743 13.0001C96.8628 13.6685 97.0003 13.8607 97.1743 14.5001C97.4063 15.3428 97.7452 16.2076 98.3832 16.9051C98.9777 17.559 100.319 18.8112 101.174 19.0001C101.74 19.1308 102.609 19.4274 103.174 19.5001C104.175 19.6308 106.435 19.3257 107.174 19.5001C112.174 18.5001 114.674 16.5001 115.174 10.8313C115.16 8.39017 114.754 5.61483 113.362 3.60961C111.665 1.16847 109.374 0.543651 106.59 0.500059Z"
                          fill="#DFD9C9"
                          stroke="black"
                          strokeMiterlimit={10}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>

                    {/* Resize handle — fixed-size square visual + click
                        area centered ON the wrapper's bottom-right CORNER.
                        right/bottom: -14px shifts the 28×28 hover box so
                        its center lands exactly at (wrapper_right, wrapper_
                        bottom); the 14×14 icon is then flex-centered inside,
                        giving the visual impression of "anchored at the
                        corner" rather than floating just inside it. */}
                    <div
                      className="cursor-scale-arrow absolute flex items-center justify-center"
                      style={{
                        right: "-14px",
                        bottom: "-14px",
                        width: "28px",
                        height: "28px",
                        pointerEvents: "auto",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, block.id, "resize");
                      }}
                    >
                      <svg
                        width="14"
                        height="14"
                        viewBox="200 224 18 20"
                        style={{ pointerEvents: "none" }}
                      >
                        <path
                          d="M200.784 224.85C200.774 224.86 200.674 228.89 200.674 231C200.674 233.44 200.674 235.5 200.674 238C200.674 239 200.674 242.5 200.774 243.23C201.862 243.23 204.284 243.23 205.474 243.23H209.674C211.054 243.23 212.434 243.21 213.814 243.23C214.894 243.25 215.174 243.23 216.174 243.23C217.674 243.23 217.964 243.5 217.964 242C217.754 240.656 217.964 238.64 217.964 237.28C217.964 234.97 217.964 232.281 217.964 230C217.964 228 217.964 226.656 217.964 224.85C216.674 224.85 214.304 224.81 213.204 224.87C212.104 224.93 211.034 224.86 209.954 224.86C208.964 224.86 207.974 224.87 206.994 224.86C205.694 224.85 200.784 224.85 200.774 224.86L200.784 224.85Z"
                          fill="#DFD9C9"
                          stroke="black"
                          strokeMiterlimit={10}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>
                  </div>
                )}
              </Fragment>
            );
          })}

        {/* Right-click context menu (Figma 2129:214). Hand-drawn outline +
            9 actions. The transparent backdrop catches outside clicks (and
            right-clicks) to dismiss. The menu is rendered inside the canvas
            so its coords are in design pixels and ViewportFit's scale
            handles visual sizing. */}
        {contextMenu && (
          <>
            <div
              className="fixed inset-0 z-[299]"
              onClick={() => setContextMenu(null)}
              onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu(null);
              }}
            />
            <div
              className="absolute z-[300] h-[220px] w-[124px] font-(family-name:--font-casual)"
              style={{ left: contextMenu.x, top: contextMenu.y }}
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Hand-drawn wavy outline + 8 dividers, inlined so each
                  stroke can carry vector-effect="non-scaling-stroke".
                  Without that, ViewportFit's CSS transform: scale() can
                  squash 1 px strokes to sub-pixel widths and the box
                  disappears at smaller window sizes. */}
              <FunctionBoxOutline />
              <ul
                className="absolute m-0 flex list-none flex-col p-0"
                style={{ inset: "3.18% 8.06% 2.76% 8.06%" }}
              >
                {[
                  { label: "copy", action: copy },
                  { label: "paste", action: paste },
                  { label: "duplicate", action: duplicate },
                  { label: "rotate", action: rotate },
                  { label: "flip horizontal", action: flipH },
                  { label: "flip vertical", action: flipV },
                  { label: "bring to front", action: bringToFront },
                  { label: "bring to back", action: bringToBack },
                  { label: "original position", action: originalPosition },
                ].map(({ label, action }) => (
                  <li
                    key={label}
                    role="button"
                    onClick={() => {
                      action();
                      setContextMenu(null);
                    }}
                    className="flex flex-1 items-center justify-center text-center text-[16px] leading-[normal] text-black hover:bg-black/5"
                  >
                    {label}
                  </li>
                ))}
              </ul>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── helpers ────────────────────────────────────────────────────────────────────

function uid() {
  return `b-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
}

function Btn({
  onClick,
  title,
  danger,
  children,
}: {
  onClick: () => void;
  title?: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={(e) => {
        e.stopPropagation();
        onClick();
      }}
      className={`flex h-[22px] min-w-[22px] items-center justify-center rounded px-[4px] text-[12px] font-bold transition-colors ${
        danger
          ? "bg-red-100 text-red-700 hover:bg-red-200"
          : "bg-black/5 text-black hover:bg-black/15"
      }`}
    >
      {children}
    </button>
  );
}
