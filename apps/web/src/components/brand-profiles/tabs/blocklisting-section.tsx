"use client";

import { useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Ban, Check, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  MOTION_TEMPLATES,
  TRANSITION_TEMPLATES,
  type BrandCompliance,
  type BrandProfile,
} from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";

type BlockView = "motion" | "transitions";

const TEMPLATE_SWATCHES = [
  "from-sky-600/40 via-zinc-900 to-zinc-950",
  "from-emerald-600/35 via-zinc-900 to-zinc-950",
  "from-violet-600/40 via-zinc-900 to-zinc-950",
  "from-amber-600/35 via-zinc-900 to-zinc-950",
  "from-rose-600/40 via-zinc-900 to-zinc-950",
  "from-cyan-600/35 via-zinc-900 to-zinc-950",
  "from-indigo-600/40 via-zinc-900 to-zinc-950",
  "from-orange-600/35 via-zinc-900 to-zinc-950",
];

type BlocklistingSectionProps = {
  profile: BrandProfile;
  onChange: (patch: Partial<BrandProfile>) => void;
};

export function BlocklistingSection({ profile, onChange }: BlocklistingSectionProps) {
  const { blocklist } = profile.compliance;
  const [blockView, setBlockView] = useState<BlockView>("motion");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState("all");

  const catalog = blockView === "motion" ? MOTION_TEMPLATES : TRANSITION_TEMPLATES;
  const selectedKey =
    blockView === "motion" ? "blocklistedTemplates" : "blocklistedTransitions";
  const selected = blocklist[selectedKey];

  const filtered = useMemo(() => {
    let list = [...catalog];
    if (filter === "blocked") list = list.filter((t) => selected.includes(t));
    if (filter === "allowed") list = list.filter((t) => !selected.includes(t));
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((t) => t.toLowerCase().includes(q));
    return list;
  }, [catalog, filter, query, selected]);

  function patchBlocklist(patch: Partial<BrandCompliance["blocklist"]>) {
    onChange({
      compliance: {
        ...profile.compliance,
        blocklist: { ...blocklist, ...patch },
      },
    });
  }

  function toggleItem(id: string) {
    const next = selected.includes(id)
      ? selected.filter((x) => x !== id)
      : [...selected, id];
    patchBlocklist({ [selectedKey]: next });
  }

  return (
    <section className="relative overflow-hidden rounded-2xl border border-white/8 bg-[#161618] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
      <div
        className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-blue-500/10 blur-3xl"
        aria-hidden
      />
      <div
        className="pointer-events-none absolute -bottom-24 -left-10 size-48 rounded-full bg-violet-500/8 blur-3xl"
        aria-hidden
      />

      <div className="relative mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <Ban className="size-4 text-zinc-300" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-sm font-semibold tracking-tight text-white">Blocklisting</h3>
              <span className="inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-amber-500/20 to-orange-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-300 ring-1 ring-amber-400/25">
                <Sparkles className="size-2.5" />
                Creative Assets
              </span>
            </div>
            <p className="mt-1 max-w-xl text-xs leading-relaxed text-zinc-500">
              Exclude specific templates, blocks, or transitions from use — applies to every video on
              this channel.
            </p>
          </div>
        </div>

        <div className="inline-flex rounded-full bg-black/30 p-1 ring-1 ring-white/10">
          {(
            [
              ["motion", "Motion graphics"],
              ["transitions", "Transitions"],
            ] as const
          ).map(([id, label]) => {
            const active = blockView === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => {
                  setBlockView(id);
                  setQuery("");
                  setFilter("all");
                }}
                className={cn(
                  "relative rounded-full px-3.5 py-1.5 text-xs font-medium transition",
                  active ? "text-white" : "text-zinc-500 hover:text-zinc-300",
                )}
              >
                {active ? (
                  <motion.span
                    layoutId="blocklist-view-pill"
                    className="absolute inset-0 rounded-full bg-white/12 shadow-[0_0_20px_rgba(59,130,246,0.25)]"
                    transition={{ type: "spring", stiffness: 420, damping: 32 }}
                  />
                ) : null}
                <span className="relative z-10">{label}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative mb-5 space-y-2">
        <ToggleRow
          title="Disable Animations"
          description="Generate videos without animated text reveals, motion graphics, or kinetic effects."
          checked={blocklist.disableAnimations}
          onCheckedChange={(v) => patchBlocklist({ disableAnimations: v })}
        />
        <ToggleRow
          title="Disable Overlays"
          description="Generate videos without text overlays, captions, or graphic elements layered over the footage."
          checked={blocklist.disableOverlays}
          onCheckedChange={(v) => patchBlocklist({ disableOverlays: v })}
        />
        <ToggleRow
          title="Disable Effects"
          description="Generate videos without visual effects like color grading, filters, light leaks, or stylized treatments."
          checked={blocklist.disableEffects}
          onCheckedChange={(v) => patchBlocklist({ disableEffects: v })}
        />
      </div>

      <div className="relative grid gap-4 lg:grid-cols-[1.25fr_0.75fr]">
        <div>
          <div className="mb-3 flex flex-wrap gap-2">
            <div className="relative min-w-[160px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-zinc-500" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search"
                className="h-9 rounded-xl border-white/10 bg-white/[0.04] pl-9 text-sm text-white placeholder:text-zinc-600 focus-visible:border-blue-500/60 focus-visible:ring-blue-500/20"
              />
            </div>
            <Select value={filter} onValueChange={(v) => v && setFilter(v)}>
              <SelectTrigger className="h-9 w-[180px] rounded-xl border-white/10 bg-white/[0.04] text-xs text-white">
                <SelectValue>
                  {filter === "all"
                    ? blockView === "motion"
                      ? "All motion graphics"
                      : "All transitions"
                    : filter === "blocked"
                      ? "Blocklisted only"
                      : "Allowed only"}
                </SelectValue>
              </SelectTrigger>
              <SelectContent className="z-[130] border-white/10 bg-[#1a1a1c] text-white">
                <SelectItem value="all">
                  {blockView === "motion" ? "All motion graphics" : "All transitions"}
                </SelectItem>
                <SelectItem value="blocked">Blocklisted only</SelectItem>
                <SelectItem value="allowed">Allowed only</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <AnimatePresence mode="popLayout">
            <motion.div
              key={`${blockView}-${filter}-${query}`}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.18 }}
              className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
            >
              {filtered.map((item, index) => {
                const blocked = selected.includes(item);
                const swatch = TEMPLATE_SWATCHES[index % TEMPLATE_SWATCHES.length];
                return (
                  <button
                    key={item}
                    type="button"
                    onClick={() => toggleItem(item)}
                    className={cn(
                      "group relative overflow-hidden rounded-xl border text-left transition duration-200",
                      blocked
                        ? "border-red-500/45 bg-red-500/10 shadow-[0_0_24px_-12px_rgba(239,68,68,0.55)]"
                        : "border-white/8 bg-white/[0.02] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.05]",
                    )}
                  >
                    <div
                      className={cn(
                        "relative aspect-[16/10] bg-gradient-to-br",
                        swatch,
                      )}
                    >
                      <div className="absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:14px_14px] opacity-40" />
                      <div className="absolute inset-x-2 bottom-2 rounded-md bg-black/35 px-1.5 py-1 backdrop-blur-[2px]">
                        <p className="truncate text-[9px] font-medium text-zinc-200">{item}</p>
                      </div>
                      {blocked ? (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-red-500 text-white shadow-lg">
                          <Ban className="size-3" />
                        </span>
                      ) : (
                        <span className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full bg-black/40 opacity-0 ring-1 ring-white/15 transition group-hover:opacity-100">
                          <Check className="size-3 text-zinc-300" />
                        </span>
                      )}
                    </div>
                    <p className="truncate px-2.5 py-2 text-[11px] font-medium text-zinc-300">
                      {item}
                    </p>
                  </button>
                );
              })}
            </motion.div>
          </AnimatePresence>

          {filtered.length === 0 ? (
            <p className="mt-6 text-center text-xs text-zinc-500">No items match your search.</p>
          ) : null}
        </div>

        <div className="rounded-xl border border-white/8 bg-gradient-to-b from-white/[0.04] to-transparent p-4">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-white">Selected items</p>
            {selected.length > 0 ? (
              <span className="rounded-full bg-red-500/15 px-2 py-0.5 text-[10px] font-semibold text-red-300 ring-1 ring-red-500/25">
                {selected.length} blocked
              </span>
            ) : null}
          </div>
          {selected.length === 0 ? (
            <div className="flex min-h-[140px] flex-col items-center justify-center rounded-lg border border-dashed border-white/10 bg-black/20 px-4 text-center">
              <Ban className="mb-2 size-5 text-zinc-600" />
              <p className="text-xs text-zinc-500">
                No {blockView === "motion" ? "templates" : "transitions"} blocklisted.
              </p>
              <p className="mt-1 text-[11px] text-zinc-600">
                Click a card to exclude it from this channel.
              </p>
            </div>
          ) : (
            <ul className="max-h-[280px] space-y-1.5 overflow-y-auto pr-1">
              {selected.map((item) => (
                <li
                  key={item}
                  className="flex items-center justify-between gap-2 rounded-lg bg-white/[0.04] px-2.5 py-2 text-xs text-zinc-300 ring-1 ring-white/5"
                >
                  <span className="truncate">{item}</span>
                  <button
                    type="button"
                    className="shrink-0 text-zinc-500 transition hover:text-white"
                    onClick={() => toggleItem(item)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <p className="relative mt-4 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2.5 text-[11px] leading-relaxed text-amber-200/80">
        Motion graphics and transitions do a lot of the “produced” look. Blocking many of them can make
        videos feel plain — if quality drops, review this list first.
      </p>
    </section>
  );
}

function ToggleRow({
  title,
  description,
  checked,
  onCheckedChange,
}: {
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border px-4 py-3 transition",
        checked
          ? "border-blue-500/30 bg-blue-500/[0.08]"
          : "border-white/8 bg-white/[0.02] hover:bg-white/[0.04]",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-medium text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}
