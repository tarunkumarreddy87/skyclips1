"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Sparkles,
  Bot,
  Scissors,
  Wand2,
  Sliders,
  ArrowRight,
  Send,
  FileText,
  Mic,
  Film,
  Zap,
  CheckCircle2,
} from "lucide-react";
import { BorderBeam } from "@/components/ui/border-beam";
import { cn } from "@/lib/utils";

interface CaptionSegment {
  id: string;
  startMs: number;
  endMs: number;
  text: string;
  highlight: string;
}

const CAPTIONS: CaptionSegment[] = [
  {
    id: "c1",
    startMs: 0,
    endMs: 3200,
    text: "For centuries, the imperial navy governed the trade corridors",
    highlight: "imperial navy",
  },
  {
    id: "c2",
    startMs: 3200,
    endMs: 6500,
    text: "linking the Indian Ocean across Southeast Asian kingdoms.",
    highlight: "Indian Ocean",
  },
  {
    id: "c3",
    startMs: 6500,
    endMs: 9500,
    text: "Their armada engineered naval architecture never seen before,",
    highlight: "naval architecture",
  },
  {
    id: "c4",
    startMs: 9500,
    endMs: 12000,
    text: "securing maritime supremacy for more than three hundred years.",
    highlight: "maritime supremacy",
  },
];

const TUTORIAL_STEPS = [
  {
    id: "script",
    step: "01",
    title: "AI Script & Research",
    badge: "Multi-Agent Engine",
    icon: FileText,
    desc: "Autonomous deep-research generates historically verified story beats and viral hooks.",
    detail: "Synthesizing 42 historical records · 4-act narrative structure generated.",
  },
  {
    id: "audio",
    step: "02",
    title: "Neural Voice & Beat-Sync",
    badge: "192kbps Studio",
    icon: Mic,
    desc: "Neural voiceover generated with dynamic pacing, breath pauses, and beat-matched cuts.",
    detail: "Voice: British Historian (Neural) · Beat cadence locked at 124 BPM.",
  },
  {
    id: "timeline",
    step: "03",
    title: "Multi-Track Timeline",
    badge: "60 FPS native",
    icon: Film,
    desc: "Real 60 FPS multi-track canvas with word-level captions, b-roll overlays, and cut seams.",
    detail: "4 concurrent tracks · Frame-accurate snapping · Zero dropped frames.",
  },
  {
    id: "agent",
    step: "04",
    title: "Editor Agent Copilot",
    badge: "Autonomous AI",
    icon: Bot,
    desc: "Natural language chat edits your cuts, transitions, zooms, and audio balance live.",
    detail: "Direct timeline mutations via tool calling in under 400ms.",
  },
] as const;

export function LandingInteractiveEditor() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentMs, setCurrentMs] = useState(1200);
  const [isMuted, setIsMuted] = useState(true);
  const [activeStep, setActiveStep] = useState<string>("timeline");
  const [colorGrade, setColorGrade] = useState<"normal" | "cinematic">("cinematic");
  const [hasGlitch, setHasGlitch] = useState(false);
  const [silencesTrimmed, setSilencesTrimmed] = useState(false);
  const [inputPrompt, setInputPrompt] = useState("");
  const [agentMsg, setAgentMsg] = useState(
    "SkyClip Pro Copilot ready. Scrub the timeline, trigger instant actions below, or ask me to edit anything.",
  );

  const totalDurationMs = 12000;
  const timelineRef = useRef<HTMLDivElement>(null);
  const isDraggingRef = useRef(false);
  const animFrameRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  // Gentle safe sound generator when unmuted
  const playPreviewChirp = useCallback(() => {
    if (isMuted) return;
    try {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!audioCtxRef.current || audioCtxRef.current.state === "closed") {
        audioCtxRef.current = new AudioCtx();
      }
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume();
      }
      const osc = audioCtxRef.current.createOscillator();
      const gain = audioCtxRef.current.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(440, audioCtxRef.current.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtxRef.current.currentTime + 0.08);
      gain.gain.setValueAtTime(0.03, audioCtxRef.current.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtxRef.current.currentTime + 0.08);
      osc.connect(gain);
      gain.connect(audioCtxRef.current.destination);
      osc.start();
      osc.stop(audioCtxRef.current.currentTime + 0.08);
    } catch {
      // Audio autoplay policy fallback
    }
  }, [isMuted]);

  // Smooth 60 FPS playback loop
  useEffect(() => {
    if (!isPlaying) {
      lastTimeRef.current = null;
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current !== null) {
        const delta = now - lastTimeRef.current;
        setCurrentMs((prev) => {
          const next = prev + delta;
          if (next >= totalDurationMs) {
            return 0; // Loop seamlessly
          }
          return next;
        });
      }
      lastTimeRef.current = now;
      animFrameRef.current = requestAnimationFrame(tick);
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [isPlaying, totalDurationMs]);

  const togglePlay = () => {
    playPreviewChirp();
    setIsPlaying((p) => !p);
  };

  const seekTo = useCallback(
    (ms: number) => {
      setCurrentMs(Math.max(0, Math.min(totalDurationMs, ms)));
    },
    [totalDurationMs],
  );

  // Interactive timeline scrubbing
  const updateFromPointer = useCallback(
    (clientX: number) => {
      if (!timelineRef.current) return;
      const rect = timelineRef.current.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      seekTo(ratio * totalDurationMs);
    },
    [seekTo, totalDurationMs],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    isDraggingRef.current = true;
    updateFromPointer(e.clientX);
    playPreviewChirp();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      updateFromPointer(e.clientX);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      isDraggingRef.current = false;
      try {
        (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
      } catch {
        // no-op
      }
    }
  };

  // Active caption resolution
  const activeCaption =
    CAPTIONS.find((c) => currentMs >= c.startMs && currentMs < c.endMs) ?? CAPTIONS[0];

  // Timecode formatting mm:ss.SS
  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    const frac = Math.floor((ms % 1000) / 10);
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}.${String(frac).padStart(2, "0")}`;
  };

  const progressPercent = (currentMs / totalDurationMs) * 100;

  // Custom prompt submit
  const handlePromptSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputPrompt.trim()) return;
    const p = inputPrompt.trim();
    setInputPrompt("");

    if (p.toLowerCase().includes("zoom") || p.toLowerCase().includes("scale")) {
      setAgentMsg(`Executed: Keyframed 1.15x slow dynamic push-in on Scene 01. Timeline rendered.`);
    } else if (p.toLowerCase().includes("cut") || p.toLowerCase().includes("trim")) {
      setSilencesTrimmed(true);
      setAgentMsg(`Executed: Removed 1.4s of dead speech air. Timeline compacted.`);
    } else if (p.toLowerCase().includes("color") || p.toLowerCase().includes("grade")) {
      setColorGrade((c) => (c === "cinematic" ? "normal" : "cinematic"));
      setAgentMsg(`Executed: Toggled 3D LUT Cinematic Grade across all active clips.`);
    } else {
      setAgentMsg(`Copilot: Applied "${p}" to timeline clips at current playhead position.`);
    }
  };

  return (
    <div id="demo" className="relative mt-12 sm:mt-16 scroll-mt-20">
      <div className="mx-auto max-w-6xl">
        {/* Section Header: 2D Minimalist Glassmorphism */}
        <div className="text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/20 bg-blue-500/10 px-3.5 py-1 text-xs font-medium text-blue-300 backdrop-blur-xl">
            <Sparkles className="size-3.5 text-blue-400" />
            <span>Interactive Studio Tutorial</span>
            <span className="text-zinc-500">·</span>
            <span className="text-white font-semibold">Real 60 FPS Playground</span>
          </div>

          <h2 className="mt-4 font-display text-3xl font-bold tracking-tight text-white sm:text-5xl">
            Hands-On Experience. <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-amber-200">
              Every Control Works Live.
            </span>
          </h2>
          <p className="mx-auto mt-3.5 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Click play, drag the red playhead, scrub the timeline tracks, or prompt the AI Editor Agent.
            Experience the actual editing pipeline before opening the studio.
          </p>
        </div>

        {/* Tutorial Step Switcher Tabs (2D Clean Minimalist Cards) */}
        <div className="mt-10 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {TUTORIAL_STEPS.map((step) => {
            const isSelected = activeStep === step.id;
            const Icon = step.icon;
            return (
              <button
                key={step.id}
                type="button"
                onClick={() => {
                  setActiveStep(step.id);
                  playPreviewChirp();
                  if (step.id === "script") seekTo(800);
                  if (step.id === "audio") seekTo(3600);
                  if (step.id === "timeline") seekTo(7200);
                  if (step.id === "agent") seekTo(9600);
                }}
                className={cn(
                  "group relative flex flex-col rounded-xl p-3.5 sm:p-4 text-left border transition-all duration-200",
                  "backdrop-blur-2xl",
                  isSelected
                    ? "border-blue-500/50 bg-gradient-to-b from-blue-950/40 via-zinc-950/70 to-zinc-950/80 shadow-[0_8px_24px_rgba(59,130,246,0.18)]"
                    : "border-white/[0.08] bg-zinc-950/30 hover:border-white/15 hover:bg-zinc-900/40",
                )}
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10.5px] font-mono font-semibold tracking-wider text-blue-400">
                    STEP {step.step}
                  </span>
                  <span
                    className={cn(
                      "rounded-md px-1.5 py-0.5 text-[9.5px] font-medium border",
                      isSelected
                        ? "border-blue-400/40 bg-blue-500/20 text-blue-200"
                        : "border-white/10 bg-white/[0.03] text-zinc-400",
                    )}
                  >
                    {step.badge}
                  </span>
                </div>

                <div className="mt-2.5 flex items-center gap-1.5">
                  <Icon className={cn("size-3.5", isSelected ? "text-blue-400" : "text-zinc-400")} />
                  <h3 className="text-xs sm:text-sm font-semibold text-white truncate">
                    {step.title}
                  </h3>
                </div>

                <p className="mt-1 text-[11px] leading-relaxed text-zinc-400 line-clamp-2">
                  {step.desc}
                </p>
              </button>
            );
          })}
        </div>

        {/* Tutorial Active Step Diagnostic Banner */}
        <div className="mt-3 flex items-center justify-between rounded-lg border border-white/[0.08] bg-zinc-950/40 px-3.5 py-2 text-xs backdrop-blur-xl">
          <div className="flex items-center gap-2">
            <span className="flex size-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="font-medium text-zinc-300">
              {TUTORIAL_STEPS.find((s) => s.id === activeStep)?.detail}
            </span>
          </div>
          <span className="hidden font-mono text-[10.5px] text-zinc-500 sm:inline-block">
            ACTIVE TUTORIAL MODULE
          </span>
        </div>

        {/* Studio Window Mockup (Minimalist 2D Glassmorphism) */}
        <div className="relative mt-4 rounded-2xl border border-white/[0.12] bg-zinc-950/70 p-2.5 sm:p-4 shadow-[0_24px_80px_rgba(0,0,0,0.85),inset_0_1px_0_0_rgba(255,255,255,0.08)] backdrop-blur-3xl">
          {/* Top Window Bar */}
          <div className="flex items-center justify-between border-b border-white/[0.07] px-3 pb-3 pt-1">
            <div className="flex items-center gap-2.5">
              <div className="flex gap-1.5">
                <span className="size-2.5 rounded-full bg-[#ff5f56]" />
                <span className="size-2.5 rounded-full bg-[#ffbd2e]" />
                <span className="size-2.5 rounded-full bg-[#27c93f]" />
              </div>
              <span className="ml-2 font-mono text-xs text-zinc-400 truncate max-w-[220px] sm:max-w-none">
                chola-naval-empire / sequence-01.timeline
              </span>
            </div>

            <div className="flex items-center gap-2.5">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                60 FPS LIVE
              </span>
              <Link
                href="/studio"
                className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-blue-600 to-indigo-600 px-3.5 py-1 text-xs font-semibold text-white shadow-[0_0_16px_rgba(59,130,246,0.5)] transition hover:brightness-110"
              >
                Launch Full Studio <ArrowRight className="size-3" />
              </Link>
            </div>
          </div>

          {/* Main 2-Column Interface: Viewport & Agent Dock */}
          <div className="grid gap-3 pt-3 lg:grid-cols-[1.35fr_1fr]">
            {/* Left Column: Interactive 16:9 Viewport */}
            <div className="relative aspect-video overflow-hidden rounded-xl border border-white/[0.08] bg-[#050507]">
              {/* Scene Backdrop Image */}
              <div
                className={cn(
                  "absolute inset-0 bg-cover bg-center transition-all duration-700",
                  colorGrade === "cinematic"
                    ? "contrast-115 brightness-95 saturate-110"
                    : "contrast-100",
                  hasGlitch && "skew-x-1 filter invert-10 hue-rotate-15 transition-none",
                )}
                style={{
                  backgroundImage:
                    currentMs < 6000
                      ? "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.75) 100%), url('/landing/user-thumbnails/maratha-royalty.jpg')"
                      : "linear-gradient(180deg, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.75) 100%), url('/landing/user-thumbnails/leonardo-and-art.jpg')",
                }}
              />

              {/* Viewport Floating Status Badges */}
              <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
                <span className="rounded-full border border-white/20 bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold tracking-wider text-white backdrop-blur-md">
                  {currentMs < 6000 ? "SCENE 01: IMPERIAL FLEET" : "SCENE 02: SOUTHEAST STRAIT"}
                </span>
                {colorGrade === "cinematic" && (
                  <span className="rounded-full border border-amber-500/30 bg-amber-500/20 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                    LUT: 3D Warm Gold
                  </span>
                )}
              </div>

              {/* Word-by-Word Kinetic Captions (Synchronized to exact playhead ms) */}
              <div className="absolute inset-x-4 bottom-14 z-10 text-center pointer-events-none">
                <div className="inline-block rounded-lg border border-white/10 bg-black/75 px-4 py-2 text-xs sm:text-sm font-semibold text-white shadow-2xl backdrop-blur-md">
                  {activeCaption.text.split(activeCaption.highlight).map((part, i, arr) => (
                    <React.Fragment key={i}>
                      <span>{part}</span>
                      {i < arr.length - 1 && (
                        <span className="text-amber-400 underline decoration-amber-400/80 font-bold ml-1 mr-1">
                          {activeCaption.highlight}
                        </span>
                      )}
                    </React.Fragment>
                  ))}
                </div>
              </div>

              {/* Viewport Playback Control Bar */}
              <div className="absolute inset-x-0 bottom-0 z-20 flex items-center justify-between border-t border-white/10 bg-black/80 px-3 py-2 text-xs backdrop-blur-md">
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={togglePlay}
                    title={isPlaying ? "Pause (Space)" : "Play (Space)"}
                    className="flex size-7 items-center justify-center rounded-full bg-white text-black shadow hover:bg-zinc-200 transition active:scale-95"
                  >
                    {isPlaying ? (
                      <Pause className="size-3.5 fill-current" />
                    ) : (
                      <Play className="size-3.5 fill-current pl-0.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      seekTo(0);
                      playPreviewChirp();
                    }}
                    title="Restart"
                    className="text-zinc-400 hover:text-white transition"
                  >
                    <RotateCcw className="size-3.5" />
                  </button>

                  <span className="font-mono text-[11px] tabular-nums text-zinc-300">
                    {formatTime(currentMs)} / {formatTime(totalDurationMs)}
                  </span>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setIsMuted(!isMuted);
                      playPreviewChirp();
                    }}
                    title={isMuted ? "Unmute Preview Sound" : "Mute Preview Sound"}
                    className="flex items-center gap-1 text-zinc-400 hover:text-white transition"
                  >
                    {isMuted ? (
                      <VolumeX className="size-3.5" />
                    ) : (
                      <Volume2 className="size-3.5 text-blue-400" />
                    )}
                    <span className="text-[10px] hidden sm:inline">
                      {isMuted ? "Sound Off" : "Sound On"}
                    </span>
                  </button>
                  <span className="font-mono text-[10px] text-zinc-500">4K 60fps</span>
                </div>
              </div>
            </div>

            {/* Right Column: Autonomous AI Editor Agent Dock */}
            <div className="flex flex-col justify-between rounded-xl border border-white/[0.08] bg-zinc-950/60 p-3 text-xs backdrop-blur-2xl">
              <div>
                <div className="flex items-center justify-between border-b border-white/[0.06] pb-2">
                  <div className="flex items-center gap-1.5 font-medium text-white">
                    <Bot className="size-4 text-blue-400" />
                    <span>Autonomous Editor Agent</span>
                  </div>
                  <span className="rounded-full border border-blue-500/25 bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-300">
                    Online & Ready
                  </span>
                </div>

                {/* Agent Activity Thread */}
                <div className="mt-3 space-y-2">
                  <div className="rounded-lg border border-white/[0.07] bg-white/[0.03] p-2.5 text-[11px] text-zinc-300 leading-relaxed shadow-sm">
                    <div className="flex items-center gap-1.5 mb-1 font-semibold text-blue-400">
                      <Sparkles className="size-3" />
                      <span>Copilot Stream</span>
                    </div>
                    {agentMsg}
                  </div>
                </div>

                {/* Quick Action Interactive Buttons (Real Live Timeline Mutations) */}
                <div className="mt-3.5">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
                    Live Timeline Mutations
                  </span>
                  <div className="mt-2 grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        playPreviewChirp();
                        setSilencesTrimmed(!silencesTrimmed);
                        setAgentMsg(
                          !silencesTrimmed
                            ? "Auto-cut 1.4s of silence gaps across timeline. Pacing tightened by 12%."
                            : "Restored original speech spacing.",
                        );
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border p-2 text-[11px] font-medium transition text-left",
                        silencesTrimmed
                          ? "border-emerald-500/40 bg-emerald-500/15 text-emerald-300 shadow-[0_0_12px_rgba(16,185,129,0.2)]"
                          : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <Scissors className="size-3 text-emerald-400 shrink-0" />
                      <span className="truncate">
                        {silencesTrimmed ? "Silences Cut ✓" : "Trim Silences"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playPreviewChirp();
                        setHasGlitch(!hasGlitch);
                        setAgentMsg(
                          !hasGlitch
                            ? "Applied 24-frame chromatic glitch transition at cut point 06:00."
                            : "Removed glitch transition.",
                        );
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border p-2 text-[11px] font-medium transition text-left",
                        hasGlitch
                          ? "border-purple-500/40 bg-purple-500/15 text-purple-300 shadow-[0_0_12px_rgba(168,85,247,0.2)]"
                          : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <Wand2 className="size-3 text-purple-400 shrink-0" />
                      <span className="truncate">
                        {hasGlitch ? "Glitch Active ✓" : "Add Glitch"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        playPreviewChirp();
                        setColorGrade(colorGrade === "cinematic" ? "normal" : "cinematic");
                        setAgentMsg(
                          colorGrade !== "cinematic"
                            ? "Applied Warm Cinematic 3D LUT (+15% contrast, golden skin tones)."
                            : "Reset to Rec.709 natural color profile.",
                        );
                      }}
                      className={cn(
                        "flex items-center gap-1.5 rounded-lg border p-2 text-[11px] font-medium transition text-left",
                        colorGrade === "cinematic"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-300 shadow-[0_0_12px_rgba(245,158,11,0.2)]"
                          : "border-white/[0.08] bg-white/[0.03] text-zinc-300 hover:bg-white/[0.06] hover:text-white",
                      )}
                    >
                      <Sliders className="size-3 text-amber-400 shrink-0" />
                      <span className="truncate">
                        {colorGrade === "cinematic" ? "Warm Cinema ✓" : "Color Grade"}
                      </span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        seekTo(3200);
                        setIsPlaying(true);
                        playPreviewChirp();
                        setAgentMsg("Jumped playhead to Scene 02 and started playback.");
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] p-2 text-[11px] font-medium text-zinc-300 hover:bg-white/[0.06] hover:text-white transition text-left"
                    >
                      <Play className="size-3 text-blue-400 shrink-0" />
                      <span className="truncate">Jump to Scene 2</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Natural Language Prompt Input wrapped in BorderBeam */}
              <form
                onSubmit={handlePromptSubmit}
                className="relative mt-3.5 overflow-hidden rounded-xl border border-white/[0.12] bg-zinc-900/60 p-1.5 shadow-lg backdrop-blur-xl"
              >
                <BorderBeam size={160} duration={8} colorVariant="colorful" borderWidth={1.5} />
                <div className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={inputPrompt}
                    onChange={(e) => setInputPrompt(e.target.value)}
                    placeholder='Try: "Slow zoom on Scene 1" or "Trim pauses"'
                    className="flex-1 bg-transparent px-2 text-xs text-white placeholder-zinc-500 outline-none"
                  />
                  <button
                    type="submit"
                    title="Send to Editor Agent"
                    className="flex size-7 items-center justify-center rounded-lg bg-blue-600 text-white transition hover:bg-blue-500 active:scale-95"
                  >
                    <Send className="size-3" />
                  </button>
                </div>
              </form>
            </div>
          </div>

          {/* Bottom: Interactive Multi-Track Timeline (Frame-Accurate Scrubbing) */}
          <div className="mt-3 space-y-1.5 rounded-xl border border-white/[0.08] bg-zinc-950/70 p-3 font-mono text-[10px] backdrop-blur-2xl select-none">
            {/* Timeline Ruler & Scale Header */}
            <div className="flex items-center justify-between text-[10px] text-zinc-500 pb-1.5 border-b border-white/[0.05]">
              <span className="flex items-center gap-2">
                <span className="font-semibold text-zinc-400">TIMELINE CANVAS</span>
                <span>·</span>
                <span>4 TRACKS</span>
                <span>·</span>
                <span className="text-blue-400">CLICK & DRAG TO SCRUB</span>
              </span>
              <span className="text-zinc-300 font-semibold tabular-nums">
                PLAYHEAD: {formatTime(currentMs)}
              </span>
            </div>

            {/* Interactive Timeline Canvas Container */}
            <div
              ref={timelineRef}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              className="relative cursor-ew-resize space-y-1.5 py-1"
            >
              {/* Moving Playhead Red Line with Top Diamond */}
              <div
                className="pointer-events-none absolute inset-y-0 z-30 w-[2px] bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.9)]"
                style={{ left: `${progressPercent}%` }}
              >
                <div className="size-3 -translate-x-[5px] -translate-y-1 rotate-45 rounded-[1px] bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.9)]" />
              </div>

              {/* Track 1: Dynamic Captions Track */}
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-zinc-500 font-medium">Captions</span>
                <div className="relative flex flex-1 gap-1">
                  {CAPTIONS.map((cap) => {
                    const isActive = currentMs >= cap.startMs && currentMs < cap.endMs;
                    return (
                      <div
                        key={cap.id}
                        className={cn(
                          "flex-1 rounded border py-1.5 px-2 transition-colors truncate font-sans text-[10px]",
                          isActive
                            ? "border-emerald-500/60 bg-emerald-500/25 text-emerald-200 font-semibold shadow-[0_0_12px_rgba(16,185,129,0.25)]"
                            : "border-emerald-500/20 bg-emerald-500/10 text-emerald-400/70",
                        )}
                      >
                        {cap.text}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Track 2: Video Scenes Track */}
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-zinc-500 font-medium">Scenes</span>
                <div className="relative flex flex-1 gap-1">
                  <div
                    className={cn(
                      "flex-1 rounded border py-2 px-2.5 font-sans text-[11px] transition-all truncate",
                      currentMs < 6000
                        ? "border-blue-500/60 bg-blue-500/30 text-white font-medium shadow-[0_0_12px_rgba(59,130,246,0.25)]"
                        : "border-blue-500/20 bg-blue-500/15 text-blue-300",
                    )}
                  >
                    🎬 Scene 01: The Harbor Fleet Mobilization
                  </div>
                  {hasGlitch && (
                    <span className="shrink-0 flex items-center px-1.5 rounded bg-purple-500/30 border border-purple-500/50 text-[9px] text-purple-200 font-semibold animate-pulse">
                      ⚡ Glitch Cut
                    </span>
                  )}
                  <div
                    className={cn(
                      "flex-1 rounded border py-2 px-2.5 font-sans text-[11px] transition-all truncate",
                      currentMs >= 6000
                        ? "border-blue-500/60 bg-blue-500/30 text-white font-medium shadow-[0_0_12px_rgba(59,130,246,0.25)]"
                        : "border-blue-500/20 bg-blue-500/15 text-blue-300",
                    )}
                  >
                    🎬 Scene 02: Royal Armada Navigation
                  </div>
                </div>
              </div>

              {/* Track 3: B-Roll Cutaway Track */}
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-zinc-500 font-medium">B-Roll</span>
                <div className="relative flex flex-1 gap-1 font-sans text-[10px]">
                  <div className="w-1/4 rounded border border-cyan-500/30 bg-cyan-500/15 py-1 px-2 text-cyan-300 truncate">
                    Drone Aerial
                  </div>
                  <div className="flex-1 rounded border border-cyan-500/30 bg-cyan-500/15 py-1 px-2 text-cyan-300 truncate">
                    Ancient Coin Inscription Macro
                  </div>
                </div>
              </div>

              {/* Track 4: Audio Waveform Track (Oscillates live during playback) */}
              <div className="flex items-center gap-2">
                <span className="w-14 shrink-0 text-zinc-500 font-medium">Audio</span>
                <div className="relative flex flex-1 items-center gap-0.5 rounded border border-amber-500/30 bg-amber-500/10 py-2 px-2">
                  {Array.from({ length: 64 }).map((_, i) => {
                    const activeWave = isPlaying
                      ? Math.sin((i + currentMs / 80) * 0.45)
                      : Math.sin(i * 0.45);
                    // Integer CSS pixels serialize identically in SSR and browser styles.
                    const barHeight = Math.round(Math.max(3, (activeWave * 0.5 + 0.5) * 16));
                    const isPassed = (i / 64) * 100 <= progressPercent;
                    return (
                      <span
                        key={i}
                        className={cn(
                          "flex-1 rounded-sm transition-all",
                          isPassed ? "bg-amber-400" : "bg-amber-400/40",
                        )}
                        style={{ height: `${barHeight}px` }}
                      />
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
