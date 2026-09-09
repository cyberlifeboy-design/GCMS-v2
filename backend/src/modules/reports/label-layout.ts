const MIN = 60;
const MAX = 260;

/**
 * Font size (pt) for a car number on a print label, scaled to fill the available
 * box. Height drives it for short numbers; width caps it for longer ones.
 * Clamped to [60, 260].
 */
export function labelCarFontSize(carNumber: string, availW: number, availH: number): number {
  let size = Math.min(availH * 0.7, MAX);
  const len = Math.max(carNumber.length, 1);
  if (len > 3) {
    size = Math.min(size, Math.floor((availW * 0.8) / len));
  }
  return Math.max(MIN, Math.round(size));
}
