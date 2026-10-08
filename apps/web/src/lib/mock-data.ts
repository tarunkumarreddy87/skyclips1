export type ProjectStatus = "queued" | "processing" | "editing" | "failed" | "completed" | "draft";

export type FormatMode = "documentary" | "listicle";
export type ReasoningLevel = "fast" | "balanced" | "deep";
export type ModelId = "skyclip-v1" | "skyclip-v1-pro";

export interface BrandProfile {
  id: string;
  name: string;
  accent: string;
}

export interface Workspace {
  id: string;
  name: string;
  plan: string;
}

export interface MockProject {
  id: string;
  title: string;
  status: ProjectStatus;
  createdAt: string;
  format: FormatMode;
  language: string;
  prompt: string;
  durationSec: number;
  model: ModelId;
  reasoning: ReasoningLevel;
  brandProfileId: string;
  voice: string;
  estimatedCredits: number;
  thumbnailId?: string;
  hasCustomScript?: boolean;
  hasCustomVoiceover?: boolean;
}

export interface ThumbnailOption {
  id: string;
  label: string;
  gradient: string;
}

export interface GenerationStage {
  id: string;
  label: string;
  description: string;
  status: "pending" | "active" | "completed" | "failed";
}

export const workspaces: Workspace[] = [
  { id: "ws-1", name: "Acme Studio", plan: "Pro" },
  { id: "ws-2", name: "Personal", plan: "Free" },
];

export const brandProfiles: BrandProfile[] = [
  { id: "bp-1", name: "Default", accent: "from-zinc-500 to-zinc-700" },
  { id: "bp-2", name: "Tech Explainer", accent: "from-blue-500 to-indigo-600" },
  { id: "bp-3", name: "Warm Documentary", accent: "from-amber-500 to-orange-600" },
];

export const models: { id: ModelId; label: string }[] = [
  { id: "skyclip-v1", label: "SkyClip v1" },
  { id: "skyclip-v1-pro", label: "SkyClip v1 Pro" },
];

export const reasoningLevels: { id: ReasoningLevel; label: string }[] = [
  { id: "fast", label: "Fast" },
  { id: "balanced", label: "Balanced" },
  { id: "deep", label: "Deep reasoning" },
];

export const voices = [
  { id: "aditya", label: "English (India) — Aditya" },
  { id: "abhilash", label: "English (US) — Abhilash" },
  { id: "kavya", label: "Hindi — Kavya" },
  { id: "shubh", label: "Neutral — Shubh" },
  { id: "anushka", label: "English — Anushka" },
];

export const thumbnailOptions: ThumbnailOption[] = [
  { id: "thumb-1", label: "Cinematic dark", gradient: "from-slate-900 via-slate-700 to-slate-900" },
  { id: "thumb-2", label: "Electric blue", gradient: "from-blue-600 via-indigo-500 to-violet-600" },
  { id: "thumb-3", label: "Sunset warmth", gradient: "from-orange-500 via-rose-500 to-purple-600" },
  { id: "thumb-4", label: "Forest tone", gradient: "from-emerald-700 via-teal-600 to-cyan-700" },
];

export const mockProjects: MockProject[] = [
  {
    id: "proj-1",
    title: "The Future of Renewable Energy",
    status: "completed",
    createdAt: new Date(Date.now() - 2 * 3600000).toISOString(),
    format: "documentary",
    language: "en",
    prompt: "A 5-minute documentary on how solar and wind are reshaping global power grids.",
    durationSec: 300,
    model: "skyclip-v1-pro",
    reasoning: "balanced",
    brandProfileId: "bp-2",
    voice: "aditya",
    estimatedCredits: 42,
    thumbnailId: "thumb-2",
  },
  {
    id: "proj-2",
    title: "10 Productivity Hacks for Remote Teams",
    status: "processing",
    createdAt: new Date(Date.now() - 45 * 60000).toISOString(),
    format: "listicle",
    language: "en",
    prompt: "Listicle covering async communication, focus blocks, and meeting hygiene.",
    durationSec: 180,
    model: "skyclip-v1",
    reasoning: "fast",
    brandProfileId: "bp-1",
    voice: "abhilash",
    estimatedCredits: 28,
    thumbnailId: "thumb-1",
  },
  {
    id: "proj-3",
    title: "Ancient Trade Routes of the Silk Road",
    status: "queued",
    createdAt: new Date(Date.now() - 15 * 60000).toISOString(),
    format: "documentary",
    language: "en",
    prompt: "Explore how the Silk Road connected cultures across Asia and Europe.",
    durationSec: 420,
    model: "skyclip-v1-pro",
    reasoning: "deep",
    brandProfileId: "bp-3",
    voice: "aditya",
    estimatedCredits: 55,
    thumbnailId: "thumb-3",
  },
  {
    id: "proj-4",
    title: "Startup Pitch — Series A Story",
    status: "editing",
    createdAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    format: "documentary",
    language: "en",
    prompt: "Founder narrative for a climate-tech startup raising Series A.",
    durationSec: 120,
    model: "skyclip-v1",
    reasoning: "balanced",
    brandProfileId: "bp-2",
    voice: "abhilash",
    estimatedCredits: 18,
    thumbnailId: "thumb-4",
  },
  {
    id: "proj-5",
    title: "Failed Render Test",
    status: "failed",
    createdAt: new Date(Date.now() - 3 * 24 * 3600000).toISOString(),
    format: "listicle",
    language: "en",
    prompt: "Quick test video that failed during render.",
    durationSec: 60,
    model: "skyclip-v1",
    reasoning: "fast",
    brandProfileId: "bp-1",
    voice: "aditya",
    estimatedCredits: 12,
  },
];

export const generationStages: GenerationStage[] = [
  { id: "validate", label: "Validate brief", description: "Checking project inputs", status: "completed" },
  { id: "research", label: "Research", description: "Gathering context and facts", status: "completed" },
  { id: "script", label: "Script", description: "Writing narration script", status: "active" },
  { id: "voice", label: "Voiceover", description: "Synthesizing speech", status: "pending" },
  { id: "scenes", label: "Scene planning", description: "Selecting B-roll assets", status: "pending" },
  { id: "timeline", label: "Timeline", description: "Building render manifest", status: "pending" },
  { id: "render", label: "Render", description: "Native video export", status: "pending" },
];

export const editorScenes = [
  { id: "scene-1", title: "Opening hook", duration: 12, media: "Aerial city skyline at dusk" },
  { id: "scene-2", title: "Problem statement", duration: 18, media: "Office collaboration montage" },
  { id: "scene-3", title: "Key insight #1", duration: 22, media: "Data visualization overlay" },
  { id: "scene-4", title: "Call to action", duration: 14, media: "Product demo close-up" },
];

const dynamicProjects: Record<string, MockProject> = {};

export function registerProject(project: MockProject) {
  dynamicProjects[project.id] = project;
}

export function getProjectById(id: string): MockProject | undefined {
  return dynamicProjects[id] ?? mockProjects.find((p) => p.id === id);
}

export function getBrandProfile(id: string): BrandProfile | undefined {
  return brandProfiles.find((b) => b.id === id);
}

export function createDraftProject(prompt: string, overrides?: Partial<MockProject>): MockProject {
  return {
    id: `proj-${Date.now()}`,
    title: prompt.slice(0, 60) || "Untitled video",
    status: "draft",
    createdAt: new Date().toISOString(),
    format: "documentary",
    language: "en",
    prompt,
    durationSec: 180,
    model: "skyclip-v1",
    reasoning: "balanced",
    brandProfileId: "bp-1",
    voice: "aditya",
    estimatedCredits: 24,
    ...overrides,
  };
}
