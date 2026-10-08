import type { AgentOp } from "./ops";
import { useEditorStore } from "../store";

/** Human-readable tool arguments shared by plan review and execution activity. */
export function describeAgentOp(op: AgentOp): string {
  const readable = (value: string) => value.replace(/([a-z])([A-Z])/g, "$1 $2").replaceAll("_", " ").replaceAll("-", " ").toLowerCase();
  const targetId = "itemId" in op ? op.itemId : "afterItemId" in op ? op.afterItemId : null;
  const item = targetId ? useEditorStore.getState().timeline.tracks.flatMap(t => t.items).find(i => i.id === targetId) : null;
  const target = item ? ` · ${(item.label || item.type).slice(0, 56)}` : "";
  switch (op.op) {
    case "update_caption_style": return `Style captions · ${readable(op.style)}`;
    case "add_transition": case "set_transition": return `${op.op === "add_transition" ? "Add" : "Change"} transition · ${readable(op.type)}${target}`;
    case "set_transition_sound": return `${op.enabled ? "Enable" : "Mute"} transition sound`;
    case "update_clip_effects": return `Adjust look · ${readable(op.patch.filterId || op.patch.effectId || "color grading")}${target}`;
    case "add_motion_scene": return `Create motion graphic · ${op.scene.title}`;
    case "update_motion_scene": return `Edit motion graphic · ${op.scene.title}`;
    case "add_motion_template": return `Add motion graphic · ${op.title || readable(op.templateId)}`;
    case "set_volume": return `Set volume to ${Math.round(op.volume * 100)}%${target}`;
    case "add_sfx": return `Add sound effect · ${op.label || "Sound effect"}`;
    case "add_music": return `Add music · ${op.label || "Music"}`;
    case "update_settings": return `Update ${Object.entries(op.patch).map(([key, value]) => `${readable(key)}: ${typeof value === "boolean" ? value ? "on" : "off" : key === "backgroundImage" ? value ? "image" : "none" : readable(String(value))}`).join(", ")}`;
    case "add_text": case "add_caption": return `${op.op === "add_text" ? "Add text" : "Add caption"} · ${op.text.slice(0, 60)}`;
    case "set_theme": return `Apply ${readable(op.themeId)} theme`;
    default: { const name = readable(op.op); return name.charAt(0).toUpperCase() + name.slice(1) + target; }
  }
}
