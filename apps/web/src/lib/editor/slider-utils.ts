export function sliderValue(v: number | readonly number[]): number {
  if (Array.isArray(v)) return Number(v[0] ?? 0);
  return Number(v);
}
