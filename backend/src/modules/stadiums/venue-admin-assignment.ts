export type VenueAdminAssignment =
  | { action: 'create' }
  | { action: 'promote'; userId: string }
  | { action: 'blocked'; reason: string };

/**
 * Decide what "assign this email as this venue's Admin" should do to an existing
 * account match. A SuperAdmin is never silently demoted by a typo'd email here —
 * that has to be a deliberate change on the Users page instead.
 */
export function resolveVenueAdminAssignment(
  existingUser: { id: string; role: string } | null
): VenueAdminAssignment {
  if (!existingUser) return { action: 'create' };
  if (existingUser.role === 'SuperAdmin') {
    return { action: 'blocked', reason: 'This email belongs to a SuperAdmin account — reassign it from the Users page instead.' };
  }
  return { action: 'promote', userId: existingUser.id };
}
