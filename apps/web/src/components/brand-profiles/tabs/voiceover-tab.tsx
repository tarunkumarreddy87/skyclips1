"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Heart, Mic, Search, Play, Pause, Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/api-client";
import { Input } from "@/components/ui/input";
import { BRAND_VOICES, useBrandProfileStore, type BrandProfile } from "@/lib/brand-profiles";
import { cn } from "@/lib/utils";

const ALIASES: Record<string, string> = {
  "eleven-clive": "shubh", "eleven-david": "aditya",
  "eleven-sarah": "kavya", "eleven-aria": "ritu",
};
const voices = [
  ...BRAND_VOICES.filter(v => v.provider === "Sarvam").map(v => ({ id: v.id, name: v.name })),
  ...["ritu", "priya", "neha", "rahul", "pooja", "rohan", "simran", "amit", "dev", "ishita", "shreya", "ratan", "varun", "manan", "sumit", "roopa", "kabir", "aayan", "ashutosh", "advait", "anand", "tanya", "tarun", "sunny", "mani", "gokul", "vijay", "shruti", "suhani", "mohit", "kavitha", "rehan", "soham", "rupali"].map(id => ({ id, name: id[0].toUpperCase() + id.slice(1) })),
];
const samples = new Map<string, string>();
const pending = new Map<string, Promise<string>>();
function loadSample(id: string): Promise<string> {
  if (samples.has(id)) return Promise.resolve(samples.get(id)!);
  if (pending.has(id)) return pending.get(id)!;
  const request = apiFetch<{audioBase64: string; mime: string}>("/channel-settings/voice-sample", { method: "POST", body: JSON.stringify({speaker:id}) }).then(result => {
    const url = `data:${result.mime};base64,${result.audioBase64}`; samples.set(id, url); return url;
  }).finally(() => pending.delete(id));
  pending.set(id, request); return request;
}

export function VoiceoverTab({ profile, onChange }: {
  profile: BrandProfile; onChange: (patch: Partial<BrandProfile>) => void;
}) {
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audio = useRef<HTMLAudioElement | null>(null);
  const playback = useRef(0);
  useEffect(() => {
    let stopped = false;
    let index = 0;
    const warm = async () => { while (!stopped && index < voices.length) { const voice = voices[index++]; try { await loadSample(voice.id); } catch { break; } } };
    void Promise.all([warm(), warm(), warm()]);
    return () => { stopped = true; playback.current++; audio.current?.pause(); };
  }, []);
  async function audition(id: string) {
    audio.current?.pause();
    const token = ++playback.current;
    if (playing === id) { setPlaying(null); return; }
    setPlaying(null); setLoading(id); setError("");
    try {
      const url = await loadSample(id);
      if (token !== playback.current) return;
      const player = new Audio(url); audio.current = player;
      player.onended = () => setPlaying(null);
      player.onerror = () => { setPlaying(null); setError("Could not play this sample. Please try again."); };
      await player.play(); setPlaying(id);
    } catch (err) { if (token === playback.current) setError(err instanceof Error ? err.message : "Voice preview unavailable."); }
    finally { if (token === playback.current) setLoading(null); }
  }
  const favorites = useBrandProfileStore(s => s.favoriteVoiceIds);
  const toggleFavorite = useBrandProfileStore(s => s.toggleFavoriteVoice);
  const selected = ALIASES[profile.voiceId] ?? (voices.some(v => v.id === profile.voiceId) ? profile.voiceId : "shubh");
  const filtered = voices.filter(v => v.name.toLowerCase().includes(query.trim().toLowerCase()) &&
    (!favoritesOnly || favorites.includes(v.id)));
  return <section className="space-y-5 rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.04] to-transparent p-5 sm:p-6">
    <div className="flex items-start gap-3">
      <span className="rounded-xl border border-blue-400/20 bg-blue-500/10 p-2.5 text-blue-300"><Mic className="size-5" /></span>
      <div><h2 className="text-base font-semibold text-white">Narration voices</h2>
        <p className="mt-1 text-xs leading-5 text-zinc-400">Sarvam · Bulbul v3. These speakers are connected to video generation. Your channel language controls narration.</p>
      </div>
    </div>
    <div className="flex gap-2">
      <div className="relative flex-1"><Search className="absolute left-3 top-3 size-4 text-zinc-500" /><Input aria-label="Search voices" value={query} onChange={e => setQuery(e.target.value)} placeholder="Find a voice…" className="h-10 rounded-xl pl-9" /></div>
      <button type="button" aria-pressed={favoritesOnly} onClick={() => setFavoritesOnly(!favoritesOnly)} className={cn("rounded-xl border border-white/10 px-3 text-xs", favoritesOnly ? "bg-blue-500/15 text-blue-300" : "text-zinc-400")}>Favorites</button>
    </div>
    <div className="grid max-h-[520px] gap-3 overflow-y-auto pr-1 sm:grid-cols-2">
      {filtered.map(v => <div key={v.id} className={cn("flex items-center rounded-xl border transition-colors", selected === v.id ? "border-blue-400/60 bg-blue-500/10" : "border-white/10 bg-black/10 hover:border-white/25")}>
        <button type="button" aria-pressed={selected === v.id} onClick={() => onChange({ voiceId: v.id })} className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left">
          <span className="flex size-9 items-center justify-center rounded-full bg-white/5 text-blue-200">{selected === v.id ? <Check className="size-4" /> : v.name[0]}</span>
          <span><span className="block text-sm font-medium text-white">{v.name}</span><span className="text-xs text-zinc-500">Sarvam narrator</span></span>
        </button>
        <button type="button" aria-label={`${playing === v.id ? "Pause" : "Play"} ${v.name} sample`} disabled={loading === v.id} onClick={() => void audition(v.id)} className="rounded-full border border-blue-400/20 bg-blue-500/10 p-2 text-blue-300 hover:bg-blue-500/20">{loading === v.id ? <Loader2 className="size-4 animate-spin" /> : playing === v.id ? <Pause className="size-4" /> : <Play className="size-4" />}</button>
        <button type="button" aria-label={`Favorite ${v.name}`} aria-pressed={favorites.includes(v.id)} onClick={() => toggleFavorite(v.id)} className="mr-3 rounded-lg p-2 text-zinc-400 hover:bg-white/5"><Heart className={cn("size-4", favorites.includes(v.id) && "fill-rose-400 text-rose-400")} /></button>
      </div>)}
    </div>
    {!filtered.length && <p className="py-6 text-center text-sm text-zinc-400">No matching voices.</p>}
    {error && <p role="alert" className="text-xs text-red-300">{error}</p>}
    <p className="text-xs text-zinc-500">Listen to a SkyClip documentary sample, then select your narrator. Samples are cached for fast replay.</p>
  </section>;
}
