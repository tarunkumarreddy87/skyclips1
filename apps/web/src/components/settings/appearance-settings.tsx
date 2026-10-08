"use client";

import { useEffect, useState } from "react";
import { Check, Moon, Palette, Sun } from "lucide-react";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";

const choices = [
  {
    id: "dark",
    name: "Charcoal",
    description: "The original SkyClip studio",
    icon: Palette,
    swatches: ["#1a1a1a", "#292929", "#f4f4f5"],
  },
  {
    id: "black",
    name: "Black",
    description: "A focused, cinematic workspace",
    icon: Moon,
    swatches: ["#050505", "#151515", "#f5f5f5"],
  },
  {
    id: "light",
    name: "Light",
    description: "A bright editorial canvas",
    icon: Sun,
    swatches: ["#f7f7f5", "#ffffff", "#202124"],
  },
] as const;

export function AppearanceSettings() {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const selected = mounted ? theme : "dark";

  return (
    <section id="appearance" className="scroll-mt-8 overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="border-b border-border px-5 py-5 sm:px-6">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <Palette className="size-4" /> Appearance
        </div>
        <h2 className="mt-2 font-display text-xl font-semibold tracking-tight text-card-foreground">Make the studio yours</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Your choice applies immediately to the dashboard and editor, and is remembered on this device.
        </p>
      </div>
      <div role="group" aria-label="Studio theme" className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
        {choices.map((choice) => {
          const Icon = choice.icon;
          const active = selected === choice.id;
          return (
            <button
              key={choice.id}
              type="button"
              aria-pressed={active}
              onClick={() => setTheme(choice.id)}
              className={cn(
                "group relative overflow-hidden rounded-xl border p-3 text-left outline-none transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-foreground/65 shadow-[0_0_0_1px_var(--foreground)]" : "border-border hover:border-foreground/35",
              )}
            >
              <div className="relative h-24 overflow-hidden rounded-lg border border-black/10" style={{ background: choice.swatches[0] }} aria-hidden>
                <div className="absolute inset-x-3 top-3 h-2 rounded-full opacity-40" style={{ background: choice.swatches[2] }} />
                <div className="absolute bottom-0 left-3 right-3 top-8 rounded-t-lg border border-black/10 p-2" style={{ background: choice.swatches[1] }}>
                  <div className="h-1.5 w-2/3 rounded-full opacity-70" style={{ background: choice.swatches[2] }} />
                  <div className="mt-2 h-1.5 w-1/2 rounded-full opacity-25" style={{ background: choice.swatches[2] }} />
                </div>
              </div>
              <div className="mt-3 flex items-center gap-2 text-sm font-medium text-card-foreground">
                <Icon className="size-4" /> {choice.name}
                {active ? <Check className="ml-auto size-4" aria-label="Selected" /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">{choice.description}</p>
            </button>
          );
        })}
      </div>
    </section>
  );
}
