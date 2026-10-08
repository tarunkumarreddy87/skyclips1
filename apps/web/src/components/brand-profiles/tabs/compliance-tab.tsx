"use client";

import { Sparkles, Info, Search, Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { BrandProfile } from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";

type ComplianceTabProps = {
  profile: BrandProfile;
  onChange: (patch: Partial<BrandProfile>) => void;
};

export function ComplianceTab({ profile, onChange }: ComplianceTabProps) {
  const { sourcing } = profile.compliance;
  const [domains, setDomains] = useState(profile.compliance.blacklistedWebpages.join("\n"));
  const [models, setModels] = useState<Array<{id: string; name: string}>>([]);
  const [modelError, setModelError] = useState("");
  useEffect(() => {
    let active = true;
    apiFetch<{imageConfigured: boolean; items: Array<{id:string;name:string}>}>("/channel-settings/image-models").then(result => { if (active) { setModels(result.items); if (!result.imageConfigured) setModelError("Image generation needs a valid OpenRouter image API key on the server. Stock and web sourcing are available meanwhile."); } }).catch(error => { if (active) setModelError(error.message); });
    return () => { active = false; };
  }, []);

  function patchCompliance(path: {
    sourcing?: Partial<typeof sourcing>;
    blacklistedWebpages?: string[];
  }) {
    onChange({
      compliance: {
        ...profile.compliance,
        sourcing: { ...sourcing, ...path.sourcing },
        blacklistedWebpages: path.blacklistedWebpages ?? profile.compliance.blacklistedWebpages,
      },
    });
  }

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-white/8 bg-[#161618] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <div className="mb-4 flex items-start gap-2.5">
          <span className="mt-0.5 flex size-8 items-center justify-center rounded-xl bg-white/5 ring-1 ring-white/10">
            <Shield className="size-4 text-zinc-300" />
          </span>
          <div>
            <h3 className="text-sm font-semibold tracking-tight text-white">Scene media</h3>
            <p className="mt-1 text-xs text-zinc-500">
              Control which media sources are allowed for B-roll on this channel.
            </p>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <SourcingCard
            risk="Low risk"
            riskClass="border-t-zinc-500"
            title="Commercial Stock"
            description="Access premium stock footage from licensed libraries."
            checked={sourcing.commercialStock}
            onCheckedChange={(v) => patchCompliance({ sourcing: { commercialStock: v } })}
            icon={<div className="size-10 rounded-md border border-white/10 bg-zinc-900" />}
          />
          <SourcingCard
            risk="Generate for each scene"
            riskClass="border-t-blue-500"
            title="AI generated images"
            description="Create scene-specific images with your selected model. Scenes generate in parallel."
            checked={sourcing.aiGeneratedImages ?? false}
            onCheckedChange={(v) => patchCompliance({ sourcing: { aiGeneratedImages: v, ccPublicDomain: false } })}
            icon={
              <div className="flex size-10 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10">
                <Sparkles className="size-5 text-blue-400" />
              </div>
            }
          />
          <SourcingCard
            risk="Highest risk"
            riskClass="border-t-red-600"
            title="General Web Crawling"
            description="Find web images with SerpAPI for B-roll. You must verify permission to use each image."
            checked={sourcing.generalWebCrawling}
            onCheckedChange={(v) => patchCompliance({ sourcing: { generalWebCrawling: v } })}
            icon={
              <div className="flex size-10 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10">
                <Search className="size-5 text-red-400" />
              </div>
            }
          />
        </div>

        {sourcing.aiGeneratedImages && <div className="mt-5 space-y-2">
          <label htmlFor="image-model" className="text-sm font-medium text-white">Image generation model</label>
          <select id="image-model" value={sourcing.imageModel ?? ""} onChange={event => patchCompliance({ sourcing: { imageModel: event.target.value } })} className="h-11 w-full rounded-xl border border-white/10 bg-[#14171c] px-3 text-sm text-white">
            <option value="">Choose an image model</option>
            {sourcing.imageModel && !models.some(m => m.id === sourcing.imageModel) && <option value={sourcing.imageModel}>{sourcing.imageModel}</option>}
            {models.map(model => <option key={model.id} value={model.id}>{model.name}</option>)}
          </select>
          {modelError && <p role="alert" className="text-xs text-red-300">{modelError}</p>}
          <p className="text-xs text-zinc-400">AI images are used first. Stock and web provide additional footage when enabled.</p>
        </div>}
        <div className="relative mt-4 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-amber-500/15 to-transparent" />
          <div className="relative flex gap-2 text-xs leading-relaxed text-zinc-300">
            <Info className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            Choose at least one source. AI generation uses your image model; stock and web sources use the scene’s visual brief. Blocked domains are excluded from web results.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[#161618] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <h3 className="text-sm font-semibold tracking-tight text-white">Blacklisted Webpages</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Exclude these domains and their subdomains from web image sources and downloads (one per line).
        </p>
        <textarea
          aria-label="Blocked domains"
          value={domains}
          onChange={(e) => {
            setDomains(e.target.value);
            patchCompliance({
              blacklistedWebpages: e.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            });
          }}
          placeholder={"example.com\nwiki.example.org"}
          className="mt-3 min-h-[100px] w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-white placeholder:text-zinc-600 focus:border-blue-500 focus:outline-none"
        />
      </section>
    </div>
  );
}

function SourcingCard({
  risk,
  riskClass,
  title,
  description,
  checked,
  onCheckedChange,
  icon,
  disabled = false,
}: {
  risk: string;
  riskClass: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      aria-pressed={!disabled && checked}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "rounded-xl border border-white/8 border-t-2 bg-white/[0.02] p-4 text-left transition hover:bg-white/[0.04]",
        riskClass,
        !disabled && checked && "ring-1 ring-blue-500/30",
        disabled && "opacity-60 cursor-not-allowed",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{risk}</p>
      <div className="mt-3">{icon}</div>
      <div className="mt-3 flex items-start gap-2">
        <span aria-hidden className={cn("mt-0.5 flex size-4 shrink-0 items-center justify-center rounded border border-white/30 text-[10px]", !disabled && checked && "bg-blue-600 text-white")}>
          {!disabled && checked ? "✓" : ""}
        </span>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>
        </div>
      </div>
    </button>
  );
}
