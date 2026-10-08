"use client";
import { DotPattern } from "./dot-pattern";
export function DotPatternDemo() {
  return <div className="relative flex h-[500px] items-center justify-center overflow-hidden rounded-lg border bg-background"><p className="relative text-5xl font-medium tracking-tighter">Dot Pattern</p><DotPattern cx={1} cy={1} cr={1} className="[mask-image:radial-gradient(400px_circle_at_center,white,transparent)]" /></div>;
}
