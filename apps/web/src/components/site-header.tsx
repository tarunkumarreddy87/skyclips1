"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeToggle } from "@/components/shell/theme-toggle";
import { useSubscription } from "@/lib/billing/subscription";
import { cn } from "@/lib/utils";

const planPill =
  "inline-flex h-7 items-center gap-1.5 rounded-full border border-border/80 bg-card/90 px-3 text-[12px] text-muted-foreground shadow-[inset_0_1px_0_rgba(255,255,255,0.04)] transition-colors hover:border-border hover:text-foreground dark:border-white/[0.08] dark:bg-[#1c1c1c]/95 dark:hover:border-white/[0.14] dark:hover:text-zinc-300";

function pageMeta(pathname: string): { backHref: string; backLabel: string } | null {
  if (pathname === "/studio" || pathname === "/create") return null;
  if (pathname.startsWith("/settings")) {
    return { backHref: "/studio", backLabel: "Back to Studio" };
  }
  if (pathname.startsWith("/brand-profiles")) {
    return { backHref: "/studio", backLabel: "Back to Studio" };
  }
  if (pathname.startsWith("/projects/") && pathname.includes("/queue")) {
    return { backHref: "/projects", backLabel: "Back to Projects" };
  }
  if (pathname.startsWith("/projects/") && pathname.includes("/quote")) {
    return { backHref: "/projects", backLabel: "Back to Projects" };
  }
  if (pathname.startsWith("/projects/") && pathname.includes("/publish")) {
    return { backHref: "/projects", backLabel: "Back to Projects" };
  }
  if (pathname.startsWith("/projects/") && pathname.includes("/video")) {
    return { backHref: "/projects", backLabel: "Back to Projects" };
  }
  if (pathname.startsWith("/projects")) {
    return { backHref: "/studio", backLabel: "Back to Studio" };
  }
  if (pathname.startsWith("/schedule")) {
    return { backHref: "/studio", backLabel: "Back to Studio" };
  }
  if (pathname.startsWith("/docs") || pathname.startsWith("/feedback")) {
    return { backHref: "/studio", backLabel: "Back to Studio" };
  }
  return { backHref: "/studio", backLabel: "Back to Studio" };
}

/** @deprecated Unused — workspace is headerless (ChatGPT-plane). Upgrade lives in sidebar account menu. */
export function SiteHeader({ className }: { className?: string }) {
  const pathname = usePathname();
  const back = pageMeta(pathname);
  const isStudio = pathname === "/studio" || pathname === "/create";
  const showUpgradePill = pathname === "/studio";
  const { isSubscribed } = useSubscription();

  return (
    <header
      className={cn(
        "relative flex h-12 shrink-0 items-center border-b border-border/40 bg-background",
        className,
      )}
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-x-8 top-0 h-12 bg-[radial-gradient(ellipse_at_50%_0%,rgba(59,130,246,0.06),transparent_70%)]"
        aria-hidden
      />

      <div className="flex w-full items-center px-3 md:px-4">
        <div className="flex min-w-0 flex-1 items-center gap-1">
          <SidebarTrigger className="text-muted-foreground hover:text-foreground md:hidden" />
          {back ? (
            <Link
              href={back.backHref}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="size-3.5 shrink-0" />
              <span className="hidden sm:inline">{back.backLabel}</span>
              <span className="sm:hidden">Back</span>
            </Link>
          ) : (
            <span className="hidden w-10 md:block" aria-hidden />
          )}
        </div>

        <div className="flex shrink-0 justify-center">
          {!isSubscribed && showUpgradePill ? (
            <Link href="/settings/billing" className={planPill}>
              <span>Free plan</span>
              <span className="opacity-50">·</span>
              <span className="font-medium text-foreground">Upgrade</span>
            </Link>
          ) : (
            <span className="hidden h-7 sm:block" aria-hidden />
          )}
        </div>

        <div className="flex min-w-0 flex-1 items-center justify-end">
          {isStudio ? <ThemeToggle /> : <span className="size-8" aria-hidden />}
        </div>
      </div>
    </header>
  );
}
