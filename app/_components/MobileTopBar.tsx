"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import BokBokLogo from "./BokBokLogo";

/**
 * Shared mobile header — BokBok wordmark (links home) on the left + a
 * three-line hamburger button on the right. Tapping the hamburger opens
 * a right-side slide-in nav drawer with all five page links plus a
 * backdrop tap-to-dismiss and Escape-key support.
 *
 * Used by every mobile page layout (About, Calendar, Encyclopedia,
 * Energy Blocks, Create, ...) so the navigation feels consistent and we
 * don't repaste the same JSX into each file.
 *
 * The `active` prop highlights the current page link in the drawer so
 * the user has a sense of where they are in the site.
 */
export default function MobileTopBar({ active }: { active?: NavKey }) {
  const [open, setOpen] = useState(false);
  const t = useT();

  // Esc closes the drawer — small affordance for desktop testing on
  // narrow windows but harmless on touch devices.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Drawer link helper — plain <a> tag so every nav tap triggers a full
  // page reload (matches desktop nav behaviour). The drawer's onClick
  // also closes the panel pre-navigation so it doesn't flash open on
  // the destination page during the reload.
  const NavLink = ({
    href,
    label,
    keyName,
  }: {
    href: string;
    label: string;
    keyName: NavKey;
  }) => (
    <a
      href={href}
      onClick={() => setOpen(false)}
      className={`block py-3 text-[20px] font-bold ${
        active === keyName ? "text-black" : "text-black/60"
      }`}
    >
      {label}
    </a>
  );

  return (
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between bg-[#dfd9c9]/95 px-4 py-2 backdrop-blur">
        {/* Hand-drawn BokBok wordmark (Figma 2287:82). At width 72 the
            logo's visible content (which sits in the lower ~67% of the
            132×108 frame) reads at roughly the same vertical weight as
            the previous 32 px Casual Human label. */}
        <a
          href="/"
          aria-label="BokBok home"
          className="block cursor-pointer transition-transform active:scale-95"
        >
          <BokBokLogo width={72} />
        </a>
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open navigation"
          className="flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-[5px] bg-transparent p-2"
        >
          <span className="block h-[2px] w-6 bg-black" />
          <span className="block h-[2px] w-6 bg-black" />
          <span className="block h-[2px] w-6 bg-black" />
        </button>
      </header>

      {open && (
        <>
          <div
            className="fixed inset-0 z-40 bg-black/30"
            onClick={() => setOpen(false)}
            aria-hidden
          />
          <nav className="fixed right-0 top-0 z-50 flex h-full w-[70vw] max-w-[280px] flex-col bg-[#dfd9c9] p-6 shadow-lg">
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close navigation"
              className="ml-auto flex h-10 w-10 cursor-pointer items-center justify-center bg-transparent text-[24px] font-bold text-black active:scale-95"
            >
              ×
            </button>
            <div className="mt-4 flex flex-col">
              <NavLink href="/" label="Home" keyName="home" />
              <NavLink href="/create" label={t("nav.create")} keyName="create" />
              <NavLink href="/calender" label={t("nav.calendar")} keyName="calender" />
              <NavLink href="/encyclopedia" label={t("nav.encyclopedia")} keyName="encyclopedia" />
              <NavLink href="/energy-blocks" label={t("nav.energy_blocks")} keyName="energy_blocks" />
              <NavLink href="/about" label={t("nav.about")} keyName="about" />
            </div>
          </nav>
        </>
      )}
    </>
  );
}

export type NavKey =
  | "home"
  | "create"
  | "calender"
  | "encyclopedia"
  | "energy_blocks"
  | "about";
