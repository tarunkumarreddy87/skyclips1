"use client";

import React, { useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import {
  Check,
  Sparkles,
  ArrowRight,
  Zap,
} from "lucide-react";
import { LandingPromptBox } from "@/components/landing/landing-prompt-box";
import { LandingInteractiveEditor } from "@/components/landing/landing-interactive-editor";
import { cn } from "@/lib/utils";

const SAMPLE_PROMPTS = [
  {
    icon: "⚔️",
    label: "Chola Empire History",
    prompt: "Create an engaging 10-minute documentary on the Chola navy and ancient maritime trade routes.",
  },
  {
    icon: "🚀",
    label: "Mars City 2050",
    prompt: "A cinematic documentary exploring how humanity establishes the first sustainable colony on Mars.",
  },
  {
    icon: "🏝️",
    label: "Private Island Mystery",
    prompt: "Investigative video essay detailing the world's most secretive ultra-luxury private islands.",
  },
  {
    icon: "🧠",
    label: "Quantum AI Future",
    prompt: "Explain the next decade of quantum computing and neural intelligence in a viral explainer format.",
  },
];

export function LandingHero() {
  const reduce = useReducedMotion();
  const [selectedPrompt, setSelectedPrompt] = useState("");

  return (
    <section className="relative overflow-hidden pt-28 sm:pt-36">
      {/* Background ambient lighting */}
      <div className="landing-ambient pointer-events-none" aria-hidden>
        <div className="landing-blob landing-blob-amber opacity-35" />
        <div className="landing-blob landing-blob-blue opacity-30" />
        <div className="landing-noise" />
      </div>

      <div className="relative mx-auto max-w-6xl px-4 sm:px-8">
        {/* Top Announcement Badge */}
        <div className="flex justify-center">
          <motion.div
            initial={reduce ? false : { opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-blue-500/25 bg-blue-500/10 px-4 py-1.5 text-xs text-blue-300 shadow-[0_0_24px_rgba(59,130,246,0.2)] backdrop-blur-xl"
          >
            <span className="flex size-2 rounded-full bg-blue-400 animate-pulse" />
            <span className="font-semibold text-white">SkyClip 2.0</span>
            <span className="text-zinc-500">·</span>
            <span>Autonomous AI Video Production Studio</span>
          </motion.div>
        </div>

        {/* Hero Title & Value Proposition */}
        <div className="mt-8 text-center">
          <motion.h1
            initial={reduce ? false : { opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.65, delay: 0.08 }}
            className="mx-auto max-w-4xl font-display text-5xl font-bold tracking-tight text-white sm:text-6xl lg:text-7xl leading-[1.04]"
          >
            The Edit Room <br />
            <span className="landing-chromatic">That Never Sleeps.</span>
          </motion.h1>

          <motion.p
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.16 }}
            className="mx-auto mt-6 max-w-2xl text-[16px] leading-relaxed text-zinc-300 sm:text-lg"
          >
            Transform raw ideas into fully researched, scripted, voice-acted, and scored videos in minutes.
            Fine-tune every cut in a real 60 FPS multi-track timeline.
          </motion.p>

          {/* Primary Action Buttons */}
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.55, delay: 0.22 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-3.5"
          >
            <Link
              href="/studio"
              className={cn(
                "inline-flex h-12 items-center gap-2 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-7 text-sm font-semibold text-white",
                "shadow-[0_0_36px_rgba(59,130,246,0.6)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_0_48px_rgba(59,130,246,0.8)] active:scale-[0.98]",
              )}
            >
              Start Creating for Free <ArrowRight className="size-4" />
            </Link>
            <a
              href="#demo"
              className="inline-flex h-12 items-center gap-2 rounded-full border border-white/12 bg-white/[0.04] px-6 text-sm font-medium text-zinc-200 transition-all hover:bg-white/[0.08] hover:text-white backdrop-blur-xl"
            >
              <Sparkles className="size-4 text-blue-400" />
              Try Interactive Tutorial
            </a>
          </motion.div>

          {/* Metric Micro-Badges */}
          <motion.div
            initial={reduce ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.28 }}
            className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-zinc-400"
          >
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> 10x Faster Production
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> Real Multi-Track Timeline
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-3.5 text-emerald-400" /> 4K 60fps native Export
            </span>
          </motion.div>
        </div>

        {/* Centerpiece: Real 2D Interactive Video Editor Showcase */}
        <LandingInteractiveEditor />

        {/* Interactive Prompt Box Section */}
        <div className="mt-16 sm:mt-24">
          <div className="text-center mb-6">
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-400">
              Interactive Seed Playground
            </span>
            <h3 className="mt-1 font-display text-2xl font-bold text-white sm:text-3xl">
              Type a Brief. Watch the Timeline Assemble.
            </h3>
          </div>

          {/* Quick Prompt Chips */}
          <div className="mb-4 flex flex-wrap justify-center gap-2">
            {SAMPLE_PROMPTS.map((item) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setSelectedPrompt(item.prompt)}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1 text-xs text-zinc-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white backdrop-blur-lg"
              >
                <span>{item.icon}</span>
                <span>{item.label}</span>
              </button>
            ))}
          </div>

          <div className="mx-auto max-w-3xl">
            <LandingPromptBox defaultValue={selectedPrompt} />
          </div>
        </div>
      </div>
    </section>
  );
}