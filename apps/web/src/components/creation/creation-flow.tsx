"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CheckCircle2,
  Circle,
  Loader2,
  Sparkles,
  AlertCircle,
  ImageIcon,
  FileCheck2,
  Wand2,
} from "lucide-react";
import {
  createDraftProject,
  getProjectById,
  registerProject,
  thumbnailOptions,
  type MockProject,
  type ReasoningLevel,
  type ModelId,
} from "@/lib/mock-data";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { QuoteStatementDialog } from "@/components/creation/quote-statement-dialog";

type Step = "prompt" | "checker" | "thumbnail" | "quote" | "generate";

const steps: { id: Step; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: "prompt", label: "Prompt", icon: Wand2 },
  { id: "checker", label: "AI Prompt Checker", icon: FileCheck2 },
  { id: "thumbnail", label: "Thumbnail", icon: ImageIcon },
  { id: "quote", label: "Quote Statement", icon: Sparkles },
  { id: "generate", label: "Generate", icon: CheckCircle2 },
];

export function CreationFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState<Step>("prompt");
  const [checkerState, setCheckerState] = useState<"idle" | "checking" | "passed" | "issues">("idle");
  const [checkerNotes, setCheckerNotes] = useState<string[]>([]);
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [generating, setGenerating] = useState(false);

  const initialProject = useMemo(() => {
    const existingId = searchParams.get("project");
    if (existingId) {
      const existing = getProjectById(existingId);
      if (existing) return { ...existing };
    }
    const prompt = searchParams.get("prompt") ?? "";
    const attachment = searchParams.get("attachment");
    const attachmentName = searchParams.get("attachmentName");
    return createDraftProject(prompt, {
      brandProfileId: searchParams.get("brand") ?? "bp-1",
      model: (searchParams.get("model") as ModelId) ?? "skyclip-v1",
      reasoning: (searchParams.get("reasoning") as ReasoningLevel) ?? "balanced",
      hasCustomScript: attachment === "script",
      hasCustomVoiceover: attachment === "voiceover",
      title: prompt.slice(0, 60) || "Untitled video",
    });
  }, [searchParams]);

  const [project, setProject] = useState<MockProject>(initialProject);
  const attachmentLabel = searchParams.get("attachmentName");

  useEffect(() => {
    if (step === "checker" && checkerState === "idle") {
      setCheckerState("checking");
      const timer = setTimeout(() => {
        const hasIssues = project.prompt.length < 40;
        setCheckerState(hasIssues ? "issues" : "passed");
        setCheckerNotes(
          hasIssues
            ? ["Prompt is short — add audience, tone, or key points for better results."]
            : ["Clear topic and scope.", "Good length for documentary format.", "No policy conflicts detected."],
        );
      }, 1400);
      return () => clearTimeout(timer);
    }
  }, [step, checkerState, project.prompt.length]);

  function updateProject(updates: Partial<MockProject>) {
    setProject((prev) => ({ ...prev, ...updates }));
  }

  function goNext() {
    const idx = steps.findIndex((s) => s.id === step);
    if (idx < steps.length - 1) setStep(steps[idx + 1].id);
  }

  function handleQuoteApprove() {
    setQuoteOpen(false);
    setStep("generate");
    setGenerating(true);
    const queued = { ...project, status: "processing" as const };
    registerProject(queued);
    setTimeout(() => {
      router.push(`/projects/${project.id}/queue`);
    }, 1800);
  }

  const stepIndex = steps.findIndex((s) => s.id === step);

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Create video</h1>
        <p className="text-sm text-muted-foreground">Prompt-first production workspace</p>
      </div>

      {/* Step rail */}
      <div className="flex flex-wrap gap-2">
        {steps.map((s, i) => {
          const Icon = s.icon;
          const done = i < stepIndex;
          const active = s.id === step;
          return (
            <div
              key={s.id}
              className={cn(
                "flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active && "border-primary bg-primary/5 text-foreground",
                done && !active && "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
                !active && !done && "text-muted-foreground",
              )}
            >
              {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
              {s.label}
            </div>
          );
        })}
      </div>

      {/* Step content */}
      {step === "prompt" && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <label className="text-sm font-medium">Your prompt</label>
            <Textarea
              value={project.prompt}
              onChange={(e) => updateProject({ prompt: e.target.value, title: e.target.value.slice(0, 60) })}
              className="min-h-[160px] text-base"
              placeholder="Describe the video you want to create..."
            />
            <div className="flex justify-end">
              <Button onClick={goNext} disabled={!project.prompt.trim()}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "checker" && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <div className="flex items-center gap-3">
              {checkerState === "checking" && <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />}
              {checkerState === "passed" && <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
              {checkerState === "issues" && <AlertCircle className="h-5 w-5 text-amber-600" />}
              <div>
                <p className="font-medium">AI Prompt Checker</p>
                <p className="text-sm text-muted-foreground">
                  {checkerState === "checking" && "Analyzing clarity, scope, and policy..."}
                  {checkerState === "passed" && "Prompt looks good."}
                  {checkerState === "issues" && "Suggestions available — you can still continue."}
                </p>
              </div>
            </div>
            <ul className="space-y-2">
              {checkerNotes.map((note) => (
                <li key={note} className="flex items-start gap-2 rounded-lg border bg-muted/30 px-3 py-2 text-sm">
                  <Circle className="mt-1 h-2 w-2 shrink-0 fill-current text-muted-foreground" />
                  {note}
                </li>
              ))}
            </ul>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("prompt")}>
                Back
              </Button>
              <Button onClick={goNext} disabled={checkerState === "checking"}>
                Continue
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "thumbnail" && (
        <Card>
          <CardContent className="space-y-4 p-6">
            <p className="text-sm text-muted-foreground">Choose a thumbnail style for your project.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {thumbnailOptions.map((thumb) => (
                <button
                  key={thumb.id}
                  type="button"
                  onClick={() => updateProject({ thumbnailId: thumb.id })}
                  className={cn(
                    "overflow-hidden rounded-xl border-2 text-left transition-all",
                    project.thumbnailId === thumb.id ? "border-primary ring-2 ring-primary/20" : "border-transparent",
                  )}
                >
                  <div className={cn("h-24 bg-gradient-to-br", thumb.gradient)} />
                  <p className="px-3 py-2 text-sm font-medium">{thumb.label}</p>
                </button>
              ))}
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("checker")}>
                Back
              </Button>
              <Button onClick={() => { setStep("quote"); setQuoteOpen(true); }} disabled={!project.thumbnailId}>
                Review quote
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {step === "quote" && !quoteOpen && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-8 text-center">
            <Sparkles className="h-8 w-8 text-muted-foreground" />
            <p className="text-muted-foreground">Open the Quote Statement to review settings.</p>
            <Button onClick={() => setQuoteOpen(true)}>Open Quote Statement</Button>
          </CardContent>
        </Card>
      )}

      {step === "generate" && (
        <Card>
          <CardContent className="flex flex-col items-center gap-4 p-12 text-center">
            {generating ? (
              <>
                <Loader2 className="h-10 w-10 animate-spin text-primary" />
                <p className="font-medium">Starting generation...</p>
                <p className="text-sm text-muted-foreground">Redirecting to queue view</p>
              </>
            ) : (
              <Button onClick={() => router.push(`/projects/${project.id}/queue`)}>View queue</Button>
            )}
          </CardContent>
        </Card>
      )}

      <QuoteStatementDialog
        open={quoteOpen}
        onOpenChange={setQuoteOpen}
        project={project}
        onUpdate={updateProject}
        onApprove={handleQuoteApprove}
        attachmentLabel={attachmentLabel}
      />
    </div>
  );
}
