"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Sparkles } from "lucide-react";
import { LandingPromptBox } from "@/components/landing/landing-prompt-box";
import { PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function LandingHero() {
  const reduce = useReducedMotion();

  return (
    <section className="relative overflow-hidden pt-28 sm:pt-32">
      <div className="landing-ambient" aria-hidden>
        <div className="landing-blob landing-blob-amber" />
        <div className="landing-blob landing-blob-blue" />
        <div className="landing-noise" />
      </div>

      <div className="relative mx-auto max-w-3xl px-5 text-center sm:px-8">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
          className="inline-flex items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-3.5 py-1 text-[12px] text-white/70"
        >
          <span className="size-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]" />
          Ready to publish &lt; 1h
        </motion.div>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
          className="mt-6 font-display text-sm font-semibold tracking-[0.22em] text-[#6b9bff]"
        >
          {PRODUCT_NAME}
        </motion.p>

        <motion.h1
          initial={reduce ? false : { opacity: 0, y: 22 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-3 text-balance font-display text-4xl font-semibold leading-[1.08] tracking-tight text-white sm:text-5xl md:text-[3.35rem]"
        >
          One brief in. Publish-ready long-form video out. Under an hour.
        </motion.h1>

        <motion.p
          initial={reduce ? false : { opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.65, delay: 0.18, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-5 max-w-xl text-pretty text-[15px] leading-relaxed text-white/50 sm:text-base"
        >
          It&apos;s like having a senior editor, researcher, and scriptwriter on demand — ready when
          you brief them, not when their calendar opens.
        </motion.p>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.26, ease: [0.22, 1, 0.36, 1] }}
          className="mt-8 flex flex-wrap items-center justify-center gap-3"
        >
          <Link
            href="/studio"
            className={cn(
              "inline-flex h-11 items-center gap-1.5 rounded-full bg-[#2f6bff] px-5 text-sm font-semibold text-white",
              "shadow-[0_0_28px_-6px_rgba(47,107,255,0.7)] transition-[transform,opacity] hover:opacity-95 active:scale-[0.98]",
            )}
          >
            Get started
            <span aria-hidden>›</span>
          </Link>
          <a
            href="#how"
            className="inline-flex h-11 items-center gap-2 rounded-full border border-white/12 bg-white/[0.03] px-5 text-sm font-medium text-white/75 transition-colors hover:bg-white/[0.06] hover:text-white"
          >
            <Sparkles className="size-3.5 text-[#6b9bff]" />
            How it works
          </a>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.75, delay: 0.34, ease: [0.22, 1, 0.36, 1] }}
          className="mx-auto mt-10 max-w-2xl"
        >
          <LandingPromptBox />
        </motion.div>
      </div>
    </section>
  );
}
