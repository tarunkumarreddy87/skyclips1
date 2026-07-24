"use client";

/**
 * Caption burn-in for editor preview — style ids shared with Remotion.
 * Karaoke uses color-only highlight (never solid background boxes).
 */

import type { CSSProperties } from "react";
import { useMemo } from "react";
import {
  activeWordIndex,
  resolveCaptionStyleId,
  wordsForCaption,
  type CaptionStyleId,
  type CaptionWordTiming,
} from "@hanuman/shared-types";
import { cn } from "@/lib/utils";

export interface CaptionBurnInProps {
  text: string;
  playheadMs: number;
  startMs: number;
  endMs: number;
  styleId?: string | null;
  color?: string;
  fontSize?: number;
  fontWeight?: string;
  alignment?: "left" | "center" | "right";
  className?: string;
  words?: CaptionWordTiming[] | null;
  previewScale?: boolean;
}

const baseShadow =
  "0 1px 2px rgba(0,0,0,0.85), 0 2px 10px rgba(0,0,0,0.65)";

const KARAOKE_ON = "#fbbf24";
const KARAOKE_OFF = "rgba(255,255,255,0.55)";

export function CaptionBurnIn({
  text,
  playheadMs,
  startMs,
  endMs,
  styleId,
  color = "#ffffff",
  fontSize = 24,
  fontWeight = "700",
  alignment = "center",
  className,
  words: wordsProp,
  previewScale = true,
}: CaptionBurnInProps) {
  const style = resolveCaptionStyleId(styleId);
  const durationMs = Math.max(1, endMs - startMs);
  const words = useMemo(
    () =>
      wordsForCaption({
        text,
        startSec: startMs / 1000,
        durationSec: durationMs / 1000,
        words: wordsProp,
        wordsAnchorSec: startMs / 1000,
      }),
    [text, startMs, durationMs, wordsProp],
  );
  const nowSec = playheadMs / 1000;
  const activeIdx = activeWordIndex(words, nowSec);
  const size = previewScale ? Math.min(Math.max(fontSize, 20), 30) : fontSize;

  if (style === "karaoke") {
    return (
      <p
        className={cn(
          "inline-block max-w-full break-words leading-snug tracking-tight",
          className,
        )}
        style={{
          fontSize: size,
          fontWeight: 800,
          textAlign: alignment,
          textShadow: baseShadow,
          // Never set background on the container — avoids yellow pad artifacts.
          background: "transparent",
        }}
      >
        {words.map((w, i) => {
          const spoken = i < activeIdx;
          const current = i === activeIdx;
          const on = spoken || current;
          return (
            <span key={`${w.start_sec}-${i}`}>
              <span
                style={{
                  // Color-only karaoke (matches Remotion CaptionItem). No background.
                  color: on ? KARAOKE_ON : KARAOKE_OFF,
                  background: "transparent",
                  fontWeight: current ? 900 : 700,
                  transition: "color 80ms linear",
                }}
              >
                {w.text}
              </span>
              {i < words.length - 1 ? " " : null}
            </span>
          );
        })}
      </p>
    );
  }

  if (style === "boxed_pill") {
    return (
      <p
        className={cn(
          "inline-flex max-w-full flex-wrap items-center justify-center gap-x-1 gap-y-1 break-words leading-snug",
          className,
        )}
        style={{
          fontSize: size,
          fontWeight: 700,
          textAlign: alignment,
          textShadow: baseShadow,
          color,
          background: "transparent",
        }}
      >
        {words.map((w, i) => {
          const current = i === activeIdx;
          return (
            <span
              key={`${w.start_sec}-${i}`}
              className={cn(
                "rounded-md px-1.5 py-0.5 transition-colors",
                current && "bg-sky-400 text-zinc-950 shadow-[0_2px_8px_rgba(14,165,233,0.45)]",
              )}
              style={!current ? { color: "rgba(255,255,255,0.88)", background: "transparent" } : undefined}
            >
              {w.text}
            </span>
          );
        })}
      </p>
    );
  }

  const boldStyle: CSSProperties = {
    fontSize: size,
    fontWeight: fontWeight || 800,
    color,
    textAlign: alignment,
    textShadow: baseShadow,
    WebkitTextStroke: "0.6px rgba(0,0,0,0.55)",
    letterSpacing: "-0.01em",
  };

  return (
    <p
      className={cn(
        "inline-block max-w-full rounded-lg bg-black/55 px-3 py-1.5 break-words leading-snug tracking-tight backdrop-blur-[2px]",
        className,
      )}
      style={boldStyle}
    >
      {text}
    </p>
  );
}

export function captionStyleLabel(id: CaptionStyleId | string | null | undefined): string {
  const resolved = resolveCaptionStyleId(id);
  if (resolved === "karaoke") return "Karaoke";
  if (resolved === "boxed_pill") return "Boxed";
  return "Bold";
}
