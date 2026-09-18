import { describe, it, expect } from 'vitest';
import { resolveVenueAdminAssignment } from './venue-admin-assignment';

describe('resolveVenueAdminAssignment', () => {
  it('creates a new account when no user matches the email', () => {
    expect(resolveVenueAdminAssignment(null)).toEqual({ action: 'create' });
  });

  it('promotes an existing non-SuperAdmin account', () => {
    expect(resolveVenueAdminAssignment({ id: 'u1', role: 'FA' })).toEqual({ action: 'promote', userId: 'u1' });
    expect(resolveVenueAdminAssignment({ id: 'u2', role: 'Admin' })).toEqual({ action: 'promote', userId: 'u2' });
  });

  it('blocks reassigning a SuperAdmin account', () => {
    const result = resolveVenueAdminAssignment({ id: 'u3', role: 'SuperAdmin' });
    expect(result.action).toBe('blocked');
  });
});
