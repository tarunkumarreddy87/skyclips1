"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeft,
  CreditCard,
  Palette,
  UserRound,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  { href: "/settings/billing", label: "Billing & Subscription", icon: CreditCard },
  { href: "/brand-profiles", label: "Channel profiles", icon: Palette },
  { href: "/settings/profile", label: "Profile", icon: UserRound },
] as const;

export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 md:px-6 lg:flex-row lg:gap-8 lg:py-6">
      <aside className="w-full shrink-0 lg:w-56">
        <nav className="flex flex-col gap-0.5 rounded-2xl border border-border bg-card p-2 shadow-sm">
          <Link
            href="/studio"
            className="mb-1 flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <ArrowLeft className="size-3.5" />
            Back to Studio
          </Link>
          {NAV.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/brand-profiles"
                ? pathname.startsWith("/brand-profiles")
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2.5 rounded-xl px-3 py-2 text-[13px] transition-colors",
                  active
                    ? "bg-accent font-medium text-accent-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <Icon className="size-4 shrink-0 opacity-80" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="min-w-0 flex-1 space-y-6">
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground">
            {title}
          </h1>
          {description ? (
            <p className="text-sm text-muted-foreground">{description}</p>
          ) : null}
        </header>
        {children}
      </div>
    </div>
  );
}
