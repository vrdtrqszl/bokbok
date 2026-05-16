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
      <div className="absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px] overflow-hidden">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="pointer-events-none absolute inset-0 z-10 block size-full"
        />
        {/* Scroll container — sits at (4, 10) inside the story box per
            Figma 2273:2913 (about-story frame). The previous
            inset-[12px] shifted everything 8 px right + 2 px down AND
            clipped an extra 20 px off the right side, which is why
            content like the cringe-lash and "Why do people..." text
            were partially cut off / overlapping. Now matches the
            Figma about-story inset exactly. */}
        <div
          className="scroll-fade-bottom absolute overflow-y-auto overflow-x-hidden"
          style={{ left: "4px", top: "10px", right: "0", bottom: "0" }}
        >
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
        {/* "BokBok" — Figma 2273:2316: x=122, y=285, w=145, h=40,
            centered text in a 145-px box. Avoid the previous
            translate(-50%) centering because that depended on the
            rendered text width and drifted a few px off the Figma
            position. */}
        <span
          className="absolute block whitespace-nowrap text-center text-[36px] leading-[40px] text-black font-(family-name:--font-fancy)"
          style={{ left: "122px", top: "285px", width: "145px", height: "40px" }}
        >
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

// ── Two-wrapper SVG helper (absolute-px outer) ──────────────────────
// Figma's export pattern for a path-stretched SVG: an OUTER box at the
// path's tight bbox, and an INNER box with negative insets that expand
// back to the SVG's natural viewBox aspect. The img fills the inner
// box so the SVG renders at the right shape without preserveAspectRatio
// distortion. We use absolute px coords for the outer (matching the
// Figma metadata's raw-px values) and percentage insets for the inner
// (matching the export's stroke-overflow padding). Reused everywhere
// in AboutStory: dividers, illustrations, the entire book sub-group.
function BookPart({
  src,
  left,
  top,
  width,
  height,
  inner,
}: {
  src: string;
  left: number;
  top: number;
  width: number;
  height: number;
  inner: string;
}) {
  return (
    <div
      className="pointer-events-none absolute"
      style={{
        left: `${left}px`,
        top: `${top}px`,
        width: `${width}px`,
        height: `${height}px`,
      }}
    >
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
    <div className="relative" style={{ width: "974.27px", height: "1309px" }}>
      {/* ── Comic-page dividers (filled hand-drawn lines).
          Every position now uses absolute px from the Figma 2273:2913
          metadata so the new 974×1309 frame size is matched exactly. */}
      <BookPart src="/assets/about-divider-h1.svg" left={2.88} top={224.91} width={956.45} height={188.16} inner="-0.25% 0 -0.37% 0" />
      <BookPart src="/assets/about-divider-v1.svg" left={525} top={0} width={5} height={297} inner="-0.25% -14.5% -0.26% -15.93%" />
      <BookPart src="/assets/about-divider-v2.svg" left={639} top={277} width={5} height={316} inner="-0.24% -15.39% -0.13% -15.41%" />
      <BookPart src="/assets/about-divider-diag.svg" left={288} top={349} width={159} height={244} inner="-0.37% -0.41% -0.26% -0.57%" />
      <BookPart src="/assets/about-divider-extra.svg" left={447} top={590} width={513} height={3} inner="-18.69% -0.11% -26.16% -0.15%" />
      {/* Diagonal divider between "Then..." panel and the book/eye row
          (Figma 2273:2494 / Vector 10). */}
      <BookPart src="/assets/about-divider-mid.svg" left={321} top={592.5} width={125.5} height={246} inner="-0.36% -0.71% -0.24% -0.48%" />

      {/* ── Cell 1: "Why people stopped writing a journal?" + Insta */}
      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "0px", top: "10px", width: "350px" }}
      >
        Why people stopped writing a journal?
      </p>
      <BookPart src="/assets/about-insta-new.svg" left={42.69} top={48} width={489.42} height={345.18} inner="-0.26% 0 0 -0.1%" />

      {/* ── Cell 2: cringe face + "Why do people…" rotated text ──── */}
      <BookPart src="/assets/about-face-new.svg" left={765} top={68} width={106} height={88} inner="-0.32% -0.47% 0 0" />
      <p
        className="absolute m-0 text-center text-[13px] font-bold leading-[normal] text-black"
        style={{ left: "574px", top: "113px", width: "84px" }}
      >
        cringe...
      </p>
      {/* Cringe swirl accent — rotated +19.09°. Wrapper at Figma
          export's left:539 / top:41 (NOT the raw metadata's x=579.83 —
          Figma's metadata for a rotated vector reports a different
          reference point than the export's flex-center wrapper; the
          export's coords are what produce the correct visual position
          per the 2275:26 export reference). */}
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
      {/* "Why do people have a hard time…" rotated -9.37°. Wrapper at
          the 2275:26 export's flex-center position (565.07, 189.02)
          sized 351.32×92.94 — the export uses inset[14.44% 5.95%
          78.46% 57.99%] of the 974.27×1309 story frame, which
          resolves to those px values. The inner unrotated text is
          ~349.94×36.45 (derived from cqw/cqh hypot in the export);
          after rotation it exactly fills the wrapper. NOTE: this is
          ~57 px above the raw metadata's y=246 — same rotation-bbox
          reference-frame offset as the cringe-lash + eye. */}
      <div
        className="absolute flex items-center justify-center"
        style={{ left: "565.07px", top: "189.02px", width: "351.32px", height: "92.94px" }}
      >
        <p
          className="m-0 text-center text-[20px] font-bold leading-[normal] text-black"
          style={{ width: "349.94px", height: "36.45px", transform: "rotate(-9.37deg)" }}
        >
          Why do people have a hard time expressing emotions through language?
        </p>
      </div>

      {/* ── Cell 3 + 4: "Then..." starburst + journaling question ── */}
      <BookPart src="/assets/about-starburst.svg" left={36.21} top={512.19} width={305.799} height={180.824} inner="-0.85% -0.24% -0.39% -0.21%" />
      <p
        className="absolute m-0 text-center text-[48px] font-bold leading-[normal] text-black"
        style={{ left: "125px", top: "578px", width: "151px" }}
      >
        Then...
      </p>

      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "359px", top: "371px", width: "263px" }}
      >
        What if you found your way back to journaling?
      </p>
      {/* Book group (Figma 2273:2498) at (440, 439) 161.771×106.006.
          The 18 individual sub-vectors that previously made up the
          open-book + pencil + handwritten "Bok Bok" are now baked
          into a single composite SVG per the 2275:26 export. Render
          as one image with the same two-wrapper pattern as the rest
          of the dividers — outer at the frame bbox, inner with the
          stroke-overflow padding from the export. */}
      <BookPart src="/assets/about-book-composite.svg" left={440} top={439} width={161.771} height={106.006} inner="-0.66% -0.44% -0.48% -0.12%" />

      {/* ── Cell 5: self-care + "What if there were a new way…" ──── */}
      <BookPart src="/assets/about-self-care.svg" left={748} top={302} width={102.52} height={204.51} inner="-0.24% -0.49%" />
      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "658px", top: "545px", width: "282px" }}
      >
        What if there were a new way to take care of you?
      </p>

      {/* ── Cell 6: eye composite + "What if you could see your energy?…"
          The eye composite (Figma 2273:2463) was significantly
          simplified in the latest design — the 13 individual sparkle
          /mini/detail vectors and the in-pupil creature illustration
          are gone. The new structure is just:
            • iris  (2273:2464) at (724.50, 676.02) 172.65×164.89
            • lash  frame (2273:2916) at (685.13, 606.83) 269.57×108.41
              — five lash strokes baked into the SVG
            • energy frame (2273:2914) at (738.92, 707.05) 145.04×118.36
              — empty placeholder, nothing renders
          Figma now exports the whole composite as a single baked SVG
          (about-eye-composite.svg) covering the eye frame's bbox
          (669.60, 608.53) 298.62×250.37 — iris + lash + interior
          doodles all in one. Render as a single image. */}
      <p
        className="absolute m-0 text-center text-[20px] font-bold leading-[normal] text-black"
        style={{ left: "426.02px", top: "714px", width: "232.02px" }}
      >
        What if you could see your energy?!?!?!?!?
      </p>
      {/* Eye composite (Figma 2273:2463) — flex-center wrapper at
          (669.6, 578.59) sized 298.622×250.37, inner SVG at its
          natural viewBox size 276.219×221.743 rotated -6.22°. This
          matches the 2275:26 export reference exactly. The export's
          wrapper top (578.59) is the visual bbox top AFTER rotation;
          the raw metadata's y=608.528 reports a different reference
          point (similar offset issue as the cringe-lash above). */}
      <div
        className="pointer-events-none absolute flex items-center justify-center"
        style={{ left: "669.6px", top: "578.59px", width: "298.622px", height: "250.37px" }}
      >
        <div style={{ transform: "rotate(-6.22deg)" }}>
          <img
            alt=""
            src="/assets/about-eye-composite.svg"
            className="block max-w-none"
            style={{ width: "276.219px", height: "221.743px" }}
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

      {/* ── Long-form intro paragraph (Figma 2273:2518) ───────────
          Position (13, 886) at 952×423 per the 2275:26 export
          (raw metadata reports x=11, but the export's left=13 is
          what matches the design canvas). Container uses
          line-height:0 (so the empty paragraph "spacers" collapse
          to almost no height), each paragraph has line-height:normal
          — matches the Figma's leading-[0] / leading-[normal]
          structure. */}
      <div
        className="absolute h-[423px] w-[952px] text-[20px] font-bold text-black"
        style={{
          left: "13px",
          top: "886px",
          lineHeight: 0,
          whiteSpace: "pre-wrap",
        }}
      >
        <p className="m-0 leading-[normal]">
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
        <p className="m-0 leading-[normal]">&#8203;</p>
        <p className="m-0 leading-[normal]">
          But emotions do not disappear.
          <br />
          They remain layered, contradictory, and constantly shifting beyond
          what language alone can define.
          <br />
          Perhaps this is why journaling still matters: not simply to document
          our lives, but to care for ourselves, observe our inner states, and
          create space for emotions that cannot be reduced to a single word.
        </p>
        <p className="m-0 leading-[normal]">&#8203;</p>
        <p className="m-0 leading-[normal]">
          This project explores emotion as a living creature of energy rather
          than a fixed emotional state.
          <br />
          Written experiences transform into moving entities made of colour,
          light, shape, and motion, forming an evolving emotional ecosystem
          where feelings coexist, drift, and change over time.
        </p>
        <p className="m-0 leading-[normal]">
          This is not a traditional journal.
          <br />
          It is a digital garden where emotions are allowed to live, grow, and
          remain.
        </p>
        <p className="m-0 leading-[normal]">&#8203;</p>
        <p className="m-0 leading-[normal]">
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
