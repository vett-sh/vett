export function parsePositiveInt(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return parsed;
}

export function clampInt(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
