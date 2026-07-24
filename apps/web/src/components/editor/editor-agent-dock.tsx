"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Film,
  Loader2,
  Paperclip,
  Plus,
  Sparkles,
  X,
} from "lucide-react";
import { useEditorStore } from "@/lib/editor/store";
import { runEditorAgent } from "@/lib/editor/agent/run-agent";
import { resolveMediaUrl } from "@/lib/editor/media-url";
import type { TimelineItem } from "@/lib/editor/types";
import { useIsTablet } from "@/lib/editor/use-is-mobile";
import { Button } from "@/components/ui/button";
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
import { AGENT_CLIP_MIME } from "@/components/editor/agent-mention";

export type EditorAgentDockLayout = "overlay" | "panel";

interface EditorAgentDockProps {
  projectId: string;
  /** overlay = fixed/slide-in (tablet or closed desktop); panel = fills resizable parent */
  layout?: EditorAgentDockLayout;
}

type ChipTone = "media" | "motion" | "audio";

interface MentionSnapshot {
  id: string;
  label: string;
  thumbUrl: string;
  durationLabel: string;
  tone: ChipTone;
}

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: string;
  bullets?: string[];
  imageUrl?: string;
  mentions?: MentionSnapshot[];
}

interface PendingImage {
  file: File;
  previewUrl: string;
}

interface WorkStep {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
}

type AgentMode = "agent";
type AgentSpeed = "fast" | "smart";

/** VidRush Rush Agent–style empty-state prompts (voiceover regen excluded — ADR 0004). */
const SUGGESTIONS = [
  "Explain what Editor Agent can do, and how I can use you most effectively.",
  "Find a better alternative for this media",
  "Add a glitch transition on the next cut",
];

const CLIP_ACTIONS = [
  { id: "replace", label: "Replace media", prompt: "Find a better alternative for this media" },
  { id: "glitch", label: "Glitch after", prompt: "Add a glitch transition after this clip" },
  { id: "motion", label: "Motion graphic", prompt: "Add a motion graphic on this clip" },
  { id: "cta", label: "Subscribe CTA", prompt: "Add a subscribe CTA on this clip" },
] as const;

const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

const WORK_PIPELINE: Array<{ id: string; label: string }> = [
  { id: "read", label: "Reading timeline context" },
  { id: "plan", label: "Planning edits" },
  { id: "apply", label: "Applying changes" },
];

function extractBullets(reply: string): { prose: string; bullets: string[] } {
  const lines = reply.split("\n").map((l) => l.trim()).filter(Boolean);
  const bullets = lines
    .filter((l) => l.startsWith("•") || l.startsWith("-") || l.startsWith("*"))
    .map((l) => l.replace(/^[•\-*]\s*/, ""));
  const prose = lines
    .filter((l) => !(l.startsWith("•") || l.startsWith("-") || l.startsWith("*")))
    .join("\n");
  return { prose: prose || (bullets.length ? "" : reply), bullets };
}

function formatClipDuration(item: TimelineItem): string {
  const sec = Math.max(0, (item.endMs - item.startMs) / 1000);
  return `${sec.toFixed(1)}s`;
}

function clipTypeLabel(item: TimelineItem): string {
  if (item.type === "video") return "Video";
  if (item.type === "broll") return "Image";
  if (item.type === "captions") return "Caption";
  if (item.type === "text") return "Text";
  if (item.type === "animation") return "Motion";
  if (item.type === "music") return "Music";
  if (item.type === "sfx") return "SFX";
  return item.type;
}

function clipThumbUrl(
  item: TimelineItem,
  getAsset: (id: string) => { url?: string; thumbnailUrl?: string; mediaType?: string } | undefined,
): string {
  if (item.type === "video" || item.type === "broll") {
    const asset = getAsset(item.assetId);
    // Prefer real image posters; fall back to playable media URL for video-element thumbs.
    return (
      resolveMediaUrl(item.thumbnailUrl || "") ||
      resolveMediaUrl(asset?.thumbnailUrl || "") ||
      (asset?.mediaType === "image" ? resolveMediaUrl(asset.url || "") : "") ||
      resolveMediaUrl(asset?.url || "") ||
      ""
    );
  }
  return "";
}

function isVideoThumbUrl(url: string, mediaType?: string): boolean {
  if (!url) return false;
  if (mediaType === "video") return true;
  return /\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(url);
}

function shortClipLabel(item: TimelineItem): string {
  const raw = item.label || clipTypeLabel(item);
  const truncated = raw.length > 22 ? `${raw.slice(0, 20)}…` : raw;
  const hash = item.id.replace(/\D/g, "").slice(-3) || item.id.slice(-3);
  return `${truncated} #${hash}`;
}

function findItemById(id: string): TimelineItem | null {
  const tracks = useEditorStore.getState().timeline.tracks;
  for (const track of tracks) {
    const found = track.items.find((i) => i.id === id);
    if (found) return found;
  }
  return null;
}

function chipToneForItem(item: TimelineItem): ChipTone {
  if (item.type === "animation" || item.type === "text") return "motion";
  if (
    item.type === "narration" ||
    item.type === "music" ||
    item.type === "sfx"
  ) {
    return "audio";
  }
  return "media";
}

const CHIP_TONE_STYLES: Record<
  ChipTone,
  { shell: string; label: string; meta: string; remove: string; iconBg: string }
> = {
  media: {
    shell:
      "border-[#60A5FA]/50 bg-[#2563EB]/25 shadow-[0_0_0_1px_rgba(37,99,235,0.14)]",
    label: "text-sky-50",
    meta: "text-sky-200/55",
    remove: "text-sky-200/65 hover:bg-white/10 hover:text-white",
    iconBg: "bg-black/50 text-[#93C5FD] ring-white/20",
  },
  /* Rush-style orange chip for motion / generated overlays */
  motion: {
    shell:
      "border-orange-300/55 bg-[#F97316]/90 shadow-[0_0_0_1px_rgba(249,115,22,0.2)]",
    label: "text-orange-50",
    meta: "text-orange-100/70",
    remove: "text-orange-50/70 hover:bg-black/20 hover:text-white",
    iconBg: "bg-orange-950/35 text-orange-50 ring-orange-200/30",
  },
  audio: {
    shell:
      "border-amber-300/50 bg-[#F59E0B]/90 shadow-[0_0_0_1px_rgba(245,158,11,0.2)]",
    label: "text-amber-950",
    meta: "text-amber-950/60",
    remove: "text-amber-950/55 hover:bg-black/10 hover:text-amber-950",
    iconBg: "bg-amber-950/25 text-amber-50 ring-amber-900/20",
  },
};

function MentionChip({
  label,
  thumbUrl,
  durationLabel,
  tone = "media",
  onRemove,
  compact,
  mediaType,
}: {
  label: string;
  thumbUrl: string;
  durationLabel?: string;
  tone?: ChipTone;
  onRemove?: () => void;
  compact?: boolean;
  mediaType?: string;
}) {
  const styles = CHIP_TONE_STYLES[tone];
  return (
    <div
      className={cn(
        // Rush-style rectangle tag (not a pill)
        "inline-flex max-w-full items-center gap-1.5 rounded-md border py-1 pl-1 pr-1.5",
        styles.shell,
        compact && "py-0.5 pr-1",
      )}
    >
      <div
        className={cn(
          "relative size-5 shrink-0 overflow-hidden rounded-[4px] ring-1",
          styles.iconBg,
        )}
      >
        {thumbUrl ? (
          isVideoThumbUrl(thumbUrl, mediaType) ? (
            <video
              src={thumbUrl}
              muted
              playsInline
              preload="metadata"
              className="size-full object-cover"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumbUrl} alt="" className="size-full object-cover" />
          )
        ) : (
          <span className="flex size-full items-center justify-center">
            {tone === "motion" ? (
              <Sparkles className="size-2.5" />
            ) : (
              <Film className="size-2.5" />
            )}
          </span>
        )}
      </div>
      <span className={cn("min-w-0 truncate text-[11px] font-semibold leading-none", styles.label)}>
        {label}
      </span>
      {durationLabel ? (
        <span className={cn("shrink-0 text-[10px] tabular-nums", styles.meta)}>
          {durationLabel}
        </span>
      ) : null}
      {onRemove ? (
        <button
          type="button"
          title="Remove mention"
          onClick={onRemove}
          className={cn(
            "inline-flex size-4 shrink-0 items-center justify-center rounded-sm transition",
            styles.remove,
          )}
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </div>
  );
}

export function EditorAgentDock({
  projectId,
  layout = "overlay",
}: EditorAgentDockProps) {
  const open = useEditorStore((s) => s.ui.agentPanelOpen);
  const isTablet = useIsTablet();
  const toggleAgentPanel = useEditorStore((s) => s.toggleAgentPanel);
  const setAgentBusy = useEditorStore((s) => s.setAgentBusy);
  const getAsset = useEditorStore((s) => s.getAsset);
  const addBroll = useEditorStore((s) => s.addBroll);
  const mentionIds = useEditorStore((s) => s.ui.agentMentionIds);
  const addAgentMentions = useEditorStore((s) => s.addAgentMentions);
  const removeAgentMention = useEditorStore((s) => s.removeAgentMention);
  const clearAgentMentions = useEditorStore((s) => s.clearAgentMentions);
  const selectedItemId = useEditorStore((s) => s.ui.selectedItemId);
  const tracks = useEditorStore((s) => s.timeline.tracks);

  const [input, setInput] = useState("");
  const [focused, setFocused] = useState(false);
  const [busy, setBusy] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [workSteps, setWorkSteps] = useState<WorkStep[]>([]);
  const [pendingImage, setPendingImage] = useState<PendingImage | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [agentMode, setAgentMode] = useState<AgentMode>("agent");
  const [agentSpeed, setAgentSpeed] = useState<AgentSpeed>("fast");
  const [dragOver, setDragOver] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const stepTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const connectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const mentionedItems = useMemo(() => {
    const items: TimelineItem[] = [];
    for (const id of mentionIds) {
      for (const track of tracks) {
        const found = track.items.find((i) => i.id === id);
        if (found) {
          items.push(found);
          break;
        }
      }
    }
    return items;
  }, [mentionIds, tracks]);

  const isEmptyThread = messages.length === 0 && !busy && !connecting;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, open, busy, connecting, workSteps]);

  useEffect(() => {
    return () => {
      if (pendingImage) URL.revokeObjectURL(pendingImage.previewUrl);
      if (stepTimerRef.current) clearInterval(stepTimerRef.current);
      if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    };
  }, [pendingImage]);

  // Click-to-mention: selecting a clip while agent is open adds it (deduped).
  useEffect(() => {
    if (!open || !selectedItemId) return;
    if (selectedItemId.startsWith("caption")) return;
    addAgentMentions([selectedItemId]);
  }, [selectedItemId, open, addAgentMentions]);

  function clearPendingImage() {
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return null;
    });
    if (fileRef.current) fileRef.current.value = "";
  }

  function startWorkAnimation(hasImage: boolean, hasText: boolean) {
    const pipeline =
      hasImage && !hasText
        ? [
            { id: "read", label: "Preparing image" },
            { id: "apply", label: "Placing on Image lane" },
          ]
        : WORK_PIPELINE;

    setWorkSteps(pipeline.map((s, i) => ({ ...s, status: i === 0 ? "active" : "pending" })));

    let idx = 0;
    if (stepTimerRef.current) clearInterval(stepTimerRef.current);
    stepTimerRef.current = setInterval(() => {
      idx += 1;
      if (idx >= pipeline.length) {
        if (stepTimerRef.current) clearInterval(stepTimerRef.current);
        return;
      }
      setWorkSteps((prev) =>
        prev.map((s, i) => ({
          ...s,
          status: i < idx ? "done" : i === idx ? "active" : "pending",
        })),
      );
    }, 420);
  }

  function finishWorkAnimation() {
    if (stepTimerRef.current) {
      clearInterval(stepTimerRef.current);
      stepTimerRef.current = null;
    }
    setConnecting(false);
    setWorkSteps((prev) => prev.map((s) => ({ ...s, status: "done" })));
    window.setTimeout(() => setWorkSteps([]), 280);
  }

  function resetChat() {
    clearPendingImage();
    setBusy(false);
    setConnecting(false);
    setAgentBusy(false);
    finishWorkAnimation();
    setWorkSteps([]);
    clearAgentMentions();
    setMessages([]);
  }

  function handleImagePick(file: File | null) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("Please choose an image file");
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      toast.error("Image must be under 12 MB");
      return;
    }
    setPendingImage((prev) => {
      if (prev) URL.revokeObjectURL(prev.previewUrl);
      return { file, previewUrl: URL.createObjectURL(file) };
    });
    setFocused(true);
  }

  function snapshotMentions(): MentionSnapshot[] {
    return mentionedItems.map((item) => ({
      id: item.id,
      label: shortClipLabel(item),
      thumbUrl: clipThumbUrl(item, getAsset),
      durationLabel: formatClipDuration(item),
      tone: chipToneForItem(item),
    }));
  }

  async function send(text: string) {
    const trimmed = text.trim();
    const image = pendingImage;
    if ((!trimmed && !image) || busy) return;

    const mentionSnap = snapshotMentions();
    const mentionPrefix =
      mentionSnap.length > 0
        ? `[${mentionSnap.map((m) => m.label).join(", ")}] `
        : "";

    setInput("");
    if (textareaRef.current) textareaRef.current.style.height = "auto";
    setPendingImage(null);
    if (fileRef.current) fileRef.current.value = "";

    const userText =
      trimmed || (image ? `Add this image as B-roll (${image.file.name})` : "");

    setMessages((prev) => [
      ...prev,
      {
        id: `u-${Date.now()}`,
        role: "user",
        text: userText,
        imageUrl: image?.previewUrl,
        mentions: mentionSnap,
      },
    ]);
    setBusy(true);
    setAgentBusy(true);
    setConnecting(true);
    setWorkSteps([]);

    if (connectTimerRef.current) clearTimeout(connectTimerRef.current);
    connectTimerRef.current = setTimeout(() => {
      setConnecting(false);
      startWorkAnimation(Boolean(image), Boolean(trimmed));
    }, 650);

    try {
      const bullets: string[] = [];

      if (image) {
        const id = addBroll({
          label: image.file.name.replace(/\.[^.]+$/, "") || "Uploaded image",
          url: image.previewUrl,
        });
        bullets.push(`Placed “${image.file.name}” on the Image lane`);
        void id;
      }

      let prose = "";
      let source: ChatMessage["source"] = "local";

      if (trimmed) {
        // Prefer first mentioned clip as selection context for the agent.
        if (mentionSnap[0]) {
          useEditorStore.getState().selectItem(mentionSnap[0].id);
        }
        const prompt = `${mentionPrefix}${trimmed}`;
        const result = await runEditorAgent(projectId, prompt, { speed: agentSpeed });
        source = result.source;
        const parsed = extractBullets(result.reply);
        prose = parsed.prose;
        bullets.push(...parsed.bullets);
        if (!parsed.bullets.length && result.results.length) {
          for (const r of result.results) {
            if (r.ok) bullets.push(r.summary.replace(/^•\s*/, ""));
          }
        }
        if (!prose && !bullets.length) prose = result.reply;
      } else if (image) {
        prose = "Image added to the timeline at the playhead.";
      }

      finishWorkAnimation();
      await new Promise((r) => setTimeout(r, 200));

      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: prose,
          bullets,
          source,
        },
      ]);
    } catch (err) {
      finishWorkAnimation();
      setMessages((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          text: err instanceof Error ? err.message : "Something went wrong",
          source: "error",
        },
      ]);
    } finally {
      setBusy(false);
      setAgentBusy(false);
      setConnecting(false);
    }
  }

  function onDockDragOver(e: React.DragEvent) {
    if (![...e.dataTransfer.types].includes(AGENT_CLIP_MIME) && !e.dataTransfer.types.includes("text/plain")) {
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    setDragOver(true);
  }

  function onDockDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const raw =
      e.dataTransfer.getData(AGENT_CLIP_MIME) || e.dataTransfer.getData("text/plain");
    const ids = raw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (!ids.length) return;
    const valid = ids.filter((id) => findItemById(id));
    if (!valid.length) {
      toast.message("Drop a timeline clip onto Editor Agent");
      return;
    }
    addAgentMentions(valid);
    window.setTimeout(() => textareaRef.current?.focus(), 60);
  }

  const canSend = Boolean(input.trim() || pendingImage) && !busy;
  const isPanel = layout === "panel";
  const showOverlayChrome = !isPanel && isTablet;

  return (
    <>
      {showOverlayChrome && open ? (
        <div
          className="fixed inset-0 z-[210] bg-black/50 backdrop-blur-[1px] transition-opacity duration-300 xl:hidden"
          onClick={() => toggleAgentPanel(false)}
          aria-hidden
        />
      ) : null}
      <aside
        className={cn(
          "flex h-full min-h-0 flex-col self-stretch overflow-hidden",
          "editor-agent-shell",
          dragOver && "ring-2 ring-inset ring-primary/60",
          isPanel
            ? "relative z-[215] w-full opacity-100"
            : cn(
                "relative z-[215] transition-[width,transform,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
                open && "editor-agent-glow-ring editor-agent-glow-ring--chat",
                isTablet
                  ? cn(
                      "fixed inset-y-2 right-2 w-full max-w-[400px]",
                      open
                        ? "translate-x-0 opacity-100"
                        : "pointer-events-none translate-x-full opacity-0",
                    )
                  : cn(
                      "shrink-0",
                      open
                        ? "editor-agent-panel-enter my-2 mr-2 ml-1.5 w-[min(360px,34vw)] opacity-100"
                        : "pointer-events-none my-0 mr-0 ml-0 w-0 border-0 opacity-0 shadow-none",
                    ),
              ),
        )}
        aria-label="Editor agent"
        aria-hidden={!open}
        onDragOver={onDockDragOver}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDockDrop}
      >
        <header className="relative z-10 flex h-11 shrink-0 items-center justify-between px-4">
          <span className="text-[13px] font-medium text-zinc-400">New chat</span>
          <div className="flex items-center gap-0.5">
            <button
              type="button"
              title="New chat"
              onClick={resetChat}
              className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <Plus className="size-4" />
            </button>
            <button
              type="button"
              title="Close agent"
              onClick={() => toggleAgentPanel(false)}
              className="inline-flex size-8 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            >
              <X className="size-3.5" />
            </button>
          </div>
        </header>

        <div className="relative z-10 flex min-h-0 flex-1 flex-col overflow-hidden">
          {isEmptyThread ? (
            <div className="editor-scroll flex min-h-0 flex-1 flex-col items-center justify-center overflow-y-auto px-5 pb-4">
              <div className="agent-msg-enter flex w-full max-w-[300px] flex-col items-center text-center">
                <span className="mb-5 inline-flex size-12 items-center justify-center rounded-2xl bg-[#1a1a1a] text-[#93C5FD] ring-1 ring-white/[0.1]">
                  <Sparkles className="size-5" />
                </span>
                <h2 className="text-[18px] font-semibold tracking-tight text-white">Editor Agent</h2>
                <p className="mt-2 max-w-[260px] text-[12.5px] leading-relaxed text-zinc-400">
                  Ask me to edit your timeline, add effects, or improve your cut.
                </p>
              </div>

              <div className="agent-chip-stagger mt-10 flex w-full max-w-[300px] flex-col gap-2">
                {SUGGESTIONS.map((s) => (
                  <Button
                    key={s}
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void send(s)}
                    className="h-auto w-full justify-start whitespace-normal rounded-[14px] border-white/[0.09] bg-[#1c1c1c] px-4 py-3.5 text-left text-[12.5px] leading-snug font-normal text-zinc-300 hover:border-white/[0.16] hover:bg-[#242424] hover:text-white"
                  >
                    {s}
                  </Button>
                ))}
              </div>
            </div>
          ) : (
            <div className="editor-scroll flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-3">
              {messages.map((m) =>
                m.role === "user" ? (
                  <div key={m.id} className="agent-msg-enter flex justify-end">
                    <div className="max-w-[92%] overflow-hidden rounded-2xl rounded-br-md bg-[#2a2a2a] ring-1 ring-white/[0.06]">
                      {m.imageUrl ? (
                        <div className="border-b border-white/[0.06] bg-black/40 p-1.5">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={m.imageUrl}
                            alt=""
                            className="h-28 w-full rounded-xl object-cover"
                          />
                        </div>
                      ) : null}
                      {m.mentions && m.mentions.length > 0 ? (
                        <div className="flex flex-wrap gap-1.5 border-b border-white/[0.05] px-3 pt-2.5">
                          {m.mentions.map((chip) => (
                            <MentionChip
                              key={chip.id}
                              label={chip.label}
                              thumbUrl={chip.thumbUrl}
                              tone={chip.tone}
                              compact
                            />
                          ))}
                        </div>
                      ) : null}
                      <p className="px-3.5 py-2.5 text-[13px] leading-relaxed text-zinc-100">
                        {m.text}
                      </p>
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="agent-msg-enter flex flex-col gap-2">
                    {m.text ? (
                      <p className="text-[13px] leading-relaxed text-zinc-300">{m.text}</p>
                    ) : null}
                    {m.bullets && m.bullets.length > 0 ? (
                      <ul className="flex flex-col gap-1.5">
                        {m.bullets.map((b, i) => (
                          <li
                            key={`${m.id}-b-${i}`}
                            className="flex items-start gap-2 text-[12.5px] text-zinc-400"
                          >
                            <span className="agent-check-in mt-0.5 inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-400">
                              <Check className="size-2.5" strokeWidth={3} />
                            </span>
                            <span>{b}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ),
              )}

              {connecting ? (
                <div className="agent-msg-enter flex items-center gap-2 px-1 py-1">
                  <Loader2 className="size-3.5 animate-spin text-[#60A5FA]/80" />
                  <span className="agent-shimmer-text text-[12px] font-medium">
                    Connecting to Agent…
                  </span>
                </div>
              ) : null}

              {busy && !connecting && workSteps.length > 0 ? (
                <div className="agent-msg-enter flex flex-col gap-2 rounded-xl border border-white/[0.07] bg-[#1a1a1a] px-3.5 py-3">
                  <div className="flex items-center gap-2">
                    <Loader2 className="size-3.5 animate-spin text-[#60A5FA]" />
                    <span className="agent-shimmer-text text-[12px] font-medium">Working…</span>
                  </div>
                  <ul className="flex flex-col gap-1.5 border-t border-white/[0.05] pt-2">
                    {workSteps.map((step) => (
                      <li key={step.id} className="flex items-center gap-2 text-[11.5px]">
                        {step.status === "done" ? (
                          <Check className="size-3 text-emerald-400" strokeWidth={3} />
                        ) : step.status === "active" ? (
                          <Loader2 className="size-3 animate-spin text-[#60A5FA]" />
                        ) : (
                          <span className="size-3 rounded-full border border-white/15" />
                        )}
                        <span
                          className={cn(
                            step.status === "active" && "text-zinc-200",
                            step.status === "done" && "text-zinc-500",
                            step.status === "pending" && "text-zinc-600",
                          )}
                        >
                          {step.label}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div ref={bottomRef} />
            </div>
          )}
        </div>

        <div className="relative z-10 shrink-0 px-3 pb-3 pt-1">
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            className="hidden"
            onChange={(e) => handleImagePick(e.target.files?.[0] ?? null)}
          />

          <div
            className={cn(
              "overflow-hidden rounded-2xl border bg-[#1c1c1c] transition-[box-shadow,border-color] duration-200",
              focused || busy || pendingImage || mentionedItems.length > 0
                ? "border-white/[0.16] shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
                : "border-white/[0.1]",
              dragOver && "border-primary/70 shadow-[0_0_0_1px_rgba(59,130,246,0.25)]",
            )}
          >
            {mentionedItems.length === 1 &&
            (mentionedItems[0].type === "video" || mentionedItems[0].type === "broll") &&
            messages.length > 0 ? (
              <div className="flex gap-1 overflow-x-auto border-b border-white/[0.06] px-3 py-2 [scrollbar-width:none]">
                {CLIP_ACTIONS.map((action) => (
                  <button
                    key={action.id}
                    type="button"
                    disabled={busy}
                    onClick={() => void send(action.prompt)}
                    className="inline-flex shrink-0 items-center rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[10.5px] font-medium text-zinc-400 transition hover:border-white/15 hover:text-zinc-200 disabled:opacity-40"
                  >
                    {action.label}
                  </button>
                ))}
              </div>
            ) : null}

            {pendingImage ? (
              <div className="flex items-start gap-2.5 px-3 pt-3">
                <div className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={pendingImage.previewUrl}
                    alt=""
                    className="h-12 w-16 rounded-lg object-cover ring-1 ring-white/10"
                  />
                  <button
                    type="button"
                    title="Remove image"
                    onClick={clearPendingImage}
                    className="absolute -right-1.5 -top-1.5 inline-flex size-5 items-center justify-center rounded-full bg-[#2a2a2a] text-zinc-300 ring-1 ring-white/15 hover:bg-[#3a3a3a]"
                  >
                    <X className="size-3" />
                  </button>
                </div>
                <p className="min-w-0 flex-1 pt-1 text-[11px] text-zinc-400">
                  Places as B-roll at playhead
                </p>
              </div>
            ) : null}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                void send(input);
              }}
            >
              <div className="flex flex-col gap-2 px-3 pt-3">
                {mentionedItems.length > 0 ? (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {mentionedItems.map((item) => {
                      const asset =
                        "assetId" in item ? getAsset(item.assetId) : undefined;
                      return (
                      <MentionChip
                        key={item.id}
                        label={shortClipLabel(item)}
                        thumbUrl={clipThumbUrl(item, getAsset)}
                        tone={chipToneForItem(item)}
                        mediaType={asset?.mediaType}
                        onRemove={() => removeAgentMention(item.id)}
                      />
                      );
                    })}
                  </div>
                ) : null}
                <textarea
                  ref={textareaRef}
                  value={input}
                  rows={2}
                  disabled={busy}
                  placeholder={
                    mentionedItems.length
                      ? "Ask Editor Agent to edit these clips…"
                      : "Ask Editor Agent to edit your video…"
                  }
                  onFocus={() => setFocused(true)}
                  onBlur={() => setFocused(false)}
                  onChange={(e) => {
                    setInput(e.target.value);
                    const el = e.target;
                    el.style.height = "auto";
                    el.style.height = `${Math.min(el.scrollHeight, 140)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      void send(input);
                    }
                  }}
                  onPaste={(e) => {
                    const item = Array.from(e.clipboardData.items).find((i) =>
                      i.type.startsWith("image/"),
                    );
                    if (!item) return;
                    const file = item.getAsFile();
                    if (file) {
                      e.preventDefault();
                      handleImagePick(file);
                    }
                  }}
                  className="max-h-[140px] min-h-[48px] w-full resize-none bg-transparent text-[13px] leading-relaxed text-white outline-none placeholder:text-zinc-500 disabled:opacity-60"
                />
              </div>

              <div className="flex items-center justify-between gap-2 px-2.5 pb-2.5 pt-1">
                <div className="flex items-center gap-1">
                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title="Agent mode"
                          className="inline-flex h-7 items-center gap-1 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-200"
                        />
                      }
                    >
                      Agent
                      <ChevronDown className="size-3 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="z-[230] w-44">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Mode</DropdownMenuLabel>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="justify-between text-xs"
                        onClick={() => setAgentMode("agent")}
                      >
                        Agent
                        {agentMode === "agent" ? <Check className="size-3.5" /> : null}
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <DropdownMenu>
                    <DropdownMenuTrigger
                      render={
                        <button
                          type="button"
                          title="Speed vs quality"
                          className={cn(
                            "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-[11px] font-medium transition",
                            agentSpeed === "smart"
                              ? "border-orange-400/35 bg-orange-500/10 text-orange-300 hover:bg-orange-500/15"
                              : "border-white/[0.08] bg-white/[0.03] text-zinc-400 hover:bg-white/[0.06] hover:text-zinc-200",
                          )}
                        />
                      }
                    >
                      {agentSpeed === "smart" ? "Smart" : "Fast"}
                      <ChevronDown className="size-3 opacity-50" />
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="start" className="z-[230] w-48">
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Quality</DropdownMenuLabel>
                      </DropdownMenuGroup>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        className="justify-between text-xs"
                        onClick={() => setAgentSpeed("fast")}
                      >
                        Fast
                        {agentSpeed === "fast" ? <Check className="size-3.5" /> : null}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        className="justify-between text-xs"
                        onClick={() => setAgentSpeed("smart")}
                      >
                        Smart
                        {agentSpeed === "smart" ? <Check className="size-3.5" /> : null}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <p className="px-2 py-1.5 text-[9px] text-zinc-500">
                        Smart takes longer and aims for higher-quality edits.
                      </p>
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <button
                    type="button"
                    title="Attach image"
                    disabled={busy}
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex size-8 items-center justify-center rounded-full text-zinc-500 transition hover:bg-white/[0.06] hover:text-zinc-300 disabled:opacity-40"
                  >
                    <Paperclip className="size-3.5" />
                  </button>
                </div>
                <Button
                  type="submit"
                  disabled={!canSend}
                  size="icon"
                  title="Send"
                  className="size-8 rounded-full"
                >
                  {busy ? (
                    <Loader2 className="animate-spin" />
                  ) : (
                    <ArrowUp strokeWidth={2.5} />
                  )}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </aside>
    </>
  );
}
