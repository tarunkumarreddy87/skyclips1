"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const FAQ = [
  {
    q: "Will the output actually look professional, or like AI slop?",
    a: "SkyClip runs a real production pipeline — research, structured script, TTS voiceover, scene-matched B-roll, and native render to 1080p 16:9. You preview the timeline and can polish before export.",
  },
  {
    q: "How much does a video cost?",
    a: "Local/dev usage depends on your OpenRouter, Sarvam, and stock API keys. Billing and credit enforcement are post-MVP — bring your own keys for now.",
  },
  {
    q: "What formats and niches does SkyClip work for?",
    a: "MVP focuses on documentary and listicle modes. History, science, biography, news-style beats, and similar long-form niches work best.",
  },
  {
    q: "Can I edit the video if I don't like the output?",
    a: "Yes. Open the timeline editor, adjust clips and captions, or ask the editor agent in plain English — then re-render.",
  },
  {
    q: "Can I use my own script, voiceover, or footage?",
    a: "Script-first entry is supported today. Custom voiceover upload and arbitrary footage libraries are reserved for post-MVP.",
  },
  {
    q: "How do I get support?",
    a: "Use Feedback in the studio sidebar, or open an issue in the repo if you're running the monorepo locally.",
  },
] as const;

export function LandingFaq() {
  const [open, setOpen] = useState<number | null>(0);
  const reduce = useReducedMotion();

  return (
    <section id="faq" className="scroll-mt-24 px-5 pb-24 sm:px-8 sm:pb-32">
      <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[1.75rem] border border-white/8 bg-[#101012] px-6 py-10 sm:px-10 sm:py-14">
        <div
          className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-[radial-gradient(circle,rgba(251,146,60,0.22),transparent_70%)] blur-2xl"
          aria-hidden
        />

        <div className="relative grid gap-10 lg:grid-cols-[0.85fr_1.15fr] lg:gap-16">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
          >
            <h2 className="font-display text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Got questions? We&apos;ve got answers.
            </h2>
            <p className="mt-4 text-sm leading-relaxed text-white/45">
              Straight answers about quality, editing, formats, and what&apos;s in MVP scope.
            </p>
          </motion.div>

          <div className="relative space-y-2">
            {FAQ.map((item, i) => {
              const isOpen = open === i;
              return (
                <div
                  key={item.q}
                  className="overflow-hidden rounded-2xl border border-white/8 bg-black/30"
                >
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : i)}
                    className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left sm:px-5"
                  >
                    <span className="text-[14px] font-medium text-white/90">{item.q}</span>
                    <ChevronDown
                      className={cn(
                        "size-4 shrink-0 text-white/40 transition-transform duration-300",
                        isOpen && "rotate-180",
                      )}
                    />
                  </button>
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: "auto", opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
                      >
                        <p className="border-t border-white/6 px-4 pb-4 pt-3 text-[13px] leading-relaxed text-white/50 sm:px-5">
                          {item.a}
                        </p>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
