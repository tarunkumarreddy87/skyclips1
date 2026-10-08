"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, FileText, Loader2, Plus, Clock3, X, ArrowUpRight, Zap, Layers } from "lucide-react";
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
import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";
import { useStudioDraft } from "@/lib/studio-draft";
import { useSession } from "@/lib/auth-client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

const MODEL_TRIGGER = "studio-composer-control";

type PromptHeroProps = {
  seedPrompt?: string;
  onSeedConsumed?: () => void;
};

export function PromptHero({ seedPrompt, onSeedConsumed }: PromptHeroProps) {
  const router = useRouter();
  const scriptRef = useRef<HTMLInputElement>(null);
  const { prompt, title, model, scriptFile, durationOverride, patch } = useStudioDraft();
  const setPrompt = (prompt: string) => patch({ prompt });
  const setTitle = (title: string) => patch({ title });
  const setModel = (model: ModelId) => patch({ model });
  const setScriptFile = (scriptFile: File | null) => patch({ scriptFile });
  const setDurationOverride = (minutes: number | null) => {
    if (minutes !== null && brand) useBrandProfileStore.getState().updateProfile(brand.id, { defaultDurationMin: minutes });
    patch({ durationOverride: null });
  };
  const [submitting, setSubmitting] = useState(false);
  const submitInFlight = useRef(false);
  const { data: session } = useSession();
  const displayName = session?.user.name?.trim();
  const firstName = displayName && !displayName.includes("@")
    ? displayName.split(/\s+/)[0]
    : undefined;

  const profiles = useBrandProfileStore((s) => s.profiles);
  const activeProfileId = useBrandProfileStore((s) => s.activeProfileId);
  const brand = profiles.find((p) => p.id === activeProfileId) ?? profiles[0];

  const durationMin = brand?.defaultDurationMin ?? durationOverride ?? 10;

  const selectedModel = models.find((m) => m.id === model) ?? models[0];

  useEffect(() => { void useStudioDraft.persist.rehydrate(); }, []);

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
    if (!prompt.trim() || submitInFlight.current) return;
    if (!useBrandProfileStore.persist.hasHydrated()) {
      toast.message("Channel settings are still loading. Please try again in a moment.");
      return;
    }
    submitInFlight.current = true;
    setSubmitting(true);
    try {
      let scriptText: string | undefined;
      if (scriptFile) {
        scriptText = await scriptFile.text();
      }

      const formatMode = brand?.formatMode ?? "documentary";
      const themeId = "standard";
      const voiceId = brand?.voiceId ?? "shubh";
      const language = brand?.language
        ? brand.language.startsWith("en")
          ? "en"
          : brand.language
        : parseLanguageFromPrompt(prompt.trim(), "en");

      const targetDurationSec = durationMin * 60;
      const sources = brand?.compliance.sourcing;
      if (sources && !sources.commercialStock && !sources.generalWebCrawling && !sources.aiGeneratedImages) throw new Error("Choose a media source in channel settings.");
      if (sources?.aiGeneratedImages && !sources.imageModel) throw new Error("Choose an image model in channel settings.");
      if (!["en", "hi", "te", "ta", "kn", "ml", "bn", "mr", "gu", "pa", "or", "od"].includes(language)) {
        throw new Error("Choose a supported narration language in your channel profile before creating a video.");
      }
      const brandLine = brand
        ? `Brand profile: ${brand.name}. Theme: ${themeId}. Voice: ${voiceId}.`
        : "";
      const lengthLine = `Target length: ${durationMin} minutes (${targetDurationSec} seconds).`;
      const formatLine = `Format: ${formatMode}.`;
      const composedPrompt = [prompt.trim(), brandLine, formatLine, lengthLine]
        .filter(Boolean)
        .join("\n\n");

      const project = await createProject({
        title: title.trim() || prompt.trim().slice(0, 80) || "Untitled video",
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
      const quoteToApprove = await updateQuote(project.id, {
        formatMode,
        durationSec: targetDurationSec,
        modelId: model,
        language,
        voiceId,
        brandProfileId: themeId,
      });
      await approveQuote(project.id, quoteToApprove.id);
      await startGeneration(project.id, {
        brandCompliance: brandComplianceForGenerate(brand),
      });

      useStudioDraft.getState().clear();
      router.push(`/projects/${project.id}/queue`);
    } catch (e) {
      toast.error("Could not start video", {
        description: e instanceof Error ? e.message : "Check that the API is running.",
      });
    } finally {
      submitInFlight.current = false;
      setSubmitting(false);
    }
  }

  return (
    <section className="studio-prompt mx-auto w-full max-w-3xl" aria-label="Create a video">
      <div className="mb-8 flex flex-col items-center gap-3 text-center sm:mb-10">
        <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Your next great story</p>
        <h1 className="text-3xl font-medium leading-tight tracking-[-0.045em] text-foreground sm:text-[2.75rem]">
          {firstName ? `What’s cooking, ${firstName}?` : "What will you create today?"}
        </h1>
        <p className="text-sm text-muted-foreground">An idea, a script, a story worth telling. Start here.</p>
      </div>

      <div className="studio-composer-shell">
        <div className="studio-composer-heading">
          <label className="studio-composer-title">
            <span>Title</span>
            <input aria-label="Video title" maxLength={80} placeholder="Give your story a name…" value={title} onChange={e => setTitle(e.target.value)} disabled={submitting} />
          </label>
          <BrandProfileSelector />
        </div>
        <InputGroup className="studio-composer" aria-label="Video prompt" aria-busy={submitting}>
          <InputGroupTextarea
            aria-label="Describe your video"
            value={prompt}
            disabled={submitting}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Describe the video you want to create…"
            className="studio-composer-textarea"
            onKeyDown={e => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void handleSubmit();
              }
            }}
          />
          {scriptFile && (
            <div className="px-5 pb-2">
              <span className="studio-script-chip">
                <FileText className="size-3.5 shrink-0" />
                <span className="max-w-[220px] truncate">{scriptFile.name}</span>
                <button type="button" disabled={submitting} aria-label="Remove attached script" onClick={() => setScriptFile(null)}><X className="size-3.5" /></button>
              </span>
            </div>
          )}
          <InputGroupAddon className="studio-composer-toolbar">
            <div className="flex items-center gap-1 sm:gap-2">
              <input ref={scriptRef} type="file" accept=".txt,.md,text/plain" className="hidden" onChange={e => { handleFile(e.target.files?.[0] ?? null); e.target.value = ""; }} />
              <button type="button" disabled={submitting} onClick={handleAttachScript} className="studio-composer-attach" aria-label="Attach script" title="Attach a text or Markdown script">
                <Plus className="size-5" />
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" disabled={submitting} className={MODEL_TRIGGER} aria-label="Video length" />}>
                  <Clock3 className="size-4" />
                  <span>{durationMin} min</span><ChevronDown className="size-3 opacity-50" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" sideOffset={6} className="studio-choice-menu studio-length-menu w-48">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="studio-choice-heading">Video length</DropdownMenuLabel>
                    {[1, 3, 5, 10, 15].map(minutes => (
                      <DropdownMenuItem key={minutes} className="studio-duration-option" data-selected={durationMin === minutes} onClick={() => setDurationOverride(minutes)}>
                        <span className="flex-1 tabular-nums">{minutes} min</span>
                        {durationMin === minutes && <Check />}
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuItem onClick={() => setDurationOverride(null)}>Use channel default</DropdownMenuItem>
                  </DropdownMenuGroup>
                  <DropdownMenuSeparator />
                  <DropdownMenuGroup>
                    <DropdownMenuItem onClick={() => router.push(brand ? `/brand-profiles/${encodeURIComponent(brand.id)}` : "/brand-profiles")}>
                      Channel settings <ArrowUpRight />
                    </DropdownMenuItem>
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            <div className="flex min-w-0 items-center gap-2 sm:gap-3">
              <DropdownMenu>
                <DropdownMenuTrigger render={<button type="button" disabled={submitting} className={MODEL_TRIGGER} aria-label="Choose video model" />}>
                  <span className="truncate">{selectedModel.label}</span>
                  <ChevronDown className="size-3.5 shrink-0 opacity-60" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" sideOffset={6} className="studio-choice-menu w-60">
                  <DropdownMenuGroup>
                    <DropdownMenuLabel className="studio-choice-heading">Model</DropdownMenuLabel>
                    {models.map(m => (
                      <DropdownMenuItem key={m.id} onClick={() => setModel(m.id)} className="studio-model-option" data-selected={model === m.id}>
                        <span className="studio-model-icon">{m.id === "skyclip-v1-pro" ? <Layers /> : <Zap />}</span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{m.label}</p>
                          <p className="mt-1 text-xs text-muted-foreground">{m.id === "skyclip-v1-pro" ? "Deeper research" : "Fast & balanced"}</p>
                        </div>
                        {model === m.id && <Check />}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button onClick={() => void handleSubmit()} disabled={!prompt.trim() || submitting} size="icon" className="studio-composer-submit" aria-label="Create video">
                {submitting ? <Loader2 className="animate-spin" /> : <ArrowUp />}
              </Button>
            </div>
          </InputGroupAddon>
        </InputGroup>
      </div>
      <div className="mt-3 flex items-center justify-between gap-3 px-2 text-[11px] text-muted-foreground">
        <span>{durationMin} min · {brand?.formatMode === "listicle" ? "Listicle" : "Documentary"}</span>
        <span>{submitting ? "Starting your production…" : "⌘ / Ctrl + Enter to create"}</span>
      </div>
    </section>
  );
}
