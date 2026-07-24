"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ChevronDown, Plus } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

const PLACEHOLDERS = [
  "Generate a nature wildlife video…",
  "Build me a WW2 documentary in 10 minutes…",
  "Create a listicle about Indian empires…",
  "Prompt a science explainer on black holes…",
];

type LandingPromptBoxProps = {
  className?: string;
  highlighted?: boolean;
  defaultValue?: string;
  tags?: { label: string; tone?: "blue" | "amber" }[];
  showExtras?: boolean;
  compact?: boolean;
};

export function LandingPromptBox({
  className,
  highlighted,
  defaultValue = "",
  tags,
  showExtras = true,
  compact = false,
}: LandingPromptBoxProps) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [value, setValue] = useState(defaultValue);
  const [phIndex, setPhIndex] = useState(0);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (defaultValue || reduce) return;
    const id = window.setInterval(() => {
      setPhIndex((i) => (i + 1) % PLACEHOLDERS.length);
    }, 3200);
    return () => window.clearInterval(id);
  }, [defaultValue, reduce]);

  function submit() {
    const prompt = value.trim() || PLACEHOLDERS[phIndex];
    try {
      sessionStorage.setItem("skyclip_seed_prompt", prompt);
    } catch {
      /* ignore */
    }
    router.push("/studio");
  }

  return (
    <div className={cn("relative", className)}>
      {highlighted ? (
        <div
          className="pointer-events-none absolute -inset-8 -z-10 bg-[radial-gradient(ellipse_at_50%_100%,rgba(251,146,60,0.28),transparent_60%)] blur-2xl"
          aria-hidden
        />
      ) : null}

      <div
        className={cn(
          "relative overflow-hidden rounded-[1.35rem] border border-white/10 bg-[#121214]/90 shadow-[0_24px_80px_-40px_rgba(0,0,0,0.9)] backdrop-blur-md transition-[border-color,box-shadow] duration-300",
          focused && "border-[#2f6bff]/50 shadow-[0_0_0_1px_rgba(47,107,255,0.25),0_24px_80px_-36px_rgba(47,107,255,0.35)]",
        )}
      >
        <div className={cn("px-4 pt-4 sm:px-5", compact ? "pb-2" : "pb-1")}>
          {tags?.length ? (
            <p className="mb-3 text-[15px] leading-relaxed text-white/85">
              {value.split(/(\bDocumentary\b|@historical\b)/g).map((part, i) => {
                if (part === "Documentary") {
                  return (
                    <span
                      key={i}
                      className="mx-0.5 inline-flex rounded-md bg-[#2f6bff]/25 px-1.5 py-0.5 text-[13px] font-medium text-[#9cbcff]"
                    >
                      {part}
                    </span>
                  );
                }
                if (part === "@historical") {
                  return (
                    <span
                      key={i}
                      className="mx-0.5 inline-flex rounded-md bg-amber-500/20 px-1.5 py-0.5 text-[13px] font-medium text-amber-200"
                    >
                      {part}
                    </span>
                  );
                }
                return <span key={i}>{part}</span>;
              })}
            </p>
          ) : (
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  submit();
                }
              }}
              rows={compact ? 2 : 3}
              placeholder={PLACEHOLDERS[phIndex]}
              className="w-full resize-none bg-transparent text-[15px] leading-relaxed text-white outline-none placeholder:text-white/35"
            />
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-3 pb-3 sm:px-4">
          <button
            type="button"
            className="inline-flex size-8 items-center justify-center rounded-full border border-white/10 text-white/50 transition-colors hover:border-white/20 hover:text-white"
            aria-label="Attach script"
            onClick={() => router.push("/studio")}
          >
            <Plus className="size-4" />
          </button>

          <div className="flex items-center gap-2">
            {showExtras ? (
              <button
                type="button"
                className="hidden items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[12px] text-white/55 transition-colors hover:text-white sm:inline-flex"
              >
                SkyClip v1
                <ChevronDown className="size-3.5 opacity-60" />
              </button>
            ) : null}
            <button
              type="button"
              onClick={submit}
              className="inline-flex size-9 items-center justify-center rounded-full bg-[#2f6bff] text-white shadow-[0_0_20px_-4px_rgba(47,107,255,0.8)] transition-[transform,opacity] hover:opacity-95 active:scale-95"
              aria-label="Start generation"
            >
              <ArrowUp className="size-4" strokeWidth={2.5} />
            </button>
          </div>
        </div>
      </div>

      {highlighted ? (
        <div className="mt-3 flex flex-wrap justify-center gap-2">
          <button
            type="button"
            onClick={() => router.push("/studio")}
            className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Custom Script
          </button>
          <button
            type="button"
            onClick={() => router.push("/studio")}
            className="rounded-full border border-white/10 bg-white/5 px-3.5 py-1.5 text-[12px] text-white/70 transition-colors hover:bg-white/10 hover:text-white"
          >
            Custom Audio
          </button>
        </div>
      ) : null}
    </div>
  );
}

/** Highlighted demo prompt used in Step 01 */
export function LandingBriefDemo() {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { opacity: 0, y: 24 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-10% 0px" }}
      transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
    >
      <LandingPromptBox
        highlighted
        defaultValue="Build me a WW2 Documentary in 10 minutes, use my @historical brand profile with archival war footage visuals…"
        tags={[
          { label: "Documentary", tone: "blue" },
          { label: "@historical", tone: "amber" },
        ]}
      />
    </motion.div>
  );
}
