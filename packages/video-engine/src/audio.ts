import type { TimelineManifestV1 } from "@hanuman/shared-types";
import { clamp, timelineDurationSec } from "./timing.js";

export interface SceneAudioCue { id: string; startSec: number; durationSec: number; file: string; gain: number; sourceStartSec?: number }
export const SCENE_SOUND_LENGTHS: Record<string, number> = {
  whoosh: 0.8, impact: 1.2, tick: 0.2, rise: 2, ambient: 6,
  "press-paper": 0.8, "press-impact": 1.1, "press-marker": 0.62, "press-whoosh": 0.76,
  "press-pencil": 0.9, "press-rise": 1.6, "press-exit": 0.55,
};
const TRANSITION_AUDIO: Record<string, { file: string; durationSec: number; gain: number }> = {
  whoosh: { file: "motion-whoosh.wav", durationSec: 0.8, gain: 0.32 }, impact: { file: "motion-impact.wav", durationSec: 1.2, gain: 0.24 },
  rise: { file: "motion-rise.wav", durationSec: 2, gain: 0.22 }, tick: { file: "motion-tick.wav", durationSec: 0.2, gain: 0.24 },
  glitch: { file: "transition-glitch.wav", durationSec: 0.16, gain: 0.3 }, glass: { file: "kenney-glass.wav", durationSec: 0.122, gain: 0.22 },
  switch: { file: "kenney-switch.wav", durationSec: 0.608, gain: 0.22 }, digital: { file: "kenney-digital.wav", durationSec: 0.38, gain: 0.24 },
};

/** Cue times are absolute, with each sound cut at the owning scene/clip boundary. */
export function timelineSceneAudioCues(manifest: TimelineManifestV1): SceneAudioCue[] {
  const duration = timelineDurationSec(manifest); const cues: SceneAudioCue[] = [];
  const add = (id: string, sound: string, startSec: number, gain: number, endSec: number, clipStart = 0) => {
    const sourceStartSec = Math.max(0, clipStart - startSec); startSec += sourceStartSec;
    const length = SCENE_SOUND_LENGTHS[sound]; const lengthSec = Math.min((length ?? 0) - sourceStartSec, duration - startSec, endSec - startSec);
    if (!Number.isFinite(startSec) || startSec < 0 || lengthSec <= 0 || !Number.isFinite(lengthSec)) return;
    cues.push({ id, file: `motion-${sound}.wav`, startSec, durationSec: lengthSec, gain: clamp(gain), ...(sourceStartSec > 0 ? {sourceStartSec} : {}) });
  };
  for (const overlay of manifest.overlays ?? []) {
    const end = overlay.start_sec + Math.min(overlay.duration_sec, (overlay.scene?.durationMs ?? overlay.duration_sec * 1000) / 1000);
    for (const [index, cue] of (overlay.scene?.audio ?? []).entries()) add(`scene:${overlay.id}:${index}`, cue.sound, overlay.start_sec + cue.startMs / 1000, cue.volume, end);
  }
  for (const clip of [...manifest.tracks.video, ...(manifest.tracks.broll ?? [])]) {
    const template = clip.motion_template; if (!template) continue;
    const end = clip.start_sec + clip.duration_sec;
    if (template.html_template) {
      for (const [index, cue] of (template.html_template.audioCues ?? []).entries()) add(`template:${clip.id}:${index}`, cue.sound, clip.start_sec + cue.at - Math.max(0, clip.source_start_sec ?? 0), cue.gain, end, clip.start_sec);
    } else {
      add(`template:${clip.id}:whoosh`, "whoosh", clip.start_sec + 0.2, 0.15, end);
      add(`template:${clip.id}:mark`, "tick", clip.start_sec + 0.55, 0.12, end);
      const chart = ["bars", "line", "annotated-chart"].includes(template.documentary_layout ?? "") || ["editorial-data", "vertical-bar-chart", "line-chart"].includes(template.id);
      const count = chart ? template.values?.length ?? 0 : template.elements?.length ?? 0;
      for (let index = 1; index < Math.min(count, 6); index++) add(`template:${clip.id}:data:${index}`, "tick", clip.start_sec + 0.5 + index * 0.12, 0.08, end);
    }
  }
  return cues.sort((left, right) => left.startSec - right.startSec || left.id.localeCompare(right.id));
}

/** Browser/cloud cue plan. Global SFX volume is applied by the caller, once. */
export function timelineAudioCues(manifest: TimelineManifestV1): SceneAudioCue[] {
  const cues = timelineSceneAudioCues(manifest); const duration = timelineDurationSec(manifest);
  const video = [...manifest.tracks.video].sort((left, right) => left.start_sec - right.start_sec);
  const manual = (manifest.tracks.music ?? []).filter(clip => clip.mood === "sfx");
  const windows: Array<{ id: string; type: string; start: number; end: number; duration: number }> = [];
  for (const transition of manifest.transitions ?? []) {
    if (transition.enabled === false || transition.sfx_muted || transition.duration_sec <= 0 || transition.type === "cut") continue;
    const index = video.findIndex(clip => clip.id === transition.after_clip_id); const left = video[index]; const right = video[index + 1];
    if (!left || !right || Math.abs(left.start_sec + left.duration_sec - right.start_sec) > 0.002) continue;
    const length = Math.min(transition.duration_sec, left.duration_sec / 2, right.duration_sec / 2); const end = left.start_sec + left.duration_sec;
    if (length > 0) windows.push({ id: transition.id, type: transition.type, start: end - length, end, duration: length });
  }
  let previousEnd = -Infinity;
  for (const window of windows.sort((a, b) => a.start - b.start || a.id.localeCompare(b.id))) {
    const type = window.type;
    const id = type === "glitch" ? "glitch" : type === "pixelize" ? "digital" : type === "zoom" ? "impact"
      : type === "film-burn" || type.startsWith("slide") || type.startsWith("wipe") ? "whoosh" : type.startsWith("circle") ? "switch" : "";
    const sound = TRANSITION_AUDIO[id]; if (!sound) continue;
    const start = Math.max(0, window.start + window.duration / 2 - Math.min(sound.durationSec / 2, window.duration / 2));
    if (start < previousEnd || manual.some(clip => clip.start_sec < window.end && clip.start_sec + clip.duration_sec > window.start)) continue;
    const length = Math.min(sound.durationSec, duration - start); if (length <= 0) continue;
    cues.push({ id: `transition:${window.id}`, file: sound.file, startSec: start, durationSec: length, gain: sound.gain });
    previousEnd = start + length;
  }
  const seen = new Set<string>();
  return cues.sort((a, b) => a.startSec - b.startSec || a.id.localeCompare(b.id)).filter(cue => {
    const key = `${cue.id}|${cue.startSec}|${cue.file}`; if (seen.has(key)) return false; seen.add(key); return true;
  });
}
