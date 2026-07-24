"use client";

import { useEffect, useState, type RefObject } from "react";

export type StageSize = { width: number; height: number };

/**
 * Fit a fixed aspect ratio (default 16:9) inside a container without
 * CSS aspect-ratio + max-height bugs that squash the preview stage.
 */
export function useFitStageSize(
  containerRef: RefObject<HTMLElement | null>,
  aspect = 16 / 9,
  paddingPx = 0,
): StageSize {
  const [size, setSize] = useState<StageSize>({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const measure = () => {
      const el = containerRef.current;
      if (!el) return;
      const style = window.getComputedStyle(el);
      const padX =
        (Number.parseFloat(style.paddingLeft) || 0) + (Number.parseFloat(style.paddingRight) || 0);
      const padY =
        (Number.parseFloat(style.paddingTop) || 0) + (Number.parseFloat(style.paddingBottom) || 0);
      const availW = Math.max(0, el.clientWidth - padX - paddingPx * 2);
      const availH = Math.max(0, el.clientHeight - padY - paddingPx * 2);
      if (availW < 2 || availH < 2) {
        setSize({ width: 0, height: 0 });
        return;
      }
      let width = availW;
      let height = width / aspect;
      if (height > availH) {
        height = availH;
        width = height * aspect;
      }
      setSize({
        width: Math.floor(width),
        height: Math.floor(height),
      });
    };

    measure();
    // ResizeObserver already fires on viewport/layout changes that affect the
    // element's box; adding a window resize listener caused a redundant second
    // measure + render per resize event.
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => {
      ro.disconnect();
    };
  }, [aspect, containerRef, paddingPx]);

  return size;
}
