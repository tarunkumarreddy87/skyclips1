import type { ProjectDetail } from "@hanuman/shared-types";
import { resolveThemeId } from "@hanuman/shared-types";
import type {
  Asset,
  EditorProject,
  EditorState,
  HistorySnapshot,
  TextItem,
  Timeline,
  Track,
  TransitionItem,
  TransitionType,
} from "./types";
import type { TimelineApiResponse, TimelineManifestV1, TimelineTransition, ElementAnimation as ManifestElementAnimation } from "./manifest-types";
import type { ElementAnimation } from "./types";
import { DEFAULT_ZOOM } from "./utils";
import {
  dedupeOverlappingCaptions,
  realignCaptionsToSpeechLayout,
  refreshCaptionWordClocks,
} from "./caption-groups";

const secToMs = (sec: number) => Math.round(sec * 1000);

function mapManifestAnimation(anim: ManifestElementAnimation | undefined): ElementAnimation | undefined {
  if (!anim) return undefined;
  const out: ElementAnimation = {};
  if (anim.in) {
    out.in = {
      preset: anim.in.preset,
      durationMs: Math.round((anim.in.duration_sec ?? 0.6) * 1000),
    };
  }
  if (anim.out) {
    out.out = {
      preset: anim.out.preset,
      durationMs: Math.round((anim.out.duration_sec ?? 0.6) * 1000),
    };
  }
  if (anim.loop) {
    out.loop = { preset: anim.loop.preset };
    if (anim.loop.params) out.loop.params = { ...anim.loop.params };
  }
  if (!out.in && !out.out && !out.loop) return undefined;
  return out;
}

function mapManifestTransform(t: TimelineManifestV1["tracks"]["video"][number]["transform"]) {
  if (!t) return undefined;
  return {
    x: t.x ?? 50,
    y: t.y ?? 50,
    scaleX: t.scaleX ?? 1,
    scaleY: t.scaleY ?? 1,
    rotation: t.rotation ?? 0,
    zIndex: t.zIndex ?? 0,
  };
}

const RENDER_TRANSITION_TYPES = new Set<TransitionType>([
  "cut",
  "zoom",
  "slide-pan",
  "film-burn",
  "glitch",
  "fade",
  "slide",
]);

function mapTransitionType(raw: string): TransitionType {
  const key = raw.trim().toLowerCase().replace(/_/g, "-");
  if (RENDER_TRANSITION_TYPES.has(key as TransitionType)) return key as TransitionType;
  return "fade";
}

/** Ensure React keys / selection ids stay unique even on older broken manifests. */
function uniqueId(raw: string, seen: Set<string>, fallback: string): string {
  const base = (raw || fallback).trim() || fallback;
  let id = base;
  let n = 2;
  while (seen.has(id)) {
    id = `${base}-${n}`;
    n += 1;
  }
  seen.add(id);
  return id;
}

function assetIdForSrc(src: string): string {
  // Stable across clips that reuse the same media object.
  const safe = src.replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-|-$/g, "").slice(-80);
  return `asset-${safe || "media"}`;
}

function mapManifestTransitions(
  transitions: TimelineTransition[] | undefined,
  _videoClips: TimelineManifestV1["tracks"]["video"],
): TransitionItem[] {
  if (!transitions?.length) return [];
  return transitions
    .filter((t) => t.enabled !== false)
    .map((t) => ({
      id: t.id,
      afterItemId: t.after_clip_id,
      transitionType: mapTransitionType(t.type),
      durationMs: Math.round(Number(t.duration_sec || 0.5) * 1000),
      enabled: t.enabled !== false,
      sfxMuted: Boolean(t.sfx_muted),
    }));
}

/**
 * Map persisted timeline.v1 overlays → animation-lane items.
 * SSOT is overlays[] (and editorDocument). Do NOT invent CTAs from caption text —
 * that created phantom UI overlays that never reached disk until a later edit.
 */
function mapMotionOverlays(
  tracks: Track[],
  overlays: TimelineManifestV1["overlays"],
): void {
  const animationTrack = tracks.find((t) => t.type === "animation");
  const textTrack = tracks.find((t) => t.type === "text");

  for (const overlay of overlays || []) {
    if (overlay.type === "freeform_text" && textTrack) {
      const t = overlay.transform;
      const fontUi = overlay.style?.font_size_px
        ? Math.max(14, Math.min(64, Math.round(overlay.style.font_size_px / 3.2)))
        : 32;
      textTrack.items.push({
        id: overlay.id || `txt-${overlay.start_sec}`,
        type: "text",
        startMs: secToMs(overlay.start_sec),
        endMs: secToMs(overlay.start_sec + overlay.duration_sec),
        label: (overlay.text || "Text").slice(0, 28),
        text: overlay.text || "",
        stylePreset: "default",
        fontSize: fontUi,
        color: overlay.style?.color || "#ffffff",
        fontWeight: overlay.style?.font_weight || "700",
        alignment: overlay.style?.alignment || "center",
        fontFamily: overlay.style?.font_family || undefined,
        boxWidthPct: overlay.style?.box_width_pct,
        position: { x: t?.x ?? 50, y: t?.y ?? 42 },
        transform: mapManifestTransform(overlay.transform) ?? {
          x: 50,
          y: 42,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: 12,
        },
        animation: mapManifestAnimation(overlay.animation),
        hidden: false,
      });
      continue;
    }

    if (!animationTrack) continue;

    if (overlay.type === "subscribe_cta") {
      animationTrack.items.push({
        id: overlay.id || "anim-subscribe-cta",
        type: "animation",
        startMs: secToMs(overlay.start_sec),
        endMs: secToMs(overlay.start_sec + overlay.duration_sec),
        label: overlay.text || "Subscribe CTA",
        preset: "subscribe-cta",
        intensity: 80,
        position: { x: overlay.transform?.x ?? 85, y: overlay.transform?.y ?? 12 },
        transform: mapManifestTransform(overlay.transform) ?? {
          x: 85,
          y: 12,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: 5,
        },
        animation: mapManifestAnimation(overlay.animation),
        hidden: false,
      });
    } else if (overlay.type === "chapter_title") {
      animationTrack.items.push({
        id: overlay.id || `anim-chapter-${overlay.start_sec}`,
        type: "animation",
        startMs: secToMs(overlay.start_sec),
        endMs: secToMs(overlay.start_sec + overlay.duration_sec),
        label: overlay.text || "Chapter",
        preset: "chapter-title",
        intensity: 70,
        boxWidthPct: overlay.style?.box_width_pct ?? 70,
        position: { x: overlay.transform?.x ?? 50, y: overlay.transform?.y ?? 40 },
        transform: mapManifestTransform(overlay.transform) ?? {
          x: 50,
          y: 40,
          scaleX: 1,
          scaleY: 1,
          rotation: 0,
          zIndex: 5,
        },
        animation: mapManifestAnimation(overlay.animation),
        hidden: false,
      });
    }
  }
}

function defaultSettings(): Timeline["settings"] {
  return {
    zoom: DEFAULT_ZOOM,
    snappingEnabled: true,
    showTransitions: true,
    captionsEnabled: true,
    captionStyle: "bold_static",
    backgroundColor: "#000000",
    backgroundImage: null,
    overlayDropShadow: true,
    narrationVolume: 100,
    musicVolume: 35,
    sfxVolume: 50,
    clipAudioVolume: 0,
    previewMuted: false,
    themeId: "standard",
  };
}

function emptyTracks(_durationMs: number): Track[] {
  const empty = (id: string, type: Track["type"], label: string): Track => ({
    id,
    type,
    label,
    locked: false,
    hidden: false,
    items: [],
  });

  return [
    empty("track-captions", "captions", "Captions"),
    empty("track-text", "text", "Text overlay"),
    empty("track-video", "video", "Video"),
    empty("track-broll", "broll", "Image"),
    empty("track-animation", "animation", "Motion graphics"),
    empty("track-narration", "narration", "Narration"),
    empty("track-music", "music", "Music"),
    empty("track-sfx", "sfx", "SFX"),
  ];
}

function buildAssets(manifest: TimelineManifestV1, mediaUrls: Record<string, string>): Asset[] {
  const assets = new Map<string, Asset>();

  const pushClip = (
    clip: { id: string; src: string; type?: string; duration_sec: number; scene_id?: string },
    label: string,
    mediaType: Asset["mediaType"],
  ) => {
    if (assets.has(clip.src)) return;
    const url = mediaUrls[clip.src] ?? clip.src;
    const metadata: Record<string, string> = { sourceKey: clip.src };
    if (clip.scene_id) metadata.sceneId = clip.scene_id;
    assets.set(clip.src, {
      id: assetIdForSrc(clip.src),
      sourceType: "generated",
      mediaType,
      label,
      url,
      thumbnailUrl: mediaType === "image" ? url : "",
      durationMs: secToMs(clip.duration_sec),
      metadata,
    });
  };

  for (const clip of manifest.tracks.video) {
    pushClip(clip, clip.scene_id || clip.id, clip.type === "image" ? "image" : "video");
  }
  for (const clip of manifest.tracks.broll || []) {
    pushClip(clip, clip.label || clip.scene_id || clip.id, clip.type === "image" ? "image" : "video");
  }
  for (const clip of manifest.tracks.audio) {
    pushClip(clip, clip.type === "narration" ? "Narration" : clip.id, "audio");
  }
  for (const clip of manifest.tracks.music || []) {
    pushClip(clip, clip.label || "Music bed", "audio");
  }

  return [...assets.values()];
}

/** Exported for CTA persistence round-trip tests (overlays[] SSOT). */
export function mapManifestToTimeline(manifest: TimelineManifestV1, mediaUrls: Record<string, string>): Timeline {
  const durationMs = secToMs(manifest.metadata.duration_sec);
  const tracks = emptyTracks(durationMs);
  const settings = defaultSettings();
  const seenIds = new Set<string>();
  if (manifest.settings?.music_volume != null) {
    settings.musicVolume = Math.round(manifest.settings.music_volume * 100);
  }
  if (manifest.settings?.narration_volume != null) {
    settings.narrationVolume = Math.round(manifest.settings.narration_volume * 100);
  }
  if (manifest.settings?.captions_enabled != null) {
    settings.captionsEnabled = manifest.settings.captions_enabled;
  }
  if (manifest.settings?.caption_style) {
    settings.captionStyle = manifest.settings.caption_style;
  }
  if (manifest.settings?.sfx_volume != null) {
    settings.sfxVolume = Math.round(manifest.settings.sfx_volume * 100);
  }
  if (manifest.settings?.theme_id) {
    settings.themeId = manifest.settings.theme_id;
  }

  for (const clip of manifest.tracks.video) {
    const url = mediaUrls[clip.src] ?? clip.src;
    const id = uniqueId(clip.id, seenIds, `video-${seenIds.size}`);
    const sceneLabel = (clip.scene_id || clip.id || "").replace(/-/g, " ");
    tracks.find((t) => t.type === "video")!.items.push({
      id,
      type: "video",
      startMs: secToMs(clip.start_sec),
      endMs: secToMs(clip.start_sec + clip.duration_sec),
      label: sceneLabel || id,
      mediaType: clip.type === "image" ? "image" : "video",
      assetId: assetIdForSrc(clip.src),
      fitMode: clip.fit ?? "cover",
      muted: true,
      hidden: false,
      sourceStartMs: secToMs(clip.source_start_sec ?? 0),
      thumbnailUrl: clip.type === "image" ? url : undefined,
      transform: mapManifestTransform(clip.transform),
      animation: mapManifestAnimation(clip.animation),
    });
  }

  for (const clip of manifest.tracks.broll || []) {
    const url = mediaUrls[clip.src] ?? clip.src;
    const id = uniqueId(clip.id, seenIds, `broll-${seenIds.size}`);
    const sceneLabel = (clip.label || clip.scene_id || "B-roll").replace(/-/g, " ");
    tracks.find((t) => t.type === "broll")!.items.push({
      id,
      type: "broll",
      startMs: secToMs(clip.start_sec),
      endMs: secToMs(clip.start_sec + clip.duration_sec),
      label: sceneLabel,
      mediaType: clip.type === "image" ? "image" : "video",
      assetId: assetIdForSrc(clip.src),
      fitMode: clip.fit ?? "cover",
      muted: true,
      hidden: false,
      sourceStartMs: secToMs(clip.source_start_sec ?? 0),
      thumbnailUrl: clip.type === "image" ? url : undefined,
      transform: mapManifestTransform(clip.transform),
      animation: mapManifestAnimation(clip.animation),
    });
  }

  for (const clip of manifest.tracks.audio) {
    const id = uniqueId(clip.id, seenIds, `narration-${seenIds.size}`);
    tracks.find((t) => t.type === "narration")!.items.push({
      id,
      type: "narration",
      startMs: secToMs(clip.start_sec),
      endMs: secToMs(clip.start_sec + clip.duration_sec),
      label: "Narration",
      assetId: assetIdForSrc(clip.src),
      volume: Math.round((clip.volume ?? 1) * 100),
      fadeIn: Math.round((clip.fade_in_sec ?? 0) * 1000),
      fadeOut: Math.round((clip.fade_out_sec ?? 0.5) * 1000),
      sourceStartMs: secToMs(clip.source_start_sec ?? 0),
      hidden: false,
    });
  }

  for (const clip of manifest.tracks.music || []) {
    const id = uniqueId(clip.id, seenIds, `music-${seenIds.size}`);
    const isSfx = String(clip.mood || "").toLowerCase() === "sfx";
    const trackType = isSfx ? "sfx" : "music";
    tracks.find((t) => t.type === trackType)!.items.push({
      id,
      type: trackType,
      startMs: secToMs(clip.start_sec),
      endMs: secToMs(clip.start_sec + clip.duration_sec),
      label: clip.label || (isSfx ? "SFX" : "Music bed"),
      assetId: assetIdForSrc(clip.src),
      volume: Math.round((clip.volume ?? (isSfx ? 0.6 : 0.28)) * 100),
      fadeIn: Math.round((clip.fade_in_sec ?? (isSfx ? 0 : 2)) * 1000),
      fadeOut: Math.round((clip.fade_out_sec ?? (isSfx ? 0.2 : 3)) * 1000),
      sourceStartMs: secToMs(clip.source_start_sec ?? 0),
      hidden: false,
    });
  }

  for (const [i, cap] of manifest.tracks.captions.entries()) {
    const id = uniqueId(cap.id, seenIds, `caption-${i}`);
    const style = cap.style;
    tracks.find((t) => t.type === "captions")!.items.push({
      id,
      type: "captions",
      startMs: secToMs(cap.start_sec),
      endMs: secToMs(cap.start_sec + cap.duration_sec),
      label: cap.text.length > 24 ? `${cap.text.slice(0, 24)}…` : cap.text,
      text: cap.text,
      sectionId: cap.section_id || undefined,
      stylePreset: "default",
      fontSize: Math.max(14, Math.min(32, Math.round(
        // Prefer UI-sized values; downscale composition-sized (Remotion) fonts for the inspector.
        (style?.font_size_px ?? 20) >= 36
          ? (style!.font_size_px! / 3)
          : (style?.font_size_px ?? 20),
      ))),
      color: style?.color || "#ffffff",
      fontWeight: style?.font_weight || "500",
      alignment: "center",
      boxWidthPct: style?.box_width_pct ?? 72,
      position: { x: cap.transform?.x ?? 50, y: cap.transform?.y ?? 90 },
      transform: (() => {
        const mapped = mapManifestTransform(cap.transform);
        return mapped
          ? { ...mapped }
          : {
              x: 50,
              y: 90,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              zIndex: 20,
            };
      })(),
      animation: mapManifestAnimation(cap.animation),
      words: cap.words?.map((w) => ({
        text: w.text,
        startSec: w.start_sec,
        durationSec: w.duration_sec,
      })),
      hidden: false,
    });
  }

  // Collapse near-duplicates. Re-chunk only when pipeline omitted word clocks
  // (legacy manifests) — never overwrite measured tts_piece timings.
  {
    const capTrack = tracks.find((t) => t.type === "captions");
    if (capTrack) {
      const captions = capTrack.items.filter((i): i is TextItem => i.type === "captions");
      const cleaned = dedupeOverlappingCaptions(captions);
      const missingWords = cleaned.length > 0 && cleaned.every((c) => !c.words?.length);
      const laidOut = missingWords
        ? realignCaptionsToSpeechLayout(cleaned)
        : cleaned;
      // Keep karaoke locked to each cue window (fixes text/voice drift after edits).
      capTrack.items = refreshCaptionWordClocks(laidOut);
    }
  }

  mapMotionOverlays(tracks, manifest.overlays);

  return {
    id: manifest.metadata.run_id,
    durationMs,
    fps: manifest.metadata.fps,
    settings,
    tracks,
    transitions: mapManifestTransitions(manifest.transitions, manifest.tracks.video),
  };
}

function mapProject(project: ProjectDetail, manifest: TimelineManifestV1): EditorProject {
  const durationMs = secToMs(manifest.metadata.duration_sec);
  const quote = project.activeQuote;

  return {
    id: project.id,
    title: project.title,
    format: project.formatMode,
    durationMs,
    status: project.status === "completed" ? "completed" : "editing",
    prompt: project.brief?.promptText ?? project.brief?.scriptText ?? "",
    model: "skyclip-v1",
    language: project.brief?.language ?? quote?.language ?? "en",
    voice: quote?.voiceId ?? "default",
    brandProfile: resolveThemeId(quote?.brandProfileId ?? "standard"),
    createdAt: project.createdAt,
    fps: manifest.metadata.fps,
  };
}

function buildHistory(manifest: TimelineManifestV1): HistorySnapshot[] {
  return [
    {
      id: `hist-${manifest.metadata.run_id}`,
      label: "Original AI-generated version",
      createdAt: new Date().toISOString(),
      actionType: "generate",
      isOriginal: true,
    },
  ];
}

export interface ManifestMappingReport {
  unmappedManifestFields: string[];
  editorDefaultsUsed: string[];
}

export function mapTimelineResponseToEditorState(
  project: ProjectDetail,
  timeline: TimelineApiResponse,
): { state: EditorState; report: ManifestMappingReport } {
  const report: ManifestMappingReport = {
    unmappedManifestFields: [
      "tracks.video[].scene_id — stored in asset.metadata only",
      "No caption position/style fields (TextItem.position defaults to lower-third)",
      "No editor chrome settings (zoom, snap) in manifest",
      "No thumbnail URLs for video clips (image src used as thumb when type=image)",
    ],
    editorDefaultsUsed: [
      "timeline.settings.* with music_volume / captions_enabled from manifest when present",
      "caption stylePreset, fontSize, color, position",
      "motion overlays → animation lane from timeline.overlays[] only (no caption invent)",
      "unique item ids + src-keyed assets (repairs older duplicate-id manifests)",
    ],
  };

  const manifest = timeline.manifest;
  const state: EditorState = {
    project: mapProject(project, manifest),
    timeline: mapManifestToTimeline(manifest, timeline.mediaUrls),
    assets: buildAssets(manifest, timeline.mediaUrls),
    history: buildHistory(manifest),
  };

  return { state, report };
}
