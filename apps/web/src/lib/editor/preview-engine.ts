/** Feature flag: Remotion Player vs legacy CSS preview (ADR 0009). */

/** Default on — CSS is the opt-out for debugging. */
export function isRemotionPreviewEnabled(): boolean {
  const raw = (process.env.NEXT_PUBLIC_PREVIEW_ENGINE ?? "remotion").trim().toLowerCase();
  return raw !== "css" && raw !== "legacy";
}
