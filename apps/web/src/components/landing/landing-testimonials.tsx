"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const CARDS = [
  {
    name: "Riz",
    handle: "@rizcreates",
    quote:
      "Went from blank page to a 10-minute history doc the same afternoon. The pipeline stages alone saved me a producer.",
    metric: "🔥 124",
    tall: false,
    chart: true,
  },
  {
    name: "Laminoob",
    handle: "@laminoob",
    quote: "Retention on the first SkyClip cut beat my hand-edited pilot by ~18%.",
    metric: "❤️ 298",
    tall: true,
    chart: true,
  },
  {
    name: "Maya K",
    handle: "@mayakdocs",
    quote: "Script-first is the killer feature. I drop VO, it builds the cut around my words.",
    metric: "🚀 25",
    tall: false,
    chart: false,
  },
  {
    name: "Studio North",
    handle: "@studionorth",
    quote: "We ship weekly listicles now. Prompt → queue → editor agent polish.",
    metric: "🔥 86",
    tall: false,
    chart: false,
  },
  {
    name: "Dev Patel",
    handle: "@devcuts",
    quote: "The editor agent understood “shorter intro, warmer B-roll” on the first try.",
    metric: "❤️ 152",
    tall: true,
    chart: true,
  },
  {
    name: "Asha",
    handle: "@ashafilms",
    quote: "Finally an AI video tool that feels like production, not a toy.",
    metric: "🚀 41",
    tall: false,
    chart: false,
  },
] as const;

function MiniChart() {
  return (
    <div className="mt-4 h-20 rounded-lg bg-black/40 p-2 ring-1 ring-white/8">
      <svg viewBox="0 0 200 60" className="h-full w-full" aria-hidden>
        <path
          d="M0 48 C30 44 40 20 70 28 C100 36 110 10 140 18 C170 26 180 8 200 12"
          fill="none"
          stroke="#2f6bff"
          strokeWidth="2"
        />
        <path
          d="M0 52 C40 50 60 40 90 42 C120 44 150 30 200 28"
          fill="none"
          stroke="rgba(255,255,255,0.25)"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );
}

export function LandingTestimonials() {
  const reduce = useReducedMotion();

  return (
    <section id="proof" className="scroll-mt-24 border-t border-white/6 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
          >
            <p className="flex items-center gap-2 text-[12px] font-medium tracking-wide text-[#6b9bff]">
              <span className="inline-block h-3 w-0.5 bg-[#6b9bff]" />
              <span className="inline-block h-3 w-0.5 bg-[#6b9bff]/50" />
              Testimonials
            </p>
            <h2 className="mt-3 max-w-md font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Creators already shipping with SkyClip
            </h2>
          </motion.div>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: 0.08 }}
            className="max-w-md"
          >
            <p className="text-sm leading-relaxed text-white/45">
              Long-form documentaries and listicles — from first brief to 1080p MP4 — without a
              five-person crew on standby.
            </p>
            <div className="mt-5 grid grid-cols-3 gap-4 text-left">
              {[
                { k: "1080p", v: "16:9 MP4" },
                { k: "< 1h", v: "Typical first cut" },
                { k: "2 paths", v: "Prompt or script" },
              ].map((s) => (
                <div key={s.k}>
                  <p className="font-display text-lg font-semibold text-white">{s.k}</p>
                  <p className="text-[11px] text-white/40">{s.v}</p>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <div className="mt-14 columns-1 gap-4 sm:columns-2 lg:columns-3">
          {CARDS.map((card, i) => (
            <motion.article
              key={card.handle}
              initial={reduce ? false : { opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-5% 0px" }}
              transition={{ duration: 0.5, delay: reduce ? 0 : i * 0.05 }}
              className={cn(
                "mb-4 break-inside-avoid rounded-2xl border border-white/8 bg-[#121214] p-4 transition-[border-color,transform] hover:-translate-y-0.5 hover:border-white/16",
                card.tall && "sm:min-h-[220px]",
              )}
            >
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-[#2f6bff]/40 to-white/10 text-[12px] font-semibold text-white">
                  {card.name.slice(0, 1)}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{card.name}</p>
                  <p className="text-[11px] text-white/40">{card.handle}</p>
                </div>
              </div>
              <p className="mt-3 text-[13px] leading-relaxed text-white/70">{card.quote}</p>
              {card.chart ? <MiniChart /> : null}
              <p className="mt-3 text-[12px] text-white/40">{card.metric}</p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
