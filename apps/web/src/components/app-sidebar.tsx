"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FolderKanban,
  HelpCircle,
  Home,
  LogOut,
  MessageSquare,
  Settings2,
  SquarePen,
} from "lucide-react";
import { SidebarAccountMenu } from "@/components/auth/sidebar-account-menu";
import {
  SidebarBrandHeader,
  SidebarCollapsedLogoButton,
} from "@/components/sidebar-brand-header";
import { listProjects } from "@/lib/api-client";
import type { Project } from "@hanuman/shared-types";
import { projectHref } from "@/lib/project-routes";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const topNav = [
  { href: "/studio", label: "Home", icon: Home },
  { href: "/settings", label: "Setting", icon: Settings2 },
  { href: "/projects", label: "Projects", icon: FolderKanban },
];

function AuthSidebarAction({ collapsed }: { collapsed: boolean }) {
  void collapsed;
  const { data: session } = useSession();
  const btn =
    "flex items-center gap-3 rounded-xl px-2.5 py-2 text-left text-[13px] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0";

  if (session?.user) {
    return (
      <button type="button" className={btn} onClick={() => void signOut()}>
        <LogOut className="size-4 shrink-0" />
        <span className="group-data-[collapsible=icon]:hidden">Log out</span>
      </button>
    );
  }

  return (
    <Link href="/sign-in" className={btn} title="Sign in">
      <LogOut className="size-4 shrink-0" />
      <span className="group-data-[collapsible=icon]:hidden">Sign in</span>
    </Link>
  );
}

function monthLabel(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "Recent";
  return d.toLocaleString(undefined, { month: "long" });
}

function formatShortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function statusBadge(status: string): string {
  if (status === "draft" || status === "quoted") return "Draft";
  if (status === "completed") return "Ready";
  if (status === "failed") return "Failed";
  if (status === "running" || status === "queued") return "Running";
  return status.replace(/_/g, " ");
}

export function AppSidebar({ ...props }: React.ComponentProps<typeof Sidebar>) {
  const pathname = usePathname();
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    let cancelled = false;
    void listProjects()
      .then((res) => {
        if (!cancelled) setProjects(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setProjects([]);
      });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  const grouped = useMemo(() => {
    const sorted = [...projects].sort(
      (a, b) =>
        new Date(b.updatedAt || b.createdAt).getTime() -
        new Date(a.updatedAt || a.createdAt).getTime(),
    );
    const map = new Map<string, Project[]>();
    for (const p of sorted.slice(0, 24)) {
      const key = monthLabel(p.updatedAt || p.createdAt);
      const list = map.get(key) ?? [];
      list.push(p);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [projects]);

  return (
    <Sidebar
      collapsible="icon"
      {...props}
      className={cn(
        "border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
        props.className,
      )}
    >
      <SidebarBrandHeader />

      <SidebarContent className={cn("gap-0 px-2 pb-2", collapsed ? "pt-2" : "pt-1.5")}>
        <nav className="flex flex-col gap-1.5">
          {collapsed ? <SidebarCollapsedLogoButton /> : null}
          <Link
            href="/studio"
            title="New video"
            className={cn(
              "flex h-8 items-center gap-2 rounded-lg px-2 text-[13px] text-sidebar-foreground/80 transition-colors",
              "hover:bg-sidebar-accent hover:text-sidebar-foreground",
              collapsed && "size-8 justify-center p-0",
            )}
          >
            <SquarePen className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">New video</span>
          </Link>
          {topNav.map((item) => {
            const Icon = item.icon;
            const active =
              item.href === "/studio"
                ? pathname === "/studio" || pathname === "/create"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                title={item.label}
                className={cn(
                  "flex h-8 items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors",
                  active
                    ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                  collapsed && "size-8 justify-center p-0",
                )}
              >
                <Icon className="size-4 shrink-0 opacity-90" />
                <span className="group-data-[collapsible=icon]:hidden">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        {!collapsed ? (
          <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
            {grouped.map(([month, items]) => (
              <div key={month}>
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.14em] text-sidebar-foreground/40">
                  {month}
                </p>
                <ul className="flex flex-col gap-0.5">
                  {items.map((p) => {
                    const href = projectHref(p.status, p.id);
                    const active = pathname.includes(p.id);
                    return (
                      <li key={p.id}>
                        <Link
                          href={href}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                          )}
                        >
                          <span className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-gradient-to-br from-zinc-700 to-zinc-900 text-[10px] font-semibold text-zinc-300 ring-1 ring-white/10">
                            {(p.title || "V").slice(0, 1).toUpperCase()}
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium leading-tight text-zinc-200">
                              {p.title || "Untitled"}
                            </span>
                            <span className="block truncate text-[10px] text-zinc-600">
                              {formatShortDate(p.updatedAt || p.createdAt)}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-0.5 text-[9px] font-medium capitalize text-zinc-500">
                            {statusBadge(p.status)}
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {projects.length === 0 ? (
              <p className="px-2.5 text-[11px] text-zinc-600">
                No projects yet — create one from Home.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={cn("mt-auto flex flex-col gap-0.5 pt-3", collapsed && "items-center")}>
          <Link
            href="/feedback"
            className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <HelpCircle className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Support</span>
          </Link>
          <Link
            href="/feedback"
            className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] text-zinc-400 hover:bg-white/[0.05] hover:text-zinc-100 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <MessageSquare className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Feedback</span>
          </Link>
          <AuthSidebarAction collapsed={collapsed} />
        </div>
      </SidebarContent>

      <SidebarFooter className="p-2">
        <SidebarAccountMenu />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
