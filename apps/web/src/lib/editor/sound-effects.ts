import { requestMediaUploadUrl, uploadFileToPresignedUrl } from "@/lib/api-client";

export const SOUND_EFFECTS = [
  { id: "soft_whoosh", label: "Soft whoosh", durationMs: 650 },
  { id: "soft_impact", label: "Soft impact", durationMs: 420 },
  { id: "editorial_tick", label: "Editorial tick", durationMs: 120 },
] as const;
export type SoundEffectId = (typeof SOUND_EFFECTS)[number]["id"];

/** Original procedural sound cues: deterministic PCM WAV, no third-party media. */
export function createSoundEffectFile(id: SoundEffectId): File {
  const spec = SOUND_EFFECTS.find((effect) => effect.id === id)!;
  const rate = 44_100; const count = Math.round(rate * spec.durationMs / 1000);
  const buffer = new ArrayBuffer(44 + count * 2); const view = new DataView(buffer);
  const ascii = (offset: number, text: string) => [...text].forEach((char, index) => view.setUint8(offset + index, char.charCodeAt(0)));
  ascii(0, "RIFF"); view.setUint32(4, 36 + count * 2, true); ascii(8, "WAVE"); ascii(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  ascii(36, "data"); view.setUint32(40, count * 2, true);
  let seed = 14693; let lowpass = 0;
  for (let index = 0; index < count; index++) {
    const t = index / rate; const phase = index / count;
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const noise = seed / 0xffffffff * 2 - 1;
    lowpass += (noise - lowpass) * (0.06 + phase * 0.1);
    const attack = Math.min(1, t / 0.008);
    const sample = id === "soft_whoosh"
      ? lowpass * Math.sin(Math.PI * phase) ** 2 * 0.8
      : id === "soft_impact" ? (Math.sin(2 * Math.PI * (75 * t - 30 * t * t)) * Math.exp(-t * 12) * 0.36 + lowpass * Math.exp(-t * 24) * 0.18) * attack * (1 - phase)
      : Math.sin(2 * Math.PI * 1500 * t) * Math.exp(-t * 70) * 0.2 * attack * (1 - phase);
    view.setInt16(44 + index * 2, Math.round(Math.max(-1, Math.min(1, sample)) * 32767), true);
  }
  return new File([buffer], `${id}.wav`, { type: "audio/wav" });
}

export async function uploadSoundEffect(projectId: string, id: SoundEffectId) {
  const spec = SOUND_EFFECTS.find((effect) => effect.id === id)!;
  const file = createSoundEffectFile(id);
  const upload = await requestMediaUploadUrl(projectId, file.name, file.type);
  await uploadFileToPresignedUrl(upload.uploadUrl, file);
  return { url: upload.downloadUrl || upload.uploadUrl, sourceKey: upload.s3Key, durationMs: spec.durationMs, label: spec.label };
}
