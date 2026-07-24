"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "motion/react";
import {
  Eye,
  ImageIcon,
  Mic,
  Paintbrush,
  Shield,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { OverviewTab } from "@/components/brand-profiles/tabs/overview-tab";
import { VoiceoverTab } from "@/components/brand-profiles/tabs/voiceover-tab";
import { CreativeAssetsTab } from "@/components/brand-profiles/tabs/creative-assets-tab";
import { ComplianceTab } from "@/components/brand-profiles/tabs/compliance-tab";
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
  { id: "creative", label: "Creative Assets", icon: ImageIcon },
  { id: "compliance", label: "Compliance", icon: Shield },
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
  const [tab, setTab] = useState<BrandProfileTab>(initialTab);
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

  function patchDraft(patch: Partial<BrandProfile>) {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev));
    setDirty(true);
  }

  function handleSave() {
    if (!draft) return;
    setSaving(true);
    try {
      updateProfile(draft.id, draft);
      setActiveProfileId(draft.id);
      setDirty(false);
      toast.success("Brand profile saved", {
        description: "Opening Studio — your settings apply to every new video.",
      });
      // Take the user to the creation pipeline (Studio) once the profile is saved.
      router.push("/studio");
    } catch (e) {
      toast.error("Could not save", {
        description: e instanceof Error ? e.message : "Check the profile name.",
      });
    } finally {
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
    <div className="mx-auto w-full max-w-5xl space-y-8 pb-16">
      <header className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Paintbrush className="size-5 text-zinc-300" />
            <h1 className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
              Brand profiles
            </h1>
          </div>
          <p className="mt-2 max-w-2xl text-sm text-zinc-400">
            Set up channel-specific settings for editing style, voice, and content compliance that
            apply to all your videos.
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
            disabled={saving || !dirty}
            className="rounded-lg bg-blue-600 px-4 text-white hover:bg-blue-500 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save brand profile"}
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
                "rounded-full px-3 py-1 text-xs font-medium transition",
                p.id === draft.id
                  ? "bg-blue-600 text-white"
                  : "bg-white/5 text-zinc-400 hover:bg-white/10 hover:text-white",
              )}
            >
              {p.name}
            </button>
          ))}
        </div>
      ) : null}

      <nav className="flex gap-1 overflow-x-auto border-b border-white/8 pb-px">
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
                active ? "text-blue-400" : "text-zinc-400 hover:text-zinc-200",
              )}
            >
              <Icon className="size-4" />
              {t.label}
              {active ? (
                <motion.span
                  layoutId="bp-tab-underline"
                  className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.8)]"
                />
              ) : null}
            </button>
          );
        })}
      </nav>

      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
        >
          {tab === "overview" ? <OverviewTab profile={draft} onChange={patchDraft} /> : null}
          {tab === "voiceover" ? <VoiceoverTab profile={draft} onChange={patchDraft} /> : null}
          {tab === "creative" ? <CreativeAssetsTab profile={draft} onChange={patchDraft} /> : null}
          {tab === "compliance" ? <ComplianceTab profile={draft} onChange={patchDraft} /> : null}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
