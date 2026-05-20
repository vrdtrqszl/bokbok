/**
 * Hand-drawn × close-to-home button (Figma 2288:37). Renders on every
 * page except the main page so visitors always have a one-click route
 * back to /. Plain <a> (not Next.js Link) so the click triggers a full
 * browser navigation — same behaviour as the BokBok logo home link and
 * the top nav.
 *
 * Position: the Figma frame 2288:37 reports (924, 8) which is in some
 * intermediate parent's coord system that I couldn't trace via the
 * MCP. BUT there's a hidden sibling frame `2288:47` at page coords
 * (957, 107) sized 42×43 — the older box-outline variant of the same
 * × button, which IS in page coords. The new SVG-based 2288:37
 * replaces 2288:47 at the same anchor point, so we mount the new
 * 32.12×32.5 button at the hidden frame's top-left (957, 107). That
 * lands the × at the top-right corner inside the main wavy frame —
 * 42 px from the right edge, 22 px below the main box top — same
 * visual slot the desktop main page uses for its fullscreen button.
 * The SVG has a -1.54%/-1.56% inner inset (stroke overflow) so we
 * wrap it in the standard two-div pattern used elsewhere on the site.
 */
export default function CloseToHomeButton() {
  return (
    <a
      href="/"
      aria-label="Close — back to home"
      title="Back to home"
      className="absolute z-[30] block cursor-pointer transition-transform active:scale-95 hover:scale-105"
      style={{ left: 957, top: 107, width: 32.12, height: 32.5 }}
    >
      <div className="absolute" style={{ inset: "-1.54% -1.56%" }}>
        <img
          alt=""
          src="/assets/close-x.svg"
          className="block size-full max-w-none"
          draggable={false}
        />
      </div>
    </a>
  );
}
