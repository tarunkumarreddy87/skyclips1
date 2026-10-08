"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession } from "@/lib/auth-client";
import { isProtectedRoute } from "@/lib/auth-routes";

/** UI lifecycle guard; server middleware/API still enforce authorization. */
export function ProtectedSession({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data, isPending } = useSession();
  const redirecting = useRef(false);
  const wasSignedIn = useRef(false);
  const protectedPage = isProtectedRoute(pathname);
  useEffect(() => {
    if (data) wasSignedIn.current = true;
    if (protectedPage && !isPending && !data && !redirecting.current) {
      redirecting.current = true;
      // Discard router caches and unmount private UI, including in other logout tabs.
      window.location.replace(wasSignedIn.current ? "/" : "/sign-in?next=" + encodeURIComponent(pathname));
    }
  }, [protectedPage, pathname, data, isPending]);
  if (protectedPage && (isPending || !data)) {
    return <main className="flex min-h-svh items-center justify-center" role="status">
      {isPending ? "Checking your session…" : "Redirecting to sign in…"}
    </main>;
  }
  return children;
}
