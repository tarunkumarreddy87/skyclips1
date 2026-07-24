/** Public SaaS product name (UI copy, metadata, social captions). */
export const PRODUCT_NAME = "SkyClip";

/** Lowercase wordmark as shown in the brand lockup. */
export const PRODUCT_WORDMARK = "skyclip";

export const PRODUCT_TAGLINE = "AI Video Production";

export const PRODUCT_DESCRIPTION =
  "Turn a prompt or script into a finished 1080p documentary or listicle. Research, voice, visuals, and render — one production pipeline.";

/**
 * Single source-of-truth for logo mark sizing across UI contexts.
 * Mark asset is square; wordmark sits beside it via BrandLogo variant="full".
 */
export const BRAND_MARK_SIZE = {
  /** Expanded sidebar + app chrome */
  sidebar: 24,
  /** Collapsed icon rail — match lucide size-4 (16px) exactly */
  sidebarCollapsed: 16,
  /** Landing header / footer */
  landing: 28,
  landingFooter: 24,
} as const;

/** Trimmed square mark — preferred for UI + favicons */
export const BRAND_MARK_SRC = "/logo-skyclip-mark.png";

/** @deprecated Prefer BRAND_MARK_SRC; kept for any legacy references */
export const BRAND_ICON_SRC = BRAND_MARK_SRC;

/** Full lockup PNG (optional; BrandLogo full uses mark + text for alignment) */
export const BRAND_FULL_LOGO_SRC = "/logo-skyclip-full.png";
