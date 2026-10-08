"use client";

import { THEME_LIST, type ThemeId } from "@hanuman/shared-types";
import { useEditorStore } from "@/lib/editor/store";
import { ClipTemplateProperties } from "./clip-template-properties";

export function TemplatesPanel() {
  const selected = useEditorStore(s => s.getSelectedItem());
  const themeId = useEditorStore((s) => s.timeline.settings.themeId ?? "standard");
  const updateSettings = useEditorStore((s) => s.updateSettings);

  if (selected?.type === "video" && selected.motionTemplate) return <ClipTemplateProperties key={selected.id} item={selected} />;

  return (
    <div className="space-y-2 p-3">
      <p className="text-xs leading-relaxed text-zinc-500">
        Visual theme for this video — grade and brand palette ship in the native engine MP4.
      </p>
      {THEME_LIST.map((t) => {
        const active = t.id === themeId;
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => updateSettings({ themeId: t.id as ThemeId })}
            className={`w-full rounded-lg border p-3 text-left transition-colors ${
              active
                ? "border-emerald-500/40 bg-emerald-500/10"
                : "border-white/10 hover:border-white/20 hover:bg-white/5"
            }`}
          >
            <div className="mb-1.5 flex items-center gap-2">
              <span
                className="size-2.5 rounded-full"
                style={{ backgroundColor: `#${t.palette.primary.replace(/^0x/i, "")}` }}
              />
              <p className="text-xs font-medium text-zinc-300">
                {t.name}
                {active ? " · active" : ""}
              </p>
            </div>
            <p className="text-[10px] text-zinc-600">{t.description}</p>
          </button>
        );
      })}
    </div>
  );
}
