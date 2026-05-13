"use client";

import { useEffect, useRef, useState } from "react";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
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
  const rotatorRef = useRef<HTMLDivElement | null>(null);
  const blockRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [fitScale, setFitScale] = useState(1);
  // Wheel-driven zoom multiplier — multiplies on top of the page-level
  // `zoom` prop (used by the +/− buttons) and the auto fit scale. Scroll
  // up zooms in, scroll down zooms out. Resets to 1 when the displayed
  // creature changes.
  const [wheelZoom, setWheelZoom] = useState(1);

  // ---- Drag-to-rotate (3D turntable) ----------------------------------
  // Refs (not state) so we can write the CSS transform every pointermove
  // without re-rendering and tearing the per-frame "alive body" animation.
  // yaw  = rotation around Y axis  (horizontal drag spins like a turntable)
  // pitch = rotation around X axis (vertical drag tilts forward / back)
  const yawRef = useRef(0);
  const pitchRef = useRef(0);
  const dragRef = useRef<{
    sx: number; sy: number; yaw0: number; pitch0: number; pid: number;
  } | null>(null);

  const applyRotation = () => {
    const el = rotatorRef.current;
    if (!el) return;
    // rotateX FIRST then rotateY so vertical drag stays intuitive when the
    // creature has been spun (otherwise the X axis follows the rotated Y).
    el.style.transform = `rotateX(${pitchRef.current}deg) rotateY(${yawRef.current}deg)`;
  };

  // Reset rotation when the displayed creature changes — a fresh subject
  // should always show its "front" view first.
  useEffect(() => {
    yawRef.current = 0;
    pitchRef.current = 0;
    applyRotation();
    // Wheel zoom resets per-creature too so the next subject opens at fit.
    setWheelZoom(1);
  }, [creature?.id]);

  // Native wheel listener — React's `onWheel` is registered with
  // passive:true so preventDefault() is a no-op. We need preventDefault
  // to stop the page from scrolling under the cursor while the user is
  // zooming the creature, so the listener is attached manually with
  // passive:false. Exponential scaling per pixel keeps trackpad and
  // mouse-wheel speeds both feeling natural; the multiplier is clamped
  // to [0.3, 4] so the creature can't disappear or explode off-screen.
  useEffect(() => {
    const el = containerRef.current;
    if (!el || !creature) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // deltaY > 0 (scroll down) → zoom out; deltaY < 0 → zoom in.
      const factor = Math.exp(-e.deltaY * 0.0015);
      setWheelZoom((z) => Math.max(0.3, Math.min(4, z * factor)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [creature]);

  // Tap-vs-drag threshold. If the pointer never moves more than this from
  // its down position before pointerup, treat the gesture as a click and
  // play the creature's giggle. Bigger movement = drag, no sound.
  const TAP_PIXEL_THRESHOLD = 5;

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!creature) return;
    dragRef.current = {
      sx: e.clientX,
      sy: e.clientY,
      yaw0: yawRef.current,
      pitch0: pitchRef.current,
      pid: e.pointerId,
    };
    // Capture so the drag keeps tracking even if the cursor leaves the box.
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s) return;
    // 0.5 deg per CSS pixel — a 200-px drag = full 100° sweep, a 720-px
    // drag = full 360°. Comfortable on both desktop and the design canvas.
    const SENS = 0.5;
    const dx = e.clientX - s.sx;
    const dy = e.clientY - s.sy;
    yawRef.current = s.yaw0 + dx * SENS;
    // Invert so "drag up" looks "up" (CSS rotateX positive tilts the top
    // away from camera, which feels reversed when reading as a turntable).
    pitchRef.current = s.pitch0 - dy * SENS;
    applyRotation();
  };
  const endDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const s = dragRef.current;
    if (!s) return;
    // Tap detection: if the pointer never travelled more than the
    // threshold, play the creature's giggle. `force: true` bypasses the
    // global Sound Off toggle — pressing the creature in the panel
    // always plays, matching the BokBokpedia / Calendar tile clicks.
    const moved = Math.hypot(e.clientX - s.sx, e.clientY - s.sy);
    if (creature && moved < TAP_PIXEL_THRESHOLD) {
      unlockAudio();
      playCreatureGiggle(creature.blocks, { force: true });
    }
    try {
      e.currentTarget.releasePointerCapture(s.pid);
    } catch {
      // releasePointerCapture throws if the capture was already lost;
      // safe to ignore — the drag is ending either way.
    }
    dragRef.current = null;
  };

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

  // Combined fit-to-container × prop-zoom × wheel-zoom. prop-zoom is the
  // page-level +/- button state; wheel-zoom is this component's own
  // scroll-driven multiplier. Either > 1 lets the creature overflow the
  // box (clipped by overflow:hidden + scroll-fade mask on the wrapper),
  // < 1 shrinks below fit.
  const effectiveBlockSize = blockSize * fitScale * zoom * wheelZoom;

  return (
    <div
      ref={containerRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      className={`relative h-full w-full overflow-hidden select-none ${className ?? ""}`}
      style={{
        // 3D perspective for the rotator child — bigger = subtler 3D
        // foreshortening. 1200 px feels natural at the design's box size.
        perspective: "1200px",
        // Cursor hints at the new drag interaction. `touch-action: none`
        // disables touchscreen scrolling while the user is dragging the
        // creature so the rotation feels like grabbing the object.
        cursor: dragRef.current ? "grabbing" : "grab",
        touchAction: "none",
      }}
    >
      {/* 3D rotator — yaw/pitch are written to its transform every
          pointermove (via applyRotation). The blocks live inside so the
          whole creature spins as one rigid body; their per-frame "alive"
          animation runs on top in local space. */}
      <div
        ref={rotatorRef}
        className="absolute inset-0"
        style={{ transformStyle: "preserve-3d", willChange: "transform" }}
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
    </div>
  );
}
