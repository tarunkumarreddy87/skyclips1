"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, MoreHorizontal } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { PLAN_LABELS, refreshSubscriptionFromServer, useSubscription } from "@/lib/billing/subscription";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export function SidebarAccountMenu({ collapsed }: { collapsed?: boolean }) {
  const router = useRouter();
  const { data: session } = useSession();
  const { planId, isSubscribed } = useSubscription();

  useEffect(() => {
    if (session?.user) void refreshSubscriptionFromServer();
  }, [session?.user?.id]);

  const user = session?.user;
  const initials = (user?.name || user?.email || "SC")
    .split(/\s+/)
    .map((p) => p[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Account"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors",
              "hover:bg-sidebar-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
              collapsed && "justify-center p-0",
            )}
          />
        }
      >
        <Avatar className="size-8">
          {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initials}
          </AvatarFallback>
        </Avatar>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-sidebar-foreground">
                {user?.name || "SkyClip"}
              </p>
              <p className="truncate text-[10px] text-sidebar-foreground/45">
                {isSubscribed ? `${PLAN_LABELS[planId]} plan` : "Free plan"}
              </p>
            </div>
            <MoreHorizontal className="size-4 shrink-0 text-sidebar-foreground/40" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuItem onClick={() => router.push("/settings/profile")}>
            Profile
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings/billing")}>
            {isSubscribed ? "Billing" : "Upgrade plan"}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => router.push("/settings/notifications")}>
            Notifications
          </DropdownMenuItem>
        </DropdownMenuGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => toast.message("Credits UI is preview-only")}>
          Credit balance
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={() =>
            toast.message("Teams coming soon", {
              description: "Multi-workspace ships with billing.",
            })
          }
        >
          My Workspace
          <ChevronDown className="ml-auto size-3.5 opacity-50" />
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {user ? (
          <DropdownMenuItem
            onClick={() => {
              void signOut().then(() => router.push("/sign-in"));
            }}
          >
            Sign out
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem onClick={() => router.push("/sign-in")}>Sign in</DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
