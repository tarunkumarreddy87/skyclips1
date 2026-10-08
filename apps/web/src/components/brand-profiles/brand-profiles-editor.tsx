"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import {
  Eye,
  ImageIcon,
  Sparkles,
  Mic,
  Paintbrush,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverviewTab } from "@/components/brand-profiles/tabs/overview-tab";
const VoiceoverTab = dynamic(() => import("@/components/brand-profiles/tabs/voiceover-tab").then(m => m.VoiceoverTab), { loading: () => <p className="p-6 text-sm text-muted-foreground" role="status">Loading settings…</p> });
const MotionGraphicsTab = dynamic(() => import("@/components/brand-profiles/tabs/motion-graphics-tab").then(m => m.MotionGraphicsTab));
const CreativeAssetsTab = dynamic(() => import("@/components/brand-profiles/tabs/creative-assets-tab").then(m => m.CreativeAssetsTab), { loading: () => <p className="p-6 text-sm text-muted-foreground" role="status">Loading settings…</p> });
import {
  useBrandProfileStore,
  type BrandProfile,
  type BrandProfileTab,
} from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TABS: Array<{
  id: BrandProfileTab;
  label: string;
  icon: typeof Eye;
}> = [
  { id: "overview", label: "Overview", icon: Eye },
  { id: "voiceover", label: "Voiceover", icon: Mic },
  { id: "creative", label: "Media sources", icon: ImageIcon },
  { id: "motion", label: "Motion graphics", icon: Sparkles },
];

type BrandProfilesEditorProps = {
  profileId?: string;
  initialTab?: BrandProfileTab;
};

export function BrandProfilesEditor({ profileId, initialTab = "overview" }: BrandProfilesEditorProps) {
  const router = useRouter();
  const profiles = useBrandProfileStore((s) => s.profiles);
  const activeProfileId = useBrandProfileStore((s) => s.activeProfileId);
  const updateProfile = useBrandProfileStore((s) => s.updateProfile);
  const deleteProfile = useBrandProfileStore((s) => s.deleteProfile);
  const setActiveProfileId = useBrandProfileStore((s) => s.setActiveProfileId);
  const hydrated = useBrandProfileStore((s) => s.hydrated);

  const resolvedId = profileId ?? activeProfileId ?? profiles[0]?.id;
  const stored = profiles.find((p) => p.id === resolvedId) ?? profiles[0];

  const [draft, setDraft] = useState<BrandProfile | null>(stored ?? null);
  const [tab, setTab] = useState<BrandProfileTab>(initialTab === "compliance" ? "creative" : initialTab);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const finish = () => useBrandProfileStore.getState().setHydrated(true);
    const unsub = useBrandProfileStore.persist.onFinishHydration(finish);
    if (useBrandProfileStore.persist.hasHydrated()) finish();
    return unsub;
  }, []);

  useEffect(() => {
    if (!stored) {
      setDraft(null);
      return;
    }
    setDraft(stored);
    setDirty(false);
  }, [stored?.id, hydrated]); // eslint-disable-line react-hooks/exhaustive-deps -- reset draft when switching profile

  useEffect(() => { router.prefetch("/studio"); }, [router]);

  function patchDraft(patch: Partial<BrandProfile>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  function handleSave() {
    if (!draft || saving) return;
    setSaving(true);
    try {
      const sources = draft.compliance.sourcing;
      if (!sources.commercialStock && !sources.generalWebCrawling && !sources.aiGeneratedImages) throw new Error("Choose at least one media source.");
      if (sources.aiGeneratedImages && !sources.imageModel) throw new Error("Choose an image generation model.");
      updateProfile(draft.id, draft);
      setActiveProfileId(draft.id);
      setDirty(false);

      // Take the user to the creation pipeline (Studio) once the profile is saved.
      router.push("/studio");
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : "Check the profile name.",
      });
      setSaving(false);
    }
  }

  function handleDelete() {
    if (!draft) return;
    if (profiles.length <= 1) {
      toast.error("Keep at least one brand profile");
      return;
    }
    deleteProfile(draft.id);
    toast.message("Brand profile deleted");
    router.push("/brand-profiles");
  }

  if (!hydrated) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center text-sm text-muted-foreground">
        Loading brand profiles…
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-border/60 bg-card p-8 text-center">
        <Paintbrush className="mx-auto size-8 text-muted-foreground" />
        <h2 className="mt-4 text-lg font-semibold">No brand profiles yet</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Create a profile from the studio prompt selector to set voice, theme, and compliance.
        </p>
        <Button className="mt-6" onClick={() => router.push("/studio")}>
          Go to Studio
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full channel-settings max-w-5xl flex flex-col gap-7 pb-16">
      <Link href="/studio" className="flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4" /> Back to studio</Link>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">

            <h1 className="font-display text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
              Channel settings
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Your voice, visual style, and defaults. Ready for every new story.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {profiles.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleDelete}
              className="text-zinc-400 hover:text-red-400"
            >
              <Trash2 className="size-3.5" />
              Delete
            </Button>
          ) : null}
          <Button
            type="button"
            onClick={handleSave}
            disabled={saving || !draft.name.trim()}
            className="rounded-full px-5"
          >
            <Check />{saving ? "Saving…" : "Save & return"}
            {dirty ? (
              <span className="ml-1.5 size-1.5 rounded-full bg-white/90" aria-hidden />
            ) : null}
          </Button>
        </div>
      </header>

      {profiles.length > 1 ? (
        <div className="flex flex-wrap gap-2">
          {profiles.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                if (dirty && !window.confirm("Discard unsaved changes?")) return;
                router.push(`/brand-profiles/${p.id}`);
              }}
              className={cn(
                "rounded-full px-4 py-2 text-sm font-medium transition",
                p.id === draft.id
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "bg-muted text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto rounded-2xl border border-border bg-muted/40 p-1.5">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "relative inline-flex items-center gap-2 whitespace-nowrap px-3 py-2.5 text-sm font-medium transition",
                active ? "rounded-xl bg-card text-foreground shadow-sm" : "rounded-xl text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {t.label}

            </button>
          );
        })}
      </nav>

        <div
          key={tab}
        >
          {tab === "motion" ? <MotionGraphicsTab profile={draft} onChange={patchDraft} /> : null}
          {tab === "overview" ? <OverviewTab profile={draft} onChange={patchDraft} /> : null}
          {tab === "voiceover" ? <VoiceoverTab profile={draft} onChange={patchDraft} /> : null}
          {tab === "creative" ? <CreativeAssetsTab profile={draft} onChange={patchDraft} /> : null}
        </div>
    </div>
  );
}
