"use client";

import Link from "next/link";
import { Play } from "lucide-react";

const SHOWCASE = [
  {
    id: "doc",
    label: "Documentary",
    hint: "Narrative arc + B-roll",
    image:
      "https://images.unsplash.com/photo-1559827260-dc66d52bef19?auto=format&fit=crop&w=600&q=80",
    prompt:
      "A 10-minute documentary about coral reefs and climate change with a soft subscribe CTA.",
  },
  {
    id: "list",
    label: "Listicle",
    hint: "Numbered beats",
    image:
      "https://images.unsplash.com/photo-1506905925346-21bda4d32df4?auto=format&fit=crop&w=600&q=80",
    prompt: "A 5-minute listicle: 7 turning points that shaped World War II.",
  },
  {
    id: "deep",
    label: "Deep dive",
    hint: "Long-form research",
    image:
      "https://images.unsplash.com/photo-1451187580459-43490279c0fa?auto=format&fit=crop&w=600&q=80",
    prompt: "A 20-minute deep dive on how AI video pipelines actually work.",
  },
  {
    id: "explain",
    label: "Explainer",
    hint: "Clear + visual",
    image:
      "https://images.unsplash.com/photo-1469474968028-56623f02e42e?auto=format&fit=crop&w=600&q=80",
    prompt: "A 3-minute explainer on how coral bleaching happens, in simple language.",
  },
  {
    id: "story",
    label: "Story arc",
    hint: "Hook to meaning",
    image:
      "https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=80",
    prompt: "A cinematic 8-minute story about a fishing village adapting to rising seas.",
  },
] as const;

type Props = {
  onPick?: (prompt: string) => void;
};

export function StyleShowcase({ onPick }: Props) {
  return (
    <section className="mx-auto w-full max-w-5xl">
      <div className="mb-5 flex items-end justify-between gap-4">
        <h2 className="font-display text-xl font-semibold tracking-tight sm:text-2xl">
          Created with SkyClip
        </h2>
        <Link
          href="/projects"
          className="text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          View all
        </Link>
      </div>

      <div className="flex gap-4 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {SHOWCASE.map((item, i) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onPick?.(item.prompt)}
            className="group relative w-[168px] shrink-0 text-left sm:w-[180px]"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="relative aspect-[3/4] overflow-hidden rounded-2xl bg-zinc-900 ring-1 ring-black/5 dark:ring-white/10">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.image}
                alt=""
                className="absolute inset-0 size-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
              <span className="absolute left-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-black/35 text-white backdrop-blur-sm ring-1 ring-white/20">
                <Play className="size-3.5 fill-current" />
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="text-sm font-medium text-white">{item.label}</p>
                <p className="mt-0.5 text-xs text-white/65">{item.hint}</p>
              </div>
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}
