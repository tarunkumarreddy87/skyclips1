"use client";



import { useEffect, useMemo, useRef, useState } from "react";

import { ArrowUp, ArrowUpRight, Check, ChevronDown, Copy, Pencil, Film, History as HistoryIcon, Layers, ListChecks, Loader2, Mic, MousePointer2, Plus, ScanLine, ShieldCheck, SlidersHorizontal, Sparkles, Square, Subtitles, X } from "lucide-react";

import { useEditorStore } from "@/lib/editor/store";

import { useVoiceInput } from "./hooks/use-voice-input";

import { runEditorAgent, type AgentActivity, type AgentChatResult } from "@/lib/editor/agent/run-agent";

import { AgentModelPicker } from "./agent-model-picker";

import { imageReferenceDataUrl } from "@/lib/editor/agent/image-reference";

import { useIsTablet } from "@/lib/editor/use-is-mobile";

import { requestMediaUploadUrl, uploadFileToPresignedUrl } from "@/lib/api-client";

import { Button } from "@/components/ui/button";


import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

import { InputGroup, InputGroupAddon, InputGroupTextarea } from "@/components/ui/input-group";

import { cn } from "@/lib/utils";

import { toast } from "sonner";

import { AGENT_CLIP_MIME } from "./agent-mention";



interface DockProps { projectId: string; layout?: "overlay" | "panel" }

interface Mention { id: string; label: string; thumbnailUrl?: string }

interface Message {

  id: string; role: "user" | "assistant"; text: string; imageUrl?: string;

  mentions?: Mention[]; activity?: AgentActivity[]; result?: AgentChatResult;

  planState?: "pending" | "applied" | "discarded" | "superseded" | "failed";

  elapsed?: number;

}

const STARTERS = [

  { icon: Subtitles, title: "Style captions", detail: "Make every word land", prompt: "Style the captions with a clean, readable karaoke treatment. Keep the original language and wording." },

  { icon: ScanLine, title: "Shape the cut", detail: "Transitions with rhythm", prompt: "Add a short, tasteful transition at the next scene cut after the playhead. Choose one that suits this scene and keep its automatic sound subtle." },

  { icon: Sparkles, title: "Create motion", detail: "Bring your story to life", prompt: "Design a polished motion graphic for the scene at the playhead using its actual text. Use a clear visual hierarchy, staggered animation and subtle sound cues. Do not invent facts." },

  { icon: SlidersHorizontal, title: "Refine the look", detail: "Color, light & atmosphere", prompt: "Give the current scene a subtle cinematic color grade using the Cinema filter at 60% strength." },

];

const LIMIT = 3600;

const CONVERSATION_VERSION = 1;

const MAX_STORED_MESSAGES = 60;

function AgentCompanion({ animated = false }: { animated?: boolean }) {

  return <span className="agent-companion" aria-hidden="true" data-animated={animated}>

    {animated && <img src="/agent/creative-companion.gif" alt="" width={64} height={64} />}

    <span className="agent-companion-still"><i /><i /></span>

  </span>;

}

const conversationStorageKey = (projectId: string) => `skyclip-editor-agent:${projectId}`;



type StoredConversation = {

  version: number;

  projectId: string;

  activeConversationId?: string;

  conversations?: StoredConversationSession[];

  // Kept for migration from the first version of per-video persistence.

  messages?: StoredMessage[];

};

type StoredMessage = Omit<Message, "imageUrl" | "result"> & { result?: Omit<AgentChatResult, "approve"> };

type StoredConversationSession = { id: string; title: string; updatedAt: number; messages: StoredMessage[] };

type ConversationSession = { id: string; title: string; updatedAt: number; messages: Message[] };



function conversationTitle(messages: Message[]) {

  const firstRequest = messages.find(message => message.role === "user")?.text?.trim();

  return (firstRequest || "New conversation").replace(/\s+/g, " ").slice(0, 48);

}



function readStoredConversation(projectId: string): { activeId: string; sessions: ConversationSession[] } {

  try {

    const raw = localStorage.getItem(conversationStorageKey(projectId));

    if (!raw) return { activeId: "", sessions: [] };

    const stored = JSON.parse(raw) as StoredConversation;

    if (stored.version !== CONVERSATION_VERSION || stored.projectId !== projectId) return { activeId: "", sessions: [] };

    const source = stored.conversations?.length

      ? stored.conversations

      : stored.messages?.length

        ? [{ id: "conversation-1", title: conversationTitle(stored.messages as Message[]), updatedAt: Date.now(), messages: stored.messages }]

        : [];

    const sessions = source.map(session => ({

      ...session,

      messages: session.messages.slice(-MAX_STORED_MESSAGES).map(message => ({

        ...message,

        // Object URLs are session-only. The user text and mention chips remain durable.

        imageUrl: undefined,

        result: message.result ? { ...message.result } : undefined,

      })),

    }));

    const activeId = stored.activeConversationId && sessions.some(s => s.id === stored.activeConversationId) ? stored.activeConversationId : sessions[0]?.id || "";

    return { activeId, sessions: sessions.filter(session => session.messages.length > 0 || session.id === activeId) };

  } catch {

    return { activeId: "", sessions: [] };

  }

}



function writeStoredConversation(projectId: string, activeId: string, sessions: ConversationSession[], activeMessages: Message[]) {

  try {

    const stored: StoredConversation = {

      version: CONVERSATION_VERSION,

      projectId,

      activeConversationId: activeId,

      conversations: sessions.map(session => ({

        ...session,

        messages: (session.id === activeId ? activeMessages : session.messages).slice(-MAX_STORED_MESSAGES).map(({ imageUrl: _imageUrl, result, ...message }) => ({

          ...message,

          // Approval callbacks are closures and cannot survive a reload. Keep the

          // proposed plan visible, but require a fresh request before applying it.

          result: result ? { ...result, approve: undefined } : undefined,

        })),

      })),

    };

    localStorage.setItem(conversationStorageKey(projectId), JSON.stringify(stored));

  } catch {

    // Storage can be unavailable or full; the in-memory conversation still works.

  }

}



function Activity({ steps, busy, elapsed }: { steps: AgentActivity[]; busy: boolean; elapsed?: number }) {

  const [expanded, setExpanded] = useState<boolean | undefined>();

  steps = steps.filter(step => Boolean(step.tool));

  if (!steps.length) return null;

  const failed = steps.some(s => s.status === "error" || s.status === "rolled-back");

  const cancelled = steps.some(s => s.status === "cancelled");


  const complete = steps.filter(s => s.status === "complete").length;

  return <Collapsible className="agent-activity" open={expanded ?? busy} onOpenChange={setExpanded}>

    <CollapsibleTrigger className="agent-activity-trigger">

      {busy ? <Loader2 className="size-3.5 animate-spin" /> : failed ? <X className="size-3.5 text-destructive" /> : <Check className="size-3.5" />}

      <span>{busy ? "Working on your edit" : cancelled ? "Stopped" : failed ? "Couldn’t finish" : "Work completed"}</span>

      <span className="agent-step-count">{complete}/{steps.length}</span>

      {elapsed != null && <span className="agent-elapsed">{elapsed}s</span>}

      <ChevronDown className={cn("size-3 transition-transform", (expanded ?? busy) && "rotate-180")} />

    </CollapsibleTrigger>

    <CollapsibleContent>

      <ol className="agent-activity-list">

        {steps.map(step => <li key={step.id} data-status={step.status}>

          <span className="agent-step-icon">{step.status === "running" ? <Loader2 className="size-3 animate-spin" /> : step.status === "complete" ? <Check className="size-3" /> : <X className="size-3" />}</span>

          <div><p>{step.label}</p>{step.detail && (step.status === "error" || step.status === "rolled-back") && <span className="agent-step-detail">{step.detail}</span>}</div>

        </li>)}

      </ol>

    </CollapsibleContent>

  </Collapsible>;

}



export function EditorAgentDock(props: DockProps) {

  // A different project gets a different conversation and cancels its previous request.

  return <AgentSession key={props.projectId} {...props} />;

}



function AgentSession({ projectId, layout = "overlay" }: DockProps) {

  const open = useEditorStore(s => s.ui.agentPanelOpen);

  const toggleAgentPanel = useEditorStore(s => s.toggleAgentPanel);

  const mentionIds = useEditorStore(s => s.ui.agentMentionIds);

  const selectedItemId = useEditorStore(s => s.ui.selectedItemId);

  const tracks = useEditorStore(s => s.timeline.tracks);
  const assets = useEditorStore(s => s.assets);

  const projectTitle = useEditorStore(s => s.project.title);

  const isTablet = useIsTablet();

  const [input, setInput] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);

  const [mode, setMode] = useState<"plan" | "control">("control");

  const [messages, setMessages] = useState<Message[]>([]);

  const [conversations, setConversations] = useState<ConversationSession[]>([]);

  const [activeConversationId, setActiveConversationId] = useState("");

  const [historyOpen, setHistoryOpen] = useState(false);

  const [conversationHydrated, setConversationHydrated] = useState(false);

  const [busyId, setBusyId] = useState<string | null>(null);

  const [seconds, setSeconds] = useState(0);

  const [modelId, setModelId] = useState("");

  const [pendingImage, setPendingImage] = useState<{ file: File; previewUrl: string } | null>(null);

  const [dragOver, setDragOver] = useState(false);

  const activeRequest = useRef<{ controller: AbortController; id: string } | null>(null);

  const hydratedProjectId = useRef<string | null>(null);

  const imageUrls = useRef(new Set<string>());

  const scroller = useRef<HTMLDivElement>(null);

  const followLatest = useRef(true);

  const textarea = useRef<HTMLTextAreaElement>(null);

  const fileInput = useRef<HTMLInputElement>(null);

  const voice = useVoiceInput(text => setInput(previous => (previous ? previous + " " + text : text).slice(0, LIMIT)));

  const busy = Boolean(busyId);



  useEffect(() => {

    hydratedProjectId.current = null;

    setConversationHydrated(false);

    try {

      setModelId(localStorage.getItem("skyclip-editor-model") || "");

      const saved = readStoredConversation(projectId);

      const initialId = saved.activeId || crypto.randomUUID();

      const sessions = saved.sessions.length ? saved.sessions : [{ id: initialId, title: "New conversation", updatedAt: Date.now(), messages: [] }];

      setConversations(sessions);

      setActiveConversationId(initialId);

      setMessages(sessions.find(session => session.id === initialId)?.messages || []);

    } catch { /* Private browsing can disable storage. */ }

    hydratedProjectId.current = projectId;

    setConversationHydrated(true);

    return () => {

      activeRequest.current?.controller.abort();

      useEditorStore.getState().setAgentBusy(false);

      for (const url of imageUrls.current) URL.revokeObjectURL(url);

      imageUrls.current.clear();

    };

  }, [projectId]);

  useEffect(() => {

    if (conversationHydrated && hydratedProjectId.current === projectId && activeConversationId) {

      writeStoredConversation(projectId, activeConversationId, conversations, messages);

    }

  }, [activeConversationId, conversationHydrated, conversations, messages, projectId]);

  useEffect(() => { if (!open || busy) voice.stop(); }, [open, busy, voice.stop]);

  useEffect(() => {

    if (!busy) return;

    const started = Date.now();

    setSeconds(0);

    const timer = window.setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);

    return () => clearInterval(timer);

  }, [busy]);

  useEffect(() => {

    if (followLatest.current && scroller.current) scroller.current.scrollTop = messages.length ? scroller.current.scrollHeight : 0;

  }, [messages, open]);



  const items = useMemo(() => new Map(tracks.flatMap(t => t.items).map(i => [i.id, i])), [tracks]);

  const mentions = mentionIds.flatMap(id => { const item = items.get(id); return item ? [{ id, label: item.label || item.type, thumbnailUrl: ("thumbnailUrl" in item ? item.thumbnailUrl : undefined) || ("assetId" in item ? assets.find(asset => asset.id === item.assetId)?.thumbnailUrl : undefined) }] : []; });

  const selected = selectedItemId ? items.get(selectedItemId) : null;



  function patchMessage(id: string, patch: Partial<Message>) {

    setMessages(previous => previous.map(m => m.id === id ? { ...m, ...patch } : m));

  }

  function updateActivity(id: string, activity: AgentActivity) {

    setMessages(previous => previous.map(m => m.id !== id ? m : {

      ...m, activity: (m.activity || []).some(s => s.id === activity.id)

        ? m.activity!.map(s => s.id === activity.id ? activity : s)

        : [...(m.activity || []), activity],

    }));

  }

  function discardPlans(state: "discarded" | "superseded") {

    setMessages(previous => previous.map(m => m.planState === "pending" ? { ...m, planState: state, result: m.result ? { ...m.result, approve: undefined } : undefined } : m));

  }

  function startNewConversation() {

    if (busy) return;

    const nextId = crypto.randomUUID();

    const now = Date.now();

    setConversations(previous => [

      ...previous.map(session => session.id === activeConversationId ? { ...session, title: conversationTitle(messages), updatedAt: now, messages } : session),

      { id: nextId, title: "New conversation", updatedAt: now, messages: [] },

    ]);

    setActiveConversationId(nextId);

    setEditingId(null); setMessages([]); setInput(""); setPendingImage(null); setHistoryOpen(false);

    useEditorStore.getState().clearAgentMentions();

    textarea.current?.focus();

  }

  function openConversation(session: ConversationSession) {

    if (busy || session.id === activeConversationId) { setHistoryOpen(false); return; }

    setConversations(previous => previous.map(item => item.id === activeConversationId ? { ...item, title: conversationTitle(messages), updatedAt: Date.now(), messages } : item));

    setActiveConversationId(session.id);

    setEditingId(null); setMessages(session.messages); setInput(""); setPendingImage(null); setHistoryOpen(false);

    useEditorStore.getState().clearAgentMentions();

  }

  function stop() {

    const request = activeRequest.current;

    if (!request) return;

    request.controller.abort();

    activeRequest.current = null;

    setBusyId(null);

    useEditorStore.getState().setAgentBusy(false);

    setMessages(previous => previous.map(m => m.id === request.id ? {

      ...m, text: "Stopped. Any completed edits are kept; use Undo to revert them.", elapsed: seconds,

      result: { reply: "Stopped. Any completed edits are kept; use Undo to revert them.", source: "stopped", results: [] },

      activity: m.activity?.map(s => s.status === "running" ? { ...s, status: "cancelled" } : s),

    } : m));

  }

  function clearImage() {

    if (pendingImage) { URL.revokeObjectURL(pendingImage.previewUrl); imageUrls.current.delete(pendingImage.previewUrl); }

    setPendingImage(null);

    if (fileInput.current) fileInput.current.value = "";

  }

  function pickImage(file?: File) {

    if (!file) return;

    if (!/^image\/(png|jpeg|webp|gif|avif)$/.test(file.type)) { toast.error("Choose a PNG, JPEG, WebP, GIF or AVIF image."); return; }

    if (file.size > 12 * 1024 * 1024) { toast.error("Choose an image smaller than 12 MB."); return; }

    clearImage();

    const previewUrl = URL.createObjectURL(file);

    imageUrls.current.add(previewUrl);

    setPendingImage({ file, previewUrl });

    textarea.current?.focus();

  }



  async function send() {

    const text = input.trim();

    const image = pendingImage;

    if ((!text && !image) || activeRequest.current) return;

    voice.stop();

    const id = crypto.randomUUID();

    const controller = new AbortController();

    activeRequest.current = { id, controller };

    const started = Date.now();

    const userText = text || `Add this image as B-roll: ${image!.file.name}`;

    const contextIds = mentions.length ? mentions.map(m => m.id) : selected ? [selected.id] : [];

    const contextMentions = contextIds.map(id => ({ id, label: items.get(id)?.label || "Clip" }));

    const editIndex = editingId ? messages.findIndex(message => message.id === editingId) : -1;

    const history = editIndex >= 0 ? messages.slice(0, editIndex) : messages;

    if (editIndex >= 0) {

      // Preserve the previous branch in history; timeline edits are never undone.

      setConversations(previous => [...previous, { id: crypto.randomUUID(), title: `${conversationTitle(messages)} · previous version`, updatedAt: Date.now(), messages: messages.map(message => message.planState === "pending" ? { ...message, planState: "superseded" as const, result: message.result ? { ...message.result, approve: undefined } : undefined } : message) }]);

    }

    discardPlans("superseded");

    setMessages([...history.map(message => message.planState === "pending" ? { ...message, planState: "superseded" as const, result: message.result ? { ...message.result, approve: undefined } : undefined } : message),

      { id: crypto.randomUUID(), role: "user", text: userText, imageUrl: image?.previewUrl, mentions: contextMentions },

      { id, role: "assistant", text: "", activity: [] },

    ]);

    setEditingId(null); setInput(""); setPendingImage(null); setBusyId(id);

    if (fileInput.current) fileInput.current.value = "";

    useEditorStore.getState().clearAgentMentions();

    useEditorStore.getState().setAgentBusy(true);

    followLatest.current = true;

    const onActivity = (event: AgentActivity) => { if (!controller.signal.aborted) updateActivity(id, event); };

    try {

      let referenceImageUrl: string | undefined;

      let referenceAsset: { url: string; label: string } | undefined;

      if (image) {

        onActivity({ id: "upload", tool: "upload_image", label: "Prepare image reference", status: "running" });

        const uploaded = await requestMediaUploadUrl(projectId, image.file.name, image.file.type);

        controller.signal.throwIfAborted();

        await uploadFileToPresignedUrl(uploaded.uploadUrl, image.file);

        controller.signal.throwIfAborted();

        if (!uploaded.downloadUrl) throw new Error("The upload did not return a usable media URL. No edits were applied.");

        referenceAsset = { url: uploaded.downloadUrl, label: image.file.name };

        referenceImageUrl = await imageReferenceDataUrl(image.file);

        controller.signal.throwIfAborted();

        onActivity({ id: "upload", tool: "upload_image", label: "Image reference ready", status: "complete", detail: image.file.name });

      }

      const result = await runEditorAgent(projectId, userText, { mode, verifyResult: true, modelId, referenceImageUrl, referenceAsset,

        signal: controller.signal, mentionedItemIds: contextIds, onActivity,

        conversation: history.slice(-8).map(m => ({ role: m.role, content: m.planState && m.planState !== "applied" ? `Proposed only, not applied: ${m.text}` : m.text })),

      });

      if (controller.signal.aborted) return;

      patchMessage(id, { text: result.reply, result, planState: result.plannedChanges?.length ? "pending" : undefined, elapsed: Math.round((Date.now() - started) / 1000) });

    } catch (error) {

      if (controller.signal.aborted) return;

      const reply = error instanceof Error ? error.message : "Could not complete this request. No edits were applied.";

      onActivity({ id: "upload", tool: "upload_image", label: "Request failed", status: "error", detail: reply });

      patchMessage(id, { text: reply, result: { reply, source: "error", results: [] } });

    } finally {

      if (activeRequest.current?.controller === controller) {

        activeRequest.current = null; setBusyId(null); useEditorStore.getState().setAgentBusy(false);

      }

    }

  }

  function approve(message: Message) {

    if (busy || message.planState !== "pending" || !message.result?.approve) return;

    const result = message.result.approve();

    patchMessage(message.id, { text: result.reply, result, planState: result.source === "error" || result.source === "stopped" ? "failed" : "applied" });

  }

  return <>

    {layout === "overlay" && isTablet && open && <div className="fixed inset-0 z-[210] bg-black/50" onClick={() => toggleAgentPanel(false)} aria-hidden />}

    <aside aria-label="Editor agent" aria-hidden={!open} inert={!open} data-layout={layout}

      className={cn("agent-workspace editor-agent-shell flex h-full min-h-0 flex-col overflow-hidden",

        layout === "panel" ? "relative w-full" : cn("fixed inset-y-2 right-2 z-[215] w-[min(360px,calc(100vw-1rem))]", !open && "hidden"), dragOver && "ring-2 ring-primary")}

      onDragOver={e => { if (e.dataTransfer.types.includes(AGENT_CLIP_MIME)) { e.preventDefault(); setDragOver(true); } }}

      onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}

      onDrop={e => {

        e.preventDefault(); setDragOver(false);

        const ids = e.dataTransfer.getData(AGENT_CLIP_MIME).split(",").filter(id => items.has(id));

        if (ids.length) useEditorStore.getState().addAgentMentions(ids);

        textarea.current?.focus();

      }}>

      <header className="agent-header">

        <div className="min-w-0 flex-1"><h2>SkyClip Agent</h2><p>{busy ? "Creating with your timeline…" : "Your creative partner"}</p></div>

        <Button variant="ghost" size="icon-sm" aria-label="Conversation history" title="Previous conversations" disabled={busy} onClick={() => setHistoryOpen(value => !value)}><HistoryIcon /></Button>

        <Button variant="ghost" size="icon-sm" aria-label="New conversation" title="New conversation" disabled={busy} onClick={startNewConversation}><Plus /></Button>

        <Button variant="ghost" size="icon-sm" aria-label="Close agent" title="Close agent" onClick={() => toggleAgentPanel(false)}><X /></Button>

      </header>

      {historyOpen && <div className="agent-history-popover" role="dialog" aria-label="Previous conversations">

        <div className="agent-history-heading"><span>Previous conversations</span><small>{conversations.filter(session => session.messages.length > 0).length} saved for this video</small></div>

        <div className="agent-history-list">

          {[...conversations].filter(session => session.messages.length > 0 || session.id === activeConversationId).sort((a, b) => b.updatedAt - a.updatedAt).map(session => <button type="button" key={session.id} className={cn("agent-history-item", session.id === activeConversationId && "is-active")} onClick={() => openConversation(session)}>

            <span className="agent-history-dot" /><span className="min-w-0"><strong>{session.title}</strong><small>{session.messages.length} messages</small></span><ChevronDown className="-rotate-90" />

          </button>)}

          <button type="button" className="agent-history-new" onClick={startNewConversation}><Plus className="size-3.5" />New conversation</button>

        </div>

      </div>}



      <div ref={scroller} className="agent-conversation editor-scroll" onScroll={e => {

        const el = e.currentTarget; followLatest.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;

      }}>

        {!messages.length ? <div className="agent-welcome">

          <div className="agent-welcome-symbol"><AgentCompanion animated /></div>

          <h3>What shall we<br /><span>create together?</span></h3>

          <p className="agent-welcome-copy">A small refinement or a whole new direction. Start with your idea.</p>

          <div className="agent-starters">{STARTERS.map(({ icon: Icon, title, detail, prompt }) =>

            <Button key={title} variant="outline" className="agent-starter" onClick={() => { setInput(prompt); textarea.current?.focus(); }}>

              <Icon data-icon="inline-start" /><span><strong>{title}</strong><small>{detail}</small></span><ArrowUpRight data-icon="inline-end" />

            </Button>)}</div>

          <div className="agent-scope-note"><LayersIcon /><p>Double-click a timeline clip to add or remove it from your request.</p></div>

        </div> : <div className="agent-thread" role="log" aria-label="Agent conversation" aria-live="polite">

          {messages.map(message => <article key={message.id} className={cn("agent-message", message.role === "user" ? "agent-message-user" : "agent-message-assistant")}>

            {busyId === message.id && <div className="agent-message-label"><AgentCompanion animated /><span>Thinking…</span></div>}

            {message.imageUrl && <img className="agent-message-image" src={message.imageUrl} alt="Your image reference" />}

            {!!message.mentions?.length && <div className="agent-message-mentions">{message.mentions.map(m => <span key={m.id} title={m.label}><Film className="size-3" />{m.label}</span>)}</div>}

            <Activity steps={message.activity || []} busy={busyId === message.id} elapsed={busyId === message.id ? seconds : message.elapsed} />

            {message.text && <div className={cn("agent-message-text", message.result?.source === "error" && "text-destructive")}>{message.text}</div>}

            {message.text && <div className="agent-message-actions">

              <Button type="button" variant="ghost" size="icon-sm" aria-label="Copy message" onClick={async () => { try { await navigator.clipboard.writeText(message.text); toast.success("Message copied"); } catch { toast.error("Clipboard unavailable. Select the text to copy."); } }}><Copy /></Button>

              {message.role === "user" && <Button type="button" variant="ghost" size="icon-sm" aria-label="Edit and resend message" disabled={busy} onClick={() => { setEditingId(message.id); setInput(message.text); clearImage(); useEditorStore.getState().clearAgentMentions(); useEditorStore.getState().addAgentMentions((message.mentions || []).map(mention => mention.id).filter(id => items.has(id))); textarea.current?.focus(); }}><Pencil /></Button>}

            </div>}

            {message.planState === "pending" && <section className="agent-plan" aria-label="Proposed edits">

              <div className="agent-plan-title"><ListChecks className="size-4" /><strong>Proposed edits</strong><span>{message.result?.plannedChanges?.length}</span></div>

              <ol>{message.result?.plannedChanges?.map((change, index) => <li key={index}><span>{String(index + 1).padStart(2, "0")}</span>{change}</li>)}</ol>

              <p>Read-only plan. Switch to Control and ask me to carry it out when ready.</p>

              <Button variant="ghost" size="sm" onClick={() => discardPlans("discarded")} disabled={busy}>Dismiss plan</Button>

            </section>}

            {message.planState === "discarded" || message.planState === "superseded" ? <p className="agent-plan-dismissed">{message.planState === "discarded" ? "Plan discarded" : "Replaced by your next request"} · no edits applied</p> : null}

          </article>)}

        </div>}

      </div>



      <footer className="agent-footer">

        <form onSubmit={e => { e.preventDefault(); void send(); }}>

          {editingId && <div className="agent-edit-notice"><span>Edit & resend<small>Earlier timeline edits stay applied. Previous chat stays in history.</small></span><Button type="button" variant="ghost" size="icon-sm" aria-label="Cancel editing" onClick={() => { setEditingId(null); setInput(""); }}><X /></Button></div>}

          <InputGroup className="agent-composer">

            <InputGroupTextarea ref={textarea} aria-label="Message Editor Agent" placeholder={voice.listening ? "Listening…" : "Describe your edit…"}

              onPaste={event => {

                const image = Array.from(event.clipboardData.items).find(item => item.kind === "file" && item.type.startsWith("image/"))?.getAsFile();

                if (!image || busy) return;

                event.preventDefault(); pickImage(image);

                const text = event.clipboardData.getData("text/plain");

                if (text) { const start = event.currentTarget.selectionStart; const end = event.currentTarget.selectionEnd; setInput(previous => (previous.slice(0, start) + text + previous.slice(end)).slice(0, LIMIT)); }

              }}

              value={input} maxLength={LIMIT} onChange={e => setInput(e.target.value)} rows={3}

              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); if (!busy) void send(); } }} />

            {(mentions.length > 0 || pendingImage) && <InputGroupAddon align="block-start" className="agent-composer-context">

              {mentions.map(m => <span className="agent-context-chip" key={m.id}><span className="agent-context-thumbnail">{m.thumbnailUrl ? <img src={m.thumbnailUrl} alt="" onError={event => { event.currentTarget.style.display = "none"; }} /> : <Film className="size-3" />}</span><span title={m.label}>{m.label}</span><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${m.label} from request`} onClick={() => useEditorStore.getState().removeAgentMention(m.id)}><X /></Button></span>)}

              {pendingImage && <span className="agent-context-chip"><span className="agent-context-thumbnail"><img src={pendingImage.previewUrl} alt="Image reference" /></span><span>{pendingImage.file.name}</span><Button type="button" variant="ghost" size="icon-sm" aria-label="Remove image reference" onClick={clearImage}><X /></Button></span>}

            </InputGroupAddon>}

            <InputGroupAddon align="block-end" className="agent-composer-actions">

              <Button type="button" variant="ghost" size="icon-sm" disabled={busy} aria-label="Attach image reference" title="Add image reference" onClick={() => fileInput.current?.click()}><Plus /></Button>

              <DropdownMenu>

                <DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon-sm" className="agent-permission-button" data-mode={mode} disabled={busy} aria-label="Agent permission mode" title={mode === "plan" ? "Plan · read and suggest only" : "Control · apply edits directly"}>{mode === "plan" ? <ShieldCheck /> : <MousePointer2 />}</Button></DropdownMenuTrigger>

                <DropdownMenuContent side="top" align="start" className="agent-control-menu"><p className="agent-control-heading">How should timeline edits be applied?</p>

                  <DropdownMenuItem onSelect={() => setMode("plan")}><ShieldCheck /><span><strong>Plan</strong><small>Read timeline and captions · suggest edits</small></span>{mode === "plan" && <Check className="ml-auto" />}</DropdownMenuItem>

                  <DropdownMenuItem onSelect={() => setMode("control")}><MousePointer2 /><span><strong>Control</strong><small>Read, edit and review automatically</small></span>{mode === "control" && <Check className="ml-auto" />}</DropdownMenuItem>

                </DropdownMenuContent>

              </DropdownMenu>

              <div className="min-w-0 ml-auto shrink-0"><AgentModelPicker value={modelId} disabled={busy} onChange={value => { setModelId(value); try { localStorage.setItem("skyclip-editor-model", value); } catch {} }} /></div>

              {voice.supported && <Button type="button" variant={voice.listening ? "secondary" : "ghost"} size="icon-sm" aria-label={voice.listening ? "Stop dictation" : "Dictate a message"} title="Dictate a message" aria-pressed={voice.listening} disabled={busy} onClick={voice.listening ? voice.stop : voice.start}><Mic /></Button>}

              {busy ? <Button type="button" size="icon-sm" variant="secondary" aria-label="Stop agent" title="Stop agent" onClick={stop}><Square /></Button>

                : <Button type="submit" size="icon-sm" aria-label={editingId ? "Resend edited message" : "Send message"} title={editingId ? "Resend edited message" : "Send message"} disabled={!input.trim() && !pendingImage}><ArrowUp /></Button>}

            </InputGroupAddon>

          </InputGroup>

          <input ref={fileInput} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif" className="hidden" aria-label="Choose image reference" onChange={e => pickImage(e.target.files?.[0])} />

        </form>

        {input.length > LIMIT - 200 && <p className="agent-composer-hint">{input.length}/{LIMIT}</p>}

      </footer>

    </aside>

  </>;

}



function LayersIcon() { return <Layers className="size-4 shrink-0" />; }
