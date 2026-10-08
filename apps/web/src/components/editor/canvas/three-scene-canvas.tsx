"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ThreeScene } from "@hanuman/shared-types";
import type { createThreeRenderer } from "@hanuman/video-engine/three";

export function ThreeSceneCanvas({ scene, seconds }: { scene: ThreeScene; seconds: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const runtime = useRef<ReturnType<typeof createThreeRenderer> | null>(null);
  const time = useRef(seconds); time.current = seconds;
  const [error, setError] = useState("");
  const sceneKey = useMemo(() => JSON.stringify(scene), [scene]);
  useEffect(() => {
    let stopped = false;
    let resize: ResizeObserver | undefined;
    let instance: ReturnType<typeof createThreeRenderer> | undefined;
    setError("");
    const element = canvas.current!;
    const lost = () => setError("3D preview lost its graphics connection. Reload to restore it.");
    element.addEventListener("webglcontextlost", lost);
    void import("@hanuman/video-engine/three").then(async ({ createThreeRenderer }) => {
      if (stopped) return;
      instance = createThreeRenderer(element, JSON.parse(sceneKey), 960, 540);
      await instance.prepare();
      if (stopped) return;
      runtime.current = instance;
      const draw = () => {
        if (!instance || stopped) return;
        try {
          const rect = element.getBoundingClientRect();
          const ratio = Math.min(window.devicePixelRatio || 1, 2);
          instance.resize(Math.max(2, Math.round(rect.width * ratio)), Math.max(2, Math.round(rect.height * ratio)));
          instance.renderAt(time.current);
        } catch (cause) { setError(cause instanceof Error ? cause.message : "3D preview unavailable"); }
      };
      resize = new ResizeObserver(draw); resize.observe(element); draw();
    }).catch(cause => { if (!stopped) setError(cause instanceof Error ? cause.message : "3D preview unavailable"); });
    return () => { stopped = true; runtime.current = null; resize?.disconnect(); element.removeEventListener("webglcontextlost", lost); instance?.dispose(); };
  }, [sceneKey]);
  useEffect(() => { try { runtime.current?.renderAt(seconds); } catch (cause) { setError(String(cause)); } }, [seconds]);
  return <div className="relative h-full w-full"><canvas key={sceneKey} ref={canvas} aria-label="Three.js motion graphics" className="h-full w-full" />
    {error ? <div role="alert" className="absolute inset-0 flex items-center justify-center bg-black/90 p-6 text-center text-sm text-white">{error}</div> : null}</div>;
}
