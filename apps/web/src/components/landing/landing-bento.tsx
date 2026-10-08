"use client";

import React from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  Brain,
  Cpu,
  Layers,
  Sparkles,
  Volume2,
  Wand2,
  Video,
  Scissors,
  CheckCircle2,
  Sliders,
  ArrowRight,
} from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

const BENTO_FEATURES = [
  {
    icon: Brain,
    category: "Autonomous Intelligence",
    title: "AI Director & Deep Scripting",
    description:
      "Turn a single phrase or thesis into an extensively researched, multi-chapter video. Generates narrative hooks, citations, visual scene briefs, and audience retention pacing automatically.",
    badge: "Multi-Agent Research",
    color: "from-blue-500/20 to-indigo-500/10",
    borderAccent: "group-hover:border-blue-500/40",
    visual: (
      <div className="mt-4 flex flex-col gap-2 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3 text-xs">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="flex items-center gap-1.5 font-medium text-blue-400">
            <Sparkles className="size-3" /> Narrative Structure
          </span>
          <span className="font-mono text-zinc-500">12:00 Total</span>
        </div>
        <div className="grid grid-cols-3 gap-1.5 pt-1">
          <div className="rounded-lg border border-blue-500/20 bg-blue-500/10 p-2 text-[10px]">
            <span className="font-semibold text-blue-300">01. The Hook</span>
            <p className="mt-0.5 text-zinc-400">Pacing: 140 WPM</p>
          </div>
          <div className="rounded-lg border border-indigo-500/20 bg-indigo-500/10 p-2 text-[10px]">
            <span className="font-semibold text-indigo-300">02. The Conflict</span>
            <p className="mt-0.5 text-zinc-400">Visuals: 8 Cutaways</p>
          </div>
          <div className="rounded-lg border border-purple-500/20 bg-purple-500/10 p-2 text-[10px]">
            <span className="font-semibold text-purple-300">03. Resolution</span>
            <p className="mt-0.5 text-zinc-400">Dynamic Outro</p>
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Volume2,
    category: "Neural Audio",
    title: "Studio Voiceover & Beat-Sync",
    description:
      "Hyper-realistic voice models with emotional intonation. Audio is dynamically ducked beneath narration and cuts are mathematically aligned to the rhythm of the soundtrack.",
    badge: "Auto Ducking & Beat-Sync",
    color: "from-amber-500/20 to-orange-500/10",
    borderAccent: "group-hover:border-amber-500/40",
    visual: (
      <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3">
        <div className="flex items-center justify-between text-[11px] text-zinc-400">
          <span className="font-mono text-amber-400">128 BPM · Cinematic Score</span>
          <span className="text-[10px] text-emerald-400">Audio Ducked -12dB</span>
        </div>
        <div className="mt-2.5 flex h-8 items-center gap-1">
          {Array.from({ length: 24 }).map((_, i) => (
            <div
              key={i}
              className="flex-1 rounded-sm bg-gradient-to-t from-amber-500/60 to-orange-400/80"
              style={{
                height: `${Math.max(15, ((Math.sin(i * 0.8) + 1) / 2) * 100)}%`,
                opacity: i > 8 && i < 18 ? 0.35 : 0.9,
              }}
            />
          ))}
        </div>
      </div>
    ),
  },
  {
    icon: Layers,
    category: "Timeline Architecture",
    title: "Real Multi-Track Timeline",
    description:
      "No black boxes. You get a full 60 FPS browser-based native timeline with split, trim, keyframes, transitions, and text overlays that you can tweak at any frame.",
    badge: "60 FPS native Engine",
    color: "from-emerald-500/20 to-teal-500/10",
    borderAccent: "group-hover:border-emerald-500/40",
    visual: (
      <div className="mt-4 space-y-1.5 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3 text-[10px]">
        <div className="flex items-center gap-2">
          <span className="w-12 font-mono text-zinc-500">Captions</span>
          <div className="flex-1 rounded bg-emerald-500/20 px-2 py-1 text-emerald-300 font-medium border border-emerald-500/30">
            Word-level kinetic captions
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 font-mono text-zinc-500">Scenes</span>
          <div className="flex-1 flex gap-1">
            <div className="flex-1 rounded bg-blue-500/20 px-2 py-1 text-blue-300 border border-blue-500/30 truncate">
              Scene 01 · 4K Drone
            </div>
            <div className="flex-1 rounded bg-blue-500/20 px-2 py-1 text-blue-300 border border-blue-500/30 truncate">
              Scene 02 · Archive
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="w-12 font-mono text-zinc-500">Audio</span>
          <div className="flex-1 rounded bg-amber-500/20 px-2 py-1 text-amber-300 border border-amber-500/30 truncate">
            Voiceover + Atmospheric BGM
          </div>
        </div>
      </div>
    ),
  },
  {
    icon: Wand2,
    category: "Autonomous Editing",
    title: "Editor Agent Copilot",
    description:
      "Chat with your video in plain English. Tell it to 'cut silences', 'add glitch transition', or 'find better b-roll for the intro', and watch it execute directly on your timeline.",
    badge: "Real-Time Execution",
    color: "from-purple-500/20 to-pink-500/10",
    borderAccent: "group-hover:border-purple-500/40",
    visual: (
      <div className="mt-4 rounded-xl border border-white/[0.08] bg-[#0f0f12] p-3 text-xs">
        <div className="flex items-start gap-2">
          <span className="rounded-full bg-blue-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-blue-400">YOU</span>
          <p className="text-[11px] text-zinc-300">"Trim all pauses longer than 0.5s and color grade with warm contrast."</p>
        </div>
        <div className="mt-2.5 flex items-start gap-2 border-t border-white/[0.05] pt-2">
          <span className="rounded-full bg-purple-500/20 px-1.5 py-0.5 text-[9px] font-semibold text-purple-400">AGENT</span>
          <p className="text-[11px] text-zinc-400">
            Trimmed <span className="text-emerald-400 font-medium">14 silence gaps (-4.2s)</span> and applied LUT preset <span className="text-purple-300 font-medium">"Warm Cinema"</span>.
          </p>
        </div>
      </div>
    ),
  },
];

export function LandingBento() {
  const reduce = useReducedMotion();

  return (
    <section id="features" className="relative overflow-hidden py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <div className="text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-xs font-medium text-blue-400">
            <Cpu className="size-3.5" /> 2D System Architecture
          </span>
          <h2 className="mt-4 font-display text-3xl font-semibold tracking-tight text-white sm:text-5xl">
            Engineered for Creators. Built for Production.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] text-zinc-400 sm:text-base">
            Everything you need to produce professional-grade videos at scale—without juggling five different tools.
          </p>
        </div>

        <div className="mt-16 grid gap-6 md:grid-cols-2">
          {BENTO_FEATURES.map((item, idx) => {
            const Icon = item.icon;
            return (
              <motion.div
                key={item.title}
                initial={reduce ? false : { opacity: 0, y: 24 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: idx * 0.1 }}
                className={cn(
                  "group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-[#121215]/80 p-6 sm:p-8 backdrop-blur-md transition-all duration-300 hover:bg-[#141418] hover:shadow-[0_12px_40px_rgba(0,0,0,0.5)]",
                  item.borderAccent,
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute -right-20 -top-20 size-60 rounded-full bg-gradient-to-br opacity-20 blur-3xl transition-opacity group-hover:opacity-40",
                    item.color,
                  )}
                  aria-hidden
                />

                <div className="flex items-center justify-between">
                  <div className="flex size-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04]">
                    <Icon className="size-5 text-white" />
                  </div>
                  <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 py-0.5 text-[11px] font-medium text-zinc-400">
                    {item.badge}
                  </span>
                </div>

                <div className="mt-6">
                  <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500">
                    {item.category}
                  </span>
                  <h3 className="mt-1 font-display text-xl font-semibold text-white sm:text-2xl">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                    {item.description}
                  </p>
                </div>

                {item.visual}
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
