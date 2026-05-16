"use client";

// About page (Figma 2273:2299 — comic-collage redesign).
//
// Top nav + creature-view + info box are similar to the previous
// version (creature view: pet-dog photo + BokBok name + Korean
// definition; info box now contains the Instagram QR + handle link).
// The main story box on the left was rewritten — it's now a comic
// page with irregular panel dividers, six question prompts threaded
// between illustrations (Insta notebook, cringe face, eye in the
// pupil, self-care figure, "Then..." starburst, book), and a
// long-form intro paragraph at the bottom (scrollable inside the
// wavy outline).
//
// All positions inside the about-story group come straight from the
// Figma metadata (left/top/width/height in pixels, or inset percentages
// of the 974 × 1332 about-story area) so the layout stays 1:1 with
// the design without manually re-doing the percentage math.

import Link from "next/link";
import { useT } from "@/lib/i18n";

const INSTAGRAM_URL =
  "https://www.instagram.com/bokbok.meee?igsh=aThxYnVscHV1MHNh&utm_source=qr";

export default function AboutPage() {
  const t = useT();

  return (
    <div className="bg-grain relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* ── Top nav + logo (shared pattern) ───────────────────────── */}
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

      {/* ── Story box (left, scrollable) ──────────────────────────── */}
      {/* The wavy outline is the standard main-box.svg every page uses;
          inside, the about-story collage (974×1332, taller than the
          789-px box) lives in a scrollable region so the long bottom
          paragraph is reachable. scroll-fade adds the soft edge mask
          shared with the rest of the site. */}
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="pointer-events-none absolute inset-0 z-10 block size-full"
        />
        <div className="scroll-fade absolute inset-[10px] overflow-y-auto overflow-x-hidden">
          <AboutStory />
        </div>
      </div>

      {/* ── Right column: creature view (top) ─────────────────────── */}
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
        {/* Korean definition (Figma 2273:2315): y=351.5 (was 333). */}
        <p className="absolute left-[21px] top-[333px] m-0 block h-[37px] w-[354px] text-center text-[16px] font-bold leading-[normal] uppercase text-black">
          :a Korean onomatopoeic word describing
          <br />
          the gentle act of petting an animal
        </p>
      </div>

      {/* ── Right column: info box (bottom) ───────────────────────── */}
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

        {/* QR → Instagram. Figma 2273:2309 — top:52, left/right 12.34% /
            12.14% of the 397.21-px info box (=300 wide). */}
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

        {/* @BokBok.Meee handle (Figma 2273:2308) — top:334, 24 px font. */}
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

// ── About story (comic-collage) ─────────────────────────────────────
// Renders the 974 × 1332 collage that lives inside the (scrollable)
// story-box wrapper. Coordinates are verbatim from the Figma frame
// metadata (Figma node 2273:2408 "about story" group), expressed as
// either inset percentages of the 974 × 1332 area or absolute px
// offsets (when the source uses literal px positions).
//
// Note: a handful of the smallest decorative sparkles inside the eye
// composite (Figma vectors 2273:2472–2485) are omitted — they're sub-
// 20-px details that don't read at this rendering size and would
// triple the markup volume for negligible visual return.
function AboutStory() {
  return (
    <div className="relative" style={{ width: "100%", height: "1332px" }}>
      {/* Panel dividers — the irregular hand-drawn lines that subdivide
          the comic page into its six story cells. */}
      <img alt="" src="/assets/about-divider-h1.svg" className="pointer-events-none absolute block" style={{ inset: "16.89% 1.53% 68.99% 0.3%" }} draggable={false} />
      <img alt="" src="/assets/about-divider-v1.svg" className="pointer-events-none absolute block" style={{ inset: "0 45.6% 77.7% 53.89%" }} draggable={false} />
      <img alt="" src="/assets/about-divider-v2.svg" className="pointer-events-none absolute block" style={{ inset: "20.8% 33.9% 55.48% 65.59%" }} draggable={false} />
      <img alt="" src="/assets/about-divider-diag.svg" className="pointer-events-none absolute block" style={{ inset: "26.2% 54.12% 55.48% 29.56%" }} draggable={false} />
      <img alt="" src="/assets/about-divider-extra.svg" className="pointer-events-none absolute block" style={{ inset: "44.29% 1.46% 55.48% 45.88%" }} draggable={false} />
      <img alt="" src="/assets/about-divider-mid.svg" className="pointer-events-none absolute block" style={{ inset: "44.48% 54.17% 37.05% 32.95%" }} draggable={false} />
      <img alt="" src="/assets/about-divider-bottom.svg" className="pointer-events-none absolute block" style={{ left: "3.06px", top: "836.68px", width: "971.203px", height: "3.584px" }} draggable={false} />

      {/* Panel borders (book panel + connecting panel). */}
      <img alt="" src="/assets/about-book-panel.svg" className="pointer-events-none absolute block" style={{ left: "468px", top: "615px", width: "251.941px", height: "98.125px" }} draggable={false} />
      <img alt="" src="/assets/about-book-extra.svg" className="pointer-events-none absolute block" style={{ left: "357px", top: "774px", width: "363.258px", height: "49.786px" }} draggable={false} />

      {/* ── Panel 1: "Why people stopped writing a journal?" + Insta */}
      <p className="absolute m-0 block text-center text-[20px] font-bold leading-[normal] text-black" style={{ inset: "0.75% 64.08% 97.82% 0" }}>
        Why people stopped writing a journal?
      </p>
      <img
        alt=""
        src="/assets/about-insta-new.svg"
        className="pointer-events-none absolute block"
        style={{ inset: "3.6% 45.38% 70.48% 4.38%" }}
        draggable={false}
      />

      {/* ── Panel 2: cringe / LoL face + "Why do people have a hard time…" */}
      {/* Rotated -9.37° per the Figma container. */}
      <div className="absolute flex items-center justify-center" style={{ inset: "14.19% 5.95% 78.83% 57.99%" }}>
        <p
          className="m-0 block w-full text-center text-[20px] font-bold leading-[normal] text-black"
          style={{ transform: "rotate(-9.37deg)" }}
        >
          Why do people have a hard time expressing emotions through language?
        </p>
      </div>
      <img
        alt=""
        src="/assets/about-face-new.svg"
        className="pointer-events-none absolute block"
        style={{ inset: "5.11% 10.6% 88.29% 78.52%" }}
        draggable={false}
      />
      <p className="absolute m-0 block text-center text-[13px] font-bold leading-[normal] text-black" style={{ inset: "8.48% 32.46% 90.69% 58.92%" }}>
        cringe...
      </p>
      {/* Cringe accent (rotated lashes/swirl). */}
      <div className="pointer-events-none absolute flex items-center justify-center" style={{ left: "539px", top: "41px", width: "209.278px", height: "176.261px" }}>
        <img
          alt=""
          src="/assets/about-cringe-lash.svg"
          className="block max-w-none"
          style={{ width: "178.255px", height: "124.823px", transform: "rotate(19.09deg)" }}
          draggable={false}
        />
      </div>

      {/* ── "Then..." starburst (Figma 2273:2492 + 2273:2493) */}
      <img
        alt=""
        src="/assets/about-starburst.svg"
        className="pointer-events-none absolute block"
        style={{ left: "36.21px", top: "512.19px", width: "305.799px", height: "180.824px" }}
        draggable={false}
      />
      <p className="absolute m-0 block text-center text-[48px] font-bold leading-[normal] text-black" style={{ inset: "43.39% 71.67% 53.15% 12.83%" }}>
        Then...
      </p>

      {/* ── Panel: "What if you found your way back to journaling?" + book */}
      <p
        className="absolute m-0 block text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "490.5px", top: "371px", width: "263px", transform: "translateX(-50%)" }}
      >
        What if you found your way back to journaling?
      </p>
      {/* Book composite (Figma 2273:2498). Multiple sub-vectors at
          absolute pixel positions within about-story. */}
      <img alt="" src="/assets/about-book-left.svg" className="pointer-events-none absolute block" style={{ left: "440px", top: "445px", width: "65.488px", height: "99.501px" }} draggable={false} />
      <img alt="" src="/assets/about-book-right.svg" className="pointer-events-none absolute block" style={{ left: "502.49px", top: "439px", width: "64.806px", height: "106.006px" }} draggable={false} />
      <img alt="" src="/assets/about-book-spine.svg" className="pointer-events-none absolute block" style={{ left: "502.21px", top: "449.34px", width: "3.734px", height: "95.523px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail1.svg" className="pointer-events-none absolute block" style={{ left: "591.08px", top: "439.62px", width: "10.2px", height: "15.15px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail2.svg" className="pointer-events-none absolute block" style={{ left: "591.46px", top: "452.8px", width: "10.312px", height: "2.981px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail3.svg" className="pointer-events-none absolute block" style={{ left: "589.47px", top: "455.35px", width: "11.723px", height: "75.075px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail6.svg" className="pointer-events-none absolute block" style={{ left: "448.23px", top: "484.51px", width: "3.91px", height: "17.039px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail7.svg" className="pointer-events-none absolute block" style={{ left: "448.85px", top: "482px", width: "15.854px", height: "19.065px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail8.svg" className="pointer-events-none absolute block" style={{ left: "468.14px", top: "489.46px", width: "10.553px", height: "11.969px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail10.svg" className="pointer-events-none absolute block" style={{ left: "485.99px", top: "488.51px", width: "7.48px", height: "9.602px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail11.svg" className="pointer-events-none absolute block" style={{ left: "514.99px", top: "486.54px", width: "8.801px", height: "17.84px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail12.svg" className="pointer-events-none absolute block" style={{ left: "515.7px", top: "483.3px", width: "15.518px", height: "20.603px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail13.svg" className="pointer-events-none absolute block" style={{ left: "535.44px", top: "491.19px", width: "9.489px", height: "12.211px" }} draggable={false} />
      <img alt="" src="/assets/about-book-detail15.svg" className="pointer-events-none absolute block" style={{ left: "548.75px", top: "481.59px", width: "7.25px", height: "10.719px" }} draggable={false} />

      {/* ── Panel: "What if there were a new way to take care of you?" + self-care */}
      <p className="absolute m-0 block text-center text-[20px] font-bold leading-[normal] text-black" style={{ inset: "40.92% 3.52% 55.93% 67.54%" }}>
        What if there were a new way to take care of you?
      </p>
      <img
        alt=""
        src="/assets/about-self-care.svg"
        className="pointer-events-none absolute block max-w-none"
        style={{ inset: "22.67% 12.7% 61.97% 76.78%" }}
        draggable={false}
      />

      {/* ── Bottom panel: "What if you could see your energy?" + eye */}
      <p className="absolute m-0 block text-center text-[20px] font-bold leading-[normal] text-black" style={{ inset: "53.6% 32.46% 43.54% 43.73%" }}>
        What if you could see your energy?!?!?!?!?
      </p>
      {/* Eye iris (rotated -6.22°). */}
      <div className="pointer-events-none absolute flex items-center justify-center" style={{ inset: "49.47% 7.92% 38.15% 74.36%" }}>
        <img
          alt=""
          src="/assets/about-eye-iris.svg"
          className="block size-full max-w-none"
          style={{ transform: "rotate(-6.22deg)" }}
          draggable={false}
        />
      </div>
      {/* Eyelash (rotated 3.52°). */}
      <div className="pointer-events-none absolute flex items-center justify-center" style={{ left: "678.97px", top: "606.34px", width: "270.581px", height: "109.399px" }}>
        <img
          alt=""
          src="/assets/about-eyelash-new.svg"
          className="block max-w-none"
          style={{ width: "265.359px", height: "93.304px", transform: "rotate(3.52deg)" }}
          draggable={false}
        />
      </div>
      {/* Big eye decoration / second iris layer (rotated -6.22°). */}
      <div className="pointer-events-none absolute flex items-center justify-center" style={{ inset: "52.71% 19.07% 44.42% 77.69%" }}>
        <img
          alt=""
          src="/assets/about-eye-detail-large.svg"
          className="block size-full max-w-none"
          style={{ transform: "rotate(-6.22deg)" }}
          draggable={false}
        />
      </div>
      {/* Creature visible in the pupil. */}
      <img
        alt=""
        src="/assets/about-eye-creature.svg"
        className="pointer-events-none absolute block max-w-none"
        style={{ left: "790.67px", top: "770.74px", width: "34.486px", height: "31.934px" }}
        draggable={false}
      />

      {/* ── Long-form intro paragraph (Figma 2273:2518) ──────────── */}
      {/* Lives below the visible "story panels" — reached by scrolling
          inside the story box. 952 × 446 starting at (11, 886). */}
      <div
        className="absolute text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "11px", top: "886px", width: "952px", whiteSpace: "pre-wrap" }}
      >
        <p className="m-0">
          We no longer keep journals the way we used to.
          <br />
          Instead, we leave fragments of ourselves on social media: curated
          moments, filtered emotions, and versions of feelings shaped to be
          seen by others.
          <br />
          Being fully honest about our emotions can feel uncomfortable, even
          embarrassing.
          <br />
          So many feelings pass through us without ever being truly expressed.
        </p>
        <p className="m-0">&#8203;</p>
        <p className="m-0">
          But emotions do not disappear.
          <br />
          They remain layered, contradictory, and constantly shifting beyond
          what language alone can define.
          <br />
          Perhaps this is why journaling still matters: not simply to document
          our lives, but to care for ourselves, observe our inner states, and
          create space for emotions that cannot be reduced to a single word.
        </p>
        <p className="m-0">&#8203;</p>
        <p className="m-0">
          This project explores emotion as a living creature of energy rather
          than a fixed emotional state.
          <br />
          Written experiences transform into moving entities made of colour,
          light, shape, and motion, forming an evolving emotional ecosystem
          where feelings coexist, drift, and change over time.
        </p>
        <p className="m-0">
          This is not a traditional journal.
          <br />
          It is a digital garden where emotions are allowed to live, grow, and
          remain.
        </p>
        <p className="m-0">&#8203;</p>
        <p className="m-0">
          Your emotions are not linear.
          <br />
          They overlap, mutate, contradict, and evolve.
          <br />
          Within this space, they finally become visible.
        </p>
      </div>
    </div>
  );
}
