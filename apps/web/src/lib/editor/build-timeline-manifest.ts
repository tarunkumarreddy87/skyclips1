import type { Asset, AudioItem, ClipItem, EditorState, TextItem, TransitionType } from "./types";
import type { TimelineManifestV1, TimelineCaptionClip, TimelineVideoClip, TimelineAudioClip, TimelineBrollClip, TimelineMusicClip, TimelineTransition, TimelineOverlay, ElementAnimation } from "./manifest-types";
import { toManifestTransform, resolveTransform } from "./transform";
import type { ElementAnimation as EditorElementAnimation } from "./types";
import { estimateExportDurationSec } from "./export-duration";
import { resolveMediaUrl } from "./media-url";
import { compositionCaptionFontPx, compositionTextFontPx } from "./text-size";
import {
  estimateWordTimings,
  type GraphicObject,
  getTemplateMeta,
  isMotionGraphicManifestType,
} from "@hanuman/shared-types";

export type ManifestSrcMode = "durable" | "browser";

export interface BuildManifestOptions {
  /**
   * durable — S3 keys for cloud worker download (persist + render).
   * browser — playable http(s)/proxy URLs for engine preview.
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
  if (raw.startsWith("/sfx/")) return "static:" + raw.slice(1);
  return extractS3KeyOrPassthrough(raw);
}

/** Warn once per asset when browser preview cannot use a proxy. */
const browserSrcFallbackWarned = new Set<string>();

export type BrowserSrcResolution = {
  src: string;
  /** When true, treat as Img still (poster / stub) — never Html5Video of original. */
  forceImage?: boolean;
};

/**
 * Browser preview media URL.
 * Videos prefer proxies, but remain playable from their source while deriving.
 * Posters are only a fallback when no playable source URL is available.
 * Audio / images may use the asset URL.
 */
export function resolveBrowserSrc(asset: Asset | undefined): BrowserSrcResolution {
  if (!asset) return { src: "" };

  // Prefer a derived proxy for native browser video preview.
  const proxyUrl = asset.metadata?.proxyUrl;
  if (proxyUrl) {
    const resolved = resolveMediaUrl(proxyUrl);
    if (resolved) return { src: resolved };
  }

  // A missing proxy must not silently turn an available video into a slideshow.
  if (asset.mediaType === "video") {
    const original = asset.url ? resolveMediaUrl(asset.url) : "";
    if (original && /^(https?:|blob:|\/)/i.test(original)) {
      return { src: original };
    }
    const posterRaw =
      asset.metadata?.posterUrl ||
      asset.thumbnailUrl ||
      "";
    const poster = posterRaw ? resolveMediaUrl(posterRaw) : "";
    if (poster) {
      if (!browserSrcFallbackWarned.has(asset.id)) {
        browserSrcFallbackWarned.add(asset.id);
        console.warn(
          "[manifest] browser preview using poster still (no proxy yet)",
          asset.id,
          asset.metadata?.sourceKey ?? "",
        );
      }
      return { src: poster, forceImage: true };
    }
    if (!browserSrcFallbackWarned.has(asset.id)) {
      browserSrcFallbackWarned.add(asset.id);
      console.warn(
        "[manifest] browser preview blocked original MP4 — no proxy/poster",
        asset.id,
        asset.metadata?.sourceKey ?? "",
      );
    }
    return { src: "color:#111111", forceImage: true };
  }

  if (!asset.url) return { src: "" };
  return { src: resolveMediaUrl(asset.url) };
}

function resolveClipSrc(asset: Asset | undefined, mode: ManifestSrcMode): BrowserSrcResolution {
  if (mode === "browser") return resolveBrowserSrc(asset);
  return { src: resolveDurableSrc(asset) };
}

/** Prefer S3 object key over expired/presigned HTTP URLs for persistence + render download. */
export function extractS3KeyOrPassthrough(src: string): string {
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

export { compositionCaptionFontPx, compositionTextFontPx } from "./text-size";

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
    // Freeform text is a separate native engine overlay — never compete with captions.
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

  // Export SSOT metadata: transition-overlap-aware (native engine TransitionSeries).
  // Browser preview uses the full canvas duration so playhead ↔ picture stay 1:1.
  const durationSecExport = estimateExportDurationSec(timeline);
  const durationSecCanvas = Math.max(0.001, timeline.durationMs / 1000);
  const durationSecMeta = srcMode === "browser" ? durationSecCanvas : durationSecExport;

  const videoClips: TimelineVideoClip[] = visibleVideoItems
    .map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const resolved = resolveClipSrc(asset, srcMode);
      const src = resolved.src;
      const clipType = (
        resolved.forceImage || item.mediaType !== "video" ? "image" : "video"
      ) as "video" | "image";

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
        three_scene: item.threeScene,
        visual_effects: item.visualEffects,
        motion_template: item.motionTemplate,
      };
    })
    .filter((c) => Boolean(c.src?.trim()));

  const brollClips: TimelineBrollClip[] = visibleBrollItems
    .map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const resolved = resolveClipSrc(asset, srcMode);
      const src = resolved.src;
      return {
        id: item.id || `broll-${idx}`,
        scene_id: String(asset?.metadata?.sceneId || item.id || `broll-${idx}`),
        type: (
          resolved.forceImage || item.mediaType !== "video" ? "image" : "video"
        ) as "video" | "image",
        src,
        start_sec: sec(item.startMs),
        duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
        source_start_sec: Math.max(0, sec(item.sourceStartMs ?? 0)),
        fit: normalizeFit(item.fitMode),
        muted: Boolean(item.muted),
        label: item.label,
        transform: toManifestTransform(item.transform),
        animation: toManifestAnimation(item.animation),
        three_scene: item.threeScene,
        visual_effects: item.visualEffects,
      };
    })
    .filter((c) => Boolean(c.src?.trim()));

  const audioClips: TimelineAudioClip[] = visibleNarrationItems
    .map((item, idx) => {
      const asset = assets.find((a) => a.id === item.assetId);
      const src = resolveClipSrc(asset, srcMode).src;
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
      const src = resolveClipSrc(asset, srcMode).src;
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
      const src = resolveClipSrc(asset, srcMode).src;
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
        // Always emit transform so native engine matches editor WYSIWYG (don't strip
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
          // Editor fontSize is preview-UI px (~16–28). native engine composition is 1080p —
          // map ~3× so captions stay readable in Player + final MP4.
          font_size_px: compositionCaptionFontPx(item.fontSize),
          color: item.color || "#FFFFFF",
          font_weight: item.fontWeight || "700",
          font_family: item.fontFamily || undefined,
          alignment: item.alignment || "center",
          box_width_pct: Math.max(18, Math.min(88, item.boxWidthPct ?? 72)),
        },
        words,
      };
    });

  const runId = timeline.id;

  const sortedVideoClips = [...videoClips].sort((a, b) => a.start_sec - b.start_sec);
  const transitionLimits = new Map<string, number>();
  sortedVideoClips.forEach((clip, index) => {
    const next = sortedVideoClips[index + 1];
    if (next && Math.abs(clip.start_sec + clip.duration_sec - next.start_sec) <= 1 / timeline.fps) {
      transitionLimits.set(clip.id, Math.min(clip.duration_sec, next.duration_sec));
    }
  });
  // Global "Show Transitions" off → hard cuts only in export (markers stay in editor state).
  const transitions: TimelineTransition[] = timeline.settings.showTransitions
    ? timeline.transitions
        .filter((t) => {
          if (t.enabled === false) return false;
          if (!transitionLimits.has(t.afterItemId)) return false;
          if (t.transitionType === "cut" || t.durationMs <= 0) return false;
          return true;
        })
        .map((t) => ({
          id: t.id,
          after_clip_id: t.afterItemId,
          type: normalizeTransitionTypeForManifest(t.transitionType),
          duration_sec: Math.min(transitionLimits.get(t.afterItemId)!, Math.max(0.001, sec(t.durationMs))),
          enabled: true,
          sfx_muted: Boolean(t.sfxMuted),
        }))
    : [];

  const overlays: TimelineOverlay[] = [];
  const graphics: GraphicObject[] = [];
  for (const track of timeline.tracks) {
    if (track.type !== "animation" || track.hidden) continue;
    for (const item of track.items) {
      if (item.hidden || item.type !== "animation") continue;
      if (item.graphic) {
        const asset = assets.find((a) => a.url === item.graphic?.src || a.metadata?.sourceKey === item.graphic?.src);
        graphics.push({
          ...item.graphic, id: item.id, start_sec: sec(item.startMs),
          duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
          src: asset ? resolveClipSrc(asset, srcMode).src : item.graphic.src ? (srcMode === "durable" ? extractS3KeyOrPassthrough(item.graphic.src) : resolveMediaUrl(item.graphic.src)) : undefined,
          transform: toManifestTransform(item.transform) ?? item.graphic.transform,
          animation: toManifestAnimation(item.animation) ?? item.graphic.animation,
        });
        continue;
      }
      if (item.preset === "generated-scene" && item.scene) {
        overlays.push({ id: item.id, type: "generated_scene", title: item.title || item.scene.title, scene: item.scene,
          start_sec: sec(item.startMs), duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
          transform: toManifestTransform(item.transform) });
      } else if (item.preset === "subscribe-cta") {
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
          text: item.title ?? item.label ?? (isLower ? "Title" : "Chapter"),
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
            font_size_px: item.textStyle?.fontSize,
            color: item.textStyle?.color,
            font_family: item.textStyle?.fontFamily,
            font_weight: item.textStyle?.fontWeight,
            alignment: item.textStyle?.alignment,
          },
        });
      } else {
        const meta = getTemplateMeta(item.preset);
        if (meta && isMotionGraphicManifestType(meta.manifestType)) {
          overlays.push({
            id: item.id,
            type: meta.manifestType,
            text: item.label || meta.label,
            title: item.title || item.label || meta.label,
            subtitle: item.subtitle,
            slots: item.slots,
            image_refs: item.imageRefs ?? [],
            theme_id: item.themeId,
            start_sec: sec(item.startMs),
            duration_sec: Math.max(0.001, sec(item.endMs - item.startMs)),
            transform: toManifestTransform(
              item.transform ?? {
                x: item.position.x,
                y: item.position.y,
                scaleX: 1,
                scaleY: 1,
                rotation: 0,
                zIndex: 25,
              },
            ),
            animation: toManifestAnimation(item.animation),
            style: {
              box_width_pct: Math.max(28, Math.min(92, item.boxWidthPct ?? 72)),
              font_size_px: item.textStyle?.fontSize,
              color: item.textStyle?.color,
              font_family: item.textStyle?.fontFamily,
              font_weight: item.textStyle?.fontWeight,
              alignment: item.textStyle?.alignment,
            },
          });
        }
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
        // Keep uniform scale for rotate/size feel; native engine maps avg scale → font.
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
    graphics,
    settings: {
      captions_enabled: timeline.settings.captionsEnabled,
      caption_style: timeline.settings.captionStyle ?? "cinematic",
      music_volume: musicVolume01,
      narration_volume: narrationVolume01,
      sfx_volume: sfxVolume01,
      theme_id: timeline.settings.themeId ?? "standard",
      clip_audio_volume: clipAudioVolume01,
      background_color: timeline.settings.backgroundColor,
      ...(timeline.settings.backgroundImage ? { background_image: srcMode === "durable" ? extractS3KeyOrPassthrough(timeline.settings.backgroundImage) : resolveMediaUrl(timeline.settings.backgroundImage) } : {}),
      overlay_drop_shadow: timeline.settings.overlayDropShadow,
    },
  };
}

function normalizeTransitionTypeForManifest(t: TransitionType): string {
  return t;
}
