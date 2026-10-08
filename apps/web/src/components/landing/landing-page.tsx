"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Sparkles, Video } from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingBento } from "@/components/landing/landing-bento";
import { LandingThumbRail } from "@/components/landing/landing-thumb-rail";
import { LandingSteps } from "@/components/landing/landing-steps";
import { LandingTestimonials } from "@/components/landing/landing-testimonials";
import { LandingPricing } from "@/components/landing/landing-pricing";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingFooter } from "@/components/landing/landing-footer";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

function ClosingCta() {
  const reduce = useReducedMotion();
  return (
    <section className="relative overflow-hidden px-5 py-24 sm:px-8 sm:py-32">
      <div className="landing-grid-bg pointer-events-none absolute inset-0 opacity-40" aria-hidden />
      <div className="relative mx-auto max-w-4xl text-center">
        <div className="relative overflow-hidden rounded-3xl border border-white/[0.12] bg-gradient-to-b from-[#161724] via-[#0f1017] to-[#09090b] p-10 sm:p-16 shadow-[0_24px_100px_rgba(0,0,0,0.8)] backdrop-blur-2xl">
          <BorderBeam size={320} duration={8} colorVariant="colorful" borderWidth={1.5} />
          
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-medium text-blue-300">
            <Sparkles className="size-3.5 text-blue-400" /> Start Producing In Minutes
          </span>

          <motion.h2
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
            className="mt-6 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl leading-[1.1]"
          >
            The Fastest Way From Raw Idea <br className="hidden sm:inline" />
            <span className="landing-chromatic">To 4K Published Video.</span>
          </motion.h2>

          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-zinc-300 sm:text-base">
            Join thousands of modern creators, documentary storytellers, and media teams scaling weekly releases without production burnout.
          </p>

          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.1 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-4"
          >
            <Link
              href="/studio"
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-8 text-sm font-semibold text-white",
                "shadow-[0_0_36px_rgba(59,130,246,0.6)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_48px_rgba(59,130,246,0.85)] active:scale-[0.98]",
              )}
            >
              Get Started for Free <ArrowRight className="size-4" />
            </Link>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

export function LandingPage() {
  return (
    <div className="bg-[#070709] text-white selection:bg-blue-500/30 selection:text-white">
      <LandingNav />
      <LandingHero />
      <LandingThumbRail />
      <LandingBento />
      <section className="border-t border-white/[0.08] pt-24 sm:pt-32">
        <div className="mx-auto max-w-3xl px-5 text-center sm:px-8">
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-blue-400">
            Automated Workflow
          </p>
          <h2 className="mt-3 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Less Production Friction. <br />
            <span className="text-zinc-400">More Publishing Velocity.</span>
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
