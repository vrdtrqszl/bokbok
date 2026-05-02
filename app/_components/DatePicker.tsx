"use client";

import { useEffect, useRef } from "react";

type Props = {
  value: Date;
  onChange: (d: Date) => void;
  onClose: () => void;
  className?: string;
};

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// Wide year range — covers any practical journaling use case.
const YEAR_START = 1900;
const YEAR_END = 2100;
const YEARS = Array.from({ length: YEAR_END - YEAR_START + 1 }, (_, i) => YEAR_START + i);

const ROW_H = 18; // px — single item height
const ROW_GAP = 4; // px — gap between items

export default function DatePicker({ value, onChange, onClose, className }: Props) {
  const popupRef = useRef<HTMLDivElement | null>(null);
  const yearColRef = useRef<HTMLDivElement | null>(null);
  const monthColRef = useRef<HTMLDivElement | null>(null);
  const dayColRef = useRef<HTMLDivElement | null>(null);

  const selectedYear = value.getFullYear();
  const selectedMonth = value.getMonth();
  const selectedDay = value.getDate();
  const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();
  const DAYS = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  // Click-outside + Escape to close
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  // On mount, scroll each column so the currently selected value is in view.
  useEffect(() => {
    const scrollTo = (el: HTMLDivElement | null, idx: number) => {
      if (!el) return;
      const target = idx * (ROW_H + ROW_GAP);
      el.scrollTop = Math.max(0, target - ROW_H * 2);
    };
    const yIdx = YEARS.indexOf(selectedYear);
    if (yIdx >= 0) scrollTo(yearColRef.current, yIdx);
    scrollTo(monthColRef.current, selectedMonth);
    scrollTo(dayColRef.current, selectedDay - 1);
    // run once on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Setters: clamp day if month/year shrinks the available range.
  const setYear = (y: number) => {
    const maxDay = new Date(y, selectedMonth + 1, 0).getDate();
    onChange(new Date(y, selectedMonth, Math.min(selectedDay, maxDay)));
  };
  const setMonth = (m: number) => {
    const maxDay = new Date(selectedYear, m + 1, 0).getDate();
    onChange(new Date(selectedYear, m, Math.min(selectedDay, maxDay)));
  };
  const setDay = (d: number) => {
    onChange(new Date(selectedYear, selectedMonth, d));
  };

  return (
    <div
      ref={popupRef}
      className={`relative h-[162px] w-[258px] font-(family-name:--font-casual) ${className ?? ""}`}
      data-component="choose-date-popup"
    >
      {/* Hand-drawn box background */}
      <img
        alt=""
        src="/assets/choose-date-popup.svg"
        className="pointer-events-none absolute inset-0 block size-full"
      />

      {/* Year column */}
      <div
        ref={yearColRef}
        className="absolute left-[27px] top-[10px] flex h-[144px] w-[57px] flex-col gap-[4px] overflow-y-auto overflow-x-clip text-center text-[20px] font-bold leading-[normal] text-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {YEARS.map((y) => (
          <button
            key={y}
            type="button"
            onClick={() => setYear(y)}
            className={`block h-[18px] w-full shrink-0 cursor-pointer bg-transparent p-0 transition-colors ${
              y === selectedYear ? "font-bold text-black" : "text-black/45 hover:text-black"
            }`}
          >
            {y}
          </button>
        ))}
      </div>

      {/* Month column */}
      <div
        ref={monthColRef}
        className="absolute left-[87px] top-[10px] flex h-[144px] w-[117px] flex-col gap-[4px] overflow-y-auto overflow-x-clip text-center text-[20px] font-bold leading-[normal] text-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {MONTHS.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => setMonth(i)}
            className={`block h-[19px] w-full shrink-0 cursor-pointer bg-transparent p-0 transition-colors ${
              i === selectedMonth ? "font-bold text-black" : "text-black/45 hover:text-black"
            }`}
          >
            {m}
          </button>
        ))}
      </div>

      {/* Day column */}
      <div
        ref={dayColRef}
        className="absolute left-[210px] top-[10px] flex h-[144px] w-[31px] flex-col gap-[4px] overflow-y-auto overflow-x-clip text-center text-[20px] font-bold leading-[normal] text-black [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {DAYS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => setDay(d)}
            className={`block h-[18px] w-full shrink-0 cursor-pointer bg-transparent p-0 transition-colors ${
              d === selectedDay ? "font-bold text-black" : "text-black/45 hover:text-black"
            }`}
          >
            {d}
          </button>
        ))}
      </div>
    </div>
  );
}
