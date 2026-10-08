"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight,
  Check,
  ChevronDown,
  Film,
  MessageSquareText,
  Play,
  Scissors,
  Sparkles,
  WandSparkles,
} from "lucide-react";
import { LandingNav } from "@/components/landing/landing-nav";
import { LandingInteractiveEditor } from "@/components/landing/landing-interactive-editor";
import { cn } from "@/lib/utils";
import { landingMedia } from "./landing-media-data";

const examples = [
  {
    label: "Documentary",
    image: landingMedia[10].image,
    title: "The story behind the battle",
    command: "Tighten the opening. Add a title, captions, and a warmer grade.",
    color: "#e8c49a",
  },
  {
    label: "Travel",
    image: landingMedia[13].image,
    title: "Beyond the shoreline",
    command: "Find a stronger opening shot and cut the pauses between scenes.",
    color: "#bce7dc",
  },
  {
    label: "Science",
    image: landingMedia[8].image,
    title: "A new world awaits",
    command:
      "Build an atmospheric intro with a slow push-in and cinematic captions.",
    color: "#e7bda9",
  },
] as const;

const faqs = [
  {
    q: "Can I change the video after SkyClip generates it?",
    a: "Yes. You can edit clips, captions, and audio in the multi-track timeline, or ask the editor agent for a change in plain language.",
  },
  {
    q: "What can I create today?",
    a: "SkyClip currently focuses on documentary and listicle videos. Start from a brief or your own script, then review and refine before rendering.",
  },
  {
    q: "Can I upload my own footage or voiceover?",
    a: "Script-first creation is supported. Custom voiceover uploads and broader personal footage libraries are not yet part of the MVP.",
  },
  {
    q: "How does pricing work?",
    a: "Paid plan billing and credit enforcement are still being finalized. The studio shows the available creation flow without asking you to choose a paid plan here.",
  },
] as const;

function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description?: string;
}) {
  return (
    <div className="mx-auto max-w-3xl text-center">
      <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
        {eyebrow}
      </p>
      <h2 className="mt-5 text-balance text-4xl font-semibold tracking-[-0.055em] text-[#111] sm:text-5xl lg:text-[3.7rem] lg:leading-[1.08]">
        {title}
      </h2>
      {description ? (
        <p className="mx-auto mt-5 max-w-2xl text-pretty text-base leading-7 text-neutral-600 sm:text-lg">
          {description}
        </p>
      ) : null}
    </div>
  );
}

function ProductPreview() {
  const [selected, setSelected] = useState(0);
  const example = examples[selected];
  return (
    <div className="mx-auto mt-16 max-w-[1160px] sm:mt-20">
      <div className="overflow-hidden rounded-[22px] border border-neutral-200 bg-[#f3f2ee] shadow-[0_30px_90px_-52px_rgba(0,0,0,0.4)] sm:rounded-[28px]">
        <div className="flex items-center justify-between border-b border-black/10 bg-white px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-semibold text-neutral-800">
            <span className="flex size-6 items-center justify-center rounded-md bg-black text-white">
              <Film className="size-3.5" />
            </span>{" "}
            SkyClip Studio{" "}
            <span className="hidden text-neutral-400 sm:inline">
              / Product preview
            </span>
          </div>
          <div
            className="flex items-center gap-1.5"
            aria-label="Choose preview project"
          >
            {examples.map((item, index) => (
              <button
                key={item.label}
                type="button"
                onClick={() => setSelected(index)}
                aria-pressed={selected === index}
                className={cn(
                  "rounded-full px-3 py-1.5 text-[11px] font-medium transition-colors",
                  selected === index
                    ? "bg-black text-white"
                    : "text-neutral-500 hover:bg-neutral-100 hover:text-black",
                )}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
        <div className="grid gap-5 p-3 sm:p-5 lg:grid-cols-[1fr_280px]">
          <div className="min-w-0 overflow-hidden rounded-xl bg-[#101113]">
            <div className="relative aspect-video overflow-hidden">
              <Image
                src={example.image}
                alt={`${example.label} video preview`}
                fill
                priority={selected === 0}
                sizes="(max-width: 1024px) 100vw, 800px"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/10" />
              <div className="absolute bottom-6 left-6 right-6 text-white sm:bottom-10 sm:left-10">
                <span
                  className="text-[10px] font-bold uppercase tracking-[0.2em]"
                  style={{ color: example.color }}
                >
                  EXAMPLE PROJECT
                </span>
                <p className="mt-2 max-w-md text-2xl font-semibold tracking-tight sm:text-4xl">
                  {example.title}
                </p>
              </div>
              <div className="absolute right-4 top-4 rounded-full bg-black/55 px-3 py-1 text-[10px] font-medium text-white backdrop-blur">
                Preview · 16:9
              </div>
            </div>
            <div className="border-t border-white/10 bg-[#18191b] p-3 sm:p-4">
              <div className="flex justify-between text-[10px] font-medium text-neutral-400">
                <span>00:00</span>
                <span>00:12</span>
                <span>00:24</span>
                <span>00:36</span>
                <span>00:48</span>
              </div>
              <div className="relative mt-2 space-y-1.5">
                <div className="grid h-9 grid-cols-[1.1fr_0.85fr_1fr_0.7fr] gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden rounded-sm"
                    >
                      <Image
                        src={examples[i % examples.length].image}
                        alt=""
                        fill
                        sizes="240px"
                        className="object-cover opacity-65"
                      />
                    </div>
                  ))}
                </div>
                <div className="h-4 rounded-sm bg-[#6f50b5]/75" />
                <div className="flex h-5 items-center gap-[2px] overflow-hidden rounded-sm bg-[#bf8b35]/65 px-1">
                  {Array.from({ length: 90 }, (_, i) => (
                    <span
                      key={i}
                      className="w-[2px] shrink-0 rounded-full bg-white/70"
                      style={{ height: `${3 + ((i * 17) % 12)}px` }}
                    />
                  ))}
                </div>
                <div className="absolute -top-1 bottom-0 left-[31%] w-px bg-[#ff6057]">
                  <span className="absolute -left-[3px] -top-1 size-[7px] rounded-full bg-[#ff6057]" />
                </div>
              </div>
            </div>
          </div>
          <div className="flex min-h-[230px] flex-col rounded-xl border border-neutral-200 bg-white p-5 lg:min-h-0">
            <div className="flex items-center gap-2 border-b border-neutral-100 pb-4 text-xs font-semibold">
              <span className="flex size-7 items-center justify-center rounded-lg bg-black text-white">
                <Sparkles className="size-4" />
              </span>{" "}
              Editor Agent{" "}
              <span className="ml-auto text-[10px] font-medium text-neutral-400">Sample plan</span>
            </div>
            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.13em] text-neutral-400">
              Your direction
            </p>
            <div className="mt-2 rounded-xl bg-[#f5f5f3] p-3 text-[13px] leading-5 text-neutral-800">
              {example.command}
            </div>
            <div className="mt-5 space-y-3 text-xs text-neutral-600">
              <div className="flex gap-2">
                <Check className="size-4 shrink-0 text-emerald-600" /> Map scene pacing
              </div>
              <div className="flex gap-2">
                <Check className="size-4 shrink-0 text-emerald-600" /> Add timeline captions
              </div>
              <div className="flex gap-2">
                <Check className="size-4 shrink-0 text-emerald-600" /> Review the first cut
              </div>
            </div>
            <Link
              href="/studio"
              className="mt-auto flex items-center justify-between border-t border-neutral-100 pt-5 text-xs font-semibold text-neutral-900 hover:underline"
            >
              Open your studio <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      </div>
      <p className="mt-4 text-center text-xs text-neutral-500">
        A look at the workflow · Try the interactive playground below
      </p>
    </div>
  );
}

export function LandingReimagined() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);
  return (
    <div className="landing-white min-h-screen bg-white font-sans text-[#111] selection:bg-neutral-200 selection:text-black">
      <LandingNav />
      <main>
        <section
          className="px-5 pb-24 pt-36 sm:px-8 sm:pt-44"
          aria-labelledby="landing-title"
        >
          <div className="mx-auto max-w-5xl text-center">
            <p className="inline-flex items-center gap-2 text-xs font-medium text-neutral-600">
              <span className="size-1.5 rounded-full bg-[#151515]" /> The AI
              video studio, built around your ideas
            </p>
            <h1
              id="landing-title"
              className="mx-auto mt-8 max-w-[950px] text-balance text-[clamp(3.4rem,7.1vw,6.6rem)] font-semibold leading-[0.99] tracking-[-0.075em] text-black"
            >
              An idea becomes a video.
              <br />
              <span className="text-neutral-400">The edit stays yours.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-[680px] text-pretty text-base leading-7 text-neutral-600 sm:text-xl sm:leading-8">
              From brief to researched script, voice, visuals, and a real
              editable timeline. Direct the agent in plain language or take the
              controls yourself.
            </p>
            <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
              <Link
                href="/studio"
                className="inline-flex h-12 items-center gap-2 rounded-full bg-black px-7 text-sm font-semibold text-white transition hover:bg-neutral-800"
              >
                Start creating <ArrowRight className="size-4" />
              </Link>
              <a
                href="#demo"
                className="inline-flex h-12 items-center gap-2 rounded-full border border-neutral-300 px-6 text-sm font-semibold text-neutral-800 transition hover:border-black hover:bg-neutral-50"
              >
                <Play className="size-3.5 fill-current" /> Explore the demo
              </a>
            </div>
          </div>
          <ProductPreview />
        </section>
        <section
          id="features"
          className="scroll-mt-24 border-t border-neutral-200 px-5 py-24 sm:px-8 sm:py-32"
        >
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="A different kind of edit"
              title="Tell the story. Shape every frame."
              description="SkyClip brings production and post-production into one place. The agent does the first pass; the timeline remains fully yours."
            />
            <div className="mt-16 grid gap-4 md:grid-cols-3">
              <div className="rounded-[24px] bg-[#f3f4f2] p-8 sm:p-9">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white">
                  <MessageSquareText className="size-5" />
                </span>
                <h3 className="mt-10 text-2xl font-semibold tracking-tight">
                  Start with language.
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Give SkyClip a brief or a script. It builds the narrative and
                  assembles a first cut you can inspect.
                </p>
                <div className="mt-8 rounded-xl border border-neutral-200 bg-white p-4 text-sm text-neutral-600">
                  “Make a documentary about the Chola navy, in Telugu.”
                </div>
              </div>
              <div className="rounded-[24px] bg-[#ecefeb] p-8 sm:p-9">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white">
                  <WandSparkles className="size-5" />
                </span>
                <h3 className="mt-10 text-2xl font-semibold tracking-tight">
                  Direct the agent.
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Ask for a tighter hook, a new shot, or different captions.
                  Review the proposed changes before you publish.
                </p>
                <div className="mt-8 space-y-2 rounded-xl border border-neutral-200 bg-white p-4 text-xs">
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-600" /> Shortened
                    opening
                  </div>
                  <div className="flex items-center gap-2">
                    <Check className="size-3.5 text-emerald-600" /> Updated
                    visual sequence
                  </div>
                </div>
              </div>
              <div className="rounded-[24px] bg-[#f1f0ed] p-8 sm:p-9">
                <span className="flex size-10 items-center justify-center rounded-xl bg-white">
                  <Scissors className="size-5" />
                </span>
                <h3 className="mt-10 text-2xl font-semibold tracking-tight">
                  Keep the timeline.
                </h3>
                <p className="mt-3 text-sm leading-6 text-neutral-600">
                  Every cut, caption, layer, and audio track stays editable in a
                  familiar multi-track workspace.
                </p>
                <div className="mt-8 flex h-16 flex-col justify-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-4">
                  <div className="flex gap-1">
                    <span className="h-4 w-1/3 rounded bg-slate-700" />
                    <span className="h-4 w-1/4 rounded bg-slate-500" />
                    <span className="h-4 flex-1 rounded bg-slate-700" />
                  </div>
                  <div className="h-3 rounded bg-[#a9a1c5]" />
                </div>
              </div>
            </div>
          </div>
        </section>
        <section
          id="how"
          className="scroll-mt-24 border-t border-neutral-200 px-5 py-24 sm:px-8 sm:py-32"
        >
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="How it works"
              title="From the first sentence to the final cut."
            />
            <div className="mt-16 grid gap-10 border-t border-neutral-200 pt-8 md:grid-cols-3">
              {[
                {
                  n: "01",
                  title: "Describe it",
                  body: "Start with a topic, a brief, or your own script. Choose the direction and let the production pipeline get to work.",
                },
                {
                  n: "02",
                  title: "Review the first cut",
                  body: "See the assembled footage, narration, captions, music, and pacing together in one editable timeline.",
                },
                {
                  n: "03",
                  title: "Make it yours",
                  body: "Ask the editor agent for changes or edit by hand. Render only when the story feels right.",
                },
              ].map((step) => (
                <div key={step.n}>
                  <span className="text-xs font-semibold text-neutral-400">
                    {step.n} / 03
                  </span>
                  <h3 className="mt-10 text-2xl font-semibold tracking-tight">
                    {step.title}
                  </h3>
                  <p className="mt-3 max-w-sm text-sm leading-7 text-neutral-600">
                    {step.body}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>
        <section
          id="demo"
          className="scroll-mt-24 bg-[#f5f5f2] px-5 py-24 sm:px-8 sm:py-32"
        >
          <div className="mx-auto max-w-6xl">
            <SectionHeading
              eyebrow="Try the workflow"
              title="A timeline you can actually touch."
              description="Scrub, play, and experiment with the editing controls in this interactive sample. Your real projects live in the studio."
            />
            <div className="landing-demo-dark mt-12 overflow-hidden rounded-[24px] bg-[#0b0c0e] p-4 sm:p-8">
              <LandingInteractiveEditor />
            </div>
          </div>
        </section>
        <section
          id="pricing"
          className="scroll-mt-24 border-t border-neutral-200 px-5 py-24 sm:px-8 sm:py-32"
        >
          <div className="mx-auto grid max-w-6xl items-center gap-10 rounded-[28px] bg-[#e9eee8] p-8 sm:p-14 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Access
              </p>
              <h2 className="mt-6 max-w-lg text-balance text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
                Make the next video. Not another workflow.
              </h2>
              <p className="mt-5 max-w-lg text-base leading-7 text-neutral-600">
                Explore the studio and start a project. Paid billing plans are
                still being finalized, so we won&apos;t show a price that
                isn&apos;t available yet.
              </p>
              <Link
                href="/studio"
                className="mt-8 inline-flex h-12 items-center gap-2 rounded-full bg-black px-6 text-sm font-semibold text-white hover:bg-neutral-800"
              >
                Go to studio <ArrowRight className="size-4" />
              </Link>
            </div>
            <div className="rounded-2xl border border-black/10 bg-white p-7 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.17em] text-neutral-500">
                In your workspace
              </p>
              <div className="mt-7 space-y-5 text-sm font-medium">
                {[
                  "Brief or script-first creation",
                  "Research, voice, visuals, and music",
                  "Multi-track timeline and editor agent",
                  "Review before rendering",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-black text-white">
                      <Check className="size-3" />
                    </span>
                    {item}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
        <section
          id="faq"
          className="scroll-mt-24 border-t border-neutral-200 px-5 py-24 sm:px-8 sm:py-32"
        >
          <div className="mx-auto grid max-w-6xl gap-12 lg:grid-cols-[0.8fr_1.2fr]">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-neutral-500">
                Good to know
              </p>
              <h2 className="mt-5 text-4xl font-semibold tracking-[-0.055em] sm:text-5xl">
                Questions, answered.
              </h2>
            </div>
            <div className="border-t border-neutral-200">
              {faqs.map((item, index) => (
                <div key={item.q} className="border-b border-neutral-200">
                  <button
                    type="button"
                    aria-expanded={openFaq === index}
                    onClick={() => setOpenFaq(openFaq === index ? null : index)}
                    className="flex w-full items-center justify-between gap-5 py-6 text-left text-base font-medium"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={cn(
                        "size-5 shrink-0 text-neutral-500 transition-transform",
                        openFaq === index && "rotate-180",
                      )}
                    />
                  </button>
                  {openFaq === index ? (
                    <p className="max-w-2xl pb-6 pr-8 text-sm leading-7 text-neutral-600">
                      {item.a}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>
        <section className="bg-[#111311] px-5 py-24 text-white sm:px-8 sm:py-32">
          <div className="mx-auto max-w-5xl text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/50">
              Your next story starts here
            </p>
            <h2 className="mt-6 text-balance text-5xl font-semibold tracking-[-0.06em] sm:text-7xl">
              Make something worth watching.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-base leading-7 text-white/60">
              Bring the idea. SkyClip helps you make the cut.
            </p>
            <Link
              href="/studio"
              className="mt-9 inline-flex h-12 items-center gap-2 rounded-full bg-white px-7 text-sm font-semibold text-black hover:bg-neutral-200"
            >
              Open SkyClip Studio <ArrowRight className="size-4" />
            </Link>
          </div>
        </section>
      </main>
      <footer className="bg-[#111311] px-5 text-white sm:px-8">
        <div className="mx-auto flex max-w-6xl flex-col gap-8 border-t border-white/15 py-8 text-sm sm:flex-row sm:items-center sm:justify-between">
          <Link href="/" className="text-xl font-bold tracking-tight">
            skyclip
          </Link>
          <div className="flex flex-wrap gap-x-6 gap-y-3 text-white/60">
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#how" className="hover:text-white">
              How it works
            </a>
            <Link href="/docs" className="hover:text-white">
              Docs
            </Link>
            <Link href="/privacy" className="hover:text-white">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-white">
              Terms
            </Link>
          </div>
          <span className="text-xs text-white/40">
            © {new Date().getFullYear()} SkyClip
          </span>
        </div>
      </footer>
    </div>
  );
}
