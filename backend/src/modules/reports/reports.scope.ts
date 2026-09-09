export type ScopeRole =
  | 'SuperAdmin' | 'Admin' | 'FA' | 'Observer' | 'Contracts' | 'MaintenanceTeam';

export interface ScopeUser {
  role: ScopeRole | string;
  stadiumId?: string | null;
}

/** Passed to the service to force an empty result set. */
export const NO_STADIUM_SENTINEL = '__none__';

const VENUE_LOCKED_ROLES = new Set(['Admin', 'FA']);

/**
 * Resolve which stadium a report/dashboard query may read.
 * - Admin & FA: always their own stadiumId; the requested value is ignored.
 *   If such a user has no stadiumId, returns NO_STADIUM_SENTINEL so callers can
 *   force an empty result set.
 * - SuperAdmin / Observer / Contracts / MaintenanceTeam: the requested stadiumId
 *   if provided as a non-empty string, otherwise undefined (all venues).
 * Never throws.
 */
export function resolveStadiumScope(
  user: ScopeUser | undefined,
  requestedStadiumId: unknown,
): string | undefined {
  if (!user) return undefined;

  if (VENUE_LOCKED_ROLES.has(user.role)) {
    return user.stadiumId ? user.stadiumId : NO_STADIUM_SENTINEL;
  }

  // Privileged roles: honour an explicit, non-empty string filter only.
  if (typeof requestedStadiumId === 'string' && requestedStadiumId.trim() !== '') {
    return requestedStadiumId;
  }
  return undefined;
}
