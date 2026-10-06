// Regression test for the GCMS VAPT observations (v1.0): #3 concurrent sessions,
// #4 publicly readable venue/department lists, #5 no session expiry.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const user = {
    id: 'u1', email: 'a@sc.qa', name: 'A', phone: null, role: 'Admin',
    stadiumId: 's1', departmentId: null, isActive: true, isBlocked: false,
};
// In-memory session table (RefreshToken rows).
const sessions = new Map<string, { id: string; token: string; userId: string; createdAt: Date; expiresAt: Date }>();
let n = 0;

vi.mock('../config/database', () => ({
    prisma: {
        auditLog: { create: vi.fn(async () => ({})) },
        user: { findUnique: vi.fn(async () => ({ ...user, stadium: null })) },
        stadium: { findMany: vi.fn(async () => [{ id: 's1', name: 'Venue', code: 'V' }]) },
        department: { findMany: vi.fn(async () => []) },
        refreshToken: {
            findUnique: vi.fn(async ({ where }: any) => {
                const s = where.id ? sessions.get(where.id) : [...sessions.values()].find(x => x.token === where.token);
                return s ? { ...s, user } : null;
            }),
            create: vi.fn(async ({ data }: any) => {
                const s = { id: `sess${++n}`, createdAt: new Date(), ...data };
                sessions.set(s.id, s);
                return s;
            }),
            update: vi.fn(async ({ where, data }: any) => Object.assign(sessions.get(where.id)!, data)),
            delete: vi.fn(async ({ where }: any) => sessions.delete(where.id)),
            deleteMany: vi.fn(async ({ where }: any) => {
                for (const s of [...sessions.values()]) {
                    if ((where.id && s.id === where.id) || (where.userId && s.userId === where.userId && s.id !== where.id?.not)) sessions.delete(s.id);
                }
            }),
        },
        $transaction: vi.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    },
    checkDatabaseConnection: vi.fn(async () => true),
}));
vi.mock('../modules/invitations/invitations.service', () => ({
    invitationsService: {
        validateForSubmission: vi.fn(async (t: string) => { if (t !== 'good-invite') throw new Error('INVITATION_NOT_FOUND'); return {}; }),
    },
}));
vi.mock('../services/microsoft-auth.service', () => ({
    verifyMicrosoftToken: vi.fn(async () => { throw new Error('bad token'); }),
}));

import { AuthService } from '../modules/auth/auth.service';
import { authConfig } from '../config/auth';
import app from '../app';

const me = (token: string, background = false) => {
    const r = request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    return background ? r.set('X-Background', '1') : r;
};

describe('session management (VAPT #3, #5)', () => {
    beforeEach(() => { sessions.clear(); vi.useRealTimers(); });

    it('a new sign-in ends the previous session (#3)', async () => {
        const first = await AuthService.issueSession(user);
        expect((await me(first.accessToken)).status).toBe(200);

        const second = await AuthService.issueSession(user);
        const res = await me(first.accessToken);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('SESSION_ENDED');
        expect((await me(second.accessToken)).status).toBe(200);

        // The old device can't mint a fresh access token either.
        expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken: first.refreshToken })).status).toBe(401);
    });

    it('expires after the idle timeout; background polls do not keep it alive (#5)', async () => {
        const { accessToken, refreshToken } = await AuthService.issueSession(user);
        const [session] = sessions.values();

        // Idle 10 min with polls only — deadline must not move.
        const deadline = session.expiresAt.getTime();
        session.createdAt = new Date(Date.now() - 10 * 60_000);
        expect((await me(accessToken, true)).status).toBe(200);
        expect(session.expiresAt.getTime()).toBe(deadline);

        // Past the idle deadline: rejected and the session is gone.
        session.expiresAt = new Date(Date.now() - 1);
        const res = await me(accessToken);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('SESSION_EXPIRED');
        expect(sessions.size).toBe(0);
        expect((await request(app).post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
    });

    it('real activity slides the idle deadline, capped by the absolute lifetime (#5)', async () => {
        const { accessToken } = await AuthService.issueSession(user);
        const [session] = sessions.values();
        session.expiresAt = new Date(Date.now() + 2 * 60_000); // 13 min idle so far

        expect((await me(accessToken)).status).toBe(200);
        expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now() + authConfig.session.idleMs - 5_000);

        // Signed in longer ago than the absolute lifetime: rejected even while active.
        session.createdAt = new Date(Date.now() - authConfig.session.maxMs - 1);
        expect((await me(accessToken)).status).toBe(401);
    });

    it('tokens without a session id (issued before this fix) are rejected', async () => {
        const jwt = await import('jsonwebtoken');
        const legacy = jwt.default.sign({ userId: 'u1', email: user.email, role: 'Admin' }, authConfig.jwt.accessTokenSecret);
        expect((await me(legacy)).status).toBe(401);
    });
});

describe('venue / department lookups (VAPT #4)', () => {
    beforeEach(() => sessions.clear());

    it.each(['/api/v1/public/stadiums', '/api/v1/public/departments?stadiumId=s1'])('%s rejects anonymous callers', async (url) => {
        expect((await request(app).get(url)).status).toBe(401);
        expect((await request(app).get(url).set('X-Invite-Token', 'forged')).status).toBe(401);
        expect((await request(app).get(url).set('X-MS-Id-Token', 'forged')).status).toBe(401);
    });

    it('allows a signed-in user or a valid invitation', async () => {
        const { accessToken } = await AuthService.issueSession(user);
        expect((await request(app).get('/api/v1/public/stadiums').set('Authorization', `Bearer ${accessToken}`)).status).toBe(200);
        expect((await request(app).get('/api/v1/public/stadiums').set('X-Invite-Token', 'good-invite')).status).toBe(200);
    });

    it('the API index no longer lists endpoints', async () => {
        const res = await request(app).get('/api/v1');
        expect(res.body.endpoints).toBeUndefined();
    });
});
