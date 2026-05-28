"use client";

import BokBokLogo from "./BokBokLogo";

/**
 * Full-screen prompt asking the user to rotate their phone to landscape.
 * Shown by ViewportFit when useIsPortraitMobile() returns true.
 *
 * Why this exists:
 *   The dedicated Mobile* layouts are temporarily paused. The desktop
 *   1440×900 design fits acceptably on a phone in landscape (ViewportFit
 *   scales it), but in portrait everything becomes too narrow and the
 *   3D scene clips badly. Rather than show a broken layout, we show a
 *   clear instruction to rotate.
 *
 * The phone icon below is a CSS-only outlined rectangle that rocks back
 * and forth (CSS animation) to visually suggest "turn me sideways".
 */
export default function RotatePrompt() {
  return (
    <div
      className="bg-grain fixed inset-0 flex flex-col items-center justify-center gap-8 px-8 text-center font-(family-name:--font-casual)"
      style={{ touchAction: "none" }}
    >
      {/* BokBok wordmark up top so the page still reads as ours even
          before the user rotates. */}
      <div className="opacity-80">
        <BokBokLogo width={88} />
      </div>

      {/* Animated rotating-phone icon. Pure CSS — a tall rounded
          rectangle that rocks ±90° on a 2.4 s loop. */}
      <div className="rotate-phone-loop" aria-hidden>
        <div className="relative h-[120px] w-[68px] rounded-[14px] border-[2.5px] border-black">
          {/* Earpiece slit at the top of the portrait phone */}
          <span className="absolute left-1/2 top-[10px] block h-[3px] w-[22px] -translate-x-1/2 rounded-full bg-black" />
          {/* Home indicator / pill at the bottom */}
          <span className="absolute left-1/2 bottom-[8px] block h-[4px] w-[26px] -translate-x-1/2 rounded-full bg-black/70" />
        </div>
      </div>

      <div className="max-w-[280px]">
        <p className="m-0 text-[22px] font-bold leading-tight text-black">
          Rotate your phone
        </p>
        <p className="mt-2 text-[16px] font-bold leading-snug text-black/60">
          BokBok works best in landscape. Turn your phone sideways to
          enter the ecosystem.
        </p>
      </div>

      {/* Scoped keyframes for the rocking-phone icon. Kept inline so we
          don't have to plumb new CSS into globals.css for a single
          one-screen affordance. */}
      <style>{`
        @keyframes bokbok-rotate-rock {
          0%   { transform: rotate(0deg); }
          35%  { transform: rotate(-90deg); }
          65%  { transform: rotate(-90deg); }
          100% { transform: rotate(0deg); }
        }
        .rotate-phone-loop {
          animation: bokbok-rotate-rock 2.4s cubic-bezier(.4,.0,.2,1) infinite;
          transform-origin: center center;
        }
      `}</style>
    </div>
  );
}
