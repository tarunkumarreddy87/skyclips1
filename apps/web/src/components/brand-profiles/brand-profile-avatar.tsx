"use client";

import { cn } from "@/lib/utils";

type BrandProfileAvatarProps = {
  name: string;
  hue: number;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
  className?: string;
};

const SIZES = {
  sm: "size-5 text-[9px]",
  md: "size-7 text-[10px]",
  lg: "size-10 text-sm",
};

export function BrandProfileAvatar({
  name,
  hue,
  avatarUrl,
  size = "sm",
  className,
}: BrandProfileAvatarProps) {
  const initial = name.trim().charAt(0).toUpperCase() || "B";
  if (avatarUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={avatarUrl}
        alt=""
        className={cn("shrink-0 rounded-full object-cover ring-1 ring-white/10", SIZES[size], className)}
      />
    );
  }
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white ring-1 ring-white/15",
        SIZES[size],
        className,
      )}
      style={{
        background: `linear-gradient(135deg, hsl(${hue} 72% 52%), hsl(${(hue + 40) % 360} 68% 38%))`,
      }}
      aria-hidden
    >
      {initial}
    </span>
  );
}
