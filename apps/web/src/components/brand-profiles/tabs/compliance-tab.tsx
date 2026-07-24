"use client";

import { Globe2, Info, Search, Shield } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { BrandProfile } from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";

type ComplianceTabProps = {
  profile: BrandProfile;
  onChange: (patch: Partial<BrandProfile>) => void;
};

export function ComplianceTab({ profile, onChange }: ComplianceTabProps) {
  const { sourcing } = profile.compliance;

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
            <h3 className="text-sm font-semibold tracking-tight text-white">Safety &amp; Sourcing</h3>
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
            risk="Medium risk"
            riskClass="border-t-amber-500"
            title="CC & Public Domain Only"
            description="Use Creative Commons and public domain content."
            checked={sourcing.ccPublicDomain}
            onCheckedChange={(v) => patchCompliance({ sourcing: { ccPublicDomain: v } })}
            icon={
              <div className="flex size-10 items-center justify-center rounded-md border border-amber-500/30 bg-amber-500/10">
                <Globe2 className="size-5 text-amber-400" />
              </div>
            }
          />
          <SourcingCard
            risk="Highest risk"
            riskClass="border-t-red-600"
            title="General Web Crawling"
            description="Best real-world footage — you accept full licensing responsibility."
            checked={sourcing.generalWebCrawling}
            onCheckedChange={(v) => patchCompliance({ sourcing: { generalWebCrawling: v } })}
            icon={
              <div className="flex size-10 items-center justify-center rounded-md border border-red-500/30 bg-red-500/10">
                <Search className="size-5 text-red-400" />
              </div>
            }
          />
        </div>

        <div className="relative mt-4 overflow-hidden rounded-xl border border-amber-500/20 bg-amber-500/5 px-4 py-3">
          <div className="pointer-events-none absolute inset-y-0 right-0 w-1/3 bg-gradient-to-l from-amber-500/15 to-transparent" />
          <div className="relative flex gap-2 text-xs leading-relaxed text-zinc-300">
            <Info className="mt-0.5 size-3.5 shrink-0 text-amber-400" />
            Enabling all sourcing options means you accept legal responsibility for third-party
            media. Prefer commercial stock for brand-safe channels.
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-white/8 bg-[#161618] p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]">
        <h3 className="text-sm font-semibold tracking-tight text-white">Blacklisted Webpages</h3>
        <p className="mt-1 text-xs text-zinc-500">
          Domains to never crawl when web sourcing is enabled (one per line).
        </p>
        <textarea
          value={profile.compliance.blacklistedWebpages.join("\n")}
          onChange={(e) =>
            patchCompliance({
              blacklistedWebpages: e.target.value
                .split("\n")
                .map((line) => line.trim())
                .filter(Boolean),
            })
          }
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
}: {
  risk: string;
  riskClass: string;
  title: string;
  description: string;
  checked: boolean;
  onCheckedChange: (v: boolean) => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        "rounded-xl border border-white/8 border-t-2 bg-white/[0.02] p-4 text-left transition hover:bg-white/[0.04]",
        riskClass,
        checked && "ring-1 ring-blue-500/30",
      )}
    >
      <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">{risk}</p>
      <div className="mt-3">{icon}</div>
      <div className="mt-3 flex items-start gap-2">
        <Checkbox
          checked={checked}
          onCheckedChange={(v) => onCheckedChange(v === true)}
          className="mt-0.5 border-white/30 data-[state=checked]:border-blue-500 data-[state=checked]:bg-blue-500"
          onClick={(e) => e.stopPropagation()}
        />
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-zinc-500">{description}</p>
        </div>
      </div>
    </button>
  );
}
