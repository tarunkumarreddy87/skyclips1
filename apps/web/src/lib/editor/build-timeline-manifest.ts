import type { Asset, AudioItem, ClipItem, EditorState, TextItem, TransitionType } from "./types";
import type { TimelineManifestV1, TimelineCaptionClip, TimelineVideoClip, TimelineAudioClip, TimelineBrollClip, TimelineMusicClip, TimelineTransition, TimelineOverlay, ElementAnimation } from "./manifest-types";
import { toManifestTransform, resolveTransform } from "./transform";
import type { ElementAnimation as EditorElementAnimation } from "./types";
import { estimateExportDurationSec } from "./export-duration";
import { resolveMediaUrl } from "./media-url";
import { estimateWordTimings } from "@hanuman/shared-types";

export type ManifestSrcMode = "durable" | "browser";

export interface BuildManifestOptions {
  /**
   * durable — S3 keys for worker/Remotion CLI download (persist + render).
   * browser — playable http(s)/proxy URLs for @remotion/player preview.
   */
  srcMode?: ManifestSrcMode;
}

function toManifestAnimation(anim: EditorElementAnimation | undefined): ElementAnimation | undefined {
  if (!anim) return undefined;
  const out: ElementAnimation = {};
  if (anim.in) {
    out.in = { preset: anim.in.preset, duration_sec: Math.max(0.05, anim.in.durationMs / 1000) };
  }
  if (anim.out) {
    out.out = { preset: anim.out.preset, duration_sec: Math.max(0.05, anim.out.durationMs / 1000) };
  }
  if (anim.loop) {
    out.loop = { preset: anim.loop.preset };
    if (anim.loop.params) out.loop.params = { ...anim.loop.params };
  }
  if (!out.in && !out.out && !out.loop) return undefined;
  return out;
}
function resolveDurableSrc(asset: Asset | undefined): string {
  const raw = asset?.metadata?.sourceKey || asset?.url || "";
  return extractS3KeyOrPassthrough(raw);
}

function resolveBrowserSrc(asset: Asset | undefined): string {
  if (!asset?.url) return "";
  return resolveMediaUrl(asset.url);
}

function resolveClipSrc(asset: Asset | undefined, mode: ManifestSrcMode): string {
  return mode === "browser" ? resolveBrowserSrc(asset) : resolveDurableSrc(asset);
}

/** Prefer S3 object key over expired/presigned HTTP URLs for persistence + render download. */
function extractS3KeyOrPassthrough(src: string): string {
  if (!src) return src;
  if (!src.startsWith("http://") && !src.startsWith("https://")) return src;
  try {
    const u = new URL(src);
    const host = u.hostname.toLowerCase();
    const path = u.pathname.replace(/^\/+/, "");

    // MinIO / path-style: /{bucket}/{key...}
    const parts = path.split("/");
    if (parts.length >= 2 && (parts[0] === "hanuman-artifacts" || parts[0].includes("artifact"))) {
      return parts.slice(1).join("/");
    }

    // Virtual-hosted: {bucket}.s3.{region}.amazonaws.com/{key}
    const vhostMatch = host.match(/^(.+)\.s3[.-][a-z0-9-]+\.amazonaws\.com$/i);
    if (vhostMatch) {
      return path;
    }

    // Path-style AWS: s3.{region}.amazonaws.com/{bucket}/{key}
    if (host.startsWith("s3.") && host.includes("amazonaws.com") && parts.length >= 2) {
      return parts.slice(1).join("/");
    }

    return src;
  } catch {
    return src;
  }
}

function sec(ms: number) {
  return ms / 1000;
}

function normalizeFit(fit: string | undefined): "cover" | "contain" {
  if (fit === "contain") return "contain";
  return "cover";
}

function clampVolumeTo0to1(v: number) {
  if (!Number.isFinite(v)) return 1;
  return Math.max(0, Math.min(1, v));
}

/** Editor caption sizes ~16–28px; map to 1080p Remotion composition px. */
export function compositionCaptionFontPx(editorFontSize?: number): number {
  const ui = Number.isFinite(editorFontSize) ? Number(editorFontSize) : 22;
  // Values already in composition range (e.g. reloaded from older manifests).
  if (ui >= 36) return Math.max(48, Math.min(110, Math.round(ui)));
  return Math.max(72, Math.min(110, Math.round(ui * 4)));
}

/** Freeform title/card text — editor UI px → 1080p Remotion px. */
export function compositionTextFontPx(editorFontSize?: number): number {
  const ui = Number.isFinite(editorFontSize) ? Number(editorFontSize) : 28;
  if (ui >= 40) return Math.max(40, Math.min(180, Math.round(ui)));
  // Slightly larger on-canvas titles so STREAMER/EDITORIAL presets read clearly at 1080p.
  return Math.max(56, Math.min(168, Math.round(ui * 3.4)));
}

export function buildTimelineManifestV1FromEditorState(
  projectId: string,
  state: EditorState,
  opts?: BuildManifestOptions,
): TimelineManifestV1 {
  const srcMode: ManifestSrcMode = opts?.srcMode ?? "durable";
  const { timeline, assets, project } = state;

  const videoItems: ClipItem[] = [];
  const brollItems: ClipItem[] = [];
  const narrationItems: AudioItem[] = [];
  const musicItems: AudioItem[] = [];
  const sfxItems: AudioItem[] = [];
  const captionItems: TextItem[] = [];
  const freeformTextItems: TextItem[] = [];

  for (const track of timeline.tracks) {
    if (track.hidden) continue;
    if (track.type === "video") {
      for (const item of track.items) {
        if (item.hidden) continue;
        videoItems.push(item as ClipItem);
      }
    }
    if (track.type === "broll") {
      for (const item of track.items) {
        if (item.hidden) continue;
        brollItems.push(item as ClipItem);
      }
    }
    if (track.type === "narration") {
      for (const item of track.items) {
        if (item.hidden) continue;
        narrationItems.push(item as AudioItem);
      }
    }
    if (track.type === "music") {
      for (const item of track.items) {
        if (item.hidden) continue;
        musicItems.push(item as AudioItem);
      }
    }
    if (track.type === "sfx") {
      for (const item of track.items) {
        if (item.hidden) continue;
        sfxItems.push(item as AudioItem);
      }
    }
    // Captions stay on the caption burn-in track (one cue at a time).
    if (track.type === "captions") {
      for (const item of track.items) {
        if (item.hidden) continue;
        captionItems.push(item as TextItem);
      }
    }
    // Freeform text is a separate Remotion overlay — never compete with captions.
    if (track.type === "text") {
      for (const item of track.items) {
        if (item.hidden) continue;
        freeformTextItems.push(item as TextItem);
      }
    }
  }

  const visibleVideoItems = videoItems.sort((a, b) => a.startMs - b.startMs);
  const visibleBrollItems = brollItems.sort((a, b) => a.startMs - b.startMs);
  const visibleNarrationItems = narrationItems.sort((a, b) => a.startMs - b.startMs);
  const visibleMusicItems = musicItems.sort((a, b) => a.startMs - b.startMs);
  const visibleSfxItems = sfxItems.sort((a, b) => a.startMs - b.startMs);
  const visibleCaptionItems = captionItems.sort((a, b) => a.startMs - b.startMs);

  // Export SSOT metadata: transition-overlap-aware (Remotion TransitionSeries).
  // Browser preview uses the full canvas duration so playhead ↔ picture stay 1:1.
  const durationSecExport = estimateExportDurationSec(timeline);
  const durationSecCanvas = Math.max(0.001, timeline.durationMs / 1000);
  const durationSecMeta = srcMode === "browser" ? durationSecCanvas : durationSecExport;

  const videoClips: TimelineVideoClip[] = visibleVideoItems
    .map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const src = resolveClipSrc(asset, srcMode);
      const clipType = (item.mediaType === "video" ? "video" : "image") as "video" | "image";

      return {
        id: item.id || `video-${idx}`,
        scene_id: item.id || `scene-${idx}`,
        type: clipType,
        src,
        start_sec: sec(item.startMs),
        duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
        source_start_sec: Math.max(0, sec(item.sourceStartMs ?? 0)),
        fit: normalizeFit(item.fitMode),
        muted: Boolean(item.muted),
        transform: toManifestTransform(item.transform),
        animation: toManifestAnimation(item.animation),
      };
    })
    .filter((c) => Boolean(c.src?.trim()));

  const brollClips: TimelineBrollClip[] = visibleBrollItems
    .map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const src = resolveClipSrc(asset, srcMode);
      return {
        id: item.id || `broll-${idx}`,
        scene_id: String(asset?.metadata?.sceneId || item.id || `broll-${idx}`),
        type: (item.mediaType === "video" ? "video" : "image") as "video" | "image",
        src,
        start_sec: sec(item.startMs),
        duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
        source_start_sec: Math.max(0, sec(item.sourceStartMs ?? 0)),
        fit: normalizeFit(item.fitMode),
        muted: Boolean(item.muted),
        label: item.label,
        transform: toManifestTransform(item.transform),
        animation: toManifestAnimation(item.animation),
      };
    })
    .filter((c) => Boolean(c.src?.trim()));

  const audioClips: TimelineAudioClip[] = visibleNarrationItems
    .map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const src = resolveClipSrc(asset, srcMode);
      const volume01 = clampVolumeTo0to1(item.volume / 100);

      return {
        id: item.id || `audio-${idx}`,
        type: "narration" as const,
        src,
        start_sec: sec(item.startMs),
        duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
        source_start_sec: Math.max(0, sec(item.sourceStartMs ?? 0)),
        volume: volume01,
        fade_in_sec: Math.max(0, item.fadeIn / 1000),
        fade_out_sec: Math.max(0, item.fadeOut / 1000),
      };
    })
    .filter((c) => Boolean(c.src?.trim()));

  const musicClips: TimelineMusicClip[] = [
    ...visibleMusicItems.map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const src = resolveClipSrc(asset, srcMode);
      return {
        id: item.id || `music-${idx}`,
        type: "music" as const,
        src,
        start_sec: sec(item.startMs),
        duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
        source_start_sec: Math.max(0, sec(item.sourceStartMs ?? 0)),
        volume: clampVolumeTo0to1(item.volume / 100),
        fade_in_sec: Math.max(0, item.fadeIn / 1000),
        fade_out_sec: Math.max(0, item.fadeOut / 1000),
        label: item.label,
      };
    }),
    // SFX lane → music track with mood="sfx" so the worker mixes on the sfx_volume bus.
    ...visibleSfxItems.map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const src = resolveClipSrc(asset, srcMode);
      return {
        id: item.id || `sfx-${idx}`,
        type: "music" as const,
        src,
        start_sec: sec(item.startMs),
        duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
        source_start_sec: Math.max(0, sec(item.sourceStartMs ?? 0)),
        volume: clampVolumeTo0to1(item.volume / 100),
        fade_in_sec: Math.max(0, item.fadeIn / 1000),
        fade_out_sec: Math.max(0, item.fadeOut / 1000),
        label: item.label || "SFX",
        mood: "sfx",
      };
    }),
  ].filter((c) => Boolean(c.src?.trim()));

  const captions: TimelineCaptionClip[] = visibleCaptionItems
    .filter((item) => Boolean(String(item.text ?? "").trim()))
    .map((item, idx) => {
      const startSec = sec(item.startMs);
      const durationSec = Math.max(0.001, sec(item.endMs - item.startMs));
      // Prefer pipeline/word clocks when present; else punctuation-aware estimate.
      const words = item.words?.length
        ? item.words.map((w) => ({
            text: w.text,
            start_sec: w.startSec,
            duration_sec: w.durationSec,
          }))
        : estimateWordTimings(item.text ?? "", startSec, durationSec).map((w) => ({
            text: w.text,
            start_sec: w.start_sec,
            duration_sec: w.duration_sec,
          }));
      return {
        id: item.id || `cap-${idx}`,
        section_id: item.sectionId || item.id || `sec-${idx}`,
        text: item.text ?? "",
        start_sec: startSec,
        duration_sec: durationSec,
        // Always emit transform so Remotion matches editor WYSIWYG (don't strip
        // near-identity — that incorrectly snapped freeform text to caption default).
        transform: (() => {
          const t = resolveTransform(item.transform, item.position);
          const isCaption = item.type === "captions";
          const y =
            isCaption && !item.transform && Math.abs(t.y - 50) < 0.5 ? 84 : t.y;
          return {
            x: Number(t.x.toFixed(3)),
            y: Number(y.toFixed(3)),
            scaleX: Number(t.scaleX.toFixed(4)),
            scaleY: Number(t.scaleY.toFixed(4)),
            rotation: Number(t.rotation.toFixed(2)),
            zIndex: isCaption ? Math.max(20, t.zIndex) : t.zIndex,
          };
        })(),
        animation: toManifestAnimation(item.animation),
        style: {
          // Editor fontSize is preview-UI px (~16–28). Remotion composition is 1080p —
          // map ~3× so captions stay readable in Player + final MP4.
          font_size_px: compositionCaptionFontPx(item.fontSize),
          color: item.color || "#FFFFFF",
          font_weight: item.fontWeight || "700",
          box_width_pct: Math.max(18, Math.min(88, item.boxWidthPct ?? 72)),
        },
        words,
      };
    });

  const runId = timeline.id;

  const videoIdSet = new Set(videoClips.map((c) => c.id));
  // Global "Show Transitions" off → hard cuts only in export (markers stay in editor state).
  const transitions: TimelineTransition[] = timeline.settings.showTransitions
    ? timeline.transitions
        .filter((t) => {
          if (t.enabled === false) return false;
          if (!videoIdSet.has(t.afterItemId)) return false;
          if (t.transitionType === "cut" || t.durationMs <= 0) return false;
          return true;
        })
        .map((t) => ({
          id: t.id,
          after_clip_id: t.afterItemId,
          type: normalizeTransitionTypeForManifest(t.transitionType),
          duration_sec: Math.max(0.05, sec(t.durationMs)),
          enabled: true,
          sfx_muted: Boolean(t.sfxMuted),
        }))
    : [];

  const overlays: TimelineOverlay[] = [];
  for (const track of timeline.tracks) {
    if (track.type !== "animation" || track.hidden) continue;
    for (const item of track.items) {
      if (item.hidden || item.type !== "animation") continue;
      if (item.preset === "subscribe-cta") {
        overlays.push({
          id: item.id,
          type: "subscribe_cta",
          text: item.label || "Subscribe",
          start_sec: sec(item.startMs),
          duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
          transform: toManifestTransform(item.transform ?? { x: item.position.x, y: item.position.y, scaleX: 1, scaleY: 1, rotation: 0, zIndex: 0 }),
          animation: toManifestAnimation(item.animation),
        });
      } else if (item.preset === "chapter-title" || item.preset === "lower-third") {
        const isLower = item.preset === "lower-third";
        overlays.push({
          id: item.id,
          type: "chapter_title",
          text: item.label || (isLower ? "Title" : "Chapter"),
          start_sec: sec(item.startMs),
          duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
          transform: toManifestTransform(
            item.transform ?? {
              x: item.position.x,
              y: isLower ? Math.max(item.position.y, 78) : item.position.y,
              scaleX: 1,
              scaleY: 1,
              rotation: 0,
              zIndex: 0,
            },
          ),
          animation: toManifestAnimation(item.animation),
          style: {
            box_width_pct: Math.max(18, Math.min(88, item.boxWidthPct ?? 70)),
          },
        });
      }
    }
  }

  // Freeform text cards — independent of caption burn-in (always visible when timed).
  for (const item of freeformTextItems) {
    if (!String(item.text ?? "").trim()) continue;
    const t = resolveTransform(item.transform, item.position);
    overlays.push({
      id: item.id,
      type: "freeform_text",
      text: item.text ?? "",
      start_sec: sec(item.startMs),
      duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
      transform: {
        x: Number(t.x.toFixed(3)),
        y: Number(t.y.toFixed(3)),
        // Keep uniform scale for rotate/size feel; Remotion maps avg scale → font.
        scaleX: Number(t.scaleX.toFixed(4)),
        scaleY: Number(t.scaleY.toFixed(4)),
        rotation: Number(t.rotation.toFixed(2)),
        zIndex: Math.max(12, t.zIndex),
      },
      animation: toManifestAnimation(item.animation),
      style: {
        font_size_px: compositionTextFontPx(item.fontSize),
        color: item.color || "#FFFFFF",
        font_weight: item.fontWeight || "600",
        alignment: item.alignment || "center",
        font_family: item.fontFamily || undefined,
        box_width_pct: Math.max(18, Math.min(88, item.boxWidthPct ?? 56)),
      },
    });
  }

  const musicVolume01 = clampVolumeTo0to1(timeline.settings.musicVolume / 100);
  const narrationVolume01 = clampVolumeTo0to1(timeline.settings.narrationVolume / 100);
  const sfxVolume01 = clampVolumeTo0to1(timeline.settings.sfxVolume / 100);
  const clipAudioVolume01 = clampVolumeTo0to1(timeline.settings.clipAudioVolume / 100);

  return {
    version: "1",
    metadata: {
      project_id: projectId,
      run_id: runId,
      format_mode: project.format,
      resolution: { width: 1920, height: 1080 },
      fps: timeline.fps,
      duration_sec: durationSecMeta,
    },
    tracks: {
      video: videoClips,
      audio: audioClips,
      captions,
      broll: brollClips,
      music: musicClips,
    },
    transitions,
    overlays,
    settings: {
      captions_enabled: timeline.settings.captionsEnabled,
      caption_style: timeline.settings.captionStyle ?? "bold_static",
      music_volume: musicVolume01,
      narration_volume: narrationVolume01,
      sfx_volume: sfxVolume01,
      theme_id: timeline.settings.themeId ?? "standard",
      // Browser preview only — export workers ignore / leave at 0.
      ...(srcMode === "browser" ? { clip_audio_volume: clipAudioVolume01 } : {}),
    },
  };
}

function normalizeTransitionTypeForManifest(t: TransitionType): string {
  return t;
}
