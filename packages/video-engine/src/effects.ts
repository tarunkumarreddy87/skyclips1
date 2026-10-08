import { clipVisualFilter, type ClipVisualEffects } from "@hanuman/shared-types";
import { clamp } from "./timing.js";

/** All motion uses authored local time; seeking backwards produces the same effect. */
export function evaluateClipEffects(effects: ClipVisualEffects | undefined, localSec: number, fps = 30): {
  filter: string; transform: string; opacity: number; overlay: "vignette" | "scanlines" | undefined; amount: number;
} {
  const amount = clamp(effects?.effectStrength ?? 0.5); const effect = effects?.effectId;
  const frame = Math.round(Math.max(0, localSec) * fps);
  const transform = effect === "handheld" ? `scale(1.04) translate(${Math.sin(frame * 0.73) * amount * 1.4}%, ${Math.cos(frame * 0.91) * amount}%)`
    : effect === "pulse" ? `scale(${1 + (1 + Math.sin(localSec * Math.PI * 2)) * 0.04 * amount})` : "";
  const additionalFilter = effect === "soft-focus" ? `blur(${amount * 4}px)`
    : effect === "chromatic" ? `drop-shadow(${amount * 6}px 0 #ef4444) drop-shadow(${-amount * 6}px 0 #22d3ee)` : "";
  return { filter: [clipVisualFilter(effects), additionalFilter].filter(item => item && item !== "none").join(" "), transform,
    opacity: effect === "flicker" ? 1 - amount * 0.15 * (1 + Math.sin(frame * 1.73)) : 1,
    overlay: effect === "vignette" || effect === "scanlines" ? effect : undefined, amount };
}
