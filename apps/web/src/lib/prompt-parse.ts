/** Parse duration / language hints from free-text video prompts. */

export function parseDurationSecFromPrompt(text: string, fallback = 300): number {
  const minute = text.match(/\b(\d{1,3})\s*[- ]?(?:mins?|minutes?)\b/i);
  if (minute) return Math.min(3600, Math.max(30, Number(minute[1]) * 60));
  const hour = text.match(/\b(\d{1,2})\s*[- ]?hours?\b/i);
  if (hour) return Math.min(3600, Math.max(30, Number(hour[1]) * 3600));
  const second = text.match(/\b(\d{1,5})\s*(?:seconds?|secs?)\b/i);
  if (second) return Math.min(3600, Math.max(30, Number(second[1])));
  return fallback;
}

const LANGUAGE_MAP: Record<string, string> = {
  english: "en",
  hindi: "hi",
  telugu: "te",
  tamil: "ta",
  kannada: "kn",
  malayalam: "ml",
  bengali: "bn",
  marathi: "mr",
  gujarati: "gu",
  punjabi: "pa",
};

export function parseLanguageFromPrompt(text: string, fallback = "en"): string {
  const lower = text.toLowerCase();
  if (text.includes("తెలుగు")) return "te";
  for (const [name, code] of Object.entries(LANGUAGE_MAP).sort((a, b) => b[0].length - a[0].length)) {
    if (new RegExp(`\\b${name}\\b`, "i").test(lower)) return code;
  }
  return fallback;
}
