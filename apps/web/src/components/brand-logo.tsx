"use client";

import Image from "next/image";
import {
  BRAND_MARK_SIZE,
  BRAND_MARK_SRC,
  PRODUCT_NAME,
  PRODUCT_WORDMARK,
} from "@/lib/brand";
import { cn } from "@/lib/utils";

type BrandLogoProps = {
  className?: string;
  markClassName?: string;
  wordmarkClassName?: string;
  /** Icon mark only vs mark + wordmark on one baseline */
  variant?: "icon" | "full";
  /**
   * Mark size in px. Defaults: icon → sidebarCollapsed (16), full → sidebar (24).
   * Prefer BRAND_MARK_SIZE tokens over ad-hoc values.
   */
  size?: number;
  /** @deprecated Use `size` — kept so callers that passed height still compile */
  height?: number;
  priority?: boolean;
  /** Hide the text wordmark (full variant still lays out as a flex row if needed) */
  showWordmark?: boolean;
};

/**
 * Shared SkyClip logo. One mark asset, sized via BRAND_MARK_SIZE.
 * Full = flex items-center gap-2 (mark + wordmark) — never stretch/crop separately.
 */
export function BrandLogo({
  className,
  markClassName,
  wordmarkClassName,
  variant = "icon",
  size,
  height,
  priority = false,
  showWordmark = true,
}: BrandLogoProps) {
  const markSize =
    size ??
    height ??
    (variant === "full" ? BRAND_MARK_SIZE.sidebar : BRAND_MARK_SIZE.sidebarCollapsed);

  const mark = (
    <span
      className={cn(
        "relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-md bg-black",
        markClassName,
      )}
      style={{ width: markSize, height: markSize }}
      aria-hidden={variant === "full"}
    >
      <Image
        src={BRAND_MARK_SRC}
        alt=""
        width={markSize}
        height={markSize}
        className="object-contain"
        style={{ width: markSize, height: markSize }}
        priority={priority}
      />
    </span>
  );

  if (variant === "icon") {
    return (
      <span
        className={cn("inline-flex shrink-0 items-center justify-center", className)}
        style={{ width: markSize, height: markSize }}
        aria-label={PRODUCT_NAME}
      >
        {mark}
      </span>
    );
  }

  return (
    <span
      className={cn("inline-flex items-center gap-2", className)}
      aria-label={PRODUCT_NAME}
    >
      {mark}
      {showWordmark ? (
        <span
          className={cn(
            "text-[15px] font-semibold leading-none tracking-tight text-sidebar-foreground",
            // Optical vertical center with mark (x-height vs square glyph)
            "relative top-px",
            wordmarkClassName,
          )}
        >
          {PRODUCT_WORDMARK}
        </span>
      ) : null}
    </span>
  );
}
