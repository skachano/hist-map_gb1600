export const YEAR_MIN = 1600;
export const YEAR_MAX = 1632;

/** Rough centre and zoom of the bailliage d'Allemagne (Saar / German Lorraine). */
export const MAP_CENTER: [number, number] = [6.85, 49.15];
export const MAP_ZOOM = 8;

export function clampYear(year: number): number {
  return Math.min(YEAR_MAX, Math.max(YEAR_MIN, Math.round(year)));
}
