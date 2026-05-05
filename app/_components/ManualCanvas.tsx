"use client";

import { Fragment, useEffect, useImperativeHandle, useRef, useState } from "react";
import { EMOTIONS, type EmotionKey } from "@/lib/emotions";
import type { CreatureSpec, CreatureBlock } from "@/lib/creature";
import SelectionBox from "./SelectionBox";

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
            emotions.push({
              key: b.emotionKey,
              displayName: EMOTIONS[b.emotionKey].displayName,
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
  const openContextMenu = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(blockId);
    const rect = canvasEl.current?.getBoundingClientRect();
    const offsetW = canvasEl.current?.offsetWidth ?? 1;
    if (!rect) return;
    const scale = rect.width / offsetW; // ViewportFit scale (post-transform / pre)
    const localX = (e.clientX - rect.left) / scale;
    const localY = (e.clientY - rect.top) / scale;
    setContextMenu({ x: localX, y: localY, blockId });
  };

  const hasSelected = !!blocks.find((b) => b.id === selectedId);

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative size-full select-none">
      {/* Toolbar — only visible when a block is selected */}
      {hasSelected && (
        <div className="absolute left-2 top-2 z-[200] flex items-center gap-[4px] rounded-[6px] bg-white/80 p-[4px] shadow-sm backdrop-blur-sm">
          <Btn onClick={flipH} title="Flip horizontal">⇔ H</Btn>
          <Btn onClick={flipV} title="Flip vertical">⇕ V</Btn>
          <div className="mx-[2px] h-[16px] w-px bg-black/20" />
          <Btn onClick={copy} title="Copy (⌘C)">⎘</Btn>
          <Btn onClick={paste} title="Paste (⌘V)">⎙</Btn>
          <div className="mx-[2px] h-[16px] w-px bg-black/20" />
          <Btn onClick={del} title="Delete" danger>✕</Btn>
        </div>
      )}

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
                        viewBox="95 0 21 21"
                        style={{ pointerEvents: "none" }}
                      >
                        <path
                          d="M108.131 1.35724C105.231 1.40084 102.81 1.89488 100.417 3.30434C98.4599 4.46679 95.763 7.82336 96.0385 10.4389C96.111 11.1363 96.6329 11.4124 96.7779 11.8919C96.9664 12.5603 96.7779 13.2433 96.9519 13.8826C97.1839 14.7254 97.5899 16.2075 98.2279 16.905C98.8224 17.5589 100.374 18.4452 101.229 18.6341C101.795 18.7649 102.447 18.4888 103.013 18.5615C104.013 18.6922 104.158 19.0846 104.898 19.2589C110.567 20.5667 115.048 16.3819 115.019 10.8312C115.004 8.39005 114.598 5.61471 113.206 3.60949C111.51 1.16835 109.219 0.543531 106.435 0.499939"
                          fill="#DFD9C9"
                          stroke="black"
                          strokeMiterlimit={10}
                          vectorEffect="non-scaling-stroke"
                        />
                      </svg>
                    </div>

                    {/* Resize handle — fixed-size square visual + click
                        area at bottom-right of wrapper. Same fixed sizes
                        as the rotate handle so they stay constant
                        regardless of block.scale. */}
                    <div
                      className="cursor-scale-arrow absolute flex items-center justify-center"
                      style={{
                        right: "-12px",
                        bottom: "-12px",
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
                        viewBox="198 223 21 21"
                        style={{ pointerEvents: "none" }}
                      >
                        <path
                          d="M200.629 224.85C200.599 226.92 200.039 228.67 200.039 230.78C200.039 233.22 200.179 235.59 199.579 237.89C199.279 239.04 198.949 242.76 199.989 243.27C201.029 243.78 204.129 243.23 205.319 243.23H209.519C210.899 243.23 212.279 243.21 213.659 243.23C214.739 243.25 215.099 242.81 215.999 242.61C217.329 242.31 217.559 243.1 217.819 241.51C218.039 240.17 217.809 238.64 217.809 237.28C217.809 234.97 218.279 232.11 217.759 229.89C217.309 227.97 216.819 226.23 216.549 224.34C215.559 223.92 214.149 224.81 213.049 224.87C211.949 224.93 210.879 224.86 209.799 224.86C208.809 224.86 207.819 224.87 206.839 224.86C205.539 224.85 204.809 225.29 200.619 224.86L200.629 224.85Z"
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
              <img
                alt=""
                src="/assets/function-box.svg"
                className="pointer-events-none absolute inset-0 size-full"
              />
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
