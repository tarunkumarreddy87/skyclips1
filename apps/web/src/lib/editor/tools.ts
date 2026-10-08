import {
  Blend,
  FileStack,
  Film,
  History,
  Layers,
  MousePointer2,
  Music,
  Type,
  Wand2,
  SlidersHorizontal,
  type LucideIcon,
} from "lucide-react";
import type { LeftTool } from "./types";

export const EDITOR_TOOLS: {
  id: LeftTool | "select";
  icon: LucideIcon;
  label: string;
}[] = [
  { id: "select", icon: MousePointer2, label: "Select" },
  { id: "media", icon: Film, label: "Media" },
  { id: "text", icon: Type, label: "Text" },
  { id: "audio", icon: Music, label: "Audio" },
  { id: "animations", icon: Wand2, label: "Motion & text" },
  { id: "transitions", icon: Blend, label: "Transitions" },
  { id: "effects", icon: SlidersHorizontal, label: "Filters & effects" },
  { id: "templates", icon: Layers, label: "Themes" },
  { id: "files", icon: FileStack, label: "Files" },
  { id: "history", icon: History, label: "History" },
];
