"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingThumbRail } from "@/components/landing/landing-thumb-rail";
import { LandingSteps } from "@/components/landing/landing-steps";
import { LandingTestimonials } from "@/components/landing/landing-testimonials";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { cn } from "@/lib/utils";

function ClosingCta() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-28">
      <div className="landing-grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-3xl text-center">
        <motion.h2
          initial={reduce ? false : { opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.65 }}
          className="font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl"
        >
          The fastest way from idea to published video
        </motion.h2>
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.08 }}
          className="mt-8"
        >
          <Link
            href="/studio"
            className={cn(
              "inline-flex h-12 items-center gap-1.5 rounded-full bg-[#2f6bff] px-6 text-sm font-semibold text-white",
              "shadow-[0_0_32px_-6px_rgba(47,107,255,0.75)] transition-[transform,opacity] hover:opacity-95 active:scale-[0.98]",
            )}
          >
            Get started
            <span aria-hidden>›</span>
          </Link>
        </motion.div>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="bg-black text-white">
      <LandingNav />
      <LandingHero />
      <LandingThumbRail />
      <section className="border-t border-white/6 pt-20 sm:pt-28">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <p className="inline-flex items-center gap-2 text-[13px] font-medium text-[#6b9bff]">
            How it works
          </p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Less production. More publishing.
          </h2>
        </div>
        <div className="mt-16 sm:mt-20">
          <LandingSteps />
        </div>
      </section>
      <LandingTestimonials />
      <LandingPricing />
      <ClosingCta />
      <LandingFaq />
      <LandingFooter />
    </div>
  );
}
