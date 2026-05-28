"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { loadEcosystem, deleteCreatureById, matchesCreatureQuery, subscribeRemoteEcosystem } from "@/lib/ecosystem";
import { downloadCreaturePng } from "@/lib/downloadCreature";
import { playCreatureGiggle, unlockAudio } from "@/lib/audio";
import { nameHighlightDataUrl, creatureHighlightColor } from "@/lib/nameHighlight";
import { useT } from "@/lib/i18n";
import { emotionByKey, type CreatureSpec } from "@/lib/creature";
import CreatureCanvas from "@/app/_components/CreatureCanvas";
import CreatureThumbnail from "@/app/_components/CreatureThumbnail";
import BokBokLogo from "@/app/_components/BokBokLogo";
import CloseToHomeButton from "@/app/_components/CloseToHomeButton";

export default function BokBokpediaPage() {
  // Mobile layout paused — ViewportFit shows a rotate prompt on portrait
  // phones; landscape phones see the desktop 4-col grid scaled down.
  return <DesktopBokBokpediaPage />;
}

function DesktopBokBokpediaPage() {
  const router = useRouter();
  const t = useT();
  const [creatures, setCreatures] = useState<CreatureSpec[]>([]);
  const [selected, setSelected] = useState<CreatureSpec | null>(null);
  const [query, setQuery] = useState("");
  // CreatureCanvas zoom. Entering detail mode:
  //   • Holds at MAX zoom (3.0) for a 500 ms beat so the creature
  //     reads as "this is the one you picked" before pulling back.
  //   • Then eases from 3.0 → 1.0 over 2.2 s (ease-out cubic) so it
  //     settles into the default frame gently, not abruptly.
  // After the animation the user's zoom buttons take over normally.
  const [viewportZoom, setViewportZoom] = useState(1);
  const zoomIn = () => setViewportZoom((z) => Math.min(3, z * 1.2));
  const zoomOut = () => setViewportZoom((z) => Math.max(0.4, z / 1.2));
  useEffect(() => {
    if (!selected) {
      setViewportZoom(1);
      return;
    }
    const HOLD_MS = 500;
    const ANIM_MS = 2200;
    setViewportZoom(3);
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed < HOLD_MS) {
        // Still in the hold window — stay at max zoom.
        setViewportZoom(3);
        raf = requestAnimationFrame(tick);
        return;
      }
      const t = Math.min(1, (elapsed - HOLD_MS) / ANIM_MS);
      const eased = 1 - Math.pow(1 - t, 3);
      setViewportZoom(3 - 2 * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [selected?.id]);

  // Per-visit shuffle seed — generated once on mount, stable for the
  // session. Each id is hashed together with this seed to derive a
  // per-creature order key; the grid then sorts by that. Two effects:
  //   • Order is RANDOM each time the page loads.
  //   • New creatures arriving via realtime sync slot in at a
  //     consistent (id-derived) position rather than always jumping
  //     to the end, so the layout doesn't jitter mid-session.
  const [shuffleSeed] = useState(() => Math.random().toString(36).slice(2));
  const shuffled = useMemo(() => {
    const orderKey = (id: string) => {
      const s = id + shuffleSeed;
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 16777619);
      }
      return h >>> 0;
    };
    return [...creatures].sort((a, b) => orderKey(a.id) - orderKey(b.id));
  }, [creatures, shuffleSeed]);

  const filtered = query.trim()
    ? shuffled.filter((c) => matchesCreatureQuery(c, query))
    : shuffled;

  // Live ecosystem load + cross-tab/in-tab sync + Supabase realtime
  // (no-op when in local mode).
  useEffect(() => {
    let cancelled = false;
    const refresh = () => {
      loadEcosystem().then((list) => {
        if (!cancelled) setCreatures(list);
      });
    };
    refresh();
    const onChange = () => refresh();
    window.addEventListener("ecosystem:changed", onChange);
    window.addEventListener("storage", onChange);
    const unsubscribeRemote = subscribeRemoteEcosystem(refresh);
    return () => {
      cancelled = true;
      window.removeEventListener("ecosystem:changed", onChange);
      window.removeEventListener("storage", onChange);
      unsubscribeRemote();
    };
  }, []);

  const handleEdit = () => {
    if (!selected) return;
    const dest = selected.source === "manually" ? "/create/manually" : "/create";
    router.push(`${dest}?edit=${encodeURIComponent(selected.id)}`);
  };

  const handleDelete = () => {
    if (!selected) return;
    const ok = window.confirm(
      `Delete "${selected.name ?? "this creature"}" from the ecosystem? This cannot be undone.`,
    );
    if (!ok) return;
    deleteCreatureById(selected.id);
    setSelected(null);
  };

  return (
    <div className="relative mx-auto h-[900px] w-[1440px] overflow-hidden font-(family-name:--font-casual)">
      {/* BokBok logo / Home link — hand-drawn wordmark (Figma 2287:82). */}
      <a
        href="/"
        aria-label="BokBok home"
        className="absolute block cursor-pointer transition-transform active:scale-95 hover:scale-[1.02]"
        style={{ left: 1152, top: -27 }}
      >
        <BokBokLogo />
      </a>
      {/* × close button (Figma 2288:37) — back to main from any non-main
          page. Only shown in GRID mode; in DETAIL mode the back button
          takes its slot (since "back to home" from inside the detail
          view feels like a destructive accident — Back to grid is the
          natural primary action there). */}
      {!selected && <CloseToHomeButton />}

      {/* Trash / Back button slot — same 32.12 × 32.5 footprint, one
          icon per mode:
            • GRID mode   → trash icon at (919, 107) (→ trash page)
            • DETAIL mode → back arrow at (957, 107) (× button's old
              slot), since the × is hidden in detail mode. */}
      {selected ? (
        <button
          type="button"
          onClick={() => setSelected(null)}
          aria-label="Back to BokBokpedia grid"
          title="Back"
          className="absolute z-[30] block cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:scale-105"
          style={{ left: 957, top: 107, width: 32.12, height: 32.5 }}
        >
          <div className="absolute" style={{ inset: "-1.54% -1.56%" }}>
            <img
              alt=""
              src="/assets/back-button.svg"
              className="block size-full max-w-none"
              draggable={false}
            />
          </div>
        </button>
      ) : (
        <a
          href="/encyclopedia/trash"
          aria-label="View deleted creatures"
          title="Trash"
          className="absolute z-[30] block cursor-pointer transition-transform active:scale-95 hover:scale-105"
          style={{ left: 919, top: 107, width: 32.12, height: 32.5 }}
        >
          <div className="absolute" style={{ inset: "-1.54% -1.56%" }}>
            <img
              alt=""
              src="/assets/trash-button.svg"
              className="block size-full max-w-none"
              draggable={false}
            />
          </div>
        </a>
      )}

      {/* Top nav — Figma values per node, with the row stair-stepping
          slightly down across the bar:
            Create        (2102:152)  x=35  y=48 w=91
            Calendar      (2102:153)  x=115 y=51 w=151
            BokBokpedia  (2102:157)  x=255 y=51 w=151
          Energy Blocks and About (further right) sit at y=54. */}
      <a
        href="/create"
        className="absolute left-[80.5px] top-[48px] block h-[36px] w-[91px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.create")}
      </a>
      <a
        href="/calender"
        className="absolute left-[190.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.calendar")}
      </a>

      {/* Active tab indicator behind BokBokpedia — shifted +3px with the label. */}
      <div className="absolute left-[255px] top-[44px] h-[53.89px] w-[152.19px]">
        <img
          alt=""
          src="/assets/encyclopedia-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>
      <span className="absolute left-[330.5px] top-[51px] block h-[36px] w-[151px] -translate-x-1/2 text-center text-[24px] font-bold text-black">
        {t("nav.encyclopedia")}
      </span>

      {/* Energy Blocks (Figma 2109:248) — at x=418, y=54, w=151. */}
      <a
        href="/energy-blocks"
        className="absolute left-[493.5px] top-[54px] block h-[36px] w-[151px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.energy_blocks")}
      </a>

      {/* About (Figma 2109:250) — at x=581, y=54, w=76. */}
      <a
        href="/about"
        className="absolute left-[619px] top-[54px] block h-[36px] w-[76px] -translate-x-1/2 cursor-pointer text-center text-[24px] font-bold text-black"
      >
        {t("nav.about")}
      </a>

      {/* Search box (Figma 2303:149) — filters the encyclopedia grid
          by name or date. Moved to the top nav strip between About and
          the BokBok logo. The SVG renders slightly outside its bbox to
          clear stroke overflow. */}
      <div className="absolute left-[776.64px] top-[53.99px] h-[30.66px] w-[219.71px]">
        <div
          className="pointer-events-none absolute"
          style={{ inset: "-1.63% -0.23% -1.63% 0" }}
        >
          <img
            alt=""
            src="/assets/search-box-v2.svg"
            className="block size-full max-w-none"
          />
        </div>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t("enc.search_placeholder")}
          className="absolute left-[28px] top-[4px] block h-[22px] w-[180px] bg-transparent text-[16px] font-bold text-black outline-none placeholder:text-black/35"
        />
      </div>

      {/* Main canvas box */}
      <div className="pointer-events-none absolute left-[27px] top-[85px] h-[789.67px] w-[974.69px]">
        <img
          alt=""
          src="/assets/main-box.svg"
          className="absolute inset-0 block size-full"
        />
      </div>

      {/* Creature boxes grid — Figma exact values:
            container 895.6×697 at (70, 172)
            4 columns of 211.15-px boxes, 17-px column gap
            rows of 213.27-px boxes, 15-px row gap
          Both grid-template-columns AND grid-auto-rows set explicitly so
          every row matches the box height even when a row has fewer than
          four creatures (the implicit auto would shrink incomplete rows).
          Only rendered in GRID mode; when a creature is selected the
          whole main box flips to the detail view below. */}
      {!selected && (
      <div
        className="absolute left-[70px] top-[172px] grid h-[697px] w-[895.6px] gap-x-[17px] gap-y-[15px] overflow-x-clip overflow-y-auto"
        style={{
          gridTemplateColumns: "repeat(4, 211.15px)",
          gridAutoRows: "213.27px",
        }}
      >
        {creatures.length === 0 ? (
          <div className="col-span-4 mt-12 flex flex-col items-center gap-3 text-center text-[18px] font-bold leading-relaxed text-black/40">
            <span>{t("enc.empty_no_creatures")}</span>
            <a href="/create" className="cursor-pointer text-black/70 underline">
              {t("enc.empty_create_first")}
            </a>
          </div>
        ) : filtered.length === 0 ? (
          <div className="col-span-4 mt-12 text-center text-[16px] font-bold text-black/40">
            {t("enc.no_matches")} &ldquo;{query}&rdquo;.
          </div>
        ) : (
          filtered.map((c, i) => {
            // Grid only renders when nothing is selected, so the
            // "currently selected" highlight is always off here.
            const isSelected = false;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => {
                  // Play the creature's giggle on click — same audio
                  // signature it gets when first generated on the
                  // Create page. `force: true` routes through the
                  // always-on output so this fires even when the
                  // global Sound Off toggle is on; pressing a creature
                  // here means you want to hear it.
                  unlockAudio();
                  playCreatureGiggle(c.blocks, { force: true });
                  setSelected(c);
                }}
                className="relative h-[213.27px] w-[211.15px] shrink-0 cursor-pointer bg-transparent p-0 transition-transform active:scale-95 hover:scale-[1.01]"
              >
                {/* Decorative box outline (cycles through the 24 hand-drawn variants) */}
                <img
                  alt=""
                  src={`/assets/creature-box-${i % 24}.svg`}
                  className="pointer-events-none absolute inset-0 block size-full"
                />
                {/* Date label — top of the box (compact YYYYMMDD per Figma 2102:239) */}
                <span className="pointer-events-none absolute left-1/2 top-[4px] flex h-[14px] w-[120px] -translate-x-1/2 items-center justify-center whitespace-nowrap text-center text-[13px] font-bold leading-[normal] text-black">
                  {c.dateISO ? c.dateISO.replace(/-/g, "") : ""}
                </span>
                {/* Creature thumbnail centered between the labels */}
                <div className="pointer-events-none absolute inset-[18px]">
                  <CreatureThumbnail creature={c} blockSize={92} />
                </div>
                {/* Name + optional hand-drawn highlight (Figma 2241:1429).
                    The highlight is rendered as a background-image on the
                    text span itself — this intrinsically ties the bar
                    width to the rendered text bounding box, so short
                    "POPO" gets a short bar and long "Bouncing Joyfulness"
                    gets a long one with no extra trailing space. Vertical
                    centering uses `center` (Y axis), horizontal stretch
                    uses 100% so preserveAspectRatio="none" inside the SVG
                    does the rest. Padding-x of 4 px extends the bar a
                    hair past the glyphs for the hand-drawn marker feel. */}
                <div
                  className="pointer-events-none absolute left-1/2 bottom-[6px] flex h-[28px] -translate-x-1/2 items-center justify-center"
                >
                  <span
                    className="whitespace-nowrap px-[4px] text-center text-[20px] font-normal leading-[normal] text-black font-(family-name:--font-casual)"
                    style={{
                      maxWidth: "195px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      ...(isSelected
                        ? {
                            backgroundImage: nameHighlightDataUrl(
                              creatureHighlightColor(c),
                            ),
                            backgroundRepeat: "no-repeat",
                            backgroundSize: "100% 20px",
                            backgroundPosition: "center",
                          }
                        : null),
                    }}
                  >
                    {c.name ?? "Creature"}
                  </span>
                </div>
              </button>
            );
          })
        )}
      </div>
      )}

      {/* Detail view — fills the main box when a creature is selected.
          Same wavy frame is reused (the main-box.svg is rendered behind
          everything as the page background); we just swap the inner
          content from grid → CreatureCanvas + zoom controls. The
          back button at (919, 107) lets the user return to the grid. */}
      {selected && (
        <>
          <div className="scroll-fade absolute left-[42px] top-[150px] h-[710px] w-[920px]">
            <CreatureCanvas
              creature={selected}
              blockSize={140}
              padding={8}
              zoom={viewportZoom}
            />
          </div>
          {/* Zoom controls — exact same footprint and position as the
              main page's zoom buttons (wrapper-relative left:930
              top:701/737, here in page coords because we're outside
              the main-viewport wrapper). 32.12 × 32.5 to match the
              other corner buttons (× close, fullscreen, back). */}
          <button
            type="button"
            onClick={zoomIn}
            title="Zoom in"
            className="absolute z-[30] block cursor-pointer bg-transparent p-0 opacity-80 hover:opacity-100"
            style={{ left: 957, top: 786, width: 32.12, height: 32.5 }}
          >
            <img alt="zoom in" src="/assets/zoom-in.svg" className="block size-full" />
          </button>
          <button
            type="button"
            onClick={zoomOut}
            title="Zoom out"
            className="absolute z-[30] block cursor-pointer bg-transparent p-0 opacity-80 hover:opacity-100"
            style={{ left: 957, top: 822, width: 32.12, height: 32.5 }}
          >
            <img alt="zoom out" src="/assets/zoom-out.svg" className="block size-full" />
          </button>
        </>
      )}

      {/* Creature view (top right) — shows the selected creature's
          ENERGY BLOCKS (same 2-col grid as the main page's right
          viewfinder when a creature is focused). */}
      <div className="pointer-events-none absolute left-[1016px] top-[85px] h-[386.37px] w-[396.28px]">
        <img
          alt=""
          src="/assets/creature-view.svg"
          className="absolute inset-0 block size-full"
        />
        <div className="scroll-fade-vertical pointer-events-auto absolute inset-[14px] overflow-y-auto overflow-x-hidden">
          {selected ? (
            <div className="grid grid-cols-2 gap-x-[36px] gap-y-[18px] px-[26px] pt-[3px] pb-[10px]">
              {selected.emotions.map(({ key, displayName }) => {
                const e = emotionByKey(key);
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center gap-[3px]"
                  >
                    <img
                      alt=""
                      src={e?.imagePath}
                      className="block h-[135px] w-[135px] select-none object-contain"
                      draggable={false}
                    />
                    <span className="text-center text-[16px] font-bold leading-normal text-black">
                      {displayName}
                    </span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-center text-[14px] leading-relaxed text-black/40">
              {t("panel.click_creature")}
              <br />
              {t("panel.bokbokpedia_to_view")}
            </div>
          )}
        </div>
      </div>

      {/* Info panel (bottom right) — name, date, journal, edit + delete.
          Two-vector outline matches Figma 2006:75. */}
      <div className="absolute left-[1015px] top-[480px] h-[398.38px] w-[397.21px] overflow-hidden">
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

        {/* Name + date stacked in a single positioned flex container so
            long names (e.g. "Second day in Busan") wrap to the next
            line and push the date down with them, instead of overflowing
            the wavy frame. max-w-full + break-words handle wrapping;
            leading-[1.05] keeps two-line names compact. */}
        <div className="absolute left-[20px] right-[20px] top-[15px] flex flex-col items-center text-center">
          <h2 className="m-0 max-w-full break-words text-[36px] leading-[1.05] text-black font-(family-name:--font-fancy)">
            {selected?.name ?? t("panel.empty_name")}
          </h2>
          <span className="mt-[2px] text-[18px] font-bold leading-none text-black">
            {selected?.dateISO ?? "—"}
          </span>
        </div>

        <div className="scroll-fade-vertical absolute left-[26px] right-[18px] top-[110px] bottom-[58px] flex flex-col items-center overflow-y-auto overflow-x-hidden">
          <div className="w-full text-[20px] font-bold leading-normal text-black">
            {selected ? (
              selected.journalText ? (
                selected.journalText.split(/\n\n+/).map((para, i, arr) => (
                  <p key={i} className={i === arr.length - 1 ? "" : "mb-0"}>
                    {para}
                  </p>
                ))
              ) : (
                <p className="text-black/50">
                  {t("panel.no_journal_manual")}
                </p>
              )
            ) : (
              <p className="text-black/40">
                {t("panel.pick_from_bokbokpedia")}
              </p>
            )}
          </div>
        </div>

        {/* Download button (Figma 2098:137) */}
        <button
          type="button"
          onClick={() => selected && downloadCreaturePng(selected)}
          disabled={!selected}
          className={`absolute left-[13px] bottom-[19px] block h-[27px] w-[112px] overflow-visible bg-transparent p-0 transition-transform ${
            selected
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <img
            alt=""
            src="/assets/uploaded-box.svg"
            className="absolute inset-0 block size-full"
          />
          <span
            className="absolute flex items-center justify-center text-center text-[24px] font-bold leading-[normal] text-black"
            style={{ inset: "-3.7% 0.88% -7.41% 0.88%" }}
          >
            {t("action.download")}
          </span>
        </button>

        {/* Edit button */}
        <button
          type="button"
          onClick={handleEdit}
          disabled={!selected}
          className={`absolute right-[107px] bottom-[14.54px] block h-[30.83px] w-[49.41px] overflow-visible bg-transparent p-0 transition-transform ${
            selected
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <img
            alt=""
            src="/assets/edit-button.svg"
            className="absolute inset-0 block size-full"
          />
          <span className="absolute inset-0 flex items-center justify-center text-[20px] font-bold leading-none text-black">
            {t("action.edit")}
          </span>
        </button>

        {/* Delete button */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={!selected}
          className={`absolute right-[12.8px] bottom-[10px] block h-[40.58px] w-[88.56px] overflow-visible bg-transparent p-0 transition-transform ${
            selected
              ? "cursor-pointer active:scale-95"
              : "cursor-not-allowed opacity-40"
          }`}
        >
          <div className="absolute" style={{ inset: "0 3.3% 19.51% 4.4%" }}>
            <div className="absolute" style={{ inset: "-1.53% -0.61% -1.53% -2.94%" }}>
              <img alt="" src="/assets/delete-vector.svg" className="block size-full max-w-none" />
            </div>
          </div>
          <p
            className="absolute m-0 text-center text-[24px] font-bold leading-[normal] text-black"
            style={{ inset: "12.2% 0 0 0" }}
          >
            {t("action.delete")}
          </p>
        </button>
      </div>

    </div>
  );
}
