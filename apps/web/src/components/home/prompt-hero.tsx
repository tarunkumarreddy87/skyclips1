"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, FileText, Loader2, Plus } from "lucide-react";
import { models, type ModelId } from "@/lib/mock-data";
import {
  approveQuote,
  createProject,
  generateQuote,
  requestScriptUploadUrl,
  startGeneration,
  updateBrief,
  updateQuote,
  uploadFileToPresignedUrl,
} from "@/lib/api-client";
import { parseLanguageFromPrompt } from "@/lib/prompt-parse";
import { BrandProfileSelector } from "@/components/brand-profiles/brand-profile-selector";
import { useBrandProfileStore } from "@/lib/brand-profiles";
import { brandComplianceForGenerate } from "@/lib/brand-profiles/compliance-payload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const MODEL_TRIGGER =
  "inline-flex h-8 items-center justify-center gap-1 rounded-full border border-white/10 bg-white/[0.04] px-2.5 text-[12px] font-medium text-zinc-300 transition-colors hover:border-white/16 hover:bg-white/[0.07] hover:text-white";

type PromptHeroProps = {
  seedPrompt?: string;
  onSeedConsumed?: () => void;
};

export function PromptHero({ seedPrompt, onSeedConsumed }: PromptHeroProps) {
  const router = useRouter();
  const scriptRef = useRef<HTMLInputElement>(null);
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState<ModelId>("skyclip-v1");
  const [scriptFile, setScriptFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [focused, setFocused] = useState(false);

  const profiles = useBrandProfileStore((s) => s.profiles);
  const activeProfileId = useBrandProfileStore((s) => s.activeProfileId);
  const brand = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  const selectedModel = models.find((m) => m.id === model) ?? models[0];

  useEffect(() => {
    if (!seedPrompt) return;
    setPrompt(seedPrompt);
    onSeedConsumed?.();
  }, [seedPrompt, onSeedConsumed]);

  function handleAttachScript() {
    scriptRef.current?.click();
  }

  function handleFile(file: File | null) {
    if (!file) return;
    setScriptFile(file);
  }

  async function handleSubmit() {
    if (!prompt.trim() || submitting) return;
    setSubmitting(true);
    try {
      let scriptText: string | undefined;
      if (scriptFile) {
        scriptText = await scriptFile.text();
      }

      const durationMin = brand?.defaultDurationMin ?? 10;
      const formatMode = brand?.formatMode ?? "documentary";
      const themeId = brand?.themeId ?? "standard";
      const voiceId = brand?.voiceId ?? "shubh";
      const language = brand?.language
        ? brand.language.startsWith("en")
          ? "en"
          : brand.language
        : parseLanguageFromPrompt(prompt.trim(), "en");

      const targetDurationSec = durationMin * 60;
      const brandLine = brand
        ? `Brand profile: ${brand.name}. Theme: ${themeId}. Voice: ${voiceId}.`
        : "";
      const lengthLine = `Target length: ${durationMin} minutes (${targetDurationSec} seconds).`;
      const formatLine = `Format: ${formatMode}.`;
      const composedPrompt = [prompt.trim(), brandLine, formatLine, lengthLine]
        .filter(Boolean)
        .join("\n\n");

      const project = await createProject({
        title: prompt.trim().slice(0, 80) || "Untitled video",
        entryPath: scriptFile ? "script_first" : "prompt_first",
        formatMode,
        promptText: composedPrompt,
        scriptText: scriptText?.trim() || undefined,
        targetDurationSec,
        language,
        modelId: model,
        brandProfileId: themeId,
      });

      if (scriptFile) {
        const { uploadUrl, s3Key } = await requestScriptUploadUrl(
          project.id,
          scriptFile.name,
          scriptFile.type || "text/plain",
        );
        await uploadFileToPresignedUrl(uploadUrl, scriptFile);
        await updateBrief(project.id, { scriptS3Key: s3Key });
      }

      await generateQuote(project.id);
      await updateQuote(project.id, {
        formatMode,
        durationSec: targetDurationSec,
        modelId: model,
        language,
        voiceId,
        brandProfileId: themeId,
      });
      await approveQuote(project.id);
      await startGeneration(project.id, {
        brandCompliance: brandComplianceForGenerate(brand),
      });

      toast.success("Production started", {
        description: brand
          ? `${brand.name} · ${durationMin} min · ${themeId}`
          : `${durationMin} min`,
      });
      router.push(`/projects/${project.id}/queue`);
    } catch (e) {
      toast.error("Could not start video", {
        description: e instanceof Error ? e.message : "Check that the API is running.",
      });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-2xl">
      <div className="mb-9 text-center">
        <h1
          className="text-[2rem] leading-tight tracking-[-0.02em] text-white sm:text-[2.55rem] md:text-[2.75rem]"
          style={{
            fontFamily: "var(--font-studio-serif), Georgia, 'Times New Roman', serif",
          }}
        >
          <span
            className="mr-2 inline-block align-middle text-[1.2em] leading-none text-[#F0A46A]"
            aria-hidden
          >
            ✴
          </span>
          What&apos;s cooking, Tarun?
        </h1>
      </div>

      <div
        className={cn(
          "prompt-aura relative rounded-[1.75rem] p-[1.5px] transition-[filter] duration-500",
          focused && "prompt-aura-active",
        )}
      >
        <div className="prompt-aura-spin" aria-hidden />
        <div className="relative z-10 overflow-hidden rounded-[calc(1.75rem-1.5px)] bg-[#1a1a1a] text-white shadow-[0_24px_80px_-36px_rgba(0,0,0,0.55)] ring-1 ring-white/[0.08]">
          <div
            className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_0%,rgba(255,255,255,0.05),transparent_55%)]"
            aria-hidden
          />
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder="How can I help you today?"
            className="relative min-h-[132px] resize-none border-0 bg-transparent px-5 py-5 text-base text-white shadow-none placeholder:text-zinc-500 focus-visible:ring-0"
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void handleSubmit();
            }}
          />

          <div className="relative flex items-center justify-between gap-3 border-t border-white/[0.06] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2">
              <input
                ref={scriptRef}
                type="file"
                accept=".txt,.md,text/plain"
                className="hidden"
                onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                onClick={handleAttachScript}
                className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.03] text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
                aria-label="Attach script"
              >
                <Plus className="size-4" />
              </button>
              <BrandProfileSelector />
              {scriptFile ? (
                <span className="ml-1 flex max-w-[100px] items-center gap-1 truncate text-[11px] text-zinc-500">
                  <FileText className="size-3 shrink-0" />
                  {scriptFile.name}
                </span>
              ) : null}
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" className={MODEL_TRIGGER} />}>
                  <span className="max-w-[140px] truncate">{selectedModel.label}</span>
                  <ChevronDown className="size-3.5 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="z-[100] w-64 border-white/10 bg-[#1c1c1c] text-white"
                >
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="text-zinc-400">Model</DropdownMenuLabel>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator className="bg-white/10" />
                  <DropdownMenuGroup>
                    {models.map((m) => (
                      <DropdownMenuItem
                        key={m.id}
                        onClick={() => setModel(m.id)}
                        className="flex items-start gap-2 py-2 text-zinc-100 data-highlighted:bg-white/8"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium">{m.label}</p>
                          <p className="text-xs text-zinc-500">
                            {m.id === "skyclip-v1-pro"
                              ? "Higher quality scripts & denser research"
                              : "Fast, balanced production default"}
                          </p>
                        </div>
                        {model === m.id ? (
                          <Check className="mt-0.5 size-4 shrink-0 text-white" />
                        ) : null}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                onClick={() => void handleSubmit()}
                disabled={!prompt.trim() || submitting}
                size="icon"
                className="size-8 shrink-0 rounded-full bg-white text-[#111] hover:bg-zinc-200 disabled:opacity-40"
                aria-label="Create video"
              >
                {submitting ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <ArrowUp className="size-3.5" />
                )}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
