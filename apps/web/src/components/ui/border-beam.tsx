"use client";

import React from "react";
import { cn } from "@/lib/utils";

export type BorderBeamSize = "sm" | "md" | "lg" | number;
export type BorderBeamTheme = "light" | "dark";
export type BorderBeamColorVariant =
  | "default"
  | "colorful"
  | "monochrome"
  | "rainbow"
  | "brand"
  | string;

export interface BorderBeamProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Additional CSS class names */
  className?: string;
  /** Size preset ('sm', 'md', 'lg') or numeric pixel width of the glowing beam */
  size?: BorderBeamSize;
  /** Animation duration in seconds (default: 12) */
  duration?: number;
  /** Border stroke width in pixels (default: 1.5) */
  borderWidth?: number;
  /** Anchor point offset percentage (default: 90) */
  anchor?: number;
  /** Start gradient color */
  colorFrom?: string;
  /** End gradient color */
  colorTo?: string;
  /** Initial animation delay in seconds */
  delay?: number;
  /** Theme mode ('light' | 'dark') */
  theme?: BorderBeamTheme;
  /** Color preset variant */
  colorVariant?: BorderBeamColorVariant;
  /** Optional children if BorderBeam is used as a wrapper container */
  children?: React.ReactNode;
}

export function BorderBeam({
  className,
  size = "md",
  duration = 12,
  borderWidth = 1.5,
  anchor = 90,
  colorFrom,
  colorTo,
  delay = 0,
  theme = "dark",
  colorVariant = "colorful",
  children,
  style,
  ...props
}: BorderBeamProps) {
  // Map size presets to numeric pixel sizes
  const numericSize =
    typeof size === "number"
      ? size
      : size === "sm"
      ? 100
      : size === "lg"
      ? 300
      : 200; // "md" default

  // Resolve colors based on variant & theme
  let resolvedColorFrom = colorFrom;
  let resolvedColorTo = colorTo;

  if (!resolvedColorFrom || !resolvedColorTo) {
    switch (colorVariant) {
      case "colorful":
        resolvedColorFrom = colorFrom || "#ffaa40";
        resolvedColorTo = colorTo || "#9c40ff";
        break;
      case "monochrome":
        resolvedColorFrom =
          colorFrom ||
          (theme === "light"
            ? "rgba(0, 0, 0, 0.85)"
            : "rgba(255, 255, 255, 0.85)");
        resolvedColorTo =
          colorTo ||
          (theme === "light"
            ? "rgba(0, 0, 0, 0.05)"
            : "rgba(255, 255, 255, 0.05)");
        break;
      case "brand":
        resolvedColorFrom = colorFrom || "#38bdf8";
        resolvedColorTo = colorTo || "#6366f1";
        break;
      case "rainbow":
        resolvedColorFrom = colorFrom || "#f43f5e";
        resolvedColorTo = colorTo || "#06b6d4";
        break;
      default:
        resolvedColorFrom = colorFrom || "#ffaa40";
        resolvedColorTo = colorTo || "#9c40ff";
        break;
    }
  }

  const beam = (
    <div
      style={
        {
          "--size": numericSize,
          "--duration": `${duration}s`,
          "--anchor": `${anchor}%`,
          "--border-width": `${borderWidth}px`,
          "--color-from": resolvedColorFrom,
          "--color-to": resolvedColorTo,
          "--delay": `-${delay}s`,
          ...style,
        } as React.CSSProperties
      }
      className={cn(
        "pointer-events-none absolute inset-0 rounded-[inherit] [border:calc(var(--border-width)*1px)_solid_transparent]",
        "![mask-clip:padding-box,border-box] ![mask-composite:intersect] [mask:linear-gradient(transparent,transparent),linear-gradient(white,white)]",
        "after:absolute after:aspect-square after:w-[calc(var(--size)*1px)] after:animate-border-beam after:[animation-delay:var(--delay)] after:[animation-duration:var(--duration)] after:[background:linear-gradient(to_left,var(--color-from),var(--color-to),transparent)] after:[offset-anchor:calc(var(--anchor)*1%)_50%] after:[offset-path:rect(0_auto_auto_0_round_calc(var(--size)*1px))]",
        className,
      )}
      {...props}
    />
  );

  if (children) {
    return (
      <div className="relative inline-block rounded-[inherit]">
        {children}
        {beam}
      </div>
    );
  }

  return beam;
}

export type {
  BorderBeamProps as BorderBeamPropsType,
};

export default BorderBeam;
