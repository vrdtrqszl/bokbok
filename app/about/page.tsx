"use client";

// About page. Reverted to a clean 4-panel grid (the comic-collage
// attempt with the irregular dividers and 50+ small vectors didn't
// land — too many overlapping SVGs with non-uniform stretching turned
// into visual chaos). Layout:
//
//   • Top nav + creature view (pet-dog photo + BokBok + Korean
//     onomatopoeic definition) + info box (Instagram QR + handle).
//   • Story box on the left holds 4 cartoon panels in a 2×2 grid,
//     each a rectangular hand-drawn frame with one illustration and
//     a one-line question below it.
//
// All wavy frame assets (main-box, creature-view, info-vector1+2) are
// shared with every other page so the outlines match exactly; the
// about-specific assets live in /assets/about-*.

import Link from "next/link";
import { useT } from "@/lib/i18n";

const INSTAGRAM_URL =
  "https://www.instagram.com/bokbok.meee?igsh=aThxYnVscHV1MHNh&utm_source=qr";

export default function AboutPage() {
  const t = useT();

  return (
    <div className="bg-grain relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* ── Top nav + logo ──────────────────────────────────────── */}
      <Link
        href="/"
        className="absolute left-[1213.5px] top-[24px] block -translate-x-1/2 cursor-pointer whitespace-nowrap text-[48px] leading-normal text-black font-(family-name:--font-fancy)"
      >
        BokBok
      </Link>
      <Link href="/create" className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black">
        {t("nav.create")}
      </Link>
      <Link href="/calender" className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black">
        {t("nav.calendar")}
      </Link>
      <Link href="/encyclopedia" className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black">
        {t("nav.encyclopedia")}
      </Link>
      <Link href="/energy-blocks" className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black">
        {t("nav.energy_blocks")}
      </Link>
      <div className="absolute left-[579px] top-[46px] h-[47px] w-[80px]">
        <img alt="" src="/assets/about-tab-box.svg" className="absolute inset-0 block size-full" />
      </div>
      <span className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        {t("nav.about")}
      </span>

      {/* ── Main story box (left) ──────────────────────────────── */}
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="pointer-events-none absolute inset-0 block size-full"
        />

        {/* 2×2 grid of cartoon panels. Frame positions match the
            original four-panel Figma layout (insets converted to
            pixels relative to the 974.69 × 789.67 story box). */}
        <CartoonPanel left={111} top={97} width={358} height={240}>
          <img
            alt=""
            src="/assets/about-insta-new.svg"
            className="absolute left-[87px] top-[28px] block h-[174px] w-[184px]"
            draggable={false}
          />
        </CartoonPanel>

        <CartoonPanel left={501} top={97} width={362} height={240}>
          <span className="absolute left-[50px] bottom-[24px] text-[15px] font-bold leading-[normal] text-black">
            cringe...
          </span>
          <span className="absolute right-[72px] top-[55px] text-[15px] font-bold leading-[normal] text-black">
            LoL
          </span>
          <img
            alt=""
            src="/assets/about-face-new.svg"
            className="absolute left-[119px] top-[89px] block h-[68px] w-[120px]"
            draggable={false}
          />
        </CartoonPanel>

        <CartoonPanel left={111} top={399} width={358} height={241}>
          {/* Eyelash arc across the top, slightly rotated. */}
          <div className="pointer-events-none absolute left-[36px] top-[5px] flex h-[115px] w-[285px] items-center justify-center">
            <img
              alt=""
              src="/assets/about-eyelash-new.svg"
              className="block h-[98px] w-[280px] max-w-none"
              style={{ transform: "rotate(3.52deg)" }}
              draggable={false}
            />
          </div>
          {/* Eye iris outline. */}
          <img
            alt=""
            src="/assets/about-eye-iris.svg"
            className="pointer-events-none absolute left-[94px] top-[68px] block h-[154px] w-[166px]"
            draggable={false}
          />
          {/* Creature visible "in the pupil" — clipped to a circle so
              the texture only shows inside the iris area. */}
          <div className="pointer-events-none absolute left-[118px] top-[88px] block h-[115px] w-[120px] overflow-hidden rounded-full">
            <img
              alt=""
              src="/assets/about-eye-fff.png"
              className="block h-full w-full object-cover"
              draggable={false}
            />
          </div>
        </CartoonPanel>

        <CartoonPanel left={501} top={399} width={362} height={241}>
          <img
            alt=""
            src="/assets/about-self-care.svg"
            className="absolute left-[127.24px] top-[17.24px] block h-[204.51px] w-[102.52px] max-w-none"
            draggable={false}
          />
        </CartoonPanel>

        {/* Question captions — sized + positioned per Figma metadata
            (relative to the 974.69 × 789.67 story box). 20 px Casual
            Human Bold, centered horizontally inside each 350-px box. */}
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

      {/* ── Right column: creature view (top) ─────────────────── */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px] overflow-hidden">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        <img
          alt=""
          src="/assets/about-pet-dog.png"
          className="absolute block aspect-square object-cover"
          style={{
            left: `${396.28 * 0.2221}px`,
            right: `${396.28 * 0.2026}px`,
            top: "40px",
            width: `${396.28 * (1 - 0.2221 - 0.2026)}px`,
            height: `${396.28 * (1 - 0.2221 - 0.2026)}px`,
          }}
          draggable={false}
        />
        <span className="absolute left-1/2 top-[285px] block -translate-x-1/2 whitespace-nowrap text-[36px] leading-normal text-black font-(family-name:--font-fancy)">
          BokBok
        </span>
        <p className="absolute left-[21px] top-[333px] m-0 block h-[37px] w-[354px] text-center text-[16px] font-bold leading-[normal] uppercase text-black">
          :a Korean onomatopoeic word describing
          <br />
          the gentle act of petting an animal
        </p>
      </div>

      {/* ── Right column: info box (bottom) ───────────────────── */}
      <div className="pointer-events-none absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px] overflow-hidden">
        <img
          alt=""
          src="/assets/info-vector2.svg"
          className="pointer-events-none absolute inset-[0.13%] block size-full"
        />
        <div className="pointer-events-none absolute" style={{ inset: "0.96% 98.1% 0.97% 0.13%" }}>
          <div className="absolute" style={{ inset: "0 -7.08%" }}>
            <img alt="" src="/assets/info-vector1.svg" className="block size-full max-w-none" />
          </div>
        </div>

        {/* QR → Instagram. Centred inside the info box, ~300 wide. */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute block aspect-[1179/1067] cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
          style={{
            top: "52px",
            left: `${397.21 * 0.1234}px`,
            right: `${397.21 * 0.1214}px`,
            width: `${397.21 * (1 - 0.1234 - 0.1214)}px`,
          }}
        >
          <img
            alt="BokBok Instagram QR"
            src="/assets/about-bokbok-insta-qr.png"
            className="block size-full object-contain"
            draggable={false}
          />
        </a>

        {/* @BokBok.Meee handle below the QR — 24 px Casual Human
            Regular per Figma 2273:2308. */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute left-1/2 top-[334px] block -translate-x-1/2 cursor-pointer whitespace-nowrap text-center text-[24px] leading-[normal] text-black underline-offset-4 hover:underline"
        >
          @BokBok.Meee
        </a>
      </div>
    </div>
  );
}

// ── Cartoon panel helper ────────────────────────────────────────
// Plain rectangular hand-drawn frame at the given coords, with the
// caller's illustration absolutely positioned inside.
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
