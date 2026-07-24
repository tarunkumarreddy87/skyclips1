"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "starter",
    name: "Starter",
    price: "$49",
    period: "/ mo",
    yearly: "$490 / year",
    credits: "1,200 credits / year",
    ai: "Standard AI",
    highlight: false,
  },
  {
    id: "creator",
    name: "Creator",
    price: "$239",
    period: "/ mo",
    yearly: "$2,390 / year",
    credits: "6,000 credits / year",
    ai: "Priority AI",
    highlight: true,
  },
  {
    id: "pro",
    name: "Pro",
    price: "$479",
    period: "/ mo",
    yearly: "$4,790 / year",
    credits: "15,000 credits / year",
    ai: "Priority AI",
    highlight: false,
  },
  {
    id: "scale",
    name: "Scale",
    price: "$959",
    period: "/ mo",
    yearly: "$9,590 / year",
    credits: "40,000 credits / year",
    ai: "Dedicated AI",
    highlight: false,
  },
] as const;

export function LandingPricing() {
  const reduce = useReducedMotion();

  return (
    <section id="pricing" className="border-t border-white/6 px-5 py-20 sm:px-8 sm:py-28">
      <div className="mx-auto max-w-6xl">
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
          className="mx-auto max-w-2xl text-center"
        >
          <p className="text-[13px] font-medium text-[#6b9bff]">Pricing</p>
          <h2 className="mt-3 font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            Plans that scale with your channel
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/50">
            Yearly billing shown — monthly equivalent included. Upgrade anytime from Settings →
            Billing.
          </p>
        </motion.div>

        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {PLANS.map((plan, i) => (
            <motion.div
              key={plan.id}
              initial={reduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.06 }}
              className={cn(
                "flex flex-col rounded-2xl border p-5",
                plan.highlight
                  ? "border-[#2f6bff]/50 bg-gradient-to-b from-[#2f6bff]/10 to-transparent shadow-[0_0_40px_-12px_rgba(47,107,255,0.45)]"
                  : "border-white/10 bg-white/[0.03]",
              )}
            >
              {plan.highlight ? (
                <span className="mb-3 w-fit rounded-full bg-[#2f6bff]/20 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-[#9cbcff]">
                  Most popular
                </span>
              ) : (
                <span className="mb-3 h-5" aria-hidden />
              )}
              <h3 className="font-display text-lg font-semibold text-white">{plan.name}</h3>
              <p className="mt-2 flex items-baseline gap-1">
                <span className="font-display text-3xl font-semibold text-white">{plan.price}</span>
                <span className="text-sm text-white/45">{plan.period}</span>
              </p>
              <p className="mt-1 text-xs text-white/40">{plan.yearly}</p>
              <ul className="mt-5 flex-1 space-y-2 text-sm text-white/60">
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#6b9bff]" />
                  {plan.credits}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#6b9bff]" />
                  {plan.ai}
                </li>
                <li className="flex items-start gap-2">
                  <Check className="mt-0.5 size-4 shrink-0 text-[#6b9bff]" />
                  1080p Remotion export
                </li>
              </ul>
              <Link
                href="/settings/billing"
                className={cn(
                  "mt-6 inline-flex h-10 items-center justify-center rounded-full text-sm font-semibold transition-opacity hover:opacity-95",
                  plan.highlight
                    ? "bg-[#2f6bff] text-white"
                    : "border border-white/12 bg-white/[0.04] text-white",
                )}
              >
                Get {plan.name}
              </Link>
            </motion.div>
          ))}
        </div>

        <p className="mt-8 text-center text-sm text-white/40">
          Need a studio team or unlimited credits?{" "}
          <a href="mailto:hello@skyclip.ai" className="text-[#6b9bff] hover:underline">
            Contact us
          </a>{" "}
          for custom pricing.
        </p>
      </div>
    </section>
  );
}
