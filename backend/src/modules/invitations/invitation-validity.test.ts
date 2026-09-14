import { describe, it, expect } from 'vitest';
import { checkInvitationValidity } from './invitation-validity';

const at = (s: string) => new Date(s);
const inv = (status: string, expiresAt: string) => ({ status, expiresAt: at(expiresAt) });

describe('checkInvitationValidity', () => {
  it('is valid when Pending and not yet expired', () => {
    expect(checkInvitationValidity(inv('Pending', '2026-09-20T00:00:00'), at('2026-09-14T00:00:00')).valid).toBe(true);
  });

  it('is invalid when already Used', () => {
    const r = checkInvitationValidity(inv('Used', '2026-09-20T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r).toEqual({ valid: false, reason: 'INVITATION_ALREADY_USED' });
  });

  it('is invalid when Revoked', () => {
    const r = checkInvitationValidity(inv('Revoked', '2026-09-20T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r).toEqual({ valid: false, reason: 'INVITATION_REVOKED' });
  });

  it('is invalid once past expiresAt, even if still Pending', () => {
    const r = checkInvitationValidity(inv('Pending', '2026-09-10T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r).toEqual({ valid: false, reason: 'INVITATION_EXPIRED' });
  });

  it('treats the exact expiry instant as still valid', () => {
    const r = checkInvitationValidity(inv('Pending', '2026-09-14T00:00:00'), at('2026-09-14T00:00:00'));
    expect(r.valid).toBe(true);
  });
});
