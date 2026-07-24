"use client";

import { ThemeToggle } from "@/components/shell/theme-toggle";

/** Studio chrome: theme only — auth lives in the sidebar account menu. */
export function StudioTopBar() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-center justify-end px-4 pt-4 md:px-6">
      <div className="pointer-events-auto">
        <ThemeToggle />
      </div>
    </div>
  );
}
