/**
 * Hover hint for the bottom-toolbar interaction tools (Figma 2415:235).
 *
 * Hand-drawn casual-font label that floats just ABOVE its button and fades
 * in on hover — e.g. "feeding them candies" over the candy button. Pure
 * text, no box, matching the design (Casual Human Bold, 16 px, black).
 *
 * Drives purely off CSS `group-hover`, so:
 *   • the PARENT button must carry the `group` class, and
 *   • it only ever appears on devices that actually hover (desktop / web).
 *     On touch there's no hover state, so the hint stays hidden — which is
 *     exactly what we want (mobile gets the tap-to-toggle tools instead).
 *
 * `pointer-events-none` so it never intercepts a click, `aria-hidden`
 * because each button already exposes the same info via its `aria-label`.
 */
export default function ToolHint({ children }: { children: React.ReactNode }) {
  return (
    <span
      aria-hidden="true"
      className="pointer-events-none absolute bottom-full left-1/2 z-[40] mb-[10px] -translate-x-1/2 whitespace-nowrap text-[16px] font-bold leading-normal text-black opacity-0 transition-opacity duration-150 group-hover:opacity-100 font-(family-name:--font-casual)"
    >
      {children}
    </span>
  );
}
