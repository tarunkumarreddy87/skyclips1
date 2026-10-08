"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { ArrowUp, Play } from "lucide-react";
import { LandingBriefDemo } from "@/components/landing/landing-prompt-box";
import { cn } from "@/lib/utils";
import { landingMedia } from "@/components/landing/landing-media-data";

function StepLabel({ n, soon }: { n: string; soon?: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className="rounded-full border border-white/15 bg-white/[0.04] px-3 py-1 text-[12px] font-medium text-white/70">
        Step {n}
      </span>
      {soon ? <span className="text-[12px] font-medium text-[#6b9bff]">Coming soon</span> : null}
    </div>
  );
}

const AGENT_TASKS = [
  "Mapping scene transition behavior",
  "Analyzing typography hierarchy",
  "Scanning thumbnail composition language",
  "Extracting visual identity patterns",
  "Detecting documentary pacing structure",
  "Aligning voiceover to scene duration",
] as const;

const SIDE_THUMBS = landingMedia.slice(0, 5).map((item) => ({
  label: item.label.toUpperCase(),
  tone: "from-indigo-950 to-violet-950",
  image: item.image,
}));

export function LandingSteps() {
  const reduce = useReducedMotion();
  const [activeTask, setActiveTask] = useState(0);

  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => {
      setActiveTask((i) => (i + 1) % AGENT_TASKS.length);
    }, 2200);
    return () => window.clearInterval(id);
  }, [reduce]);

  return (
    <div id="how" className="scroll-mt-24 space-y-28 sm:space-y-36">
      {/* Step 01 */}
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -24 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true, margin: "-12% 0px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <StepLabel n="01" />
          <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Brief.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-white/50 sm:text-base">
            A paragraph, a full script, or both. Brief in plain English and SkyClip takes it from
            there — documentary or listicle, prompt-first or script-first.
          </p>
        </motion.div>
        <LandingBriefDemo />
      </section>

      {/* Step 02 */}
      <section
        id="usecases"
        className="relative scroll-mt-24 overflow-hidden border-y border-white/6 py-20 sm:py-28"
      >
        <div className="landing-ambient opacity-60" aria-hidden>
          <div className="landing-blob landing-blob-blue !opacity-40" />
        </div>

        <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-5 sm:px-8 lg:grid-cols-[0.9fr_1.2fr_0.7fr]">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.65 }}
          >
            <StepLabel n="02" />
            <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
              Sit back.
            </h2>
            <p className="mt-4 text-pretty text-[15px] leading-relaxed text-white/50">
              Researcher, scriptwriter, voice, visuals, editor — specialists working in parallel on
              your brief. Same skills as a human crew, without the calendar.
            </p>
          </motion.div>

          <div className="relative min-h-[280px]">
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="relative z-10 w-full max-w-md rounded-full border border-white/10 bg-[#121214]/90 px-4 py-2.5 shadow-[0_0_40px_-12px_rgba(47,107,255,0.45)] backdrop-blur">
                <div className="flex items-center gap-2">
                  <p className="flex-1 truncate text-[13px] text-white/80">
                    Build me a WW2{" "}
                    <span className="rounded-md bg-[#2f6bff]/25 px-1.5 py-0.5 text-[#9cbcff]">
                      Documentary
                    </span>{" "}
                    in 10 minutes
                  </p>
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2f6bff] text-white">
                    <ArrowUp className="size-3.5" strokeWidth={2.5} />
                  </span>
                </div>
              </div>

              <div className="mt-8 grid w-full max-w-lg grid-cols-2 gap-2.5">
                {AGENT_TASKS.map((task, i) => (
                  <motion.div
                    key={task}
                    animate={{
                      opacity: i === activeTask ? 1 : 0.35,
                      scale: i === activeTask ? 1 : 0.98,
                    }}
                    transition={{ duration: 0.35 }}
                    className={cn(
                      "rounded-xl border px-3 py-2 text-left text-[11px] leading-snug",
                      i === activeTask
                        ? "border-[#2f6bff]/40 bg-[#2f6bff]/10 text-white"
                        : "border-white/8 bg-white/[0.03] text-white/45",
                    )}
                  >
                    {task}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="relative hidden h-[360px] overflow-hidden lg:block">
            <motion.div
              className="landing-vertical-rail flex flex-col gap-3"
              animate={reduce ? undefined : { y: [0, -180] }}
              transition={
                reduce
                  ? undefined
                  : { duration: 18, repeat: Infinity, ease: "linear", repeatType: "loop" }
              }
            >
              {[...SIDE_THUMBS, ...SIDE_THUMBS].map((t, i) => (
                <div
                  key={`${t.label}-${i}`}
                  className={cn(
                    "relative aspect-video w-full overflow-hidden rounded-xl ring-1 ring-white/10",
                    "bg-gradient-to-br",
                    t.tone,
                  )}
                >
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="flex size-9 items-center justify-center rounded-full bg-black/45 text-white ring-1 ring-white/20">
                      <Play className="size-3.5 fill-current" />
                    </span>
                  </div>
                  <p className="absolute inset-x-2 bottom-2 text-center text-[10px] font-bold tracking-wide text-white/90">
                    {t.label}
                  </p>
                </div>
              ))}
            </motion.div>
            <div className="pointer-events-none absolute inset-x-0 top-0 h-16 bg-gradient-to-b from-black to-transparent" />
            <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black to-transparent" />
          </div>
        </div>
      </section>

      {/* Step 03 */}
      <section id="polish" className="scroll-mt-24 mx-auto grid max-w-6xl items-center gap-12 px-5 sm:px-8 lg:grid-cols-2 lg:gap-16">
        <motion.div
          initial={reduce ? false : { opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.7 }}
        >
          <StepLabel n="03" />
          <h2 className="mt-5 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Polish.
          </h2>
          <p className="mt-4 max-w-md text-pretty text-[15px] leading-relaxed text-white/50">
            Watch the V1. Tell the editor agent what to change in plain English — shorter intro,
            different B-roll, tighter captions. Or open the timeline and do it yourself. Render when
            it&apos;s right.
          </p>
        </motion.div>

        <motion.div
          initial={reduce ? false : { opacity: 0, y: 28 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.75 }}
          className="relative"
        >
          <div className="pointer-events-none absolute -inset-6 -z-10 bg-[radial-gradient(ellipse_at_80%_40%,rgba(47,107,255,0.22),transparent_55%)] blur-2xl" />
          <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#0c0e12] shadow-[0_40px_100px_-50px_rgba(0,0,0,0.9)]">
            <div className="flex items-center justify-between border-b border-white/8 px-4 py-2.5">
              <div className="flex gap-1.5">
                <span className="size-2 rounded-full bg-white/20" />
                <span className="size-2 rounded-full bg-white/20" />
                <span className="size-2 rounded-full bg-white/20" />
              </div>
              <p className="text-[11px] text-white/40">Industrial revolution</p>
              <span className="rounded-md bg-[#2f6bff] px-2.5 py-1 text-[10px] font-semibold text-white">
                Render video
              </span>
            </div>
            <div className="relative grid gap-0 lg:grid-cols-[1fr_0.85fr]">
              <div className="p-3">
                <div className="aspect-video rounded-xl bg-gradient-to-br from-zinc-800 via-zinc-900 to-black ring-1 ring-white/8" />
                <div className="mt-3 space-y-1.5">
                  <div className="relative h-10 overflow-hidden rounded-md bg-white/[0.04] ring-1 ring-white/8">
                    <div className="absolute inset-y-0 left-[28%] w-0.5 bg-[#ff3b3b]" />
                    <div className="flex h-full gap-1 p-1">
                      {Array.from({ length: 8 }).map((_, i) => (
                        <div
                          key={i}
                          className="h-full flex-1 rounded-sm bg-gradient-to-b from-white/15 to-white/5"
                        />
                      ))}
                    </div>
                  </div>
                  <div className="h-5 overflow-hidden rounded-md bg-white/[0.03] ring-1 ring-white/6">
                    <div className="flex h-full items-end gap-px px-1">
                      {Array.from({ length: 40 }).map((_, i) => (
                        <div
                          key={i}
                          className="flex-1 rounded-sm bg-cyan-400/35"
                          style={{ height: `${25 + ((i * 13) % 70)}%` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              <div className="border-t border-white/8 bg-[#101218]/90 p-3 lg:border-l lg:border-t-0">
                <p className="text-[11px] font-medium text-white/50">Editor Agent</p>
                <div className="mt-3 space-y-2.5">
                  <div className="rounded-xl bg-white/[0.05] px-3 py-2 text-[12px] text-white/75">
                    Make the intro faster and swap B-roll on scene 3.
                  </div>
                  <div className="rounded-xl border border-[#2f6bff]/25 bg-[#2f6bff]/10 px-3 py-2 text-[12px] text-white/85">
                    <p className="font-medium text-[#9cbcff]">Key changes</p>
                    <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-white/60">
                      <li>Trimmed intro by 4.2s</li>
                      <li>Replaced scene 3 stock still</li>
                    </ul>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5">
                  <input
                    readOnly
                    value="Ask agent to edit your video…"
                    className="flex-1 bg-transparent text-[11px] text-white/40 outline-none"
                  />
                  <span className="flex size-6 items-center justify-center rounded-full bg-[#2f6bff] text-white">
                    <ArrowUp className="size-3" />
                  </span>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      </section>
    </div>
  );
}
