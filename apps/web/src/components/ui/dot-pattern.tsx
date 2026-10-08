"use client";

import { useId, type SVGProps } from "react";
import { cn } from "@/lib/utils";

type DotPatternProps = SVGProps<SVGSVGElement> & {
  cx?: number; cy?: number; cr?: number;
};

export function DotPattern({ width = 24, height = 24, x = 0, y = 0, cx = 1, cy = .5, cr = .5, className, ...props }: DotPatternProps) {
  const id = useId();
  return (
    <svg aria-hidden="true" focusable="false" className={cn("pointer-events-none absolute inset-0 size-full fill-muted-foreground/40", className)} {...props}>
      <defs><pattern id={id} width={width} height={height} patternUnits="userSpaceOnUse" patternContentUnits="userSpaceOnUse" x={x} y={y}><circle cx={cx} cy={cy} r={cr} /></pattern></defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
