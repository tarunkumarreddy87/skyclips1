import type { Asset, EditorProject, EditorState, HistorySnapshot, Timeline } from "./types";
import { getProjectById } from "@/lib/mock-data";

const SAMPLE_MP4 =
  "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4";

const ASSETS: Asset[] = [
  {
    id: "asset-1",
    sourceType: "generated",
    mediaType: "video",
    label: "Archive boxes scene",
    url: SAMPLE_MP4,
    thumbnailUrl: "https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=640&h=360&fit=crop",
    durationMs: 12000,
  },
  {
    id: "asset-2",
    sourceType: "stock",
    mediaType: "video",
    label: "Senators in space graphic",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_1MB.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?w=640&h=360&fit=crop",
    durationMs: 8000,
  },
  {
    id: "asset-3",
    sourceType: "stock",
    mediaType: "image",
    label: "Control room B-roll",
    url: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=1280&h=720&fit=crop",
    thumbnailUrl: "https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=640&h=360&fit=crop",
  },
  {
    id: "asset-4",
    sourceType: "generated",
    mediaType: "audio",
    label: "Narration full take",
    url: "/editor-mock/narration.mp3",
    thumbnailUrl: "",
    durationMs: 1451000,
  },
  {
    id: "asset-5",
    sourceType: "licensed",
    mediaType: "video",
    label: "Storyblocks — Capitol exterior",
    url: "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/360/Big_Buck_Bunny_360_10s_5MB.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1529107386315-e1a2ed48a620?w=640&h=360&fit=crop",
    durationMs: 15000,
  },
  {
    id: "asset-6",
    sourceType: "stock",
    mediaType: "video",
    label: "Document close-up",
    url: "https://www.w3schools.com/html/mov_bbb.mp4",
    thumbnailUrl: "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=640&h=360&fit=crop",
    durationMs: 6000,
  },
  {
    id: "asset-7",
    sourceType: "local",
    mediaType: "audio",
    label: "Background music — ambient",
    url: "/editor-mock/music.mp3",
    thumbnailUrl: "",
    durationMs: 180000,
  },
  {
    id: "asset-8",
    sourceType: "url",
    mediaType: "image",
    label: "Remote still — declassified stamp",
    url: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=320&h=180&fit=crop",
    thumbnailUrl: "https://images.unsplash.com/photo-1586281380349-632531db7ed4?w=320&h=180&fit=crop",
  },
];

const HISTORY: HistorySnapshot[] = [
  {
    id: "hist-original",
    label: "Original AI-generated version",
    createdAt: "2026-07-07T10:00:00.000Z",
    actionType: "generate",
    isOriginal: true,
  },
  {
    id: "hist-1",
    label: "Replaced B-roll clip 3",
    createdAt: "2026-07-07T11:30:00.000Z",
    actionType: "replace_media",
  },
  {
    id: "hist-2",
    label: "Added subscribe CTA overlay",
    createdAt: "2026-07-07T12:15:00.000Z",
    actionType: "add_animation",
  },
  {
    id: "hist-3",
    label: "Adjusted narration volume",
    createdAt: "2026-07-07T13:00:00.000Z",
    actionType: "audio_change",
  },
];

function buildTimeline(): Timeline {
  return {
    id: "tl-1",
    durationMs: 1451000,
    fps: 30,
    settings: {
      zoom: 8,
      snappingEnabled: true,
      showTransitions: true,
      captionsEnabled: true,
      captionStyle: "bold_static" as const,
      backgroundColor: "#000000",
      backgroundImage: null,
      overlayDropShadow: true,
      narrationVolume: 100,
      musicVolume: 35,
      sfxVolume: 50,
      clipAudioVolume: 0,
    },
    tracks: [
      {
        id: "track-captions",
        type: "captions",
        label: "Captions",
        locked: false,
        hidden: false,
        items: [
          { id: "cap-1", type: "captions", startMs: 0, endMs: 4200, label: "Let me show you what was hidden", text: "Let me show you what was hidden in the archives for decades.", stylePreset: "default", fontSize: 18, color: "#ffffff", fontWeight: "500", alignment: "center", position: { x: 50, y: 88 }, hidden: false },
          { id: "cap-2", type: "captions", startMs: 4200, endMs: 9800, label: "if declassification happened", text: "if declassification actually happened under executive order.", stylePreset: "default", fontSize: 18, color: "#ffffff", fontWeight: "500", alignment: "center", position: { x: 50, y: 88 }, hidden: false },
          { id: "cap-3", type: "captions", startMs: 9800, endMs: 15000, label: "intelligence experts warned", text: "intelligence experts warned Congress about unknown aerial phenomena.", stylePreset: "default", fontSize: 18, color: "#ffffff", fontWeight: "500", alignment: "center", position: { x: 50, y: 88 }, hidden: false },
        ],
      },
      {
        id: "track-text",
        type: "text",
        label: "Text overlay",
        locked: false,
        hidden: false,
        items: [
          { id: "txt-1", type: "text", startMs: 28000, endMs: 34000, label: "Year Text Overlay", text: "FIVE U.S. SENATORS ARE IN SPACE", stylePreset: "chapter-title", fontSize: 32, color: "#ffffff", fontWeight: "700", alignment: "center", position: { x: 50, y: 42 }, transform: { x: 50, y: 42, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 12 }, hidden: false },
        ],
      },
      {
        id: "track-video",
        type: "video",
        label: "Video",
        locked: false,
        hidden: false,
        items: [
          { id: "clip-1", type: "video", startMs: 0, endMs: 8000, label: "Human beings have always...", mediaType: "video", assetId: "asset-1", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[0].thumbnailUrl },
          { id: "clip-2", type: "video", startMs: 8000, endMs: 16000, label: "Intelligence agencies...", mediaType: "video", assetId: "asset-6", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[5].thumbnailUrl },
          { id: "clip-3", type: "video", startMs: 16000, endMs: 24000, label: "Researchers discovered...", mediaType: "video", assetId: "asset-3", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[2].thumbnailUrl },
          { id: "clip-4", type: "video", startMs: 24000, endMs: 32000, label: "Most famous incident...", mediaType: "video", assetId: "asset-2", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[1].thumbnailUrl },
          { id: "clip-5", type: "video", startMs: 32000, endMs: 40000, label: "Signed an executive order...", mediaType: "video", assetId: "asset-1", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[0].thumbnailUrl },
          { id: "gen-1", type: "video", startMs: 40000, endMs: 44000, label: "Generated scene A", mediaType: "video", assetId: "asset-2", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[1].thumbnailUrl },
          { id: "gen-2", type: "video", startMs: 44000, endMs: 48000, label: "Generated scene B", mediaType: "video", assetId: "asset-6", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[5].thumbnailUrl },
          { id: "gen-3", type: "video", startMs: 48000, endMs: 52000, label: "Generated scene C", mediaType: "video", assetId: "asset-3", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[2].thumbnailUrl },
        ],
      },
      {
        id: "track-broll",
        type: "broll",
        label: "Image",
        locked: false,
        hidden: false,
        items: [
          { id: "broll-1", type: "broll", startMs: 12000, endMs: 18000, label: "Image", mediaType: "image", assetId: "asset-8", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[7].thumbnailUrl },
          { id: "broll-2", type: "broll", startMs: 28000, endMs: 34000, label: "Image", mediaType: "image", assetId: "asset-5", fitMode: "cover", muted: true, hidden: false, thumbnailUrl: ASSETS[4].thumbnailUrl },
        ],
      },
      {
        id: "track-animation",
        type: "animation",
        label: "Motion graphics",
        locked: false,
        hidden: false,
        items: [
          { id: "anim-1", type: "animation", startMs: 45000, endMs: 52000, label: "Subscribe CTA", preset: "subscribe-cta", intensity: 80, position: { x: 85, y: 15 }, hidden: false },
        ],
      },
      {
        id: "track-narration",
        type: "narration",
        label: "Narration",
        locked: false,
        hidden: false,
        items: [
          { id: "nar-1", type: "narration", startMs: 0, endMs: 1451000, label: "Narration.mp3", assetId: "asset-4", volume: 100, fadeIn: 0, fadeOut: 500, hidden: false },
        ],
      },
      {
        id: "track-music",
        type: "music",
        label: "Music",
        locked: false,
        hidden: false,
        items: [
          { id: "mus-1", type: "music", startMs: 0, endMs: 1451000, label: "Cue.mp3", assetId: "asset-7", volume: 35, fadeIn: 2000, fadeOut: 3000, hidden: false },
        ],
      },
      {
        id: "track-sfx",
        type: "sfx",
        label: "SFX",
        locked: false,
        hidden: false,
        items: [
          { id: "sfx-1", type: "sfx", startMs: 28000, endMs: 29000, label: "Whoosh", assetId: "asset-7", volume: 60, fadeIn: 0, fadeOut: 200, hidden: false },
        ],
      },
    ],
    transitions: [
      { id: "tr-1", afterItemId: "clip-1", transitionType: "zoom", durationMs: 400, enabled: true },
      { id: "tr-2", afterItemId: "clip-2", transitionType: "slide-pan", durationMs: 500, enabled: true },
      { id: "tr-3", afterItemId: "clip-3", transitionType: "film-burn", durationMs: 500, enabled: true },
      { id: "tr-4", afterItemId: "clip-4", transitionType: "glitch", durationMs: 400, enabled: true },
      { id: "tr-5", afterItemId: "clip-5", transitionType: "cut", durationMs: 0, enabled: true },
    ],
  };
}

export function createEditorState(projectId: string): EditorState {
  const mockProject = getProjectById(projectId);
  const project: EditorProject = {
    id: projectId,
    title: mockProject?.title ?? "Declassified: What They Didn't Tell You",
    format: mockProject?.format ?? "documentary",
    durationMs: mockProject ? mockProject.durationSec * 1000 : 1451000,
    status: mockProject?.status === "completed" ? "completed" : "editing",
    prompt:
      mockProject?.prompt ??
      "A long-form documentary exploring declassified intelligence documents and the story behind five U.S. senators briefed on space anomalies.",
    model: mockProject?.model ?? "skyclip-v1-pro",
    language: mockProject?.language ?? "en",
    voice: mockProject?.voice ?? "English (India) — Neutral",
    brandProfile: "Warm Documentary",
    createdAt: mockProject?.createdAt ?? "2026-07-07T09:00:00.000Z",
    fps: 30,
  };

  return {
    project,
    timeline: buildTimeline(),
    assets: ASSETS,
    history: HISTORY,
  };
}

export const ANIMATION_PRESETS = [
  { id: "subscribe-cta", label: "Subscribe CTA", category: "CTA" },
  { id: "chapter-title", label: "Chapter title", category: "Titles" },
  { id: "lower-third", label: "Lower third", category: "Labels" },
  { id: "highlight-bar", label: "Highlight bar", category: "Accents" },
  { id: "callout", label: "Callout box", category: "Accents" },
];

export const STOCK_SEARCH_RESULTS = ASSETS.filter((a) => a.sourceType === "stock" || a.sourceType === "licensed");
