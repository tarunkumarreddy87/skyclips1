import { useEditorStore } from "../store";

export interface AgentTimelineContext {
  playheadMs: number;
  selectedItemId: string | null;
  selectedTransitionId: string | null;
  durationMs: number;
  summary: string;
  items: Array<{
    id: string;
    type: string;
    label: string;
    startMs: number;
    endMs: number;
  }>;
  transitions: Array<{
    id: string;
    afterItemId: string;
    type: string;
    durationMs: number;
    enabled: boolean;
  }>;
}

export function buildAgentContext(): AgentTimelineContext {
  const state = useEditorStore.getState();
  const items = state.timeline.tracks.flatMap((track) =>
    track.items
      .filter((i) => !i.hidden)
      .map((i) => ({
        id: i.id,
        type: i.type,
        label: i.label,
        startMs: i.startMs,
        endMs: i.endMs,
      })),
  );
  const transitions = state.timeline.transitions.map((t) => ({
    id: t.id,
    afterItemId: t.afterItemId,
    type: t.transitionType,
    durationMs: t.durationMs,
    enabled: t.enabled,
  }));

  const lines = [
    `Project: ${state.project.title} (${state.project.format})`,
    `Duration: ${(state.timeline.durationMs / 1000).toFixed(1)}s`,
    `Playhead: ${(state.ui.playheadMs / 1000).toFixed(1)}s`,
    `Selected item: ${state.ui.selectedItemId ?? "none"}`,
    `Selected transition: ${state.ui.selectedTransitionId ?? "none"}`,
    "Clips:",
    ...items.slice(0, 40).map(
      (i) =>
        `- ${i.id} [${i.type}] “${i.label}” ${ (i.startMs / 1000).toFixed(1)}–${(i.endMs / 1000).toFixed(1)}s`,
    ),
    "Transitions:",
    ...transitions
      .filter((t) => t.enabled)
      .map((t) => `- ${t.id} after ${t.afterItemId}: ${t.type} (${t.durationMs}ms)`),
  ];

  return {
    playheadMs: state.ui.playheadMs,
    selectedItemId: state.ui.selectedItemId,
    selectedTransitionId: state.ui.selectedTransitionId,
    durationMs: state.timeline.durationMs,
    summary: lines.join("\n"),
    items,
    transitions,
  };
}
