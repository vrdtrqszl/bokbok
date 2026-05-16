"use client";

// About page (Figma 2273:2299).
//
// Layout:
//   • Story box (left, 974.69×789.67) — comic-page collage with
//     irregular hand-drawn dividers carving it into ~6 cells. The
//     "about story" group inside the box is 974×1332 (taller than
//     the box), so the story box is scrollable inside its wavy
//     outline; the long-form intro paragraph at the bottom is
//     reachable by scrolling.
//   • Creature view (top right, 396×386) — pet-dog photo, "BokBok"
//     in Orange, Korean onomatopoeic definition.
//   • Info box (bottom right, 397×398) — Instagram QR + handle.
//
// Important rendering note: many of the Figma export's SVGs use
// preserveAspectRatio="none" + a tight-bbox outer wrapper + a
// negative-inset INNER wrapper that expands back to the SVG's
// natural viewBox aspect. Skipping that inner wrapper was the
// source of the earlier "giant black blob" rendering — the filled
// divider shapes got non-uniformly stretched to dozens of px in
// the wrong dimension. We faithfully reproduce the two-wrapper
// pattern here.

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

      {/* "About" tab indicator + label. Figma about-box inset is
          5.11% / 54.27% / 89.67% / 40.21% within 1440×900 — converts
          to a 80-px-wide box centered around the About text. */}
      <div className="absolute" style={{ inset: "5.11% 54.27% 89.67% 40.21%" }}>
        <div className="absolute" style={{ inset: "-1.06% -0.63% 0 -0.63%" }}>
          <img alt="" src="/assets/about-tab-box.svg" className="block size-full max-w-none" />
        </div>
      </div>
      <span className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        {t("nav.about")}
      </span>

      {/* ── Story box (left) ────────────────────────────────────── */}
      {/* Wavy outline = the standard main-box.svg the rest of the
          site uses. Inside is a scrollable area holding the about-
          story collage (which is taller than the box). */}
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="pointer-events-none absolute inset-0 z-10 block size-full"
        />
        <div className="scroll-fade absolute inset-[12px] overflow-y-auto overflow-x-hidden">
          {/* about-story group — 974×1332 collage. Insets/positions
              below come straight from the Figma export. */}
          <AboutStory />
        </div>
      </div>

      {/* ── Creature view (right top) ───────────────────────────── */}
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
        {/* Korean definition (Figma 2273:2315): 16 px Casual Human Bold,
            centered on (198, 351.5), 354×37. Translation: -50%, -50%. */}
        <div
          className="absolute flex h-[37px] w-[354px] flex-col justify-center text-center text-[16px] font-bold leading-[0] text-black uppercase"
          style={{ left: "198px", top: "351.5px", transform: "translate(-50%, -50%)" }}
        >
          <p className="leading-[normal] mb-0">:a Korean onomatopoeic word describing</p>
          <p className="leading-[normal] m-0">the gentle act of petting an animal</p>
        </div>
      </div>

      {/* ── Info box (right bottom) ─────────────────────────────── */}
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

        {/* QR → Instagram (Figma 2273:2309). top:52, left/right 12.34%
            and 12.14% of the 397.21-px info box (= ~300 wide). */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute block aspect-[1179/1067] cursor-pointer transition-transform hover:scale-[1.02] active:scale-95"
          style={{ top: "52px", left: "12.34%", right: "12.14%" }}
        >
          <img
            alt="BokBok Instagram QR"
            src="/assets/about-bokbok-insta-qr.png"
            className="block size-full object-cover"
            draggable={false}
          />
        </a>

        {/* @BokBok.Meee — Casual Human Regular 24 px, top:334, centered. */}
        <a
          href={INSTAGRAM_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto absolute top-[334px] block -translate-x-1/2 cursor-pointer whitespace-nowrap text-center text-[24px] leading-[normal] text-black underline-offset-4 hover:underline"
          style={{ left: "calc(50% + 0.4px)" }}
        >
          @BokBok.Meee
        </a>
      </div>
    </div>
  );
}

// ── Two-wrapper SVG helper ──────────────────────────────────────────
// Figma's export pattern for a path-stretched SVG: an OUTER box at the
// path's tight bbox, and an INNER box with negative insets that expand
// back to the natural viewBox aspect. The img fills the inner box so
// the SVG renders at the right shape without preserveAspectRatio
// distortion. Both insets are expressed as the Figma "top right bottom
// left" string ("X% Y% Z% W%" or raw px).
function FigmaSvg({
  outer,
  inner,
  src,
}: {
  outer: string;
  inner: string;
  src: string;
}) {
  return (
    <div className="pointer-events-none absolute" style={{ inset: outer }}>
      <div className="absolute" style={{ inset: inner }}>
        <img alt="" src={src} className="block size-full max-w-none" draggable={false} />
      </div>
    </div>
  );
}

// ── About story (974 × 1332 collage) ───────────────────────────────
// Renders all the panels, dividers, illustrations, and text inside the
// scrollable story-box wrapper. Coordinates come verbatim from the
// Figma frame exports — outer insets are the path's tight bbox within
// the 974×1332 area; inner insets restore the natural viewBox aspect.
function AboutStory() {
  return (
    <div className="relative" style={{ width: "974px", height: "1332px" }}>
      {/* ── Comic-page dividers (filled hand-drawn lines) ────────── */}
      <FigmaSvg
        outer="16.89% 1.53% 68.99% 0.3%"
        inner="-0.25% 0 -0.37% 0"
        src="/assets/about-divider-h1.svg"
      />
      <FigmaSvg
        outer="0 45.6% 77.7% 53.89%"
        inner="-0.25% -14.5% -0.26% -15.93%"
        src="/assets/about-divider-v1.svg"
      />
      <FigmaSvg
        outer="20.8% 33.9% 55.48% 65.59%"
        inner="-0.24% -15.39% -0.13% -15.41%"
        src="/assets/about-divider-v2.svg"
      />
      <FigmaSvg
        outer="26.2% 54.12% 55.48% 29.56%"
        inner="-0.37% -0.41% -0.26% -0.57%"
        src="/assets/about-divider-diag.svg"
      />
      <FigmaSvg
        outer="44.29% 1.46% 55.48% 45.88%"
        inner="-18.69% -0.11% -26.16% -0.15%"
        src="/assets/about-divider-extra.svg"
      />

      {/* ── Cell 1: "Why people stopped writing a journal?" + Insta */}
      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ inset: "0.75% 64.08% 97.82% 0" }}
      >
        Why people stopped writing a journal?
      </p>
      <FigmaSvg
        outer="3.6% 45.38% 70.48% 4.38%"
        inner="-0.26% 0 0 -0.1%"
        src="/assets/about-insta-new.svg"
      />

      {/* ── Cell 2: cringe face + "Why do people…" rotated text ──── */}
      <FigmaSvg
        outer="5.11% 10.6% 88.29% 78.52%"
        inner="-0.32% -0.47% 0 0"
        src="/assets/about-face-new.svg"
      />
      <p
        className="absolute m-0 text-center text-[13px] font-bold leading-[normal] text-black"
        style={{ inset: "8.48% 32.46% 90.69% 58.92%" }}
      >
        cringe...
      </p>
      {/* Cringe swirl accent — rotated +19.09°. Figma wraps it in a
          flex container of fixed px size that holds a rotated child of
          smaller px size; centering keeps the rotation pivot right. */}
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={{ left: "539px", top: "41px", width: "209.278px", height: "176.261px" }}
      >
        <div style={{ transform: "rotate(19.09deg)" }}>
          <div className="relative" style={{ width: "178.255px", height: "124.823px" }}>
            <div className="absolute" style={{ inset: "-0.4% -0.28%" }}>
              <img
                alt=""
                src="/assets/about-cringe-lash.svg"
                className="block size-full max-w-none"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
      {/* "Why do people have a hard time…" rotated -9.37°. */}
      <div
        className="absolute flex items-center justify-center"
        style={{ inset: "14.19% 5.95% 78.83% 57.99%" }}
      >
        <p
          className="m-0 w-full text-center text-[20px] font-bold leading-[normal] text-black"
          style={{ transform: "rotate(-9.37deg)" }}
        >
          Why do people have a hard time expressing emotions through language?
        </p>
      </div>

      {/* ── Cell 3 + 4: "Then..." starburst + journaling question ── */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "36.21px", top: "512.19px", width: "305.799px", height: "180.824px" }}
      >
        <div className="absolute" style={{ inset: "-0.85% -0.24% -0.39% -0.21%" }}>
          <img
            alt=""
            src="/assets/about-starburst.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      <p
        className="absolute m-0 text-center text-[48px] font-bold leading-[normal] text-black"
        style={{ inset: "43.39% 71.67% 53.15% 12.83%" }}
      >
        Then...
      </p>

      <p
        className="absolute m-0 w-[263px] text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "490.5px", top: "371px", transform: "translateX(-50%)" }}
      >
        What if you found your way back to journaling?
      </p>

      {/* Diagonal divider between the "Then..." starburst panel and
          the book/eye panels (Figma 2273:2494 — Vector 10). Position
          is (321, 592.5) at 125.5×246 inside the 974×1332 about-story. */}
      <FigmaSvg
        outer="44.48% 54.17% 37.05% 32.95%"
        inner="-0.36% -0.71% -0.24% -0.48%"
        src="/assets/about-divider-mid.svg"
      />
      {/* Book left page. */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "440px", top: "445px", width: "65.488px", height: "99.501px" }}
      >
        <div className="absolute" style={{ inset: "-0.69% -1.15% -0.76% -0.29%" }}>
          <img
            alt=""
            src="/assets/about-book-left.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      {/* Book right page. */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "502.49px", top: "439px", width: "64.806px", height: "106.006px" }}
      >
        <div className="absolute" style={{ inset: "-0.66% -1.4% -0.44% -1.08%" }}>
          <img
            alt=""
            src="/assets/about-book-right.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      {/* Book spine. */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "502.21px", top: "449.34px", width: "3.734px", height: "95.523px" }}
      >
        <div className="absolute" style={{ inset: "-0.8% -17.35% -0.68% -20.45%" }}>
          <img
            alt=""
            src="/assets/about-book-spine.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      {/* Pencil (right of the book). */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "591.08px", top: "439.62px", width: "10.2px", height: "15.15px" }}
      >
        <div className="absolute" style={{ inset: "-4.86% -6.65% -4.7% -6.98%" }}>
          <img
            alt=""
            src="/assets/about-book-detail1.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute"
        style={{ left: "589.47px", top: "455.35px", width: "11.723px", height: "75.075px" }}
      >
        <div className="absolute" style={{ inset: "-0.62% -4.61% -1.14% -7.76%" }}>
          <img
            alt=""
            src="/assets/about-book-detail3.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>

      {/* ── Cell 5: self-care + "What if there were a new way…" ──── */}
      <FigmaSvg
        outer="22.67% 12.7% 61.97% 76.78%"
        inner="-0.24% -0.49%"
        src="/assets/about-self-care.svg"
      />
      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ inset: "40.92% 3.52% 55.93% 67.54%" }}
      >
        What if there were a new way to take care of you?
      </p>

      {/* ── Cell 6: eye + "What if you could see your energy?…" ──── */}
      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ inset: "53.6% 32.46% 43.54% 43.73%" }}
      >
        What if you could see your energy?!?!?!?!?
      </p>
      {/* Eye iris (rotated -6.22°) — the Figma uses container queries
          for the rotated wrapper; we approximate with a fixed-px
          rotation container that matches the bbox visible inset. */}
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={{ inset: "49.47% 7.92% 38.15% 74.36%" }}
      >
        <div style={{ transform: "rotate(-6.22deg)" }}>
          <img
            alt=""
            src="/assets/about-eye-iris.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      {/* Eyelash arc rotated +3.52°. */}
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={{ left: "678.97px", top: "606.34px", width: "270.581px", height: "109.399px" }}
      >
        <div style={{ transform: "rotate(3.52deg)" }}>
          <div className="relative" style={{ width: "265.359px", height: "93.304px" }}>
            <img
              alt=""
              src="/assets/about-eyelash-new.svg"
              className="absolute inset-0 block size-full max-w-none"
              draggable={false}
            />
          </div>
        </div>
      </div>
      {/* Second iris layer / outer eye detail (rotated -6.22°). */}
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={{ inset: "52.71% 19.07% 44.42% 77.69%" }}
      >
        <div style={{ transform: "rotate(-6.22deg)" }}>
          <div className="relative size-full">
            <div className="absolute" style={{ inset: "-1.41% -1.8%" }}>
              <img
                alt=""
                src="/assets/about-eye-detail-large.svg"
                className="block size-full max-w-none"
                draggable={false}
              />
            </div>
          </div>
        </div>
      </div>
      {/* Creature in pupil. */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "790.67px", top: "770.74px", width: "34.486px", height: "31.934px" }}
      >
        <div className="absolute" style={{ inset: "-1.57% -1.45%" }}>
          <img
            alt=""
            src="/assets/about-eye-creature.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>

      {/* ── Bottom divider line + horizontal panel separator ─────── */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "3.06px", top: "836.68px", width: "971.203px", height: "3.584px" }}
      >
        <div className="absolute" style={{ inset: "-13.99% 0 -23.45% 0" }}>
          <img
            alt=""
            src="/assets/about-divider-bottom.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      <div
        className="pointer-events-none absolute"
        style={{ left: "468px", top: "615px", width: "251.941px", height: "98.125px" }}
      >
        <div className="absolute" style={{ inset: "-0.51% -0.2%" }}>
          <img
            alt=""
            src="/assets/about-book-panel.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>
      {/* Horizontal panel-bottom line (Figma 2273:2497 — Vector 65)
          spanning the book / self-care / eye row. Position is
          (357, 774) at 363.258×49.786 inside the 974×1332 about-story. */}
      <div
        className="pointer-events-none absolute"
        style={{ left: "357px", top: "774px", width: "363.258px", height: "49.786px" }}
      >
        <div className="absolute" style={{ inset: "-1% -0.14%" }}>
          <img
            alt=""
            src="/assets/about-book-extra.svg"
            className="block size-full max-w-none"
            draggable={false}
          />
        </div>
      </div>

      {/* ── Long-form intro paragraph (below the visible area) ─── */}
      <div
        className="absolute font-bold text-black"
        style={{
          left: "11px",
          top: "886px",
          width: "952px",
          fontSize: "20px",
          lineHeight: "normal",
          whiteSpace: "pre-wrap",
        }}
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
