"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BookOpen,
  CalendarClock,
  FolderKanban,
  MessageSquare,
  Settings,
} from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/schedule", label: "Auto Schedule", icon: CalendarClock },
  { href: "/feedback", label: "Feedback", icon: MessageSquare },
  { href: "/docs", label: "Documentation", icon: BookOpen },
];

const externalItems = [
  { href: "https://discord.com", label: "Join Discord", icon: MessageSquare, external: true },
];

export function AppSidebar() {
  const pathname = usePathname();

  return (
    <aside className="flex h-full w-[240px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex h-14 items-center gap-2 border-b border-sidebar-border px-4">
        <Link href="/studio" className="flex items-center gap-2 font-semibold tracking-tight">
          <BrandLogo variant="full" size={24} priority />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-3">
        {navItems.map((item) => {
          const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                  : "text-sidebar-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {item.label}
            </Link>
          );
        })}

        <div className="my-2 h-px bg-sidebar-border" />

        {externalItems.map((item) => {
          const Icon = item.icon;
          return (
            <a
              key={item.href}
              href={item.href}
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-sidebar-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
            >
              <Icon className="h-4 w-4 shrink-0 opacity-80" />
              {item.label}
            </a>
          );
        })}

        <div className="mt-auto">
          <Link
            href="/settings"
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors",
              pathname === "/settings"
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground hover:bg-sidebar-accent/60",
            )}
          >
            <Settings className="h-4 w-4 shrink-0 opacity-80" />
            Settings
          </Link>
        </div>
      </nav>
    </aside>
  );
}
