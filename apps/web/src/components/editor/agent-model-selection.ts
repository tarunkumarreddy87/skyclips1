export function resolveEditorModelId(selectedId: string, availableIds: readonly string[]): string {
  return !selectedId || availableIds.includes(selectedId) ? selectedId : "";
}
