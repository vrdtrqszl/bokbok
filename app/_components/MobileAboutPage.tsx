"use client";

import MobileTopBar from "./MobileTopBar";

const INSTAGRAM_URL =
  "https://www.instagram.com/bokbok.meee?igsh=aThxYnVscHV1MHNh&utm_source=qr";

/**
 * Mobile About page.
 *
 * Desktop is a comic-page collage: hand-drawn divider lines carve a
 * 974×1309 area into 6 cells, each with rotated illustrations + headings
 * (Insta clipping, cringe face, "Then..." starburst, open-book, eye
 * composite, self-care figure) and a long-form intro paragraph below the
 * fold. That layout depends on absolute Figma coords and rotated SVGs
 * that don't reflow.
 *
 * Mobile presents the same content as a vertical narrative — the
 * illustrations stack with their captions in reading order, then the
 * long-form paragraph, then the creature view + Instagram QR card. Each
 * section uses the same hand-drawn assets as desktop (Insta, face,
 * starburst, book, self-care, eye composite) so the comic-book feel is
 * preserved even without the carved cells.
 */
export default function MobileAboutPage() {
  return (
    <div className="relative min-h-screen w-full font-(family-name:--font-casual)">
      <MobileTopBar active="about" />

      <main className="mx-auto flex max-w-[520px] flex-col gap-10 px-5 pb-16 pt-6 text-black">
        {/* ── Opening question + Instagram clipping ───────────────── */}
        <section className="flex flex-col items-center gap-4 text-center">
          <h2 className="m-0 text-[22px] font-bold leading-snug">
            Why people stopped writing a journal?
          </h2>
          <img
            alt=""
            src="/assets/about-insta-new.svg"
            className="block w-full max-w-[360px]"
            draggable={false}
          />
        </section>

        {/* ── Cringe face → "Why do people..." follow-up ──────────── */}
        <section className="flex flex-col items-center gap-3 text-center">
          <img
            alt=""
            src="/assets/about-face-new.svg"
            className="block h-[88px] w-[106px]"
            draggable={false}
          />
          <p className="m-0 text-[13px] font-bold leading-none text-black/70">
            cringe...
          </p>
          <p className="m-0 mt-2 text-[18px] font-bold leading-snug">
            Why do people have a hard time expressing emotions through language?
          </p>
        </section>

        {/* ── "Then..." starburst pivot ───────────────────────────── */}
        <section className="relative flex flex-col items-center text-center">
          <div className="relative inline-block">
            <img
              alt=""
              src="/assets/about-starburst.svg"
              className="block h-[180px] w-[306px]"
              draggable={false}
            />
            <span className="absolute inset-0 flex items-center justify-center text-[40px] font-bold leading-none text-black">
              Then...
            </span>
          </div>
        </section>

        {/* ── Book + "What if you found your way back to journaling" */}
        <section className="flex flex-col items-center gap-4 text-center">
          <p className="m-0 text-[18px] font-bold leading-snug">
            What if you found your way back to journaling?
          </p>
          <img
            alt=""
            src="/assets/about-book-composite.svg"
            className="block h-[106px] w-[162px]"
            draggable={false}
          />
        </section>

        {/* ── Self-care + "What if there were a new way" ──────────── */}
        <section className="flex flex-col items-center gap-4 text-center">
          <img
            alt=""
            src="/assets/about-self-care.svg"
            className="block h-[205px] w-[103px]"
            draggable={false}
          />
          <p className="m-0 text-[18px] font-bold leading-snug">
            What if there were a new way to take care of you?
          </p>
        </section>

        {/* ── Eye + "What if you could see your energy" ───────────── */}
        <section className="flex flex-col items-center gap-4 text-center">
          <p className="m-0 text-[18px] font-bold leading-snug">
            What if you could see your energy?!?!?!?!?
          </p>
          <img
            alt=""
            src="/assets/about-eye-composite.svg"
            className="block h-[250px] w-[299px]"
            draggable={false}
          />
        </section>

        {/* ── Long-form intro paragraph ──────────────────────────── */}
        <section className="text-[16px] font-bold leading-relaxed">
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
          <p className="mt-4 mb-0">
            But emotions do not disappear.
            <br />
            They remain layered, contradictory, and constantly shifting beyond
            what language alone can define.
            <br />
            Perhaps this is why journaling still matters: not simply to document
            our lives, but to care for ourselves, observe our inner states, and
            create space for emotions that cannot be reduced to a single word.
          </p>
          <p className="mt-4 mb-0">
            This project explores emotion as a living creature of energy rather
            than a fixed emotional state.
            <br />
            Written experiences transform into moving entities made of colour,
            light, shape, and motion, forming an evolving emotional ecosystem
            where feelings coexist, drift, and change over time.
          </p>
          <p className="mt-4 mb-0">
            This is not a traditional journal.
            <br />
            It is a digital garden where emotions are allowed to live, grow, and
            remain.
          </p>
          <p className="mt-4 mb-0">
            Your emotions are not linear.
            <br />
            They overlap, mutate, contradict, and evolve.
            <br />
            Within this space, they finally become visible.
          </p>
        </section>

        {/* ── Creature view card (pet-dog) ───────────────────────── */}
        <section className="relative mx-auto w-full max-w-[396px] overflow-hidden">
          <img
            alt=""
            src="/assets/creature-view.svg"
            className="block w-full"
            draggable={false}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-start gap-2 pt-[10%]">
            <img
              alt=""
              src="/assets/about-pet-dog.png"
              className="block aspect-square w-[55%] object-cover"
              draggable={false}
            />
            <span className="block text-[28px] leading-none text-black font-(family-name:--font-fancy)">
              BokBok
            </span>
            <div className="mt-1 px-4 text-center text-[13px] font-bold leading-snug text-black">
              <p className="m-0">.a Korean onomatopoeic word describing</p>
              <p className="m-0">the gentle act of petting an animal</p>
            </div>
          </div>
        </section>

        {/* ── Instagram QR + handle ──────────────────────────────── */}
        <section className="relative mx-auto w-full max-w-[396px] overflow-hidden">
          <img
            alt=""
            src="/assets/info-vector2.svg"
            className="block w-full"
            draggable={false}
          />
          <div className="absolute inset-0 flex flex-col items-center justify-start gap-3 pt-[13%]">
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block aspect-[1179/1067] w-[70%] cursor-pointer transition-transform active:scale-95"
            >
              <img
                alt="BokBok Instagram QR"
                src="/assets/about-bokbok-insta-qr.png"
                className="block size-full object-cover"
                draggable={false}
              />
            </a>
            <a
              href={INSTAGRAM_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="block cursor-pointer whitespace-nowrap text-center text-[20px] leading-none text-black underline-offset-4 hover:underline"
            >
              @BokBok.Meee
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}
