/**
 * Hand-drawn BokBok wordmark logo (Figma 2287:82). Replaces the previous
 * Orange-font "BokBok" text used as the home-link in every page header.
 *
 * The Figma frame is 132×108 with two SVG groups composed inside:
 *   • Group 1 (right half): inset[31.27% 0 0 50.7%]
 *   • Group 2 (left half):  inset[34.77% 41.7% 3.54% 0]
 * They overlap in the middle to form the chunky "BoKBoK" mark.
 *
 * The top ~31% of the frame is empty whitespace above the letterforms,
 * which on the desktop pages bleeds above the page's y=0 (the frame
 * originates at y=-27 in the Figma design). Wrappers using this
 * component should place it so the empty top can clip naturally.
 *
 * `width` controls the rendered frame width; height is derived from the
 * native 132:108 = 11:9 aspect ratio so the two inner groups stay
 * positioned correctly via percentage insets.
 */
export default function BokBokLogo({
  width = 132,
  className = "",
}: {
  width?: number;
  className?: string;
}) {
  const height = (width * 108) / 132;
  return (
    <div
      className={`relative ${className}`}
      style={{ width, height }}
      aria-hidden
    >
      <div className="absolute" style={{ inset: "31.27% 0 0 50.7%" }}>
        <img
          alt=""
          src="/assets/bokbok-logo-1.svg"
          className="absolute inset-0 block size-full max-w-none"
          draggable={false}
        />
      </div>
      <div className="absolute" style={{ inset: "34.77% 41.7% 3.54% 0" }}>
        <img
          alt=""
          src="/assets/bokbok-logo-2.svg"
          className="absolute inset-0 block size-full max-w-none"
          draggable={false}
        />
      </div>
    </div>
  );
}
