"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { useSession, signOut } from "@/lib/auth-client";
import { cn } from "@/lib/utils";

type AuthControlsProps = {
  className?: string;
  variant?: "landing" | "default";
};

export function AuthControls({
  className,
  variant = "default",
}: AuthControlsProps) {
  const { data: session, isPending } = useSession();
  const busy = useRef(false);
  const [signingOut, setSigningOut] = useState(false);

  async function handleSignOut() {
    if (busy.current) return;
    busy.current = true;
    setSigningOut(true);
    try {
      await signOut();
      window.location.replace("/");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Could not sign out. Please try again.",
      );
      busy.current = false;
      setSigningOut(false);
    }
  }

  const signInClass =
    variant === "landing"
      ? "hidden h-9 items-center rounded-full px-3.5 text-[13px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-black sm:inline-flex"
      : "inline-flex h-8 items-center rounded-lg px-3 text-[13px] font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground";

  const signUpClass =
    variant === "landing"
      ? cn(
          "inline-flex h-9 items-center gap-1.5 rounded-full bg-black px-4 text-[13px] font-semibold text-white",
          "transition-[transform,background-color] hover:bg-neutral-800 active:scale-[0.98]",
        )
      : "inline-flex h-8 items-center rounded-lg bg-primary px-3 text-[13px] font-semibold text-primary-foreground hover:bg-primary/90";

  if (isPending) {
    return (
      <div
        className={cn(
          "h-9 w-24 animate-pulse rounded-full bg-white/10",
          className,
        )}
      />
    );
  }

  if (session?.user) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <button
          type="button"
          disabled={signingOut}
          onClick={() => void handleSignOut()}
          className={signInClass}
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>
        <Link href="/studio" className={signUpClass}>
          Studio
        </Link>
      </div>
    );
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Link href="/sign-in" className={signInClass}>
        Sign in
      </Link>
      <Link href="/sign-up" className={signUpClass}>
        Sign up
        {variant === "landing" ? <span aria-hidden>›</span> : null}
      </Link>
    </div>
  );
}
