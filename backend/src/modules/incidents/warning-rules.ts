export interface WarningRow { level: number; revoked: boolean }

/** Non-revoked warnings only are counted. */
export function activeWarningCount(warnings: WarningRow[]): number {
  return warnings.filter(w => !w.revoked).length;
}

/** Highest non-revoked level, or 0 if none. */
export function lastActiveLevel(warnings: WarningRow[]): number {
  return warnings.filter(w => !w.revoked).reduce((max, w) => Math.max(max, w.level), 0);
}

/** UI recommendation: min(lastActiveLevel + 1, 3); 1 when there are none. */
export function recommendNextLevel(warnings: WarningRow[]): 1 | 2 | 3 {
  const next = lastActiveLevel(warnings) + 1;
  if (next <= 1) return 1;
  if (next >= 3) return 3;
  return 2;
}

/** Block iff the just-issued level is 3, or the resulting active count is >= 3. */
export function shouldBlock(newLevel: number, activeCountIncludingNew: number): boolean {
  return newLevel === 3 || activeCountIncludingNew >= 3;
}
