"use client";

import { Fragment, useEffect, useImperativeHandle, useRef, useState } from "react";
import { createPortal } from "react-dom";
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

  // Multi-selection. Most actions (delete, move, copy, flip, rotate, etc.)
  // operate on every id in this array; the per-block rotate/resize handles
  // only render when EXACTLY one block is selected (a single rotation
  // around the centroid of N blocks is fine semantics, but a single
  // resize handle wouldn't know where to anchor with N blocks at
  // different sizes — keep that to single-select).
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const selectedIdsRef = useRef<string[]>([]);
  selectedIdsRef.current = selectedIds;
  const selectedSet = new Set(selectedIds);
  const selectOne = (id: string) => setSelectedIds([id]);
  const singleSelectedId =
    selectedIds.length === 1 ? selectedIds[0] : null;

  const clipboardRef = useRef<CanvasBlock[]>([]);
  const nextZ = useRef(0);
  const dragRef = useRef<DragState | null>(null);

  // Undo / redo history. Each entry is a full snapshot of the blocks
  // array right BEFORE a discrete user action (drag start, add, delete,
  // paste, flip, …). Drag gestures only push ONE snapshot (at mousedown)
  // so per-frame updates inside a drag don't flood the stack. Limited to
  // HISTORY_LIMIT to bound memory.
  const HISTORY_LIMIT = 80;
  const historyRef = useRef<CanvasBlock[][]>([]);
  const futureRef = useRef<CanvasBlock[][]>([]);
  const commitHistory = () => {
    historyRef.current.push(blocksRef.current.map((b) => ({ ...b })));
    if (historyRef.current.length > HISTORY_LIMIT) historyRef.current.shift();
    // Any new action invalidates the redo stack — same convention as
    // most editors: once you branch off, the old "future" is gone.
    futureRef.current = [];
  };
  const undo = () => {
    const past = historyRef.current.pop();
    if (!past) return;
    futureRef.current.push(blocksRef.current.map((b) => ({ ...b })));
    setBlocks(past);
    // After an undo, the selection may reference ids that no longer
    // exist in the restored state (e.g. you undid a paste). Drop any
    // dangling ids.
    const restoredIds = new Set(past.map((b) => b.id));
    setSelectedIds((prev) => prev.filter((id) => restoredIds.has(id)));
  };
  const redo = () => {
    const next = futureRef.current.pop();
    if (!next) return;
    historyRef.current.push(blocksRef.current.map((b) => ({ ...b })));
    setBlocks(next);
    const restoredIds = new Set(next.map((b) => b.id));
    setSelectedIds((prev) => prev.filter((id) => restoredIds.has(id)));
  };
  // Group rotation — accumulated rotation applied to the current
  // multi-block selection. Resets to 0 every time the selection changes,
  // so a fresh marquee always produces an axis-aligned bbox (even if the
  // newly-selected blocks each have their own non-zero block.rotation).
  // A ref shadows it so the rotate-drag closure can capture the fresh
  // value at drag start.
  const [groupRotation, setGroupRotation] = useState(0);
  const groupRotationRef = useRef(0);
  groupRotationRef.current = groupRotation;
  useEffect(() => {
    setGroupRotation(0);
  }, [selectedIds]);

  // Custom cursor — replaces the static .cursor-rotate-arc / .cursor-scale-
  // arrow CSS cursors so the cursor visual can rotate together with the
  // selection box. The cursor is rendered as a fixed-position DOM element
  // portalled to document.body (escaping ViewportFit's scale and the
  // canvas mask). Position is tracked via direct DOM mutation in a window
  // mousemove listener so we don't re-render on every pixel of mouse
  // motion. `locked` keeps the cursor visible during a drag even after the
  // pointer leaves the handle's hit area.
  const [customCursor, setCustomCursor] = useState<{
    kind: "rotate" | "scale";
    rotation: number;
    locked?: boolean;
  } | null>(null);
  const cursorElRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!customCursor) return;
    const move = (e: MouseEvent) => {
      const el = cursorElRef.current;
      if (!el) return;
      el.style.left = `${e.clientX}px`;
      el.style.top = `${e.clientY}px`;
    };
    window.addEventListener("mousemove", move, { passive: true });
    return () => window.removeEventListener("mousemove", move);
  }, [Boolean(customCursor)]);
  // Global mouseup ends drag-mode: anything that locked the cursor (e.g.
  // mousedown on a rotate/scale handle) is now done — clear the cursor.
  useEffect(() => {
    const up = () => setCustomCursor((c) => (c?.locked ? null : c));
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);

  // Snap the cursor element to the given client coords. Called from
  // onMouseEnter / onMouseDown so the cursor appears at the pointer
  // immediately, before the next mousemove fires. requestAnimationFrame
  // waits for the cursor element to mount after the state update.
  const snapCursorTo = (clientX: number, clientY: number) => {
    requestAnimationFrame(() => {
      const el = cursorElRef.current;
      if (!el) return;
      el.style.left = `${clientX}px`;
      el.style.top = `${clientY}px`;
    });
  };

  // Props for any of the rotate/scale handles. Hover shows the rotating
  // cursor, mousedown locks it so a drag-out doesn't lose it, mouseleave
  // hides it (unless still locked from an active drag).
  const cursorHandleProps = (kind: "rotate" | "scale", rotation: number) => ({
    onMouseEnter: (e: React.MouseEvent) => {
      setCustomCursor({ kind, rotation });
      snapCursorTo(e.clientX, e.clientY);
    },
    onMouseLeave: () =>
      setCustomCursor((c) => (c?.locked ? c : null)),
    onMouseDownCapture: (e: React.MouseEvent) => {
      setCustomCursor({ kind, rotation, locked: true });
      snapCursorTo(e.clientX, e.clientY);
    },
  });
  // Marquee (rubber-band) selection. Stored in canvas-local design pixels
  // (same coord space the right-click context menu uses). null when not
  // dragging; while dragging, currentX/Y track the pointer.
  const [marquee, setMarquee] = useState<{
    startX: number;
    startY: number;
    currentX: number;
    currentY: number;
  } | null>(null);
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
        commitHistory();
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
        selectOne(id);
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
        // Snapshot before clearing so the user can Ctrl+Z to recover.
        // (Skipped when the canvas is already empty — no-op gesture.)
        if (blocksRef.current.length > 0) commitHistory();
        setBlocks([]);
        setSelectedIds([]);
      },

      loadCreature: (creatureBlocks) => {
        // Treat the edit-mode hydration as a fresh document — wipe
        // history so the user can't undo into a half-loaded state.
        historyRef.current = [];
        futureRef.current = [];
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
        setSelectedIds([]);
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
    commitHistory();
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
    selectOne(id);
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
    // Snapshot ONCE at the start of the gesture so Ctrl+Z reverts the
    // whole move/rotate/resize as one undo step (not one entry per
    // animation frame).
    commitHistory();

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

    // Selection update:
    //   - If the block we're starting from is OUTSIDE the current
    //     selection, switch to a single-block selection on it.
    //   - If it's INSIDE a multi-block selection, keep that selection
    //     so the move drag carries everything along.
    const inSelection = selectedIdsRef.current.includes(blockId);
    if (!inSelection) selectOne(blockId);

    // For a "move" drag with multiple blocks selected, capture their
    // initial positions so we can apply the same (dx, dy) delta to all
    // of them on each frame.
    const movingIds =
      type === "move" && inSelection && selectedIdsRef.current.length > 1
        ? selectedIdsRef.current
        : [blockId];
    const moveSet = new Set(movingIds);
    const moveStart = new Map<string, { x: number; y: number }>();
    for (const b of blocksRef.current) {
      if (moveSet.has(b.id)) moveStart.set(b.id, { x: b.x, y: b.y });
    }

    // Bring the active drag block to front; for multi-move, leave the
    // other selected blocks where they are in z-order so nothing
    // unexpected reorders behind the scenes.
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
          if (ds.type === "move") {
            // Multi-block move: every block in moveSet gets the same delta.
            if (!moveSet.has(b.id)) return b;
            const start = moveStart.get(b.id);
            if (!start) return b;
            return { ...b, x: start.x + dx, y: start.y + dy };
          }
          // Resize / rotate stay single-block (handles only appear on
          // the sole-selected block, so we only ever get here for one id).
          if (b.id !== ds.blockId) return b;
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

  // ── group transform (rotate/resize handles on a multi-block bbox) ──────────

  // Returns the axis-aligned bounding box (in design pixels, canvas-
  // origin-centered coords) of the currently-selected blocks. Returns
  // null when fewer than 2 are selected — single-block transforms still
  // use the per-block handles in that case.
  const groupBBox = () => {
    const ids = selectedIdsRef.current;
    if (ids.length < 2) return null;
    const idSet = new Set(ids);
    const sel = blocksRef.current.filter((b) => idSet.has(b.id));
    if (sel.length < 2) return null;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const b of sel) {
      const r = (BASE_PX / 2) * b.scale;
      if (b.x - r < minX) minX = b.x - r;
      if (b.x + r > maxX) maxX = b.x + r;
      if (b.y - r < minY) minY = b.y - r;
      if (b.y + r > maxY) maxY = b.y + r;
    }
    return {
      cx: (minX + maxX) / 2,
      cy: (minY + maxY) / 2,
      width: maxX - minX,
      height: maxY - minY,
      sel,
    };
  };

  // Rotate every selected block rigidly around the group centroid (each
  // block's `rotation` accumulates the same delta, and its position is
  // rotated around the centroid by that same delta — so the whole
  // selection spins like a rigid body).
  const startGroupRotate = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const bbox = groupBBox();
    if (!bbox || !canvasEl.current) return;
    // One history snapshot per rotate gesture (same rationale as startDrag).
    commitHistory();
    const { cx, cy, sel } = bbox;
    const rect = canvasEl.current.getBoundingClientRect();
    const offsetW = canvasEl.current.offsetWidth;
    const scaleR = rect.width / offsetW;
    const centroidScreenX = rect.left + rect.width / 2 + cx * scaleR;
    const centroidScreenY = rect.top + rect.height / 2 + cy * scaleR;
    const startAngle = Math.atan2(
      e.clientY - centroidScreenY,
      e.clientX - centroidScreenX,
    );
    const startMap = new Map<
      string,
      { x: number; y: number; rotation: number }
    >();
    for (const b of sel) {
      startMap.set(b.id, { x: b.x, y: b.y, rotation: b.rotation });
    }
    // Capture the group's rotation at drag start so each frame can set
    // groupRotation = startGroupRot + deltaDeg (consistent accumulation
    // across the drag, plus state from any previous group rotations on
    // the same selection).
    const startGroupRot = groupRotationRef.current;
    const onMove = (ev: MouseEvent) => {
      const a = Math.atan2(
        ev.clientY - centroidScreenY,
        ev.clientX - centroidScreenX,
      );
      const delta = a - startAngle;
      const cos = Math.cos(delta);
      const sin = Math.sin(delta);
      const deltaDeg = delta * (180 / Math.PI);
      setBlocks((prev) =>
        prev.map((b) => {
          const s = startMap.get(b.id);
          if (!s) return b;
          const dx = s.x - cx;
          const dy = s.y - cy;
          return {
            ...b,
            x: cx + dx * cos - dy * sin,
            y: cy + dx * sin + dy * cos,
            rotation: s.rotation + deltaDeg,
          };
        }),
      );
      setGroupRotation(startGroupRot + deltaDeg);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Scale every selected block uniformly out from the group centroid:
  // each block's position is scaled relative to the centroid and its own
  // `scale` multiplies by the same factor — keeps relative spacing intact.
  const startGroupResize = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const bbox = groupBBox();
    if (!bbox || !canvasEl.current) return;
    // One history snapshot per resize gesture (same rationale as startDrag).
    commitHistory();
    const { cx, cy, sel } = bbox;
    const rect = canvasEl.current.getBoundingClientRect();
    const offsetW = canvasEl.current.offsetWidth;
    const scaleR = rect.width / offsetW;
    const centroidScreenX = rect.left + rect.width / 2 + cx * scaleR;
    const centroidScreenY = rect.top + rect.height / 2 + cy * scaleR;
    const startDist = Math.hypot(
      e.clientX - centroidScreenX,
      e.clientY - centroidScreenY,
    );
    if (startDist < 1) return;
    const startMap = new Map<
      string,
      { x: number; y: number; scale: number }
    >();
    for (const b of sel) {
      startMap.set(b.id, { x: b.x, y: b.y, scale: b.scale });
    }
    const onMove = (ev: MouseEvent) => {
      const d = Math.hypot(
        ev.clientX - centroidScreenX,
        ev.clientY - centroidScreenY,
      );
      const factor = Math.max(0.1, d / startDist);
      setBlocks((prev) =>
        prev.map((b) => {
          const s = startMap.get(b.id);
          if (!s) return b;
          return {
            ...b,
            x: cx + (s.x - cx) * factor,
            y: cy + (s.y - cy) * factor,
            scale: Math.max(0.2, s.scale * factor),
          };
        }),
      );
    };
    const onUp = () => {
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

      const ids = selectedIdsRef.current;
      const idSet = new Set(ids);
      const selBlocks = blocksRef.current.filter((b) => idSet.has(b.id));

      // Ctrl/Cmd+Z → undo, Ctrl/Cmd+Shift+Z (or Ctrl/Cmd+Y) → redo.
      // Checked before everything else so the user can always escape
      // their last action, even after a paste / duplicate / etc.
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
        return;
      }

      if (e.key === "Delete" || e.key === "Backspace") {
        if (ids.length === 0) return;
        commitHistory();
        setBlocks((prev) => prev.filter((b) => !idSet.has(b.id)));
        setSelectedIds([]);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "c") {
        // Copy doesn't mutate the document — no history push.
        if (selBlocks.length) clipboardRef.current = selBlocks.map((b) => ({ ...b }));
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "v") {
        e.preventDefault();
        const clip = clipboardRef.current;
        if (clip.length === 0) return;
        commitHistory();
        const newIds: string[] = [];
        const stamped: CanvasBlock[] = clip.map((c) => {
          const id = uid();
          newIds.push(id);
          return { ...c, id, x: c.x + 20, y: c.y + 20, zIndex: nextZ.current++ };
        });
        setBlocks((prev) => [...prev, ...stamped]);
        setSelectedIds(newIds);
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "d") {
        e.preventDefault();
        if (selBlocks.length === 0) return;
        commitHistory();
        const newIds: string[] = [];
        const dupes: CanvasBlock[] = selBlocks.map((b) => {
          const id = uid();
          newIds.push(id);
          return { ...b, id, x: b.x + 20, y: b.y + 20, zIndex: nextZ.current++ };
        });
        setBlocks((prev) => [...prev, ...dupes]);
        setSelectedIds(newIds);
      }
      if (e.key === "Escape" && contextMenu) {
        setContextMenu(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [contextMenu]);

  // ── toolbar / context-menu actions (operate on all selected) ───────────────

  // Apply a transformation to every currently-selected block. All
  // call sites are discrete user actions (flip, rotate, send-to-back,
  // …) so commitHistory() is fired here once per call.
  const mutateSelected = (fn: (b: CanvasBlock) => CanvasBlock) => {
    const idSet = new Set(selectedIdsRef.current);
    if (idSet.size === 0) return;
    commitHistory();
    setBlocks((p) => p.map((b) => (idSet.has(b.id) ? fn(b) : b)));
  };

  const flipH = () => mutateSelected((b) => ({ ...b, flipH: !b.flipH }));
  const flipV = () => mutateSelected((b) => ({ ...b, flipV: !b.flipV }));
  const copy = () => {
    const idSet = new Set(selectedIdsRef.current);
    const sel = blocksRef.current.filter((b) => idSet.has(b.id));
    if (sel.length) clipboardRef.current = sel.map((b) => ({ ...b }));
  };
  const paste = () => {
    const clip = clipboardRef.current;
    if (clip.length === 0) return;
    commitHistory();
    const newIds: string[] = [];
    const stamped: CanvasBlock[] = clip.map((c) => {
      const id = uid();
      newIds.push(id);
      return { ...c, id, x: c.x + 20, y: c.y + 20, zIndex: nextZ.current++ };
    });
    setBlocks((p) => [...p, ...stamped]);
    setSelectedIds(newIds);
  };
  const del = () => {
    const idSet = new Set(selectedIdsRef.current);
    if (idSet.size === 0) return;
    commitHistory();
    setBlocks((p) => p.filter((b) => !idSet.has(b.id)));
    setSelectedIds([]);
  };
  // Context-menu actions (Figma 2129:214). Operate on every selected
  // block — handleBlockContextMenu sets selectedIds before opening the
  // menu, so a right-click outside the current selection becomes a fresh
  // single-block selection, while right-clicking inside a multi-block
  // selection keeps that selection.
  const duplicate = () => {
    const idSet = new Set(selectedIdsRef.current);
    const sel = blocksRef.current.filter((b) => idSet.has(b.id));
    if (sel.length === 0) return;
    commitHistory();
    const newIds: string[] = [];
    const dupes: CanvasBlock[] = sel.map((b) => {
      const id = uid();
      newIds.push(id);
      return { ...b, id, x: b.x + 20, y: b.y + 20, zIndex: nextZ.current++ };
    });
    setBlocks((p) => [...p, ...dupes]);
    setSelectedIds(newIds);
  };
  const rotate = () =>
    mutateSelected((b) => ({ ...b, rotation: (b.rotation + 90) % 360 }));
  const bringToFront = () =>
    mutateSelected((b) => ({ ...b, zIndex: nextZ.current++ }));
  const bringToBack = () => {
    const idSet = new Set(selectedIdsRef.current);
    if (idSet.size === 0) return;
    commitHistory();
    const minZ = Math.min(...blocksRef.current.map((b) => b.zIndex));
    let i = 0;
    setBlocks((p) =>
      p.map((b) => (idSet.has(b.id) ? { ...b, zIndex: minZ - 1 - i++ } : b)),
    );
  };
  const originalPosition = () =>
    mutateSelected((b) => ({
      ...b,
      x: 0,
      y: 0,
      rotation: 0,
      scale: 1,
      flipH: false,
      flipV: false,
    }));

  // Right-click on a block: open context menu at the cursor (in canvas-local
  // design pixels, not actual pixels — the menu is rendered inside the
  // ViewportFit-scaled tree, so it gets scaled along with the rest).
  // The position is clamped to the canvas bounds so the menu never extends
  // past the edges and gets clipped (previously a right-click near the
  // bottom of the canvas would chop off the lower menu items).
  const openContextMenu = (e: React.MouseEvent, blockId: string) => {
    e.preventDefault();
    e.stopPropagation();
    // If the right-clicked block is outside the current selection, treat
    // this as a fresh single-select on it. Otherwise keep the existing
    // multi-block selection so menu actions act on all of them.
    if (!selectedIdsRef.current.includes(blockId)) selectOne(blockId);
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

  const hasSelected = selectedIds.length > 0;

  // ── render ─────────────────────────────────────────────────────────────────

  return (
    <div className="relative size-full select-none">
      {/* Toolbar removed — all of these actions are reachable through
          the right-click context menu (Figma 2129:214) and keyboard
          shortcuts (Cmd/Ctrl+C/V, Delete). */}

      {/* Canvas — `.scroll-fade` softens all four edges so a block that
          drifts toward the frame dissolves into it instead of getting
          hard-clipped at the rectangular overflow boundary. Same shared
          mask utility as the other framed scroll regions. */}
      <div
        ref={canvasEl}
        className="scroll-fade absolute inset-0 overflow-hidden"
        onDragOver={(e) => e.preventDefault()}
        onDrop={onDrop}
        // Mouse-down on the bare canvas starts a MARQUEE (rubber-band)
        // selection. The handler tracks the pointer in canvas-local
        // design pixels (same coord space as openContextMenu / blocks),
        // and on mouse-up commits every block whose bbox intersects the
        // marquee rect as the new selection. If the pointer barely
        // moved between down and up, we treat it as a plain bare-canvas
        // click and clear the current selection — same effect as the
        // old onClick.
        onMouseDown={(e) => {
          if (e.target !== e.currentTarget) return; // a block / handle was clicked
          if (e.button !== 0) return; // ignore right-click etc.
          const rect = canvasEl.current?.getBoundingClientRect();
          const offsetW = canvasEl.current?.offsetWidth ?? 1;
          const offsetH = canvasEl.current?.offsetHeight ?? 1;
          if (!rect) return;
          const scale = rect.width / offsetW;
          const startX = (e.clientX - rect.left) / scale;
          const startY = (e.clientY - rect.top) / scale;
          setMarquee({ startX, startY, currentX: startX, currentY: startY });

          const onMove = (ev: MouseEvent) => {
            const cx = (ev.clientX - rect.left) / scale;
            const cy = (ev.clientY - rect.top) / scale;
            setMarquee((m) =>
              m ? { ...m, currentX: cx, currentY: cy } : m,
            );
          };
          const onUp = () => {
            window.removeEventListener("mousemove", onMove);
            window.removeEventListener("mouseup", onUp);
            setMarquee((curr) => {
              if (!curr) return null;
              const dx = Math.abs(curr.currentX - curr.startX);
              const dy = Math.abs(curr.currentY - curr.startY);
              if (dx < 4 && dy < 4) {
                // Negligible drag → plain bare-canvas click. Clear.
                setSelectedIds([]);
                return null;
              }
              // Commit: select every block whose bbox intersects the
              // marquee rect. Block coords are centered on canvas
              // origin, so translate marquee into the same space.
              const minX = Math.min(curr.startX, curr.currentX) - offsetW / 2;
              const maxX = Math.max(curr.startX, curr.currentX) - offsetW / 2;
              const minY = Math.min(curr.startY, curr.currentY) - offsetH / 2;
              const maxY = Math.max(curr.startY, curr.currentY) - offsetH / 2;
              const inside = blocksRef.current.filter((b) => {
                const r = (BASE_PX / 2) * b.scale;
                return (
                  b.x + r > minX &&
                  b.x - r < maxX &&
                  b.y + r > minY &&
                  b.y - r < maxY
                );
              });
              setSelectedIds(inside.map((b) => b.id));
              return null;
            });
          };
          window.addEventListener("mousemove", onMove);
          window.addEventListener("mouseup", onUp);
        }}
      >
        {blocks.length === 0 && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-center text-[13px] leading-relaxed text-black/30">
            Drag blocks from the panel
            <br />
            or click them to add
          </div>
        )}

        {/* Group selection bounding box (multi-select only). Renders ONE
            wavy SelectionBox outline + a rotate/resize handle pair on the
            combined bbox of all selected blocks. Single-block selection
            keeps the per-block handles (rendered inside the blocks map
            above) — both branches share the same handle visuals. */}
        {(() => {
          if (selectedIds.length < 2) return null;
          const sel = blocks.filter((b) => selectedSet.has(b.id));
          if (sel.length < 2) return null;

          // The group's rotation comes from the dedicated `groupRotation`
          // state — NOT from averaging the selected blocks' own rotations.
          // This way a fresh marquee always starts with an axis-aligned
          // bbox (groupRotation = 0) even if the selected blocks were
          // already rotated individually beforehand. Once the user drags
          // the group rotate handle, groupRotation accumulates and the
          // bbox tilts with it.
          const gRot = groupRotation;
          // Current AABB center = rigid-rotation pivot (preserved under
          // rotation around itself).
          let cMinX = Infinity,
            cMaxX = -Infinity,
            cMinY = Infinity,
            cMaxY = -Infinity;
          for (const b of sel) {
            const r = (BASE_PX / 2) * b.scale;
            if (b.x - r < cMinX) cMinX = b.x - r;
            if (b.x + r > cMaxX) cMaxX = b.x + r;
            if (b.y - r < cMinY) cMinY = b.y - r;
            if (b.y + r > cMaxY) cMaxY = b.y + r;
          }
          const cx = (cMinX + cMaxX) / 2;
          const cy = (cMinY + cMaxY) / 2;

          // Un-rotated AABB — rotate each block's position by −gRot
          // around (cx, cy) to recover the un-rotated layout, then take
          // its width/height. The center stays at (cx, cy).
          const rad = (-gRot * Math.PI) / 180;
          const cosR = Math.cos(rad);
          const sinR = Math.sin(rad);
          let minX = Infinity,
            maxX = -Infinity,
            minY = Infinity,
            maxY = -Infinity;
          for (const b of sel) {
            const dx = b.x - cx;
            const dy = b.y - cy;
            const lx = cx + dx * cosR - dy * sinR;
            const ly = cy + dx * sinR + dy * cosR;
            const r = (BASE_PX / 2) * b.scale;
            if (lx - r < minX) minX = lx - r;
            if (lx + r > maxX) maxX = lx + r;
            if (ly - r < minY) minY = ly - r;
            if (ly + r > maxY) maxY = ly + r;
          }
          const w = maxX - minX;
          const h = maxY - minY;
          return (
            <div
              className="absolute"
              style={{
                left: `calc(50% + ${cx}px)`,
                top: `calc(50% + ${cy}px)`,
                width: `${w}px`,
                height: `${h}px`,
                transform: `translate(-50%, -50%) rotate(${gRot}deg)`,
                transformOrigin: "center",
                pointerEvents: "none",
                zIndex: 9998,
              }}
            >
              <SelectionBox />
              {/* Rotate handle — top-center of the group bbox. */}
              <div
                {...cursorHandleProps("rotate", gRot)}
                className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                style={{
                  top: "-22px",
                  width: "32px",
                  height: "28px",
                  pointerEvents: "auto",
                  cursor: "none",
                }}
                onMouseDown={startGroupRotate}
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
              {/* Resize handle — bottom-right corner of the group bbox.
                  The custom cursor rotates with `gRot`, so no flipped
                  variant is needed any more. */}
              <div
                {...cursorHandleProps("scale", gRot)}
                className="absolute flex items-center justify-center"
                style={{
                  cursor: "none",
                  right: "-14px",
                  bottom: "-14px",
                  width: "28px",
                  height: "28px",
                  pointerEvents: "auto",
                }}
                onMouseDown={startGroupResize}
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
          );
        })()}

        {/* Marquee (rubber-band) selection rectangle — rendered while the
            user is drag-selecting on the bare canvas. Faint black/8 fill,
            black/40 1 px dashed border. pointer-events:none so it never
            intercepts the drag the canvas is already handling. */}
        {marquee && (
          <div
            className="pointer-events-none absolute border border-dashed border-black/40 bg-black/[0.06]"
            style={{
              left: `${Math.min(marquee.startX, marquee.currentX)}px`,
              top: `${Math.min(marquee.startY, marquee.currentY)}px`,
              width: `${Math.abs(marquee.currentX - marquee.startX)}px`,
              height: `${Math.abs(marquee.currentY - marquee.startY)}px`,
              zIndex: 9999,
            }}
          />
        )}

        {[...blocks]
          .sort((a, b) => a.zIndex - b.zIndex)
          .map((block) => {
            const isSelected = selectedSet.has(block.id);
            // The rotate/resize handles only make sense around a single
            // block — anchoring/rotation pivots aren't defined for N
            // blocks at once. Render them only on the lone selection.
            const isSoleSelected =
              isSelected && singleSelectedId === block.id;
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
                {/* Per-block selection wrapper — only renders when this
                    block is the SOLE selection. With ≥2 blocks selected
                    we hide per-block outlines so the group bbox (rendered
                    below the blocks loop) is the only visible chrome. */}
                {isSoleSelected && (
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

                    {/* Rotate / resize handles are only rendered on the
                        SOLE selected block. With multiple blocks selected,
                        the rotation pivot and resize anchor aren't
                        well-defined per-block — use the right-click menu
                        Rotate for multi-block rotations instead. */}
                    {isSoleSelected && (
                    <div
                      {...cursorHandleProps("rotate", block.rotation)}
                      className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center"
                      style={{
                        top: "-22px",
                        width: "32px",
                        height: "28px",
                        pointerEvents: "auto",
                        cursor: "none",
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
                    )}

                    {isSoleSelected && (
                    <div
                      {...cursorHandleProps("scale", block.rotation)}
                      className="absolute flex items-center justify-center"
                      style={{
                        cursor: "none",
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
                    )}
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
      {/* Custom rotating cursor — portalled to document.body so it
          escapes ViewportFit's CSS transform: scale() (which would
          otherwise shrink the cursor along with the rest of the page)
          and the canvas's mask-image clipping. Position is updated via
          direct DOM mutation in a window mousemove listener, so the
          cursor follows the pointer without re-rendering the canvas. */}
      {customCursor &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={cursorElRef}
            style={{
              position: "fixed",
              left: 0,
              top: 0,
              pointerEvents: "none",
              zIndex: 99999,
              // The element's top-left lands at the mouse position;
              // rotating around (0, 0) means the cursor SVG rotates
              // around its hotspot (which we offset to the same origin
              // via negative margins below).
              transform: `rotate(${customCursor.rotation}deg)`,
              transformOrigin: "0 0",
            }}
          >
            {customCursor.kind === "rotate" ? (
              <svg
                width="23"
                height="12"
                viewBox="0 0 30.92 14.95"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  position: "absolute",
                  // Hotspot (11, 6) on a 23×12 cursor.
                  left: "-11px",
                  top: "-6px",
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              >
                <g clipPath="url(#bok-rotate-cursor-clip)">
                  <path
                    d="M4.44 13.7C3.85 10.44 6.2 5.6 7.7 3.75C8.61 2.62 10.13 1.44 11.55 1.15C13.46 0.76 15.47 0.45 17.47 0.51C20.52 0.6 22.71 2.69 24.73 4.81C25.8 5.93 26.09 7.24 26.65 8.51C27.29 9.95 27.1 11.52 27.84 12.95"
                    stroke="black"
                    strokeMiterlimit={10}
                    fill="none"
                  />
                  <path
                    d="M0.39 9.74C1.56 11.19 3.05 12.87 4.24 14.27C4.63 13.98 4.85 13.74 5.09 13.52C5.41 13.23 5.66 12.91 5.97 12.59C6.4 12.15 6.73 11.84 7.11 11.35C7.52 10.82 8 10.33 8.46 9.76"
                    stroke="black"
                    strokeMiterlimit={10}
                    fill="none"
                  />
                  <path
                    d="M22.81 10.61C24.39 11.6 26.35 12.71 27.92 13.65C28.19 13.25 28.32 12.95 28.48 12.66C28.69 12.28 28.82 11.9 29.01 11.49C29.27 10.93 29.48 10.54 29.68 9.95C29.89 9.32 30.19 8.7 30.44 8"
                    stroke="black"
                    strokeMiterlimit={10}
                    fill="none"
                  />
                </g>
                <defs>
                  <clipPath id="bok-rotate-cursor-clip">
                    <rect width="30.92" height="14.95" fill="white" />
                  </clipPath>
                </defs>
              </svg>
            ) : (
              <svg
                width="12"
                height="16"
                viewBox="0 0 12.2836 16"
                xmlns="http://www.w3.org/2000/svg"
                style={{
                  position: "absolute",
                  // Hotspot (6, 8) on a 12×16 cursor.
                  left: "-6px",
                  top: "-8px",
                  pointerEvents: "none",
                  overflow: "visible",
                }}
              >
                <path
                  d="M5.53316 7.10443C4.55842 5.95156 3.62325 4.82342 2.78705 3.58148C2.62871 3.34893 2.40605 3.15596 2.25761 2.92341C2.15866 2.76507 2.11412 2.582 2.01516 2.42366C1.95579 2.3247 1.87167 2.27522 1.82219 2.15647C1.72324 1.92392 1.67376 1.7161 1.55006 1.49839C1.40162 1.23615 1.24328 1.02339 1.24823 0.721564"
                  stroke="black"
                />
                <path
                  d="M0.496139 6.006C0.604994 5.13516 0.718797 4.23958 0.713849 3.36379C0.713849 2.78488 0.713849 2.21091 0.713849 1.632C0.713849 1.34502 0.669318 1.01351 0.713849 0.726524C0.743537 0.498918 0.708901 0.538501 0.93156 0.508813C1.07505 0.489022 1.24328 0.508813 1.39172 0.508813C1.66881 0.508813 1.95084 0.49397 2.22793 0.508813C2.50501 0.523657 2.75241 0.612721 3.0196 0.627565C3.53913 0.657252 4.07351 0.563241 4.59305 0.647356C5.05816 0.721576 5.54801 0.850223 6.01312 0.840327C6.33473 0.840327 6.65635 0.840327 6.97797 0.840327"
                  stroke="black"
                />
                <path
                  d="M6.75532 8.8956C7.73007 10.0485 8.66523 11.1766 9.50144 12.4186C9.65977 12.6511 9.88243 12.8441 10.0309 13.0766C10.1298 13.235 10.1744 13.418 10.2733 13.5764C10.3327 13.6753 10.4168 13.7248 10.4663 13.8436C10.5653 14.0761 10.6147 14.2839 10.7384 14.5016C10.8869 14.7639 11.0452 14.9766 11.0403 15.2785"
                  stroke="black"
                />
                <path
                  d="M11.788 9.99405C11.6791 10.8649 11.5653 11.7605 11.5702 12.6363C11.5702 13.2152 11.5702 13.7891 11.5702 14.368C11.5702 14.655 11.6147 14.9865 11.5702 15.2735C11.5405 15.5011 11.5752 15.4615 11.3525 15.4913C11.209 15.5111 11.0408 15.4913 10.8924 15.4913C10.6153 15.4913 10.3332 15.5061 10.0562 15.4913C9.77906 15.4764 9.53166 15.3874 9.26447 15.3725C8.74494 15.3428 8.21056 15.4368 7.69103 15.3527C7.22592 15.2785 6.73607 15.1499 6.27096 15.1598C5.94934 15.1598 5.62773 15.1598 5.30611 15.1598"
                  stroke="black"
                />
              </svg>
            )}
          </div>,
          document.body,
        )}
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
