"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

type Thumb = {
  title: string;
  overlay: string;
  tone: string;
};

const ROW_A: Thumb[] = [
  { title: "WW2", overlay: "BATTLE OF BRITAIN", tone: "from-stone-800 via-zinc-900 to-amber-950/40" },
  { title: "Luxury", overlay: "$150,000 PER NIGHT", tone: "from-sky-950 via-zinc-900 to-slate-950" },
  { title: "AI", overlay: "TOO SMART?", tone: "from-cyan-950 via-neutral-900 to-blue-950" },
  { title: "Auto", overlay: "TOYOTA 2026", tone: "from-red-950/50 via-zinc-900 to-stone-950" },
  { title: "Empire", overlay: "INDIAN HISTORY", tone: "from-amber-950 via-stone-900 to-orange-950/50" },
  { title: "Space", overlay: "MARS COLONY", tone: "from-indigo-950/40 via-zinc-900 to-black" },
  { title: "Food", overlay: "STREET FOOD", tone: "from-yellow-950/40 via-neutral-900 to-orange-950/30" },
];

const ROW_B: Thumb[] = [
  { title: "Ali", overlay: "THE GREATEST", tone: "from-zinc-800 via-neutral-900 to-stone-950" },
  { title: "Ocean", overlay: "DEEP BLUE", tone: "from-teal-950 via-slate-900 to-cyan-950" },
  { title: "Myth", overlay: "SkyClip", tone: "from-orange-950/60 via-stone-950 to-red-950/40" },
  { title: "Climate", overlay: "CLIMATE NOW", tone: "from-emerald-950 via-zinc-900 to-teal-950" },
  { title: "Rome", overlay: "ANCIENT ROME", tone: "from-stone-700 via-amber-950/30 to-zinc-950" },
  { title: "Tech", overlay: "STARTUPS 2026", tone: "from-blue-950 via-zinc-900 to-slate-950" },
  { title: "War", overlay: "PACIFIC FRONT", tone: "from-neutral-800 via-stone-900 to-black" },
];

function ThumbCard({ thumb }: { thumb: Thumb }) {
  return (
    <div
      className={cn(
        "group relative h-[118px] w-[210px] shrink-0 overflow-hidden rounded-2xl sm:h-[132px] sm:w-[236px]",
        "ring-1 ring-white/10 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:ring-white/25",
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br", thumb.tone)} />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.14),transparent_45%)]" />
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
      <p className="absolute inset-x-3 bottom-3 text-center font-display text-[13px] font-bold leading-tight tracking-wide text-white drop-shadow-md sm:text-sm">
        {thumb.overlay}
      </p>
    </div>
  );
}

function Rail({ items, reverse, paused }: { items: Thumb[]; reverse?: boolean; paused?: boolean }) {
  const track = [...items, ...items];
  return (
    <div className="landing-marquee-mask overflow-hidden">
      <div
        className={cn(
          "landing-marquee-track flex w-max gap-3",
          reverse ? "landing-marquee-reverse" : "landing-marquee-forward",
          paused && "![animation-play-state:paused]",
        )}
      >
        {track.map((t, i) => (
          <ThumbCard key={`${t.overlay}-${i}`} thumb={t} />
        ))}
      </div>
    </div>
  );
}

export function LandingThumbRail() {
  const reduce = useReducedMotion();

  return (
    <section className="relative mt-16 pb-6 sm:mt-20">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-20 w-16 bg-gradient-to-r from-black to-transparent sm:w-28" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-20 w-16 bg-gradient-to-l from-black to-transparent sm:w-28" />

      {/* Fixed playhead */}
      <div className="pointer-events-none absolute inset-y-0 left-1/2 z-30 -translate-x-1/2">
        <div className="relative h-full w-px bg-[#ff3b3b]">
          <div className="absolute -top-1 left-1/2 size-0 -translate-x-1/2 border-x-[6px] border-t-[8px] border-x-transparent border-t-[#ff3b3b]" />
        </div>
      </div>

      <motion.div
        initial={reduce ? false : { opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
        className="space-y-3"
      >
        <Rail items={ROW_A} paused={!!reduce} />
        <Rail items={ROW_B} reverse paused={!!reduce} />
      </motion.div>

      <p className="mt-8 text-center text-[12px] tracking-wide text-white/35">
        Trusted by creators shipping long-form every week
      </p>
    </section>
  );
}
