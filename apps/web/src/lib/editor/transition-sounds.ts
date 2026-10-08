export interface TransitionWindow { fromId: string; type: string; startSec: number; endSec: number; durationSec: number; sfxMuted?: boolean }

/** Shipped locally: original generated sounds + attributed Kenney CC0 sources. */
export const TRANSITION_SOUNDS = [
  { id: "whoosh", label: "Air whoosh", file: "motion-whoosh.wav", durationSec: 0.8, gain: 0.32, source: "SkyClip" },
  { id: "impact", label: "Soft impact", file: "motion-impact.wav", durationSec: 1.2, gain: 0.24, source: "SkyClip" },
  { id: "rise", label: "Cinematic rise", file: "motion-rise.wav", durationSec: 2, gain: 0.22, source: "SkyClip" },
  { id: "tick", label: "Clean tick", file: "motion-tick.wav", durationSec: 0.2, gain: 0.24, source: "SkyClip" },
  { id: "glitch", label: "Digital stutter", file: "transition-glitch.wav", durationSec: 0.16, gain: 0.3, source: "Kenney · CC0" },
  { id: "glass", label: "Glass accent", file: "kenney-glass.wav", durationSec: 0.122, gain: 0.22, source: "Kenney · CC0" },
  { id: "switch", label: "Soft switch", file: "kenney-switch.wav", durationSec: 0.608, gain: 0.22, source: "Kenney · CC0" },
  { id: "digital", label: "Digital reveal", file: "kenney-digital.wav", durationSec: 0.38, gain: 0.24, source: "Kenney · CC0" },
] as const;

export function transitionSound(type: string) {
  const id = type === "glitch" ? "glitch" : type === "pixelize" ? "digital"
    : type === "zoom" ? "impact" : type === "film-burn" || type.startsWith("slide") || type.startsWith("wipe") ? "whoosh"
    : type.startsWith("circle") ? "switch" : null;
  return TRANSITION_SOUNDS.find(sound => sound.id === id);
}

export function transitionAudioCues(windows: TransitionWindow[], durationSec: number,
  manualSounds: { start_sec: number; duration_sec: number; mood?: string }[] = []) {
  let previousEnd = -Infinity;
  return windows.flatMap(window => {
    const sound = transitionSound(window.type);
    if (!sound || window.sfxMuted) return [];
    // Align a short accent to the middle of the visual blend; long whooshes lead it.
    const startSec = Math.max(0, window.startSec + window.durationSec / 2 - Math.min(sound.durationSec / 2, window.durationSec / 2));
    if (startSec < previousEnd || manualSounds.some(m => m.mood === "sfx" && m.start_sec < window.endSec && m.start_sec + m.duration_sec > window.startSec)) return [];
    const length = Math.min(sound.durationSec, durationSec - startSec);
    if (length <= 0) return [];
    previousEnd = startSec + length;
    return [{ id: window.fromId, startSec, durationSec: length, sound }];
  });
}
