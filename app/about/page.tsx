"use client";

// About page (Figma 2134:2). Layout:
//   • Same top nav + BokBok logo as every other page, with the
//     "About" tab active.
//   • Main wavy story box on the left holding four "cartoon panel"
//     cards — each a rectangular hand-drawn frame with an
//     illustration above a one-line question. Questions paraphrase
//     the design brief that motivated BokBok.
//   • Right column: creature view (a petting-a-dog photo + the
//     "BokBok" name + the Korean onomatopoeic definition), and
//     below it the info box with the Instagram QR + handle link.
//
// The frame assets (main-box / creature-view / info-vector1 /
// info-vector2) are shared with every other page so the wavy outline
// is identical across the app. Only the About-specific illustrations
// + the cartoon-panel frame live in /assets/about-*.

import Link from "next/link";
import { useT } from "@/lib/i18n";

const INSTAGRAM_URL =
  "https://www.instagram.com/bokbok.meee?igsh=aThxYnVscHV1MHNh&utm_source=qr";

export default function AboutPage() {
  const t = useT();

  return (
    <div className="bg-grain relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* BokBok logo / Home link */}
      <Link
        href="/"
        className="absolute left-[1213.5px] top-[24px] block -translate-x-1/2 cursor-pointer whitespace-nowrap text-[48px] leading-normal text-black font-(family-name:--font-fancy)"
      >
        BokBok
      </Link>

      {/* Top nav — stair-stepping y values to match the Figma. */}
      <Link
        href="/create"
        className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.create")}
      </Link>
      <Link
        href="/calender"
        className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.calendar")}
      </Link>
      <Link
        href="/encyclopedia"
        className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.encyclopedia")}
      </Link>
      <Link
        href="/energy-blocks"
        className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.energy_blocks")}
      </Link>

      {/* Active-tab indicator behind "About". The Figma frame for the
          tab outline computes to roughly (579, 46) × 80 × 47 within
          the 1440×900 page. */}
      <div className="absolute left-[579px] top-[46px] h-[47px] w-[80px]">
        <img
          alt=""
          src="/assets/about-tab-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        {t("nav.about")}
      </span>

      {/* ── Main story box (left) ──────────────────────────────────── */}
      {/* Wrapper is positioned exactly where the Figma "story box" frame
          sits (27, 85) at 974.69 × 789.67 — so every child inside it
          (cartoon panels + question captions) uses coordinates that
          match the Figma metadata 1:1. */}
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="pointer-events-none absolute inset-0 block size-full"
        />

        {/* Cartoon panels — frame positions match the Figma insets
            converted to pixels relative to the story-box wrapper. */}
        {/* Panel 1 (top-left) — Instagram-style "you stopped journaling". */}
        <CartoonPanel left={111} top={97} width={358} height={240}>
          <img
            alt=""
            src="/assets/about-insta.svg"
            className="absolute left-[87px] top-[28px] block h-[174px] w-[184px]"
            draggable={false}
          />
        </CartoonPanel>

        {/* Panel 2 (top-right) — emoji-y face with "cringe" + "LoL". */}
        <CartoonPanel left={501} top={97} width={362} height={240}>
          <span className="absolute left-[50px] bottom-[24px] text-[15px] font-bold leading-[normal] text-black">
            cringe
          </span>
          <span className="absolute right-[72px] top-[55px] text-[15px] font-bold leading-[normal] text-black">
            LoL
          </span>
          <img
            alt=""
            src="/assets/about-face.svg"
            className="absolute left-[119px] top-[89px] block h-[68px] w-[120px]"
            draggable={false}
          />
        </CartoonPanel>

        {/* Panel 3 (bottom-left) — eye with the creature in the pupil. */}
        <CartoonPanel left={111} top={399} width={358} height={241}>
          <div className="pointer-events-none absolute left-[36px] top-[5px] flex h-[115px] w-[285px] items-center justify-center">
            <img
              alt=""
              src="/assets/about-eyelash.svg"
              className="block h-[98px] w-[280px] max-w-none"
              style={{ transform: "rotate(3.52deg)" }}
              draggable={false}
            />
          </div>
          <img
            alt=""
            src="/assets/about-left-eye.svg"
            className="pointer-events-none absolute left-[94px] top-[68px] block h-[154px] w-[166px]"
            draggable={false}
          />
          <div className="pointer-events-none absolute left-[118px] top-[88px] block h-[115px] w-[120px] overflow-hidden rounded-full">
            <img
              alt=""
              src="/assets/about-eye-fff.png"
              className="block h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </CartoonPanel>

        {/* Panel 4 (bottom-right) — kneeling self-care figure. */}
        <CartoonPanel left={501} top={399} width={362} height={241}>
          <img
            alt=""
            src="/assets/about-self-care.svg"
            className="absolute left-[127px] top-[17px] block h-[205px] w-[103px]"
            draggable={false}
          />
        </CartoonPanel>

        {/* Question captions — positions verbatim from Figma metadata
            (relative to the 974.69 × 789.67 story box). 20 px Casual
            Human Bold, centered horizontally inside each 350-px box.
            Figma 2251:1571 / 1599 / 1597 / 1605. */}
        <p className="pointer-events-none absolute left-[115px] top-[346px] m-0 block w-[350px] text-center text-[20px] font-bold leading-[normal] text-black">
          Why people stopped writing a journal?
          <br />
          ...
        </p>
        <p className="pointer-events-none absolute left-[501px] top-[348px] m-0 block w-[350px] text-center text-[20px] font-bold leading-[normal] text-black">
          Why do people have a hard time expressing emotions through language?
        </p>
        <p className="pointer-events-none absolute left-[115px] top-[658px] m-0 block w-[350px] text-center text-[20px] font-bold leading-[normal] text-black">
          What if you could see your energy?
        </p>
        <p className="pointer-events-none absolute left-[501px] top-[655px] m-0 block w-[350px] text-center text-[20px] font-bold leading-[normal] text-black">
          What if there were a new way to take care of you?
        </p>
      </div>

      {/* ── Right column: creature view (top) ─────────────────────── */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px] overflow-hidden">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        {/* Petting-a-dog photo. */}
        <img
          alt=""
          src="/assets/about-pet-dog.png"
          className="absolute block aspect-square object-cover"
          style={{
            // Figma: left 22.21%, right 20.26%, top 40 px (of 396.28×386.37)
            left: `${396.28 * 0.2221}px`,
            right: `${396.28 * 0.2026}px`,
            top: "40px",
            width: `${396.28 * (1 - 0.2221 - 0.2026)}px`,
            height: `${396.28 * (1 - 0.2221 - 0.2026)}px`,
          }}
          draggable={false}
        />
        {/* "BokBok" name in Orange font under the photo. */}
        <span className="absolute left-1/2 top-[285px] block -translate-x-1/2 whitespace-nowrap text-[36px] leading-normal text-black font-(family-name:--font-fancy)">
          BokBok
        </span>
        {/* Korean onomatopoeic definition, two lines. Per Figma 2251:1574:
            x=21 y=333 (relative to the 396.28×386.37 creature view),
            width 354, height 37, 16 px Casual Human Bold, uppercase,
            centered horizontally. */}
        <p
          className="absolute left-[21px] top-[333px] m-0 block h-[37px] w-[354px] text-center text-[16px] font-bold leading-[normal] uppercase text-black"
        >
          :a Korean onomatopoeic word describing
          <br />
          the gentle act of petting an animal
        </p>
      </div>

      {/* ── Right column: info box (bottom) ───────────────────────── */}
      <div className="pointer-events-none absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px] overflow-hidden">
        {/* Box outline + left squiggly line — same two-vector frame
            every info panel uses across the site. */}
        <img
          alt=""
          src="/assets/info-vector2.svg"
          className="pointer-events-none absolute inset-[0.13%] block size-full"
        />
        <div
          className="pointer-events-none absolute"
          style={{ inset: "0.96% 98.1% 0.97% 0.13%" }}
        >
          <div className="absolute" style={{ inset: "0 -7.08%" }}>
            <img
              alt=""
              src="/assets/info-vector1.svg"
              className="block size-full max-w-none"
            />
          </div>
        </div>

        {/* QR code → Instagram. Figma 2251:1580 frame is (49, 52)
            300×271 within the 397.21 × 398.38 info box.
            pointer-events-auto so the link is clickable even though
            the wrapper is pointer-events-none. */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute left-[49px] top-[52px] block h-[271px] w-[300px] cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
        >
          <img
            alt="BokBok Instagram QR"
            src="/assets/about-bokbok-insta-qr.png"
            className="block size-full object-contain"
            draggable={false}
          />
        </a>

        {/* @BokBok.Meee handle. Figma 2251:1581 frame is (131, 334)
            136×23 — Casual Human Regular, 36 px (yes the bbox height
            is tighter than the rendered cap height; Figma reports a
            visual-only bbox for text). */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute left-[131px] top-[334px] block w-[136px] cursor-pointer whitespace-nowrap text-center text-[36px] leading-[normal] text-black underline-offset-4 hover:underline"
        >
          @BokBok.Meee
        </a>
      </div>
    </div>
  );
}

// ── Small helper for the four cartoon panels ─────────────────────────
// Each panel is the same rectangular hand-drawn frame holding an
// illustration. Question captions are NOT rendered here — the Figma
// places them as siblings (below the frame) at frame-exact positions,
// so they live in the parent page where their coordinates can be
// matched 1:1 to the design.
function CartoonPanel({
  left,
  top,
  width,
  height,
  children,
}: {
  left: number;
  top: number;
  width: number;
  height: number;
  children: React.ReactNode;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{ left, top, width, height }}
    >
      <img
        alt=""
        src="/assets/about-cartoon-box.svg"
        className="pointer-events-none absolute inset-0 block size-full"
        draggable={false}
      />
      {children}
    </div>
  );
}
