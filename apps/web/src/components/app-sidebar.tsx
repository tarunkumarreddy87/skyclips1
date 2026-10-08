"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  FolderKanban,
  HelpCircle,
  Home,
  Palette,
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
import { projectThumbnailUrl } from "@/lib/project-thumbnail";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/auth-client";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";

const topNav = [
  { href: "/studio", label: "Home", icon: Home },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/brand-profiles", label: "Channel profiles", icon: Palette },
];

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
  const { state, isMobile, setOpenMobile } = useSidebar();
  const collapsed = !isMobile && state === "collapsed";
  useEffect(() => { setOpenMobile(false); }, [pathname, setOpenMobile]);
  const { data: session, isPending } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);

  useEffect(() => {
    if (isPending) return;
    if (!session?.user) { setProjects([]); return; }
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
  }, [pathname, session?.user?.id, isPending]);

  const grouped = useMemo(() => {
    const sorted = [...new Map(projects.map((p) => [p.id, p])).values()].sort(
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

      <SidebarContent onClick={(event) => {
        if (isMobile && (event.target as HTMLElement).closest("a[href]")) setOpenMobile(false);
      }} className={cn("gap-0 px-2 pb-2", collapsed ? "pt-2" : "pt-1.5")}>
        <nav className="flex flex-col gap-1.5">
          {collapsed ? <SidebarCollapsedLogoButton /> : null}
          <Link
            href="/studio"
            title="New video"
            className={cn(
              "flex h-11 items-center gap-2 rounded-lg px-2 text-[13px] text-sidebar-foreground/80 transition-colors md:h-8",
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
                  "flex h-11 items-center gap-3 rounded-lg px-2.5 text-[13px] transition-colors md:h-8",
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
          <div tabIndex={0} role="region" aria-label="Recent projects" className="sidebar-history-scroll mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto">
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
                          prefetch={false}
                          className={cn(
                            "flex items-center gap-2.5 rounded-xl px-2 py-1.5 transition-colors",
                            active
                              ? "bg-sidebar-accent text-sidebar-accent-foreground"
                              : "text-sidebar-foreground/60 hover:bg-sidebar-accent/50 hover:text-sidebar-foreground",
                          )}
                        >
                          <span className="relative flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted text-[10px] font-semibold text-muted-foreground ring-1 ring-sidebar-border">
                            {(p.title || "V").slice(0, 1).toUpperCase()}
                            {/* The same representative image used by the project list; the letter remains if it fails. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={projectThumbnailUrl(p.id, p.formatMode)}
                              alt=""
                              loading="lazy"
                              className="absolute inset-0 size-full object-cover"
                              onError={(event) => { event.currentTarget.style.display = "none"; }}
                            />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[12px] font-medium leading-tight text-sidebar-foreground">
                              {p.title || "Untitled"}
                            </span>
                            <span className="block truncate text-[10px] text-sidebar-foreground/50">
                              {formatShortDate(p.updatedAt || p.createdAt)}
                            </span>
                          </span>
                          <span className="shrink-0 rounded-full border border-sidebar-border px-1.5 py-0.5 text-[9px] font-medium capitalize text-sidebar-foreground/55">
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
              <p className="px-2.5 text-[11px] text-sidebar-foreground/50">
                No projects yet — create one from Home.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className={cn("mt-auto flex flex-col gap-0.5 pt-3", collapsed && "items-center")}>
          <Link
            href="/settings/profile"
            title="Settings"
            aria-label="Settings"
            className={cn(
              "flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] transition-colors group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0",
              pathname.startsWith("/settings")
                ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                : "text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground",
            )}
          >
            <Settings2 className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Settings</span>
          </Link>
          <Link
            href="/feedback"
            title="Help & feedback"
            aria-label="Help & feedback"
            className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-[13px] text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0"
          >
            <HelpCircle className="size-4 shrink-0" />
            <span className="group-data-[collapsible=icon]:hidden">Help & feedback</span>
          </Link>
        </div>
      </SidebarContent>

      <SidebarFooter className={cn("p-2", collapsed && "flex items-center justify-center")}>
        <SidebarAccountMenu collapsed={collapsed} />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}
