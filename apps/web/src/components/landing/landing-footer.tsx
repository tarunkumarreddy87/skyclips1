"use client";

import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND_MARK_SIZE, PRODUCT_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";

export function LandingFooter() {
  return (
    <footer className="relative overflow-hidden border-t border-white/6">
      <div className="landing-ambient opacity-50" aria-hidden>
        <div className="landing-blob landing-blob-amber !top-auto !bottom-[-20%] !left-[-10%]" />
        <div className="landing-blob landing-blob-blue !top-auto !right-[-10%] !bottom-[-30%]" />
        <div className="landing-noise" />
      </div>

      <div className="relative mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.1fr_0.7fr_1fr]">
          <div>
            <div className="flex items-center">
              <BrandLogo
                variant="full"
                size={BRAND_MARK_SIZE.landingFooter}
                wordmarkClassName="text-[15px] font-semibold text-white"
              />
            </div>
            <p className="mt-4 max-w-sm font-display text-2xl font-semibold leading-snug tracking-tight text-white sm:text-3xl">
              The AI studio for long-form video production.
            </p>
            <Link
              href="/studio"
              className={cn(
                "mt-6 inline-flex h-11 items-center gap-1.5 rounded-full bg-white px-5 text-sm font-semibold text-black",
                "transition-opacity hover:opacity-90",
              )}
            >
              Get started
              <span aria-hidden>›</span>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-8 text-sm text-white/45">
            <div className="space-y-3">
              <Link href="/studio" className="block hover:text-white">
                Studio
              </Link>
              <Link href="/projects" className="block hover:text-white">
                Projects
              </Link>
              <Link href="/docs" className="block hover:text-white">
                Docs
              </Link>
            </div>
            <div className="space-y-3">
              <a href="#faq" className="block hover:text-white">
                FAQ
              </a>
              <a href="#proof" className="block hover:text-white">
                Proof
              </a>
              <Link href="/feedback" className="block hover:text-white">
                Feedback
              </Link>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-white">Stay in the loop</p>
            <p className="mt-2 text-sm text-white/40">
              Product notes on pipeline quality, editor agent, and formats.
            </p>
            <form
              className="mt-4 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
              }}
            >
              <input
                type="email"
                placeholder="name@email.com"
                className="h-11 flex-1 rounded-full border border-white/10 bg-white/5 px-4 text-sm text-white outline-none placeholder:text-white/30 focus:border-[#2f6bff]/50"
              />
              <button
                type="submit"
                className="h-11 shrink-0 rounded-full bg-[#2f6bff] px-4 text-sm font-semibold text-white transition-opacity hover:opacity-95"
              >
                Subscribe
              </button>
            </form>
          </div>
        </div>

        <p
          className="landing-chromatic pointer-events-none mt-20 select-none text-center font-display text-[clamp(3.5rem,16vw,9rem)] font-semibold leading-none tracking-tight"
          aria-hidden
        >
          {PRODUCT_NAME}
        </p>

        <p className="mt-8 text-center text-[12px] text-white/30">
          © {new Date().getFullYear()} {PRODUCT_NAME}. Prompt-native video production.
        </p>
      </div>
    </footer>
  );
}
