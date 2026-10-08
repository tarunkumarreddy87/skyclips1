/** Pure scope validation plus a transaction postcondition; never trust planner scope alone. */
type Item = { id: string; type: string; startMs: number; endMs: number };
type Context = { selectedItemIds?: string[]; selectedItemId?: string | null; items: Item[] };
export function selectionScope(context: Context) {
  const selected = context.selectedItemIds?.length ? context.selectedItemIds : context.selectedItemId ? [context.selectedItemId] : [];
  if (!selected.length) return null;
  const items = new Map(context.items.map(item => [item.id, item]));
  const windows = selected.map(id => {
    const item = items.get(id);
    if (!item) throw new Error("The selected clip no longer exists.");
    return { start: item.startMs, end: item.endMs };
  });
  const inside = (start: unknown, end: unknown) => typeof start === "number" && typeof end === "number" && Number.isFinite(start) && Number.isFinite(end) && windows.some(window => window.start <= start && start < end && end <= window.end);
  const associated = new Set(["captions", "text", "animation", "sfx", "broll"]);
  const allowed = new Set(selected);
  context.items.forEach(item => { if (associated.has(item.type) && inside(item.startMs, item.endMs)) allowed.add(item.id); });
  return { allowed, inside, items };
}

export function validateSelectionOps(ops: Record<string, unknown>[], context: Context) {
  const scope = selectionScope(context);
  if (!scope) return;
  const additions = new Set(["add_text", "add_caption", "add_broll", "add_sfx", "add_music", "add_graphic", "add_motion_scene", "add_media"]);
  for (const op of ops) {
    const name = String(op.op);
    if (["set_playhead", "select_item"].includes(name) || (ops.length === 1 && ["undo", "redo"].includes(name))) continue;
    if (additions.has(name)) {
      const duration = name === "add_motion_scene" ? (op.scene as { durationMs?: number } | undefined)?.durationMs : op.durationMs;
      if (typeof op.startMs !== "number" || typeof duration !== "number" || !scope.inside(op.startMs, op.startMs + duration)) throw new Error("New items need explicit timing entirely inside the selected clip.");
      continue;
    }
    if (typeof op.itemId !== "string" || !scope.allowed.has(op.itemId) || ["duplicate_item", "add_animation", "add_transition", "set_transition", "remove_transition", "set_transition_sound"].includes(name)) throw new Error("The plan affects items outside the selected clip. Clear the selection for a whole-video edit.");
    const item = scope.items.get(op.itemId)!;
    let start: unknown = item.startMs, end: unknown = item.endMs;
    if (name === "move_item") { start = op.startMs; end = typeof start === "number" ? start + item.endMs - item.startMs : undefined; }
    if (name === "trim_item") { start = op.startMs; end = op.endMs; }
    if (name === "update_motion_scene") { const duration = (op.scene as { durationMs?: number } | undefined)?.durationMs; end = typeof duration === "number" ? item.startMs + duration : undefined; }
    if (!scope.inside(start, end)) throw new Error("The edit extends beyond the selected clip.");
  }
}

type Snapshot = { project: unknown; timeline: { durationMs: number; settings: unknown; transitions: unknown; tracks: Array<{ id: string; items: Item[] }> }; assets: Array<{ id: string }> };
export function assertSelectionPreserved(before: Snapshot, after: Snapshot, context: Context) {
  const scope = selectionScope(context);
  if (!scope) return;
  const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  if (!equal(before.project, after.project) || before.timeline.durationMs !== after.timeline.durationMs || !equal(before.timeline.settings, after.timeline.settings) || !equal(before.timeline.transitions, after.timeline.transitions)) throw new Error("Selected-clip editing changed whole-video settings.");
  const beforeItems = new Set(before.timeline.tracks.flatMap(track => track.items.map(item => item.id)));
  for (const track of before.timeline.tracks) {
    const current = after.timeline.tracks.find(value => value.id === track.id);
    const { items: _items, ...metadata } = track;
    const { items: _currentItems, ...currentMetadata } = current ?? { items: [] };
    if (!equal(metadata, currentMetadata)) throw new Error("Selected-clip editing changed a track.");
    for (const item of track.items) {
      const updated = current?.items.find(value => value.id === item.id);
      if (!scope.allowed.has(item.id) && !equal(item, updated)) throw new Error("An unrelated clip changed; the batch was rolled back.");
      if (scope.allowed.has(item.id) && updated && !scope.inside(updated.startMs, updated.endMs)) throw new Error("The edited clip escaped its selected range.");
    }
  }
  for (const track of after.timeline.tracks) for (const item of track.items) if (!beforeItems.has(item.id) && !scope.inside(item.startMs, item.endMs)) throw new Error("A new item escaped the selected clip.");
  for (const asset of before.assets) if (!equal(asset, after.assets.find(value => value.id === asset.id))) throw new Error("An existing asset changed outside the selected clip.");
}
