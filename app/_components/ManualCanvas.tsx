"use client";

import { useEffect, useImperativeHandle, useRef, useState } from "react";
import { EMOTIONS, type EmotionKey } from "@/lib/emotions";
import type { CreatureSpec, CreatureBlock } from "@/lib/creature";

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
        onClick={() => setSelectedId(null)}
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
              <div
                key={block.id}
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

                {isSelected && (
                  <>
                    {/* Hand-drawn selection box (Figma 2129:172) — the
                        rotate-circle (top-center) and resize-square
                        (bottom-right) are baked into the SVG. The SVG's
                        inner rectangle is ~84.4% of its total height
                        (7.5% above for the circle, 8.1% below for the
                        square), so we extend the container 8.9% above
                        and 18.5% taller to align the inner rect with
                        the block edges. */}
                    <img
                      alt=""
                      src="/assets/build-box.svg"
                      className="pointer-events-none absolute left-0 w-full max-w-none"
                      style={{ top: "-8.9%", height: "118.5%" }}
                    />

                    {/* Rotate handle — invisible click target on the
                        SVG's top-center circle. */}
                    <div
                      className="absolute left-1/2 -translate-x-1/2 cursor-crosshair"
                      style={{ top: "-9%", width: "16px", height: "16px" }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, block.id, "rotate");
                      }}
                    />

                    {/* Resize handle — invisible click target on the
                        SVG's bottom-right square. */}
                    <div
                      className="absolute cursor-se-resize"
                      style={{
                        right: "-2px",
                        bottom: "-7%",
                        width: "16px",
                        height: "16px",
                      }}
                      onMouseDown={(e) => {
                        e.stopPropagation();
                        startDrag(e, block.id, "resize");
                      }}
                    />
                  </>
                )}
              </div>
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
