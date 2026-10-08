"use client";

import { useEffect, useRef, useState } from "react";
import { Play, Plus, Square } from "lucide-react";
import { toast } from "sonner";
import { TRANSITION_SOUNDS } from "@/lib/editor/transition-sounds";
import { Button } from "@/components/ui/button";
import { useEditorStore } from "@/lib/editor/store";

export function TransitionSoundLibrary() {
  const addSfx = useEditorStore(s => s.addSfx);
  const locked = useEditorStore(s => s.timeline.tracks.some(t => t.type === "sfx" && t.locked));
  const audio = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  useEffect(() => () => { audio.current?.pause(); }, []);
  function preview(sound: (typeof TRANSITION_SOUNDS)[number]) {
    audio.current?.pause();
    if (playing === sound.id) { audio.current = null; setPlaying(null); return; }
    const player = new Audio("/sfx/" + sound.file);
    audio.current = player;
    player.volume = sound.gain;
    setPlaying(sound.id);
    player.onended = () => { if (audio.current === player) setPlaying(null); };
    void player.play().catch(() => {
      if (audio.current !== player) return;
      setPlaying(null);
      toast.error("Sound preview could not play. Please try again.");
    });
  }
  return <section className="flex flex-col gap-3" aria-label="Transition sound library">
    <div>
      <h3 className="text-sm font-medium text-foreground">Sound design</h3>
      <p className="text-xs text-muted-foreground">Audition a sound, then add it at the playhead.</p>
    </div>
    <div className="flex flex-col gap-1">
      {TRANSITION_SOUNDS.map(sound => <div key={sound.id} className="flex items-center gap-2 rounded-lg border border-border p-2">
        <Button type="button" variant="ghost" size="icon-sm" aria-label={(playing === sound.id ? "Stop " : "Preview ") + sound.label}
          onClick={() => preview(sound)}>{playing === sound.id ? <Square /> : <Play />}</Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-medium text-foreground">{sound.label}</p>
          <p className="text-[10px] text-muted-foreground">{sound.durationSec.toFixed(2)}s · {sound.source}</p>
        </div>
        <Button type="button" variant="outline" size="icon-sm" disabled={locked} aria-label={"Add " + sound.label}
          onClick={() => {
            addSfx({ label: sound.label, url: "/sfx/" + sound.file,
              durationMs: Math.round(sound.durationSec * 1000), volume: Math.round(sound.gain * 100) });
            toast.success(sound.label + " added to sound effects");
          }}><Plus /></Button>
      </div>)}
    </div>
    <p className="text-[10px] text-muted-foreground">Transitions include matched sounds automatically. Adding your own sound at a cut replaces its automatic cue.</p>
  </section>;
}
