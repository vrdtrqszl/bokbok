"use client";

/**
 * Hand-drawn zoom-in / zoom-out buttons for the creature viewport on the
 * main / encyclopedia / calendar pages. Designs from Figma 2084:88 / 2084:85.
 * Stacked vertically, anchored to the bottom-right of the viewport box.
 */
export default function ViewportZoomControls({
  onZoomIn,
  onZoomOut,
  className,
}: {
  onZoomIn: () => void;
  onZoomOut: () => void;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute ${className ?? ""}`}>
      <button
        type="button"
        onClick={onZoomIn}
        title="Zoom in"
        className="pointer-events-auto block h-[29.86px] w-[34.4px] cursor-pointer bg-transparent p-0 opacity-80 transition-opacity hover:opacity-100 active:scale-95"
      >
        <img
          alt="zoom in"
          src="/assets/viewport-zoom-in.svg"
          className="block size-full"
        />
      </button>
      <button
        type="button"
        onClick={onZoomOut}
        title="Zoom out"
        className="pointer-events-auto mt-[6px] block h-[31.13px] w-[34.33px] cursor-pointer bg-transparent p-0 opacity-80 transition-opacity hover:opacity-100 active:scale-95"
      >
        <img
          alt="zoom out"
          src="/assets/viewport-zoom-out.svg"
          className="block size-full"
        />
      </button>
    </div>
  );
}
