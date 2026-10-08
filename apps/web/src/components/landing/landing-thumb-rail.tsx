"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";
import { landingMedia } from "./landing-media-data";

type Thumb = {
  title: string;
  overlay: string;
  tone: string;
  image?: string;
};

const thumbnails: Thumb[] = landingMedia.map((item, index) => ({
  title: item.kind,
  overlay: item.label.toUpperCase(),
  tone: index % 2 ? "from-violet-950 to-slate-950" : "from-indigo-950 to-zinc-950",
  image: item.image,
}));
const ROW_A = thumbnails.slice(0, 11);
const ROW_B = thumbnails.slice(11);

function ThumbCard({ thumb }: { thumb: Thumb }) {
  return (
    <div
      className={cn(
        "group relative h-[118px] w-[210px] shrink-0 overflow-hidden rounded-2xl sm:h-[132px] sm:w-[236px]",
        "ring-1 ring-white/10 transition-[transform,box-shadow] duration-300 hover:-translate-y-1 hover:ring-white/25",
      )}
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br", thumb.tone)} />
      {thumb.image ? <Image src={thumb.image} alt="" fill sizes="236px" className="object-cover transition duration-700 group-hover:scale-110" /> : null}
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
