"use client";

import { useEffect, useState } from "react";

/**
 * Tracks viewport width against Tailwind's standard breakpoints.
 * Defaults to desktop (false) on first render to avoid SSR/hydration mismatch,
 * then corrects on mount.
 */
export function useIsMobile(breakpointPx = 768): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < breakpointPx);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, [breakpointPx]);
  return isMobile;
}

/**
 * Tablet-or-smaller. The editor's true usable desktop width is ~1280px — below that
 * the agent dock (360px) + timeline transport (~414px) + tools can't all fit, so the
 * dock must collapse to an overlay below this threshold. We keep the param available
 * in case a caller wants a different breakpoint.
 */
export function useIsTablet(): boolean {
  const [isTablet, setIsTablet] = useState(false);
  useEffect(() => {
    const check = () => setIsTablet(window.innerWidth < 1280);
    check();
    window.addEventListener("resize", check);
    return () => window.removeEventListener("resize", check);
  }, []);
  return isTablet;
}
