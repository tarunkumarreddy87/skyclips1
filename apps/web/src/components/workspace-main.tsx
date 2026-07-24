"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/** Path-aware main padding — studio is a full canvas; other pages share workspace chrome. */
export function WorkspaceMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStudio = pathname === "/studio" || pathname === "/create";
  const isFullBleed =
    isStudio ||
    pathname.startsWith("/settings") ||
    pathname.startsWith("/brand-profiles") ||
    pathname.startsWith("/projects");

  return (
    <div className="flex flex-1 flex-col bg-background text-foreground">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div
          className={cn(
            "flex flex-1 flex-col",
            isFullBleed ? "gap-0 p-0" : "gap-4 px-4 pb-6 pt-2 md:gap-6 md:px-6",
          )}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
