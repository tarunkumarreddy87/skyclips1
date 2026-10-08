"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useSession, signOut } from "@/lib/auth-client";
import { PLAN_LABELS, refreshSubscriptionFromServer, useSubscription } from "@/lib/billing/subscription";
import { planRingClass } from "@/lib/billing/plans";
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
  const { data: session, isPending } = useSession();
  const signingOut = useRef(false);
  const [isSigningOut, setIsSigningOut] = useState(false);
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

  if (isPending) {
    return <div role="status" aria-label="Loading account" className="h-10 rounded-lg bg-sidebar-accent/50" />;
  }

  async function handleSignOut() {
    if (signingOut.current) return;
    signingOut.current = true;
    setIsSigningOut(true);
    try {
      await signOut();
      // A full navigation also discards user-specific in-memory stores.
      window.location.replace("/");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out. Please try again.");
      signingOut.current = false;
      setIsSigningOut(false);
    }
  }

  return (
    <DropdownMenu modal={false} onOpenChange={open => { if (open) { router.prefetch("/settings/profile"); router.prefetch("/settings/billing"); } }}>
      <DropdownMenuTrigger
        render={
          <button
            type="button"
            title="Account"
            aria-label="Account"
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg p-1.5 text-left transition-colors",
              "hover:bg-sidebar-accent",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/50",
              collapsed && "size-8 justify-center p-0",
            )}
          />
        }
      >
        <span className={cn("relative grid size-9 shrink-0 place-items-center rounded-full p-[2px] transition-all duration-500", isSubscribed && planRingClass(planId), collapsed && "size-8")}>
          <Avatar className="size-full border-2 border-sidebar bg-sidebar">
            {user?.image ? <AvatarImage src={user.image} alt="" /> : null}
            <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
              {initials}
            </AvatarFallback>
          </Avatar>
          {isSubscribed ? <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-sidebar bg-emerald-400" aria-label={`${PLAN_LABELS[planId]} subscription active`} /> : null}
        </span>
        {!collapsed ? (
          <>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-sidebar-foreground">
                {user?.name || user?.email || "Sign in"}
              </p>
              <p className="truncate text-[10px] text-sidebar-foreground/45">
                {!user ? "Your account" : isSubscribed ? `${PLAN_LABELS[planId]} plan` : "Free plan"}
              </p>
            </div>
            <ChevronDown className="size-4 shrink-0 text-sidebar-foreground/40" />
          </>
        ) : null}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" side="top" className="w-52">
        {user ? <DropdownMenuGroup>
          <DropdownMenuItem asChild><Link href="/settings/profile">Profile</Link></DropdownMenuItem>
          <DropdownMenuItem asChild><Link href="/settings/billing">{isSubscribed ? "Billing" : "Upgrade plan"}</Link></DropdownMenuItem>
        </DropdownMenuGroup> : null}
        {user ? <DropdownMenuSeparator /> : null}
        {user ? (
          <DropdownMenuItem
            disabled={isSigningOut}
            onSelect={event => { event.preventDefault(); void handleSignOut(); }}
          >
            {isSigningOut ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        ) : (
          <DropdownMenuItem asChild><Link href="/sign-in">Sign in</Link></DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
