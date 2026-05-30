"use client";

/**
 * Candy button (Figma 2239:1401) — toggles "candy mode". When candy
 * mode is on, the page cursor becomes a small candy icon and clicking
 * anywhere in the 3D environment makes creatures converge on that
 * spot (and replays the plastic-bag rustle). Like rustling a treat bag
 * and pointing where you want the dog to come — they'll run to you.
 *
 * The toggle pattern mirrors the BokBokButton (pet mode) — the actual
 * cursor + click-to-gather wiring lives in app/page.tsx; this button is
 * purely a state flip. Press again (or Escape) to leave candy mode.
 *
 * Placed at the Figma frame position (52, 825) on the main page; the
 * page wraps it in the design-space ViewportFit so we just absolute
 * the coords. The artwork itself (a wrapped candy outline) is 66.43 ×
 * 35.26 px in the design canvas.
 */
export default function CandyButton({
  active = false,
  onToggle,
}: {
  active?: boolean;
  onToggle?: () => void;
}) {
  const label = active
    ? "Candy mode on — click in the scene to gather creatures (or press to exit)"
    : "Candy mode — call creatures to where you click";
  return (
    <button
      type="button"
      onClick={onToggle}
      title={label}
      aria-label={label}
      aria-pressed={active}
      className="tool-hit tool-mode absolute left-[52px] top-[825px] z-[20] block h-[35.26px] w-[66.43px] cursor-pointer overflow-visible bg-transparent p-0 transition-transform hover:opacity-90 active:scale-95"
    >
      <img
        alt=""
        src="/assets/candy-button.svg"
        className="block size-full"
        draggable={false}
      />
    </button>
  );
}
