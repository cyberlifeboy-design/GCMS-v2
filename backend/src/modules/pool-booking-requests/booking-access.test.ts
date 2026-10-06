// Regression test for the 2026-09-29 security review (Broken Access Control + Missing
// Rate Limiting): booking / car-request submission must require login, and the
// requester identity must come from the signed-in account, never the request body.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';

const realUser = {
    id: 'u1', email: 'real.user@sc.qa', name: 'Real User', phone: '5550000',
    role: 'FA', stadiumId: 's1', departmentId: 'd1', isActive: true, isBlocked: false,
};
vi.mock('../../config/database', () => ({
    prisma: {
        auditLog: { create: vi.fn(async () => ({})) },
        user: { findUnique: vi.fn(async () => realUser) },
        refreshToken: {
            findUnique: vi.fn(async () => ({ id: 'sess1', userId: 'u1', createdAt: new Date(), expiresAt: new Date(Date.now() + 600_000), user: realUser })),
            update: vi.fn(async () => ({})),
        },
    },
    checkDatabaseConnection: vi.fn(async () => true),
}));
vi.mock('../settings/settings.service', () => ({
    settingsService: {
        get: vi.fn(async () => ({ enableBookings: true, enableCarRequests: true })),
        getBookingWindowState: vi.fn(async () => ({ isOpen: true })),
        getRequestWindowState: vi.fn(async () => ({ isOpen: true })),
    },
}));
const createInstant = vi.fn(async (data: unknown) => ({ id: 'b1', requestToken: 't', ...(data as object) }));
vi.mock('./pool-booking-requests.service', () => ({
    poolBookingRequestsService: { createInstant: (d: unknown) => createInstant(d) },
}));
const createRequest = vi.fn(async (data: unknown) => ({ id: 'r1', requestNumber: 1, ...(data as object) }));
vi.mock('../requests/requests.service', () => ({
    requestsService: { createRequest: (d: unknown) => createRequest(d), getByToken: async () => null },
}));

import jwt from 'jsonwebtoken';
import { authConfig } from '../../config/auth';
import app from '../../app';

const token = () => jwt.sign({ userId: 'u1', email: 'real.user@sc.qa', role: 'FA', sid: 'sess1' }, authConfig.jwt.accessTokenSecret);
const spoof = { requesterName: 'Victim', requesterEmail: 'k.hameed@sc.qa' };

describe('booking / car-request submission access control', () => {
    beforeEach(() => { createInstant.mockClear(); createRequest.mockClear(); });

    it.each([
        ['post', '/api/v1/public/pool-booking-requests'],
        ['post', '/api/v1/public/pool-booking-requests/instant'],
        ['post', '/api/v1/public/pool-booking-requests/recurring'],
        ['post', '/api/v1/public/requests'],
        ['post', '/api/v1/pool-booking-requests'],
        ['post', '/api/v1/pool-booking-requests/instant'],
        ['post', '/api/v1/pool-booking-requests/recurring'],
        ['get', '/api/v1/pool-booking-requests/venues/s1/instant-available-carts'],
        ['get', '/api/v1/pool-booking-requests/venues/s1/available-carts'],
        ['post', '/api/v1/requests'],
        ['get', '/api/v1/requests/track?number=1'],
    ] as const)('%s %s rejects anonymous callers', async (method, url) => {
        const res = await request(app)[method](url).send({});
        expect(res.status).toBe(401);
    });

    it('old anonymous track-by-email lookup no longer exists', async () => {
        // "/public/requests/track" now only matches the emailed-token route, and "track" is no token.
        const res = await request(app).get('/api/v1/public/requests/track?number=1&email=a@b.c');
        expect(res.status).toBe(404);
    });

    it('stamps the signed-in account as the booking requester, ignoring a spoofed body', async () => {
        const res = await request(app)
            .post('/api/v1/pool-booking-requests/instant')
            .set('Authorization', `Bearer ${token()}`)
            .send({ stadiumId: 's1', fleetId: 'f1', departmentId: 'd1', requesterPhone: '123', ...spoof });
        expect(res.status).toBe(201);
        expect(createInstant).toHaveBeenCalledWith(expect.objectContaining({
            requesterName: 'Real User', requesterEmail: 'real.user@sc.qa', createdById: 'u1',
        }));
    });

    it('stamps the signed-in account as the car-request requester, ignoring a spoofed body', async () => {
        const res = await request(app)
            .post('/api/v1/requests')
            .set('Authorization', `Bearer ${token()}`)
            .send({ stadiumId: 's1', departmentId: 'd1', cargoCount: 1, justification: 'x', ...spoof });
        expect(res.status).toBe(201);
        expect(createRequest).toHaveBeenCalledWith(expect.objectContaining({
            requesterName: 'Real User', requesterEmail: 'real.user@sc.qa',
        }));
    });

    it('rejects a booking at another venue or department (non-SuperAdmin)', async () => {
        for (const body of [{ stadiumId: 's2', departmentId: 'd1' }, { stadiumId: 's1', departmentId: 'd2' }]) {
            const res = await request(app)
                .post('/api/v1/pool-booking-requests/instant')
                .set('Authorization', `Bearer ${token()}`)
                .send({ fleetId: 'f1', requesterPhone: '123', ...body });
            expect(res.status).toBe(400);
        }
        expect(createInstant).not.toHaveBeenCalled();
    });

    it('caps submissions per account (20/hour)', async () => {
        const send = () => request(app)
            .post('/api/v1/pool-booking-requests/instant')
            .set('Authorization', `Bearer ${token()}`)
            .send({ stadiumId: 's1', fleetId: 'f1', departmentId: 'd1', requesterPhone: '123' });
        // One shared budget across bookings + car requests: the tests above already spent 4 of 20
        // (2 accepted + 2 rejected-by-venue — the limiter counts attempts, before validation).
        const statuses: number[] = [];
        for (let i = 0; i < 17; i++) statuses.push((await send()).status);
        expect(statuses.filter((s) => s === 201)).toHaveLength(16);
        expect(statuses.at(-1)).toBe(429);
    });
});
