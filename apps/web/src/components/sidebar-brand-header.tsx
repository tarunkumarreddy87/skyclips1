"use client";

import Link from "next/link";
import { PanelLeft } from "lucide-react";
import { BrandLogo } from "@/components/brand-logo";
import { BRAND_MARK_SIZE, PRODUCT_NAME } from "@/lib/brand";
import { SidebarHeader, useSidebar } from "@/components/ui/sidebar";
import { cn } from "@/lib/utils";

/**
 * Expanded: mark + wordmark + collapse toggle (flex items-center gap-2).
 * Collapsed: logo lives in AppSidebar nav rail (same gap as other icons).
 */
export function SidebarBrandHeader() {
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  if (collapsed) {
    return null;
  }

  return (
    <SidebarHeader className="relative overflow-hidden px-2 pb-0 pt-2">
      <div className="flex items-center gap-2">
        <Link
          href="/studio"
          title={PRODUCT_NAME}
          className={cn(
            "inline-flex min-h-8 items-center rounded-lg px-1 py-0.5 transition-colors",
            "hover:bg-sidebar-accent",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
          )}
        >
          <BrandLogo variant="full" size={BRAND_MARK_SIZE.sidebar} priority />
        </Link>
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Collapse sidebar"
          className={cn(
            "ml-auto inline-flex size-8 shrink-0 items-center justify-center rounded-lg text-sidebar-foreground/55",
            "transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
          )}
        >
          <PanelLeft className="size-4" />
        </button>
      </div>
    </SidebarHeader>
  );
}

/** Collapsed-rail logo control — first item in the shared nav flex-col. */
export function SidebarCollapsedLogoButton() {
  const { toggleSidebar } = useSidebar();

  return (
    <button
      type="button"
      title="Expand sidebar"
      aria-label="Expand sidebar"
      onClick={toggleSidebar}
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-lg transition-colors",
        "hover:bg-sidebar-accent",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
      )}
    >
      <BrandLogo variant="icon" size={BRAND_MARK_SIZE.sidebarCollapsed} priority />
    </button>
  );
}
