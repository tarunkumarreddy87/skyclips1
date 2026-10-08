"use client";

import { createContext, useContext, useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const SceneClock = createContext(0);
export const useCurrentFrame = () => useContext(SceneClock);
export const useVideoConfig = () => ({ fps: 30, width: 800, height: 450 });
export function AbsoluteFill({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ position: "absolute", inset: 0, ...style }}>{children}</div>;
}
export function ShowcaseScene({ children, stopped, width, height }: { children: ReactNode; stopped: boolean; width: number; height: number }) {
  const [frame, setFrame] = useState(stopped ? 110 : 0);
  const [scale, setScale] = useState(1);
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const observer = new ResizeObserver(() => setScale(element.clientWidth / width));
    observer.observe(element);
    setScale(element.clientWidth / width);
    return () => observer.disconnect();
  }, [width]);
  useEffect(() => {
    if (stopped) return;
    let request = 0;
    const start = performance.now();
    const initial = frame;
    const tick = (now: number) => { setFrame((initial + (now - start) * .03) % 210); request = requestAnimationFrame(tick); };
    request = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(request);
    // The clock resumes from the frame at the moment its playback state changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stopped]);
  return <div ref={host} style={{ position: "relative", width: "100%", aspectRatio: `${width}/${height}`, overflow: "hidden" }}>
    <SceneClock.Provider value={frame}><div style={{ width, height, position: "absolute", transformOrigin: "0 0", transform: `scale(${scale})` }}>{children}</div></SceneClock.Provider>
  </div>;
}

type Curve = (t: number) => number;
export const Easing = {
  quad: (t: number) => t * t,
  cubic: (t: number) => t * t * t,
  in: (curve: Curve) => curve,
  out: (curve: Curve) => (t: number) => 1 - curve(1 - t),
  inOut: (curve: Curve) => (t: number) => t < .5 ? curve(t * 2) / 2 : 1 - curve((1 - t) * 2) / 2,
  bezier: (x1: number, y1: number, x2: number, y2: number) => (t: number) => {
    const at = (v: number, p1: number, p2: number) => 3 * (1 - v) ** 2 * v * p1 + 3 * (1 - v) * v ** 2 * p2 + v ** 3;
    let low = 0, high = 1;
    for (let i = 0; i < 20; i++) { const mid = (low + high) / 2; if (at(mid, x1, x2) < t) low = mid; else high = mid; }
    return at((low + high) / 2, y1, y2);
  },
};
export function interpolate(value: number, input: number[], output: number[], options?: { easing?: Curve; extrapolateLeft?: string; extrapolateRight?: string }): number {
  let index = 0;
  while (index < input.length - 2 && value > input[index + 1]) index++;
  let progress = (value - input[index]) / (input[index + 1] - input[index]);
  if (options?.extrapolateLeft === "clamp" && value < input[0]) progress = 0;
  if (options?.extrapolateRight === "clamp" && value > input[input.length - 1]) progress = 1;
  return output[index] + (output[index + 1] - output[index]) * (options?.easing?.(progress) ?? progress);
}
