"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { AuthControls } from "@/components/auth/auth-controls";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND_MARK_SIZE } from "@/lib/brand";
import { cn } from "@/lib/utils";

const LINKS = [
  { href: "#features", label: "Features" },
  { href: "#how", label: "How it works" },
  { href: "#demo", label: "Demo" },
  { href: "#pricing", label: "Access" },
] as const;

export function LandingNav() {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex justify-center border-b border-neutral-200/70 bg-white/95 px-5 backdrop-blur-xl sm:px-8">
      <div
        className={cn(
          "flex h-[72px] w-full max-w-6xl items-center justify-between transition-shadow",
          scrolled && "shadow-[0_9px_20px_-20px_rgba(0,0,0,0.4)]",
        )}
      >
        <Link href="/" className="flex items-center gap-2 pr-2">
          <BrandLogo
            variant="full"
            size={BRAND_MARK_SIZE.landing}
            priority
            wordmarkClassName="text-lg font-bold tracking-tight text-black"
          />
        </Link>

        <nav
          className="hidden items-center gap-1 md:flex"
          aria-label="Main navigation"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              className="rounded-full px-3 py-2 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black"
            >
              {link.label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={mobileOpen ? "Close menu" : "Open menu"}
            aria-expanded={mobileOpen}
            aria-controls="landing-mobile-nav"
            onClick={() => setMobileOpen((open) => !open)}
            className="flex size-9 items-center justify-center rounded-full text-neutral-700 hover:bg-neutral-100 md:hidden"
          >
            {mobileOpen ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>
          <AuthControls variant="landing" />
        </div>
      </div>
      {mobileOpen ? (
        <nav
          id="landing-mobile-nav"
          aria-label="Mobile navigation"
          className="absolute inset-x-0 top-[72px] grid gap-1 border-b border-neutral-200 bg-white px-5 py-3 shadow-xl md:hidden"
        >
          {LINKS.map((link) => (
            <a
              key={link.href}
              href={link.href}
              onClick={() => setMobileOpen(false)}
              className="rounded-lg px-3 py-3 text-sm font-medium text-neutral-800 hover:bg-neutral-100"
            >
              {link.label}
            </a>
          ))}
        </nav>
      ) : null}
    </header>
  );
}
