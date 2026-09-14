import { describe, it, expect, vi, beforeEach } from 'vitest';
import jwt from 'jsonwebtoken';

const getSigningKeyMock = vi.fn();
vi.mock('jwks-rsa', () => ({
  default: () => ({ getSigningKey: getSigningKeyMock }),
}));

vi.mock('jsonwebtoken', async () => {
  const actual = await vi.importActual<typeof import('jsonwebtoken')>('jsonwebtoken');
  return { ...actual, default: { ...actual, verify: vi.fn() } };
});

import { verifyMicrosoftToken, MicrosoftAuthError } from './microsoft-auth.service';

describe('verifyMicrosoftToken', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.MSAL_TENANT_ID = 'tenant-123';
    process.env.MSAL_CLIENT_ID = 'client-456';
  });

  it('throws MICROSOFT_SSO_NOT_CONFIGURED when env vars are missing', async () => {
    delete process.env.MSAL_TENANT_ID;
    await expect(verifyMicrosoftToken('any-token')).rejects.toThrow('MICROSOFT_SSO_NOT_CONFIGURED');
    await expect(verifyMicrosoftToken('any-token')).rejects.toBeInstanceOf(MicrosoftAuthError);
  });

  it('returns the identity from a valid decoded token', async () => {
    (jwt.verify as any).mockImplementation((_token: string, _getKey: any, _opts: any, cb: any) => {
      cb(null, { preferred_username: 'Jane.Doe@sc.qa', name: 'Jane Doe', oid: 'oid-abc' });
    });

    const identity = await verifyMicrosoftToken('valid-token');
    expect(identity).toEqual({ email: 'jane.doe@sc.qa', name: 'Jane Doe', oid: 'oid-abc' });
  });

  it('throws INVALID_MICROSOFT_TOKEN when the payload has no email or oid', async () => {
    (jwt.verify as any).mockImplementation((_token: string, _getKey: any, _opts: any, cb: any) => {
      cb(null, { name: 'No Email User' });
    });

    await expect(verifyMicrosoftToken('bad-token')).rejects.toThrow('INVALID_MICROSOFT_TOKEN');
  });

  it('rejects when jwt.verify calls back with an error', async () => {
    (jwt.verify as any).mockImplementation((_token: string, _getKey: any, _opts: any, cb: any) => {
      cb(new Error('signature invalid'));
    });

    await expect(verifyMicrosoftToken('tampered-token')).rejects.toThrow('signature invalid');
  });
});
