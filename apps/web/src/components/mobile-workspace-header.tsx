"use client";

import Link from "next/link";
import { Menu, SquarePen } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { Button } from "@/components/ui/button";
import { useSidebar } from "@/components/ui/sidebar";

export function MobileWorkspaceHeader() {
  const { openMobile, toggleSidebar } = useSidebar();

  return (
    <header className="sticky top-0 z-20 flex min-h-14 shrink-0 items-center justify-between border-b border-border/60 bg-background/95 px-3 pt-[env(safe-area-inset-top)] backdrop-blur-xl md:hidden">
      <Button variant="ghost" size="icon" className="size-11" aria-label="Open navigation menu" aria-expanded={openMobile} aria-haspopup="dialog" onClick={toggleSidebar}>
        <Menu />
      </Button>
      <Link href="/studio" aria-label="SkyClip home" className="rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <BrandLogo variant="full" size={24} />
      </Link>
      <Link href="/studio" aria-label="New video" className="inline-flex size-11 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <SquarePen className="size-5" />
      </Link>
    </header>
  );
}
