"use client";

import { useEffect, useState } from "react";
import { Brain, Check, ChevronDown, RefreshCw, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getEditorModels, type EditorModelCatalog } from "@/lib/api-client";
import { resolveEditorModelId } from "./agent-model-selection";
import { Popover } from "@base-ui/react/popover";

export function AgentModelPicker({ value, onChange, disabled }: { value: string; onChange: (value: string) => void; disabled: boolean }) {
  const [catalog, setCatalog] = useState<EditorModelCatalog | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    let active = true;
    getEditorModels().then(result => { if (active) { setCatalog(result); setError(""); } }).catch(() => { if (active) setError("Models unavailable"); });
    return () => { active = false; };
  }, [attempt]);
  useEffect(() => {
    if (catalog && value && resolveEditorModelId(value, catalog.models.map(model => model.id)) !== value) {
      onChange("");
    }
  }, [catalog, onChange, value]);
  const selected = catalog?.models.find(model => model.id === value);
  const label = selected?.name.replace(/^[^:]+:\s*/, "") || (catalog ? "Auto" : "Models");
  const filtered = catalog?.models.filter(model => `${model.name} ${model.id}`.toLowerCase().includes(search.toLowerCase())) || [];
  const choose = (id: string) => { onChange(id); setOpen(false); setSearch(""); };
  return <div className="agent-model-picker">
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Trigger render={<Button type="button" variant="ghost" className="agent-model-trigger" />} disabled={disabled || !catalog} aria-label="AI editing model" title={selected?.name || "Choose AI editing model"}><Brain /><span>{label}</span><ChevronDown /></Popover.Trigger>
      <Popover.Portal><Popover.Positioner side="top" align="end" sideOffset={10} className="z-[250]"><Popover.Popup className="agent-model-menu" aria-label="Choose editing model">
        <div className="agent-model-search"><Search /><input aria-label="Search editing models" placeholder="Search models…" value={search} onChange={e => setSearch(e.target.value)} /></div>
        <div className="agent-model-options">
          {!search && <button type="button" onClick={() => choose("")} className="agent-model-option" aria-pressed={!value}><Brain /><span><strong>Auto</strong><small>Use the workspace default</small></span>{!value && <Check />}</button>}
          {filtered.map(model => <button type="button" key={model.id} onClick={() => choose(model.id)} className="agent-model-option" aria-pressed={value === model.id}><span><strong>{model.name}</strong>{model.vision && <small>Supports image references</small>}</span>{value === model.id && <Check />}</button>)}
          {!filtered.length && <p className="agent-model-empty">No matching models</p>}
        </div>
      </Popover.Popup></Popover.Positioner></Popover.Portal>
    </Popover.Root>
    {error && <Button type="button" variant="ghost" size="icon-sm" aria-label="Reload models" title="Reload models" onClick={() => setAttempt(n => n + 1)}><RefreshCw /></Button>}
  </div>;
}
