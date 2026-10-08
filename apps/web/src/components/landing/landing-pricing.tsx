"use client";

import React from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Check, Sparkles } from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";
import { BILLING_PLANS } from "@/lib/billing/plans";

const PLANS = BILLING_PLANS.map((plan) => ({
  ...plan,
  highlight: plan.id === "creator",
  credits: `${plan.credits.toLocaleString()} credits / mo`,
  features: [
    `${plan.credits.toLocaleString()} credits every month`,
    "AI scriptwriting and video generation",
    "Full access to the timeline editor",
    "Secure billing and downloadable invoices",
    "Cancel any time",
  ],
}));

export function LandingPricing() {
  const reduce = useReducedMotion();

  return (
    <section id="pricing" className="relative overflow-hidden border-t border-white/[0.08] px-5 py-24 sm:px-8 sm:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-96 bg-[radial-gradient(ellipse_at_50%_0%,rgba(47,107,255,0.18),transparent_70%)]" />

      <div className="relative mx-auto max-w-6xl">
        <div className="mx-auto max-w-2xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
            <Sparkles className="size-3" /> Transparent Pricing
          </span>
          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Scale Your Video Production
          </h2>
          <p className="mt-4 text-[15px] text-zinc-400 sm:text-base">
            Simple, predictable plans. Start free and upgrade as your audience grows.
          </p>

          <p className="mt-7 text-xs font-medium text-zinc-400">Simple monthly plans · cancel any time</p>
        </div>

        {/* Pricing Cards */}
        <div className="mt-14 grid gap-6 md:grid-cols-3">
          {PLANS.map((plan, i) => {
            const price = plan.price;
            return (
              <motion.div
                key={plan.id}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: i * 0.08 }}
                className={cn(
                  "relative flex flex-col justify-between rounded-2xl border p-6 sm:p-8 backdrop-blur-xl transition-all duration-300",
                  plan.highlight
                    ? "border-blue-500/40 bg-[#12141c] shadow-[0_20px_50px_-10px_rgba(47,107,255,0.35)]"
                    : "border-white/[0.08] bg-[#0f0f12]/90 hover:border-white/15",
                )}
              >
                {plan.highlight && (
                  <BorderBeam size={280} duration={8} colorVariant="colorful" borderWidth={1.5} />
                )}

                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-display text-xl font-bold text-white">{plan.name}</h3>
                    {plan.highlight && (
                      <span className="rounded-full bg-gradient-to-r from-blue-500/20 to-indigo-500/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-blue-300 border border-blue-500/30">
                        Most Popular
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-zinc-400 leading-relaxed">{plan.description}</p>

                  <div className="mt-6 flex items-baseline gap-1">
                    <span className="font-display text-4xl font-bold text-white">${price}</span>
                    <span className="text-xs text-zinc-400">/ month</span>
                  </div>
                  <p className="mt-1 text-[11px] text-zinc-500">Billed monthly · cancel any time</p>

                  <div className="my-6 h-px bg-white/[0.08]" />

                  <span className="text-xs font-semibold text-zinc-300 uppercase tracking-wider">
                    {plan.credits}
                  </span>

                  <ul className="mt-4 space-y-2.5 text-xs text-zinc-300">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-center gap-2">
                        <Check className="size-4 shrink-0 text-blue-400" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Link
                  href="/studio"
                  className={cn(
                    "mt-8 inline-flex h-11 items-center justify-center rounded-full text-xs font-semibold transition-all duration-200",
                    plan.highlight
                      ? "bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg hover:brightness-110 hover:shadow-[0_0_24px_rgba(59,130,246,0.6)]"
                      : "border border-white/12 bg-white/[0.04] text-white hover:bg-white/[0.08]",
                  )}
                >
                  Get Started with {plan.name}
                </Link>
              </motion.div>
            );
          })}
        </div>

        <div className="mt-12 text-center text-xs text-zinc-500">
          Need custom enterprise pipelines, dedicated API quotas, or on-prem deployment?{" "}
          <a href="mailto:enterprise@skyclip.ai" className="text-blue-400 underline hover:text-blue-300">
            Talk to our engineering team
          </a>
          .
        </div>
      </div>
    </section>
  );
}
