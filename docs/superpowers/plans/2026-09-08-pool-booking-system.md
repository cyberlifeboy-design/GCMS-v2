# Pool Booking System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the internal, no-approval "Pool Booking" checkout page with one unified pool-booking-request system — reachable both publicly (no login) and by logged-in FA/Admin/SuperAdmin users — where every booking requires explicit Admin/SuperAdmin approval and the same cart can never be double-booked for overlapping times.

**Architecture:** A new `PoolBookingRequest` Prisma model backs a new backend module (`pool-booking-requests`), exposing public submission/status-check endpoints and authenticated list/approve/reject/amend endpoints. Two new frontend pages consume it: a public `PoolBookingRequestPage` (submission + confirmation) and an internal `BookingsPage` (review queue + venue operating-hours settings). The old `PoolBookingPage` (immediate no-approval checkout) and its nav entry are removed; its underlying `PoolBooking` table is left untouched as historical data. The login page gets a title/subtitle update and three new entry points below the Sign In button.

**Tech Stack:** Express + TypeScript + Prisma (SQLite locally) on the backend; React + TypeScript + Vite + Tailwind + shadcn/ui components on the frontend. Follows this repo's existing controller/service/routes module pattern (see `backend/src/modules/requests/`) and existing public-page pattern (see `frontend/src/pages/PublicRequestPage.tsx`).

**Spec:** `docs/superpowers/specs/2026-09-08-pool-booking-system-design.md`

## Global Constraints

- Every booking, regardless of who submits it (public visitor, FA, Admin, SuperAdmin), starts as `Pending` and requires explicit Admin/SuperAdmin approval — there is no auto-approval path for anyone.
- Approving a booking must be blocked (HTTP 409) if another `Approved` booking on the same `fleetId` overlaps its date range and time window. Admin/SuperAdmin can still amend/cancel bookings to resolve conflicts, then retry approval.
- **Do not run `npm test` in `backend/` during this plan.** The one existing suite (`maintenance.workflow.test.ts`) calls `prisma.*.deleteMany()` against whatever `DATABASE_URL` is active — there's no separate `.env.test`, so it runs against the same `backend/prisma/dev.db` we seeded with demo data earlier this session and would wipe it. Verify each backend change with direct `curl` calls instead, and verify frontend changes by using the running dev server in the browser.
- Follow the existing module layout exactly: `backend/src/modules/<kebab-case-name>/<name>.service.ts` / `.controller.ts` / `.routes.ts`, RBAC via `requireRole(...)` + manual `stadiumId` ownership checks for `Admin` (see `requests.controller.ts` for the pattern), Zod for request validation.
- Dates are stored/compared as `"YYYY-MM-DD"` strings and times as `"HH:mm"` strings — both compare correctly with plain string `<=`/`<` operators, so no date library is needed for the overlap check.
- The backend dev server (port 3005) and frontend dev server (port 3000) from earlier this session are already running in the background (`bt5o5w66a` / `b80ccpin0`). `tsx watch` and Vite both hot-reload on file save — no manual restart needed between tasks unless a task explicitly says otherwise (e.g., after a Prisma schema change, which needs `prisma generate` + `prisma migrate dev`, and the backend process needs a moment to pick up the new client).

---

### Task 1: Prisma schema — `PoolBookingRequest` model + venue operating hours

**Files:**
- Modify: `backend/prisma/schema.prisma`

**Interfaces:**
- Produces: `PoolBookingRequest` Prisma model with fields `id, stadiumId, fleetId, requesterName, requesterEmail, requesterPhone, faUserId, bookingType, startDate, endDate, startTime, endTime, purpose, status, reviewedById, reviewedAt, reviewComment, requestToken, createdById, createdAt, updatedAt`; `Stadium.poolBookingStartTime` / `Stadium.poolBookingEndTime` (nullable strings).

- [ ] **Step 1: Add the `PoolBookingRequest` model and Stadium/Fleet/User relations**

In `backend/prisma/schema.prisma`, add two fields to the existing `Stadium` model (inside the model block, near the other simple fields — after `isActive`):

```prisma
  poolBookingStartTime String?  // "HH:mm", null = no restriction
  poolBookingEndTime   String?  // "HH:mm", null = no restriction
```

Add a relation line to the `Stadium` model's relation block (alongside `fleet`, `users`, `departments`, `carRequests`):

```prisma
  poolBookingRequests PoolBookingRequest[]
```

Add a relation line to the `Fleet` model's relation block (alongside `handoverForm`, `handoverLogs`, `maintenanceLogs`, `poolBookings`):

```prisma
  poolBookingRequests PoolBookingRequest[]
```

Add relation lines to the `User` model's relation block (alongside `createdPoolBookings`, `returnedPoolBookings`):

```prisma
  faPoolBookingRequests       PoolBookingRequest[] @relation("PoolBookingRequestFA")
  reviewedPoolBookingRequests PoolBookingRequest[] @relation("PoolBookingRequestReviewer")
  createdPoolBookingRequests  PoolBookingRequest[] @relation("PoolBookingRequestCreatedBy")
```

Add the new model at the end of the file (after `model Notification { ... }`):

```prisma
// Pool Booking Request — public/internal request to book a shared pool cart at a venue.
// Every request requires explicit Admin/SuperAdmin approval; no auto-approval path.
// Status: Pending | Approved | Rejected | Cancelled
model PoolBookingRequest {
  id            String   @id @default(cuid())

  stadiumId     String
  stadium       Stadium  @relation(fields: [stadiumId], references: [id])
  fleetId       String
  fleet         Fleet    @relation(fields: [fleetId], references: [id])

  requesterName  String
  requesterEmail String
  requesterPhone String

  faUserId       String
  faUser         User     @relation("PoolBookingRequestFA", fields: [faUserId], references: [id])

  bookingType    String   // "Single" | "Recurring"
  startDate      String   // "YYYY-MM-DD"; equals startDate for Single
  endDate        String   // "YYYY-MM-DD"
  startTime      String   // "HH:mm", daily window start
  endTime        String   // "HH:mm", daily window end
  purpose        String?

  status         String    @default("Pending") // Pending, Approved, Rejected, Cancelled
  reviewedById   String?
  reviewedBy     User?     @relation("PoolBookingRequestReviewer", fields: [reviewedById], references: [id])
  reviewedAt     DateTime?
  reviewComment  String?

  requestToken   String    @unique

  createdById    String?
  createdByUser  User?     @relation("PoolBookingRequestCreatedBy", fields: [createdById], references: [id])

  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([stadiumId])
  @@index([fleetId])
  @@index([status])
  @@index([requestToken])
}
```

- [ ] **Step 2: Generate the migration and Prisma client**

Run (from `backend/`):
```bash
cd backend
npx prisma migrate dev --name add_pool_booking_request
```
Expected: prompts complete without error, prints a new migration folder name like `..._add_pool_booking_request`, ends with "Your database is now in sync with your schema." and regenerates the Prisma client.

- [ ] **Step 3: Verify the new table exists**

Run:
```bash
npx tsx -e "import('./src/config/database').then(async ({prisma}) => { console.log(await prisma.poolBookingRequest.count()); await prisma.\$disconnect(); })"
```
Expected: prints `0` (empty table, no errors).

- [ ] **Step 4: Commit**

```bash
cd ..
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat: add PoolBookingRequest model and venue operating-hours fields"
```

---

### Task 2: Backend service layer — `pool-booking-requests.service.ts`

**Files:**
- Create: `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts`

**Interfaces:**
- Consumes: `prisma` from `../../config/database`; `notificationService` from `../notifications/notification.service` (methods `createForRoles(data, roles, stadiumId?)` and `create(data)`, per Task 2's reading of the existing file).
- Produces: `poolBookingRequestsService` singleton with methods `generateRequestToken()`, `getAvailableCarts(stadiumId, startDate, endDate, startTime, endTime, excludeBookingId?)`, `getFAsForStadium(stadiumId)`, `findConflict(fleetId, startDate, endDate, startTime, endTime, excludeId?)`, `create(data)`, `getByToken(token)`, `getById(id)`, `getAll(filters)`, `approve(id, reviewedById, reviewComment?)`, `reject(id, reviewedById, reviewComment)`, `amend(id, data, reviewedById, reviewComment?)` — used by Task 3's controller.

- [ ] **Step 1: Create the module directory and write the service**

Create `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts`:

```ts
import { prisma } from '../../config/database';
import crypto from 'crypto';
import { notificationService } from '../notifications/notification.service';

export interface CreatePoolBookingRequestData {
    stadiumId: string;
    fleetId: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    faUserId: string;
    bookingType: 'Single' | 'Recurring';
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    purpose?: string;
    createdById?: string;
}

export interface AmendPoolBookingRequestData {
    fleetId?: string;
    startDate?: string;
    endDate?: string;
    startTime?: string;
    endTime?: string;
    faUserId?: string;
    status?: 'Pending' | 'Approved' | 'Rejected' | 'Cancelled';
}

const BOOKING_INCLUDE = {
    stadium: { select: { id: true, name: true, code: true } },
    fleet: { select: { id: true, carNumber: true, carType: true } },
    faUser: { select: { id: true, name: true } },
    reviewedBy: { select: { id: true, name: true } },
    createdByUser: { select: { id: true, name: true } },
};

export class PoolBookingRequestsService {
    generateRequestToken(): string {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Pool carts at a venue with no *Approved* booking overlapping the given window.
     */
    async getAvailableCarts(
        stadiumId: string,
        startDate: string,
        endDate: string,
        startTime: string,
        endTime: string,
        excludeBookingId?: string,
    ) {
        const carts = await prisma.fleet.findMany({
            where: { stadiumId, isPool: true },
            select: { id: true, carNumber: true, carType: true },
            orderBy: { carNumber: 'asc' },
        });
        if (carts.length === 0) return [];

        const overlapping = await prisma.poolBookingRequest.findMany({
            where: {
                fleetId: { in: carts.map((c) => c.id) },
                status: 'Approved',
                ...(excludeBookingId ? { id: { not: excludeBookingId } } : {}),
            },
            select: { fleetId: true, startDate: true, endDate: true, startTime: true, endTime: true },
        });

        const busyFleetIds = new Set(
            overlapping
                .filter(
                    (b) =>
                        startDate <= b.endDate &&
                        endDate >= b.startDate &&
                        startTime < b.endTime &&
                        endTime > b.startTime,
                )
                .map((b) => b.fleetId),
        );

        return carts.filter((c) => !busyFleetIds.has(c.id));
    }

    async getFAsForStadium(stadiumId: string) {
        return prisma.user.findMany({
            where: { stadiumId, role: 'FA', isActive: true },
            select: { id: true, name: true },
            orderBy: { name: 'asc' },
        });
    }

    /**
     * Finds an existing Approved booking on the same cart whose date range and
     * daily time window overlap the given one. Returns null if there's no conflict.
     */
    async findConflict(
        fleetId: string,
        startDate: string,
        endDate: string,
        startTime: string,
        endTime: string,
        excludeId?: string,
    ) {
        const candidates = await prisma.poolBookingRequest.findMany({
            where: {
                fleetId,
                status: 'Approved',
                ...(excludeId ? { id: { not: excludeId } } : {}),
            },
            include: BOOKING_INCLUDE,
        });
        return (
            candidates.find(
                (b) =>
                    startDate <= b.endDate &&
                    endDate >= b.startDate &&
                    startTime < b.endTime &&
                    endTime > b.startTime,
            ) || null
        );
    }

    async create(data: CreatePoolBookingRequestData) {
        const requestToken = this.generateRequestToken();

        const booking = await prisma.poolBookingRequest.create({
            data: {
                stadiumId: data.stadiumId,
                fleetId: data.fleetId,
                requesterName: data.requesterName,
                requesterEmail: data.requesterEmail,
                requesterPhone: data.requesterPhone,
                faUserId: data.faUserId,
                bookingType: data.bookingType,
                startDate: data.startDate,
                endDate: data.endDate,
                startTime: data.startTime,
                endTime: data.endTime,
                purpose: data.purpose,
                requestToken,
                createdById: data.createdById,
                status: 'Pending',
            },
            include: BOOKING_INCLUDE,
        });

        const message = `${data.requesterName} requested ${booking.fleet.carNumber} at ${booking.stadium.name}`;
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Pool Booking Request', message, entityType: 'PoolBookingRequest', entityId: booking.id },
            ['Admin'],
            data.stadiumId,
        );
        // SuperAdmins typically have no stadiumId set, so notify them without a stadium filter.
        await notificationService.createForRoles(
            { type: 'PoolBookingRequested', title: 'New Pool Booking Request', message, entityType: 'PoolBookingRequest', entityId: booking.id },
            ['SuperAdmin'],
        );

        return booking;
    }

    async getByToken(token: string) {
        return prisma.poolBookingRequest.findUnique({ where: { requestToken: token }, include: BOOKING_INCLUDE });
    }

    async getById(id: string) {
        return prisma.poolBookingRequest.findUnique({ where: { id }, include: BOOKING_INCLUDE });
    }

    async getAll(filters: { status?: string; stadiumId?: string }) {
        const where: Record<string, unknown> = {};
        if (filters.status) where.status = filters.status;
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        return prisma.poolBookingRequest.findMany({ where, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' } });
    }

    async approve(id: string, reviewedById: string, reviewComment?: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.status !== 'Pending') throw new Error('Booking has already been reviewed');

        const conflict = await this.findConflict(
            existing.fleetId,
            existing.startDate,
            existing.endDate,
            existing.startTime,
            existing.endTime,
            existing.id,
        );
        if (conflict) {
            const err = new Error('This cart already has an approved booking that overlaps this date/time') as Error & { status: number; conflict: unknown };
            err.status = 409;
            err.conflict = conflict;
            throw err;
        }

        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: { status: 'Approved', reviewedById, reviewedAt: new Date(), reviewComment },
            include: BOOKING_INCLUDE,
        });

        if (updated.createdById) {
            await notificationService.create({
                type: 'PoolBookingApproved',
                title: 'Pool Booking Approved',
                message: `Your pool booking for ${updated.fleet.carNumber} at ${updated.stadium.name} was approved`,
                entityType: 'PoolBookingRequest',
                entityId: id,
                userId: updated.createdById,
            });
        }

        return updated;
    }

    async reject(id: string, reviewedById: string, reviewComment: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');
        if (existing.status !== 'Pending') throw new Error('Booking has already been reviewed');

        const updated = await prisma.poolBookingRequest.update({
            where: { id },
            data: { status: 'Rejected', reviewedById, reviewedAt: new Date(), reviewComment },
            include: BOOKING_INCLUDE,
        });

        if (updated.createdById) {
            await notificationService.create({
                type: 'PoolBookingRejected',
                title: 'Pool Booking Rejected',
                message: `Your pool booking for ${updated.fleet.carNumber} at ${updated.stadium.name} was rejected`,
                entityType: 'PoolBookingRequest',
                entityId: id,
                userId: updated.createdById,
            });
        }

        return updated;
    }

    async amend(id: string, data: AmendPoolBookingRequestData, reviewedById: string, reviewComment?: string) {
        const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
        if (!existing) throw new Error('Booking request not found');

        const merged = { ...existing, ...data };

        if (merged.status === 'Approved') {
            const conflict = await this.findConflict(
                merged.fleetId,
                merged.startDate,
                merged.endDate,
                merged.startTime,
                merged.endTime,
                id,
            );
            if (conflict) {
                const err = new Error('This cart already has an approved booking that overlaps this date/time') as Error & { status: number; conflict: unknown };
                err.status = 409;
                err.conflict = conflict;
                throw err;
            }
        }

        return prisma.poolBookingRequest.update({
            where: { id },
            data: {
                ...data,
                reviewedById,
                reviewedAt: new Date(),
                ...(reviewComment !== undefined ? { reviewComment } : {}),
            },
            include: BOOKING_INCLUDE,
        });
    }
}

export const poolBookingRequestsService = new PoolBookingRequestsService();
```

- [ ] **Step 2: Verify it compiles**

Run:
```bash
cd backend
npx tsc --noEmit
```
Expected: no errors referencing `pool-booking-requests.service.ts`.

- [ ] **Step 3: Commit**

```bash
cd ..
git add backend/src/modules/pool-booking-requests
git commit -m "feat: add pool booking requests service layer"
```

---

### Task 3: Backend controller + routes + mount in `app.ts`

**Files:**
- Create: `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts`
- Create: `backend/src/modules/pool-booking-requests/pool-booking-requests.routes.ts`
- Modify: `backend/src/app.ts`

**Interfaces:**
- Consumes: `poolBookingRequestsService` from Task 2; `AuthRequest`, `authenticate`, `optionalAuth` from `../../middleware/auth.middleware`; `requireRole` from `../../middleware/rbac.middleware`.
- Produces: HTTP routes documented in Step 2 below, consumed by Task 5's frontend API client.

- [ ] **Step 1: Write the controller**

Create `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts`:

```ts
import { Response, Request } from 'express';
import { z } from 'zod';
import { poolBookingRequestsService } from './pool-booking-requests.service';
import { AuthRequest } from '../../middleware/auth.middleware';

const createSchema = z.object({
    stadiumId: z.string().min(1),
    fleetId: z.string().min(1),
    requesterName: z.string().min(1),
    requesterEmail: z.string().email(),
    requesterPhone: z.string().min(1),
    faUserId: z.string().min(1),
    bookingType: z.enum(['Single', 'Recurring']),
    startDate: z.string().min(1),
    endDate: z.string().min(1),
    startTime: z.string().regex(/^\d{2}:\d{2}$/, 'startTime must be HH:mm'),
    endTime: z.string().regex(/^\d{2}:\d{2}$/, 'endTime must be HH:mm'),
    purpose: z.string().optional(),
});

const approveSchema = z.object({
    comment: z.string().optional(),
});

const rejectSchema = z.object({
    comment: z.string().min(1, 'A comment is required when rejecting a booking'),
});

const amendSchema = z.object({
    fleetId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    startTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    endTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    faUserId: z.string().optional(),
    status: z.enum(['Pending', 'Approved', 'Rejected', 'Cancelled']).optional(),
    comment: z.string().optional(),
});

export class PoolBookingRequestsController {
    /** POST /api/v1/public/pool-booking-requests */
    static async createPublic(req: AuthRequest, res: Response) {
        try {
            const data = createSchema.parse(req.body);
            if (data.endDate < data.startDate) {
                res.status(400).json({ error: 'End date cannot be before start date' });
                return;
            }
            if (data.endTime <= data.startTime) {
                res.status(400).json({ error: 'End time must be after start time' });
                return;
            }
            const booking = await poolBookingRequestsService.create({ ...data, createdById: req.user?.userId });
            res.status(201).json({ message: 'Booking request submitted', data: booking });
        } catch (error) {
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Create pool booking request error:', error);
                res.status(500).json({ error: 'Failed to submit booking request' });
            }
        }
    }

    /** GET /api/v1/public/pool-booking-requests/:token */
    static async getByTokenPublic(req: Request, res: Response) {
        try {
            const booking = await poolBookingRequestsService.getByToken(req.params.token as string);
            if (!booking) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            res.json({ data: booking });
        } catch (error) {
            console.error('Get pool booking request by token error:', error);
            res.status(500).json({ error: 'Failed to fetch booking request' });
        }
    }

    /** GET /api/v1/public/pool-booking-requests/venues/:stadiumId/fas */
    static async getFAsPublic(req: Request, res: Response) {
        try {
            const fas = await poolBookingRequestsService.getFAsForStadium(req.params.stadiumId as string);
            res.json({ data: fas });
        } catch (error) {
            console.error('Get FAs for stadium error:', error);
            res.status(500).json({ error: 'Failed to fetch FAs' });
        }
    }

    /** GET /api/v1/public/pool-booking-requests/venues/:stadiumId/available-carts */
    static async getAvailableCartsPublic(req: Request, res: Response) {
        try {
            const { startDate, endDate, startTime, endTime, excludeBookingId } = req.query;
            if (!startDate || !endDate || !startTime || !endTime) {
                res.status(400).json({ error: 'startDate, endDate, startTime and endTime are required' });
                return;
            }
            const carts = await poolBookingRequestsService.getAvailableCarts(
                req.params.stadiumId as string,
                startDate as string,
                endDate as string,
                startTime as string,
                endTime as string,
                excludeBookingId as string | undefined,
            );
            res.json({ data: carts });
        } catch (error) {
            console.error('Get available carts error:', error);
            res.status(500).json({ error: 'Failed to fetch available carts' });
        }
    }

    /** GET /api/v1/pool-booking-requests */
    static async getAll(req: AuthRequest, res: Response) {
        try {
            const { status, stadiumId } = req.query;
            let filterStadiumId = stadiumId as string | undefined;
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }
            const data = await poolBookingRequestsService.getAll({ status: status as string, stadiumId: filterStadiumId });
            res.json({ data });
        } catch (error) {
            console.error('Get all pool booking requests error:', error);
            res.status(500).json({ error: 'Failed to fetch booking requests' });
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/approve */
    static async approve(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { comment } = approveSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const booking = await poolBookingRequestsService.approve(id, req.user!.userId, comment);
            res.json({ message: 'Booking approved', data: booking });
        } catch (error) {
            const err = error as Error & { status?: number; conflict?: unknown };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.status === 409) {
                res.status(409).json({ error: err.message, conflict: err.conflict });
            } else {
                console.error('Approve pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to approve booking' });
            }
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id/reject */
    static async reject(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const { comment } = rejectSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const booking = await poolBookingRequestsService.reject(id, req.user!.userId, comment);
            res.json({ message: 'Booking rejected', data: booking });
        } catch (error) {
            const err = error as Error;
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else {
                console.error('Reject pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to reject booking' });
            }
        }
    }

    /** PATCH /api/v1/pool-booking-requests/:id */
    static async amend(req: AuthRequest, res: Response) {
        try {
            const id = req.params.id as string;
            const data = amendSchema.parse(req.body);

            const existing = await poolBookingRequestsService.getById(id);
            if (!existing) {
                res.status(404).json({ error: 'Booking request not found' });
                return;
            }
            if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }

            const { comment, ...rest } = data;
            const booking = await poolBookingRequestsService.amend(id, rest, req.user!.userId, comment);
            res.json({ message: 'Booking updated', data: booking });
        } catch (error) {
            const err = error as Error & { status?: number; conflict?: unknown };
            if (error instanceof z.ZodError) {
                res.status(400).json({ error: 'Validation error', details: error.errors });
            } else if (err.status === 409) {
                res.status(409).json({ error: err.message, conflict: err.conflict });
            } else {
                console.error('Amend pool booking error:', error);
                res.status(400).json({ error: err.message || 'Failed to update booking' });
            }
        }
    }
}
```

- [ ] **Step 2: Write the routes**

Create `backend/src/modules/pool-booking-requests/pool-booking-requests.routes.ts`:

```ts
import { Router, Request, Response } from 'express';
import { PoolBookingRequestsController } from './pool-booking-requests.controller';
import { authenticate, optionalAuth } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// ============================================
// Public routes (no authentication required)
// optionalAuth attaches req.user when a valid token IS present, so a
// logged-in FA/Admin/SuperAdmin submitting from the in-app Bookings page
// still gets createdById recorded — without requiring a login to submit.
// ============================================

router.post('/public/pool-booking-requests', optionalAuth, (req: Request, res: Response) =>
    PoolBookingRequestsController.createPublic(req as any, res),
);
router.get('/public/pool-booking-requests/venues/:stadiumId/fas', (req: Request, res: Response) =>
    PoolBookingRequestsController.getFAsPublic(req, res),
);
router.get('/public/pool-booking-requests/venues/:stadiumId/available-carts', (req: Request, res: Response) =>
    PoolBookingRequestsController.getAvailableCartsPublic(req, res),
);
router.get('/public/pool-booking-requests/:token', (req: Request, res: Response) =>
    PoolBookingRequestsController.getByTokenPublic(req, res),
);

// ============================================
// Authenticated routes — review queue
// ============================================

router.use(authenticate);

router.get('/pool-booking-requests', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), (req: Request, res: Response) =>
    PoolBookingRequestsController.getAll(req as any, res),
);
router.patch('/pool-booking-requests/:id/approve', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.approve(req as any, res),
);
router.patch('/pool-booking-requests/:id/reject', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.reject(req as any, res),
);
router.patch('/pool-booking-requests/:id', requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.amend(req as any, res),
);

export default router;
```

- [ ] **Step 3: Mount the routes in `app.ts`**

In `backend/src/app.ts`, add the import near the other module route imports (after `import poolBookingsRoutes from './modules/pool-bookings/pool-bookings.routes';`):

```ts
import poolBookingRequestsRoutes from './modules/pool-booking-requests/pool-booking-requests.routes';
```

Add the mount line near the other `app.use('/api/v1', ...)` calls (after `app.use('/api/v1', requestRoutes);`):

```ts
app.use('/api/v1', poolBookingRequestsRoutes);
```

- [ ] **Step 4: Verify manually**

The backend dev server auto-reloads on save (`tsx watch`). Wait a couple seconds, then run:
```bash
curl -s http://localhost:3005/api/v1/public/pool-booking-requests/venues/nonexistent/fas
```
Expected: `{"data":[]}` (200, empty array — proves the route is mounted and reachable).

Get a real stadium id and confirm the FA list and available-carts endpoints return seeded data:
```bash
STADIUM_ID=$(curl -s http://localhost:3005/api/v1/public/stadiums | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0].id))")
curl -s "http://localhost:3005/api/v1/public/pool-booking-requests/venues/$STADIUM_ID/fas"
curl -s "http://localhost:3005/api/v1/public/pool-booking-requests/venues/$STADIUM_ID/available-carts?startDate=2026-09-10&endDate=2026-09-10&startTime=09:00&endTime=17:00"
```
Expected: FA list has entries (from the venue's seeded FA users), available-carts list has entries (from seeded pool carts, if any exist yet — see Task 11 if the list is empty because no carts are marked `isPool` yet).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/pool-booking-requests backend/src/app.ts
git commit -m "feat: add pool booking requests API routes"
```

---

### Task 4: Backend — venue operating-hours endpoints on Stadium

**Files:**
- Modify: `backend/src/modules/stadiums/stadiums.service.ts`
- Modify: `backend/src/modules/stadiums/stadiums.controller.ts`
- Modify: `backend/src/modules/stadiums/stadiums.routes.ts`

**Interfaces:**
- Produces: `GET /api/v1/stadiums/:id/pool-booking-hours` and `PATCH /api/v1/stadiums/:id/pool-booking-hours`, consumed by Task 5's frontend API client and Task 7's `BookingsPage`.

- [ ] **Step 1: Add service methods**

In `backend/src/modules/stadiums/stadiums.service.ts`, add these two methods inside the `StadiumsService` class (after `update`, before `bulkCreate`):

```ts
    async getPoolBookingHours(id: string) {
        const stadium = await this.prisma.stadium.findUnique({
            where: { id },
            select: { id: true, name: true, poolBookingStartTime: true, poolBookingEndTime: true },
        });
        if (!stadium) throw new Error('Stadium not found');
        return stadium;
    }

    async updatePoolBookingHours(id: string, data: { poolBookingStartTime: string | null; poolBookingEndTime: string | null }) {
        return this.prisma.stadium.update({
            where: { id },
            data,
            select: { id: true, name: true, poolBookingStartTime: true, poolBookingEndTime: true },
        });
    }
```

- [ ] **Step 2: Add controller methods**

In `backend/src/modules/stadiums/stadiums.controller.ts`, add these two methods inside `StadiumController` (after `update`, before `bulkCreate`):

```ts
    static async getPoolBookingHours(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseParam(req.params.id);
            if (!id) {
                res.status(400).json({ error: 'Stadium ID is required' });
                return;
            }
            const result = await stadiumsService.getPoolBookingHours(id);
            res.json(result);
        } catch (error) {
            res.status(404).json({ error: (error as Error).message });
        }
    }

    static async updatePoolBookingHours(req: AuthRequest, res: Response): Promise<void> {
        try {
            const id = parseParam(req.params.id);
            if (!id) {
                res.status(400).json({ error: 'Stadium ID is required' });
                return;
            }
            const { poolBookingStartTime, poolBookingEndTime } = req.body;
            const result = await stadiumsService.updatePoolBookingHours(id, {
                poolBookingStartTime: poolBookingStartTime ?? null,
                poolBookingEndTime: poolBookingEndTime ?? null,
            });
            res.json(result);
        } catch (error) {
            res.status(400).json({ error: (error as Error).message });
        }
    }
```

- [ ] **Step 3: Add routes with venue-scoped RBAC**

In `backend/src/modules/stadiums/stadiums.routes.ts`, add the import (after the existing `requireRole` import):

```ts
import { requireRole, checkStadiumAccess } from '../../middleware/rbac.middleware';
```

(This replaces the existing single-name import line — `import { requireRole } from '../../middleware/rbac.middleware';` becomes the two-name import above.)

Add the two new routes after the existing `router.put('/:id', ...)` block and before `router.delete('/:id', ...)`:

```ts
/**
 * @route   GET /api/v1/stadiums/:id/pool-booking-hours
 * @desc    Get a venue's pool-booking operating hours
 * @access  Protected (SuperAdmin: any venue; Admin: own venue only)
 */
router.get(
    '/:id/pool-booking-hours',
    authenticate,
    requireRole('SuperAdmin', 'Admin'),
    checkStadiumAccess((req) => req.params.id as string),
    StadiumController.getPoolBookingHours,
);

/**
 * @route   PATCH /api/v1/stadiums/:id/pool-booking-hours
 * @desc    Set a venue's pool-booking operating hours
 * @access  Protected (SuperAdmin: any venue; Admin: own venue only)
 */
router.patch(
    '/:id/pool-booking-hours',
    authenticate,
    requireRole('SuperAdmin', 'Admin'),
    checkStadiumAccess((req) => req.params.id as string),
    StadiumController.updatePoolBookingHours,
);
```

- [ ] **Step 4: Verify it compiles**

```bash
cd backend
npx tsc --noEmit
cd ..
```
Expected: no errors.

- [ ] **Step 5: Verify manually (requires a login token)**

```bash
TOKEN=$(curl -s -X POST http://localhost:3005/api/v1/auth/login -H "Content-Type: application/json" -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).accessToken))")
STADIUM_ID=$(curl -s http://localhost:3005/api/v1/public/stadiums | node -e "process.stdin.on('data',d=>console.log(JSON.parse(d).data[0].id))")
curl -s "http://localhost:3005/api/v1/stadiums/$STADIUM_ID/pool-booking-hours" -H "Authorization: Bearer $TOKEN"
curl -s -X PATCH "http://localhost:3005/api/v1/stadiums/$STADIUM_ID/pool-booking-hours" -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"poolBookingStartTime":"08:00","poolBookingEndTime":"20:00"}'
```
Expected: first call returns `{"id":...,"name":...,"poolBookingStartTime":null,"poolBookingEndTime":null}`; second returns the same shape with `"08:00"`/`"20:00"`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/stadiums
git commit -m "feat: add venue pool-booking operating hours endpoints"
```

---

### Task 5: Frontend API client additions

**Files:**
- Modify: `frontend/src/lib/api.ts`

**Interfaces:**
- Consumes: `apiClient` (existing axios instance with auto Bearer-token attachment and public-endpoint 401 handling already configured).
- Produces: `poolBookingRequestsApi` object and two new methods on `stadiumsApi`, consumed by Task 6 and Task 7's pages.

- [ ] **Step 1: Add `getPoolBookingHours`/`updatePoolBookingHours` to `stadiumsApi`**

In `frontend/src/lib/api.ts`, inside the existing `stadiumsApi` object (after `bulkCreate`, before the closing `};`), add:

```ts
    getPoolBookingHours: (id: string) =>
        apiClient.get(`/stadiums/${id}/pool-booking-hours`),
    updatePoolBookingHours: (id: string, data: { poolBookingStartTime: string | null; poolBookingEndTime: string | null }) =>
        apiClient.patch(`/stadiums/${id}/pool-booking-hours`, data),
```

- [ ] **Step 2: Add the `poolBookingRequestsApi` export**

Add this new export after the existing `poolBookingsApi` export, before `export default apiClient;`:

```ts
// Pool Booking Requests (public submission + admin/FA review — replaces the old
// no-approval immediate-checkout PoolBooking flow for new bookings)
export const poolBookingRequestsApi = {
    // Public endpoints — apiClient still attaches a Bearer token automatically
    // when the caller happens to be logged in, so createdById gets captured.
    getFAs: (stadiumId: string) =>
        apiClient.get(`/public/pool-booking-requests/venues/${stadiumId}/fas`),
    getAvailableCarts: (
        stadiumId: string,
        params: { startDate: string; endDate: string; startTime: string; endTime: string; excludeBookingId?: string },
    ) => apiClient.get(`/public/pool-booking-requests/venues/${stadiumId}/available-carts`, { params }),
    createPublic: (data: {
        stadiumId: string;
        fleetId: string;
        requesterName: string;
        requesterEmail: string;
        requesterPhone: string;
        faUserId: string;
        bookingType: 'Single' | 'Recurring';
        startDate: string;
        endDate: string;
        startTime: string;
        endTime: string;
        purpose?: string;
    }) => apiClient.post('/public/pool-booking-requests', data),
    getByTokenPublic: (token: string) =>
        apiClient.get(`/public/pool-booking-requests/${token}`),

    // Admin/FA/Observer endpoints (auth required)
    getAll: (params?: { status?: string; stadiumId?: string }) =>
        apiClient.get('/pool-booking-requests', { params }),
    approve: (id: string, comment?: string) =>
        apiClient.patch(`/pool-booking-requests/${id}/approve`, { comment }),
    reject: (id: string, comment: string) =>
        apiClient.patch(`/pool-booking-requests/${id}/reject`, { comment }),
    amend: (id: string, data: Record<string, unknown>) =>
        apiClient.patch(`/pool-booking-requests/${id}`, data),
};
```

- [ ] **Step 3: Verify it compiles**

```bash
cd frontend
npx tsc --noEmit
cd ..
```
Expected: no errors (the Vite dev server also hot-reloads and would show an overlay if this broke the build — check the browser tab is still showing the dashboard, not an error overlay).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat: add pool booking requests API client"
```

---

### Task 6: Frontend — public `PoolBookingRequestPage.tsx`

**Files:**
- Create: `frontend/src/pages/PoolBookingRequestPage.tsx`

**Interfaces:**
- Consumes: `poolBookingRequestsApi`, `publicDataApi`, `publicSettingsApi` from `@/lib/api`; shared UI components from `@/components/ui/*` (`Button`, `Input`, `Label`, `Select*`, `Card*`, `Textarea`, `Badge`); `useParams`/`useSearchParams` from `react-router-dom`.
- Produces: `PoolBookingRequestPage` component, wired into routes in Task 8 at `/book-pool` and `/book-pool/confirm/:token`.

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/PoolBookingRequestPage.tsx`:

```tsx
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { poolBookingRequestsApi, publicDataApi, publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Mail, Phone, MapPin, Car } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

interface Stadium {
    id: string;
    name: string;
    code: string;
}
interface FA {
    id: string;
    name: string;
}
interface AvailableCart {
    id: string;
    carNumber: string;
    carType: string;
}
interface Branding {
    tournamentName: string;
    logoUrl: string | null;
    headerUrl: string | null;
    footerUrl: string | null;
    footerText: string | null;
}

const statusColors: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Cancelled: 'bg-gray-100 text-gray-800',
};

function BookingConfirmationView({ token }: { token: string }) {
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        poolBookingRequestsApi
            .getByTokenPublic(token)
            .then((res) => setBooking(res.data.data))
            .catch((err) => setError(err.response?.data?.error || 'Failed to load booking'))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !booking) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold mb-2">Error</h2>
                        <p className="text-muted-foreground">{error || 'Booking not found'}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Booking Status</CardTitle>
                                <CardDescription>Submitted on {formatDate(booking.createdAt)}</CardDescription>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[booking.status] || 'bg-gray-100'}`}>
                                {booking.status}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Venue</p>
                                <p className="font-medium">{booking.stadium?.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Cart</p>
                                <p className="font-medium">{booking.fleet?.carNumber} ({booking.fleet?.carType})</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Dates</p>
                                <p className="font-medium">{booking.startDate}{booking.endDate !== booking.startDate ? ` – ${booking.endDate}` : ''}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Time</p>
                                <p className="font-medium">{booking.startTime} – {booking.endTime}</p>
                            </div>
                        </div>
                        {booking.reviewComment && (
                            <div>
                                <p className="text-sm text-muted-foreground">Review Comment</p>
                                <p className="font-medium">{booking.reviewComment}</p>
                            </div>
                        )}
                        {booking.reviewedBy && (
                            <div>
                                <p className="text-sm text-muted-foreground">Reviewed By</p>
                                <p className="font-medium">{booking.reviewedBy.name}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export function PoolBookingRequestPage() {
    const { token } = useParams<{ token: string }>();

    if (token) {
        return <BookingConfirmationView token={token} />;
    }

    const [loadingInitial, setLoadingInitial] = useState(true);
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [branding, setBranding] = useState<Branding>({ tournamentName: 'GCMS', logoUrl: null, headerUrl: null, footerUrl: null, footerText: null });

    const [fas, setFAs] = useState<FA[]>([]);
    const [availableCarts, setAvailableCarts] = useState<AvailableCart[]>([]);
    const [loadingCarts, setLoadingCarts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [requestToken, setRequestToken] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        stadiumId: '',
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        faUserId: '',
        bookingType: 'Single' as 'Single' | 'Recurring',
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
        fleetId: '',
        purpose: '',
    });

    useEffect(() => {
        Promise.all([publicDataApi.getStadiums(), publicSettingsApi.getBranding()])
            .then(([stadiumsRes, brandingRes]) => {
                setStadiums(stadiumsRes.data.data || []);
                setBranding(brandingRes.data);
            })
            .catch((err) => console.error('Failed to load initial data:', err))
            .finally(() => setLoadingInitial(false));
    }, []);

    useEffect(() => {
        if (!formData.stadiumId) {
            setFAs([]);
            return;
        }
        poolBookingRequestsApi
            .getFAs(formData.stadiumId)
            .then((res) => setFAs(res.data.data || []))
            .catch((err) => console.error('Failed to load FAs:', err));
    }, [formData.stadiumId]);

    useEffect(() => {
        const { stadiumId, startDate, endDate, startTime, endTime } = formData;
        const effectiveEndDate = formData.bookingType === 'Single' ? startDate : endDate;
        if (!stadiumId || !startDate || !effectiveEndDate || !startTime || !endTime) {
            setAvailableCarts([]);
            return;
        }
        if (endTime <= startTime) {
            setAvailableCarts([]);
            return;
        }
        setLoadingCarts(true);
        poolBookingRequestsApi
            .getAvailableCarts(stadiumId, { startDate, endDate: effectiveEndDate, startTime, endTime })
            .then((res) => setAvailableCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setLoadingCarts(false));
    }, [formData.stadiumId, formData.startDate, formData.endDate, formData.startTime, formData.endTime, formData.bookingType]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const effectiveEndDate = formData.bookingType === 'Single' ? formData.startDate : formData.endDate;
        if (!formData.fleetId) {
            setError('Please select a cart');
            return;
        }

        setSubmitting(true);
        try {
            const res = await poolBookingRequestsApi.createPublic({
                stadiumId: formData.stadiumId,
                fleetId: formData.fleetId,
                requesterName: formData.requesterName,
                requesterEmail: formData.requesterEmail,
                requesterPhone: formData.requesterPhone,
                faUserId: formData.faUserId,
                bookingType: formData.bookingType,
                startDate: formData.startDate,
                endDate: effectiveEndDate,
                startTime: formData.startTime,
                endTime: formData.endTime,
                purpose: formData.purpose || undefined,
            });
            setRequestToken(res.data.data.requestToken);
            setSubmitted(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit booking request');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingInitial) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (submitted) {
        const trackingUrl = `${window.location.origin}/book-pool/confirm/${requestToken}`;
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Booking Request Submitted!</h2>
                        <p className="text-muted-foreground mb-4">
                            Your pool booking request has been sent to the venue admin for approval.
                        </p>
                        <div className="bg-muted p-3 rounded-md">
                            <p className="text-sm text-muted-foreground mb-2">Track your booking:</p>
                            <a href={trackingUrl} className="text-primary hover:underline text-sm break-all">
                                {trackingUrl}
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {branding.headerUrl ? (
                <div className="w-full bg-white border-b">
                    <img src={branding.headerUrl} alt="Header" className="w-full max-h-32 object-contain" />
                </div>
            ) : (
                <div className="w-full bg-primary py-4 px-6 flex items-center gap-3">
                    {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" className="h-10 object-contain" />}
                    <span className="text-white font-bold text-xl">{branding.tournamentName}</span>
                </div>
            )}

            <div className="flex-1 py-8 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold">Book a Pool Cart</h1>
                        <p className="text-muted-foreground mt-2">Request a shared pool cart at a venue — subject to admin approval</p>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Booking Details</CardTitle>
                            <CardDescription>Select a venue to begin.</CardDescription>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="stadium" className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4" /> Venue *
                                    </Label>
                                    <Select
                                        value={formData.stadiumId}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, stadiumId: value, faUserId: '', fleetId: '' })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select venue" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stadiums.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>
                                                    {s.code} — {s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {formData.stadiumId && (
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="space-y-4">
                                            <h3 className="font-medium flex items-center gap-2">
                                                <Mail className="w-4 h-4" /> Contact Information
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="requesterName">Your Name *</Label>
                                                    <Input
                                                        id="requesterName"
                                                        value={formData.requesterName}
                                                        onChange={(e) => setFormData({ ...formData, requesterName: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="requesterEmail">Email Address *</Label>
                                                    <Input
                                                        id="requesterEmail"
                                                        type="email"
                                                        value={formData.requesterEmail}
                                                        onChange={(e) => setFormData({ ...formData, requesterEmail: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="requesterPhone" className="flex items-center gap-2">
                                                        <Phone className="w-3 h-3" /> Phone Number *
                                                    </Label>
                                                    <Input
                                                        id="requesterPhone"
                                                        value={formData.requesterPhone}
                                                        onChange={(e) => setFormData({ ...formData, requesterPhone: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="faUserId">FA *</Label>
                                                    <Select
                                                        value={formData.faUserId}
                                                        onValueChange={(value) => setFormData({ ...formData, faUserId: value })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={fas.length ? 'Select FA' : 'No FAs at this venue'} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {fas.map((fa) => (
                                                                <SelectItem key={fa.id} value={fa.id}>
                                                                    {fa.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-4">
                                            <h3 className="font-medium">Schedule</h3>
                                            <div className="space-y-2">
                                                <Label htmlFor="bookingType">Booking Type *</Label>
                                                <Select
                                                    value={formData.bookingType}
                                                    onValueChange={(value) => setFormData({ ...formData, bookingType: value as 'Single' | 'Recurring', fleetId: '' })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Single">Single day</SelectItem>
                                                        <SelectItem value="Recurring">Recurring (every day in a date range)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="startDate">{formData.bookingType === 'Single' ? 'Date *' : 'Start Date *'}</Label>
                                                    <Input
                                                        id="startDate"
                                                        type="date"
                                                        value={formData.startDate}
                                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value, fleetId: '' })}
                                                        required
                                                    />
                                                </div>
                                                {formData.bookingType === 'Recurring' && (
                                                    <div className="space-y-2">
                                                        <Label htmlFor="endDate">End Date *</Label>
                                                        <Input
                                                            id="endDate"
                                                            type="date"
                                                            value={formData.endDate}
                                                            min={formData.startDate || undefined}
                                                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value, fleetId: '' })}
                                                            required
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="startTime">Start Time *</Label>
                                                    <Input
                                                        id="startTime"
                                                        type="time"
                                                        value={formData.startTime}
                                                        onChange={(e) => setFormData({ ...formData, startTime: e.target.value, fleetId: '' })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="endTime">End Time *</Label>
                                                    <Input
                                                        id="endTime"
                                                        type="time"
                                                        value={formData.endTime}
                                                        onChange={(e) => setFormData({ ...formData, endTime: e.target.value, fleetId: '' })}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="fleetId" className="flex items-center gap-2">
                                                <Car className="w-4 h-4" /> Available Pool Cart *
                                            </Label>
                                            <Select
                                                value={formData.fleetId}
                                                onValueChange={(value) => setFormData({ ...formData, fleetId: value })}
                                                disabled={loadingCarts || availableCarts.length === 0}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue
                                                        placeholder={
                                                            loadingCarts
                                                                ? 'Checking availability...'
                                                                : availableCarts.length === 0
                                                                  ? 'Fill in the schedule above to see available carts'
                                                                  : 'Select a cart'
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableCarts.map((c) => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.carNumber} — {c.carType}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>

                                        <div className="space-y-2">
                                            <Label htmlFor="purpose">Purpose (Optional)</Label>
                                            <Textarea
                                                id="purpose"
                                                value={formData.purpose}
                                                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                                                rows={3}
                                            />
                                        </div>

                                        {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

                                        <Button type="submit" className="w-full" disabled={submitting}>
                                            {submitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...
                                                </>
                                            ) : (
                                                'Submit Booking Request'
                                            )}
                                        </Button>
                                    </form>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </div>
            </div>

            {(branding.footerUrl || branding.footerText) && (
                <div className="w-full mt-8 border-t bg-white py-4 px-6 text-center">
                    {branding.footerUrl && <img src={branding.footerUrl} alt="Footer" className="h-12 object-contain mx-auto mb-2" />}
                    {branding.footerText && <p className="text-sm text-muted-foreground">{branding.footerText}</p>}
                </div>
            )}
        </div>
    );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend
npx tsc --noEmit
cd ..
```
Expected: no errors (this component isn't wired into any route yet, so it won't be visible until Task 8 — `tsc --noEmit` is the check here, not the browser).

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/PoolBookingRequestPage.tsx
git commit -m "feat: add public pool booking request page"
```

---

### Task 7: Frontend — admin `BookingsPage.tsx`

**Files:**
- Create: `frontend/src/pages/BookingsPage.tsx`

**Interfaces:**
- Consumes: `poolBookingRequestsApi`, `stadiumsApi` from `@/lib/api`; `useAuthStore` from `@/stores/authStore`; shared UI components (`Table*`, `Dialog*`, `Badge`, `Select*`, `Button`, `Textarea`, `Input`, `Label`, `Card*`); `toast` from `sonner`; `formatDate` from `@/lib/dateUtils`.
- Produces: `BookingsPage` component, wired into routes in Task 8 at `/bookings`.

- [ ] **Step 1: Write the page**

Create `frontend/src/pages/BookingsPage.tsx`:

```tsx
import { useState, useEffect, useCallback } from 'react';
import { poolBookingRequestsApi, stadiumsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw, Edit2, Ban, AlertTriangle } from 'lucide-react';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface Booking {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    stadiumId: string;
    stadium: { id: string; name: string; code: string };
    fleetId: string;
    fleet: { id: string; carNumber: string; carType: string };
    faUser: { id: string; name: string };
    bookingType: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    purpose?: string;
    status: string;
    reviewComment?: string;
    reviewedBy?: { id: string; name: string };
    reviewedAt?: string;
    createdAt: string;
}

interface Stadium {
    id: string;
    name: string;
    code: string;
}

interface AvailableCart {
    id: string;
    carNumber: string;
    carType: string;
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    Pending: 'secondary',
    Approved: 'default',
    Rejected: 'destructive',
    Cancelled: 'outline',
};

export function BookingsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [stadiumFilter, setStadiumFilter] = useState('');

    const [selected, setSelected] = useState<Booking | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
    const [reviewComment, setReviewComment] = useState('');
    const [conflict, setConflict] = useState<Booking | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ startDate: '', endDate: '', startTime: '', endTime: '', fleetId: '' });
    const [editCarts, setEditCarts] = useState<AvailableCart[]>([]);
    const [editCartsLoading, setEditCartsLoading] = useState(false);

    const [hoursOpen, setHoursOpen] = useState(false);
    const [hoursStadiumId, setHoursStadiumId] = useState('');
    const [hoursForm, setHoursForm] = useState<{ poolBookingStartTime: string; poolBookingEndTime: string }>({
        poolBookingStartTime: '',
        poolBookingEndTime: '',
    });
    const [hoursLoading, setHoursLoading] = useState(false);

    const loadBookings = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (statusFilter) params.status = statusFilter;
            if (stadiumFilter) params.stadiumId = stadiumFilter;
            const res = await poolBookingRequestsApi.getAll(params);
            setBookings(res.data.data || []);
        } catch (err) {
            console.error('Failed to load bookings:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, stadiumFilter]);

    useEffect(() => {
        if (isSuperAdmin) {
            stadiumsApi
                .getAll()
                .then((res) => setStadiums(res.data.data || []))
                .catch((err) => console.error('Failed to load stadiums:', err));
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        loadBookings();
    }, [loadBookings]);

    const openReview = (booking: Booking, action: 'approve' | 'reject') => {
        setSelected(booking);
        setReviewAction(action);
        setReviewComment('');
        setConflict(null);
        setReviewOpen(true);
    };

    const handleReview = async () => {
        if (!selected) return;
        if (reviewAction === 'reject' && !reviewComment.trim()) {
            toast.error('A comment is required when rejecting a booking');
            return;
        }
        setActionLoading(true);
        setConflict(null);
        try {
            if (reviewAction === 'approve') {
                await poolBookingRequestsApi.approve(selected.id, reviewComment || undefined);
            } else {
                await poolBookingRequestsApi.reject(selected.id, reviewComment);
            }
            setReviewOpen(false);
            toast.success(reviewAction === 'approve' ? 'Booking approved' : 'Booking rejected');
            loadBookings();
        } catch (err: any) {
            if (err.response?.status === 409) {
                setConflict(err.response.data.conflict);
                toast.error('This cart is already booked for an overlapping time');
            } else {
                toast.error(err.response?.data?.error || 'Failed to process booking');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const openEdit = (booking: Booking) => {
        setSelected(booking);
        setEditForm({
            startDate: booking.startDate,
            endDate: booking.endDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            fleetId: booking.fleetId,
        });
        setEditOpen(true);
    };

    useEffect(() => {
        if (!editOpen || !selected) return;
        const { startDate, endDate, startTime, endTime } = editForm;
        if (!startDate || !endDate || !startTime || !endTime || endTime <= startTime) {
            setEditCarts([]);
            return;
        }
        setEditCartsLoading(true);
        poolBookingRequestsApi
            .getAvailableCarts(selected.stadiumId, { startDate, endDate, startTime, endTime, excludeBookingId: selected.id })
            .then((res) => setEditCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setEditCartsLoading(false));
    }, [editOpen, selected, editForm.startDate, editForm.endDate, editForm.startTime, editForm.endTime]);

    const handleSaveEdit = async () => {
        if (!selected) return;
        setActionLoading(true);
        try {
            await poolBookingRequestsApi.amend(selected.id, editForm);
            setEditOpen(false);
            toast.success('Booking updated');
            loadBookings();
        } catch (err: any) {
            if (err.response?.status === 409) {
                toast.error('This cart is already booked for an overlapping time — pick another cart or adjust the schedule');
            } else {
                toast.error(err.response?.data?.error || 'Failed to update booking');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async (booking: Booking) => {
        setActionLoading(true);
        try {
            await poolBookingRequestsApi.amend(booking.id, { status: 'Cancelled' });
            toast.success('Booking cancelled');
            loadBookings();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to cancel booking');
        } finally {
            setActionLoading(false);
        }
    };

    const openHours = async () => {
        const targetStadiumId = isAdmin ? user?.stadiumId || '' : hoursStadiumId;
        if (!targetStadiumId) {
            setHoursOpen(true);
            return;
        }
        setHoursStadiumId(targetStadiumId);
        setHoursLoading(true);
        setHoursOpen(true);
        try {
            const res = await stadiumsApi.getPoolBookingHours(targetStadiumId);
            setHoursForm({
                poolBookingStartTime: res.data.poolBookingStartTime || '',
                poolBookingEndTime: res.data.poolBookingEndTime || '',
            });
        } catch (err) {
            console.error('Failed to load operating hours:', err);
        } finally {
            setHoursLoading(false);
        }
    };

    const handleLoadHoursForStadium = async (stadiumId: string) => {
        setHoursStadiumId(stadiumId);
        setHoursLoading(true);
        try {
            const res = await stadiumsApi.getPoolBookingHours(stadiumId);
            setHoursForm({
                poolBookingStartTime: res.data.poolBookingStartTime || '',
                poolBookingEndTime: res.data.poolBookingEndTime || '',
            });
        } catch (err) {
            console.error('Failed to load operating hours:', err);
        } finally {
            setHoursLoading(false);
        }
    };

    const handleSaveHours = async () => {
        if (!hoursStadiumId) return;
        setHoursLoading(true);
        try {
            await stadiumsApi.updatePoolBookingHours(hoursStadiumId, {
                poolBookingStartTime: hoursForm.poolBookingStartTime || null,
                poolBookingEndTime: hoursForm.poolBookingEndTime || null,
            });
            toast.success('Operating hours saved');
            setHoursOpen(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save operating hours');
        } finally {
            setHoursLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Bookings</h1>
                    <p className="text-muted-foreground mt-1">Review and manage pool cart booking requests</p>
                </div>
                <div className="flex gap-2">
                    {canManage && (
                        <Button variant="outline" size="sm" onClick={openHours}>
                            Operating Hours
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={loadBookings}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Venue</Label>
                                <Select value={stadiumFilter || '__all__'} onValueChange={(v) => setStadiumFilter(v === '__all__' ? '' : v)}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="All venues" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All</SelectItem>
                                        {stadiums.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No bookings found</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Requester</TableHead>
                                    <TableHead>Venue / Cart</TableHead>
                                    <TableHead>FA</TableHead>
                                    <TableHead>Schedule</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bookings.map((b) => (
                                    <TableRow key={b.id}>
                                        <TableCell>
                                            <p className="font-medium">{b.requesterName}</p>
                                            <p className="text-sm text-muted-foreground">{b.requesterEmail}</p>
                                        </TableCell>
                                        <TableCell>
                                            <p>{b.stadium?.name}</p>
                                            <p className="text-sm text-muted-foreground">{b.fleet?.carNumber} ({b.fleet?.carType})</p>
                                        </TableCell>
                                        <TableCell>{b.faUser?.name}</TableCell>
                                        <TableCell>
                                            <p className="text-sm">{b.startDate}{b.endDate !== b.startDate ? ` – ${b.endDate}` : ''}</p>
                                            <p className="text-sm text-muted-foreground">{b.startTime} – {b.endTime}</p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariants[b.status] || 'outline'}>{b.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {b.status === 'Pending' && canManage && (
                                                    <>
                                                        <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700" onClick={() => openReview(b, 'approve')}>
                                                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                                                        </Button>
                                                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => openReview(b, 'reject')}>
                                                            <XCircle className="w-4 h-4 mr-1" /> Reject
                                                        </Button>
                                                    </>
                                                )}
                                                {(b.status === 'Pending' || b.status === 'Approved') && canManage && (
                                                    <>
                                                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)} title="Edit">
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleCancel(b)} title="Cancel" disabled={actionLoading}>
                                                            <Ban className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{reviewAction === 'approve' ? 'Approve Booking' : 'Reject Booking'}</DialogTitle>
                        <DialogDescription>
                            {selected && (
                                <span>
                                    Booking from <strong>{selected.requesterName}</strong> for <strong>{selected.fleet?.carNumber}</strong> at{' '}
                                    <strong>{selected.stadium?.name}</strong>
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {conflict && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm space-y-1">
                                <div className="flex items-center gap-2 text-amber-800 font-medium">
                                    <AlertTriangle className="w-4 h-4" /> Conflicting approved booking
                                </div>
                                <p>
                                    <strong>{conflict.requesterName}</strong> already has this cart approved for{' '}
                                    {conflict.startDate}{conflict.endDate !== conflict.startDate ? ` – ${conflict.endDate}` : ''}, {conflict.startTime}–{conflict.endTime}.
                                </p>
                                <p className="text-amber-700">Edit or cancel that booking first, then retry.</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Comment {reviewAction === 'reject' ? '(required)' : '(optional)'}</Label>
                            <Textarea
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder={reviewAction === 'approve' ? 'Any notes for the requester...' : 'Reason for rejection...'}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleReview}
                            disabled={actionLoading}
                            className={reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {reviewAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Booking</DialogTitle>
                        <DialogDescription>Adjust the schedule or reassign the cart to resolve a conflict.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Start Time</Label>
                                <Input type="time" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Time</Label>
                                <Input type="time" value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value, fleetId: '' })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Cart</Label>
                            <Select value={editForm.fleetId} onValueChange={(v) => setEditForm({ ...editForm, fleetId: v })} disabled={editCartsLoading}>
                                <SelectTrigger>
                                    <SelectValue placeholder={editCartsLoading ? 'Checking availability...' : 'Select a cart'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {editCarts.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.carNumber} — {c.carType}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Operating Hours Dialog */}
            <Dialog open={hoursOpen} onOpenChange={setHoursOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Pool Booking Operating Hours</DialogTitle>
                        <DialogDescription>
                            Requests outside this daily window will be rejected by the form. Leave blank for no restriction.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Venue</Label>
                                <Select value={hoursStadiumId} onValueChange={handleLoadHoursForStadium}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select venue" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stadiums.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {hoursStadiumId && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Time</Label>
                                    <Input
                                        type="time"
                                        value={hoursForm.poolBookingStartTime}
                                        onChange={(e) => setHoursForm({ ...hoursForm, poolBookingStartTime: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Time</Label>
                                    <Input
                                        type="time"
                                        value={hoursForm.poolBookingEndTime}
                                        onChange={(e) => setHoursForm({ ...hoursForm, poolBookingEndTime: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHoursOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={handleSaveHours} disabled={hoursLoading || !hoursStadiumId}>
                            {hoursLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd frontend
npx tsc --noEmit
cd ..
```
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/BookingsPage.tsx
git commit -m "feat: add admin bookings review page"
```

---

### Task 8: Wire routes and nav; remove the old immediate-checkout page

**Files:**
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/layout/MainLayout.tsx`
- Delete: `frontend/src/pages/PoolBookingPage.tsx`

**Interfaces:**
- Consumes: `PoolBookingRequestPage` (Task 6), `BookingsPage` (Task 7).
- Produces: live routes `/book-pool`, `/book-pool/confirm/:token`, `/bookings`; nav item "Bookings".

- [ ] **Step 1: Update `App.tsx`**

In `frontend/src/App.tsx`, replace the `PoolBookingPage` lazy import line:

```ts
const PoolBookingPage = lazy(() => import('@/pages/PoolBookingPage').then(m => ({ default: m.PoolBookingPage })));
```

with:

```ts
const PoolBookingRequestPage = lazy(() => import('@/pages/PoolBookingRequestPage').then(m => ({ default: m.PoolBookingRequestPage })));
const BookingsPage = lazy(() => import('@/pages/BookingsPage').then(m => ({ default: m.BookingsPage })));
```

Add the two public routes next to the existing `/request` public routes:

```tsx
<Route path="/request" element={<PublicRequestPage />} />
<Route path="/request/confirm/:token" element={<PublicRequestPage />} />
<Route path="/book-pool" element={<PoolBookingRequestPage />} />
<Route path="/book-pool/confirm/:token" element={<PoolBookingRequestPage />} />
```

Replace the protected `/pool-booking` route:

```tsx
<Route path="/pool-booking" element={<PoolBookingPage />} />
```

with:

```tsx
<Route path="/bookings" element={<PageGuard pageKey="bookings"><BookingsPage /></PageGuard>} />
```

- [ ] **Step 2: Update `MainLayout.tsx` nav**

In `frontend/src/components/layout/MainLayout.tsx`, replace the nav item:

```ts
{ name: 'Pool Booking', href: '/pool-booking', icon: Layers, roles: ['SuperAdmin', 'Admin', 'FA', 'Observer'], pageKey: null },
```

with:

```ts
{ name: 'Bookings', href: '/bookings', icon: Layers, roles: ['SuperAdmin', 'Admin', 'FA', 'Observer'], pageKey: 'bookings' },
```

- [ ] **Step 3: Delete the old page**

```bash
rm "frontend/src/pages/PoolBookingPage.tsx"
```

- [ ] **Step 4: Verify it compiles**

```bash
cd frontend
npx tsc --noEmit
cd ..
```
Expected: no errors (confirms nothing else referenced `PoolBookingPage`, matching the earlier grep that found only `App.tsx` importing it).

- [ ] **Step 5: Verify in the browser**

Open `http://localhost:3000/book-pool` — the venue-selection form should load. Log in as `superadmin@gcms.com` / `Admin@2024!` at `http://localhost:3000/login`, then confirm the sidebar shows **Bookings** (in place of the old **Pool Booking**) linking to `/bookings`, and the page loads without a console error.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/App.tsx frontend/src/components/layout/MainLayout.tsx
git rm frontend/src/pages/PoolBookingPage.tsx
git commit -m "feat: wire up bookings routes/nav, remove old immediate-checkout page"
```

---

### Task 9: Login page — MS Authenticator placeholder + new links

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Produces: updated `LoginPage` UI. No new exports/props — this is a self-contained page component.

- [ ] **Step 1: Add the placeholder button and two links below Sign In**

In `frontend/src/pages/LoginPage.tsx`, add an import for `toast` and an icon, alongside the existing imports:

```tsx
import { toast } from 'sonner';
```

Change the `Loader2` import line:
```tsx
import { Loader2 } from 'lucide-react';
```
to:
```tsx
import { Loader2, ShieldCheck } from 'lucide-react';
```

Replace the closing of the `<form>` block — currently:

```tsx
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                        </Button>
                    </form>
                </CardContent>
```

with:

```tsx
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                        </Button>
                    </form>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-3"
                        onClick={() => toast.info('Coming soon — Microsoft sign-in for @sc.qa accounts.')}
                    >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Sign in with Microsoft Authenticator
                    </Button>

                    <div className="mt-4 flex flex-col items-center gap-2 text-sm">
                        <Link to="/request" className="text-primary hover:underline font-medium">
                            Submit a Request
                        </Link>
                        <Link to="/book-pool" className="text-primary hover:underline font-medium">
                            Bookings
                        </Link>
                    </div>
                </CardContent>
```

(`Link` is already imported at the top of this file from `react-router-dom`, so no new import is needed for the two links.)

- [ ] **Step 2: Verify it compiles and renders**

```bash
cd frontend
npx tsc --noEmit
cd ..
```
Then open `http://localhost:3000/login` in the browser. Expected: below the Sign In button, an outlined "Sign in with Microsoft Authenticator" button, then "Submit a Request" and "Bookings" links stacked below it. Clicking the Microsoft button shows a toast: "Coming soon — Microsoft sign-in for @sc.qa accounts." Clicking "Submit a Request" navigates to `/request`; clicking "Bookings" navigates to `/book-pool`.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: add MS auth placeholder and request/booking links to login page"
```

---

### Task 10: "SC - GCMS" branding

**Files:**
- Modify: `backend/src/modules/settings/settings.service.ts`
- Create (temporary, deleted at end of task): `backend/prisma/_update_branding.ts`

**Interfaces:**
- Produces: updated default tournament name for fresh installs, and an updated value in the already-seeded local `SystemSettings` row so the running app shows it immediately.

- [ ] **Step 1: Update the hardcoded default**

In `backend/src/modules/settings/settings.service.ts`, in the `get()` method, change:

```ts
            settings = await prisma.systemSettings.create({
                data: { tournamentName: 'Golf Cart Management System' },
            });
```

to:

```ts
            settings = await prisma.systemSettings.create({
                data: { tournamentName: 'SC - GCMS' },
            });
```

- [ ] **Step 2: Update the already-existing local settings row**

The local dev database already has a `SystemSettings` row (auto-created earlier this session), so the Step 1 default won't apply to it. Update it directly:

Create `backend/prisma/_update_branding.ts`:

```ts
import { prisma } from '../src/config/database';

async function main() {
    const existing = await prisma.systemSettings.findFirst();
    if (!existing) {
        await prisma.systemSettings.create({ data: { tournamentName: 'SC - GCMS' } });
        console.log('Created settings with tournamentName "SC - GCMS"');
        return;
    }
    await prisma.systemSettings.update({
        where: { id: existing.id },
        data: { tournamentName: 'SC - GCMS' },
    });
    console.log('Updated tournamentName to "SC - GCMS"');
}

main()
    .catch((e) => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
```

Run it:
```bash
cd backend
npx tsx prisma/_update_branding.ts
```
Expected output: `Updated tournamentName to "SC - GCMS"`.

Delete the one-off script (it did its job; it's not part of the seed pipeline):
```bash
rm prisma/_update_branding.ts
cd ..
```

- [ ] **Step 3: Verify in the browser**

Open `http://localhost:3000/login` (hard refresh if it was already open). Expected: the card title now reads "SC - GCMS" and the subtitle below it reads "Golf Car Management System" (unchanged — it was already correct).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.service.ts
git commit -m "feat: update default tournament branding to SC - GCMS"
```

(The one-off `_update_branding.ts` script is not committed — it was deleted in Step 2 after running once.)

---

### Task 11: Dummy data for the new booking system

**Files:**
- Modify: `backend/prisma/seed-dummy.ts`

**Interfaces:**
- Consumes: `poolBookingRequestsService`-equivalent logic inlined here (this file already imports `prisma` directly, matching its existing style — no need to import the service).
- Produces: a handful of `PoolBookingRequest` rows (mixed statuses) across venues that already have pool carts, so the new `/bookings` page and `/book-pool` availability list aren't empty on first look.

- [ ] **Step 1: Add a pool-booking-requests section to the dummy seed**

Open `backend/prisma/seed-dummy.ts`. This file already computes `allFleet` (all seeded fleet carts) and `faUsersByStadium` (FA users per stadium) earlier in `main()`. Add a new section after the existing "Announcement" section and before the final `console.log('\n🎉 Dummy data seeding complete!')` block:

```ts
  // ── Pool booking requests (demo) ────────────────────────────────────────────
  let bookingCount = 0;
  const poolCartsForBooking = allFleet.filter((f) => f.carNumber.endsWith('-GC-06'));
  const bookingStatuses = ['Pending', 'Approved', 'Rejected'];

  for (const [idx, fleet] of poolCartsForBooking.entries()) {
    const faUsers = faUsersByStadium[fleet.stadiumId];
    const fa = faUsers?.[0];
    if (!fa) continue;

    const requestToken = `demo-booking-${fleet.stadiumId}-${idx}`;
    const existing = await prisma.poolBookingRequest.findUnique({ where: { requestToken } });
    if (existing) continue;

    const status = pick(bookingStatuses, idx);
    const startDate = '2026-09-15';
    const isReviewed = status !== 'Pending';

    await prisma.poolBookingRequest.create({
      data: {
        stadiumId: fleet.stadiumId,
        fleetId: fleet.id,
        requesterName: `Demo Booker ${idx + 1}`,
        requesterEmail: `booker${idx + 1}@example.com`,
        requesterPhone: `+974 5700${1000 + idx}`,
        faUserId: fa.id,
        bookingType: 'Single',
        startDate,
        endDate: startDate,
        startTime: '09:00',
        endTime: '13:00',
        purpose: 'Demo pool booking request for local testing.',
        requestToken,
        status,
        reviewedById: isReviewed ? fa.id : null,
        reviewedAt: isReviewed ? new Date() : null,
        reviewComment: status === 'Rejected' ? 'Cart needed for maintenance that day.' : status === 'Approved' ? 'Approved — enjoy.' : null,
      },
    });
    bookingCount++;
  }
  console.log(`✅ PoolBookingRequests: ${bookingCount} records created`);
```

Note: `reviewedById` uses `fa.id` here purely as a placeholder reviewer for demo data — in real usage only Admin/SuperAdmin review bookings, but the seed script doesn't have a convenient Admin reference in scope at this point in the file, and this field is never used for permission checks (only `reviewedById`'s *display name* is shown), so it's fine for demo purposes.

- [ ] **Step 2: Run the dummy seed again**

```bash
cd backend
npx tsx prisma/seed-dummy.ts
cd ..
```
Expected: prior sections print "already ready" / unchanged (idempotent — they use `upsert` or existence checks), and the new line prints e.g. `✅ PoolBookingRequests: 8 records created` (one per venue with a `-GC-06` pool cart).

- [ ] **Step 3: Verify in the browser**

Log in as `superadmin@gcms.com`, go to `/bookings`. Expected: a table with ~8 rows spanning Pending/Approved/Rejected statuses across venues, each showing a requester, venue/cart, FA, schedule, and status badge. Pending rows show Approve/Reject buttons.

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/seed-dummy.ts
git commit -m "feat: seed demo pool booking requests"
```

---

### Task 12: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Verify the public submission flow end-to-end**

In the browser, go to `http://localhost:3000/book-pool` (logged out, or in an incognito window to be sure). Pick a venue, fill in name/email/phone, pick an FA, choose "Single", pick a date a few days out, pick a start/end time (e.g. 10:00–14:00), confirm at least one available cart appears in the cart dropdown (if none appear, check that venue has a cart with `isPool: true` and no conflicting `Approved` booking in that window — the `-GC-06` cart per venue from earlier dummy-data seeding should qualify), select it, optionally add a purpose, and submit. Expected: a confirmation screen with a trackable link like `http://localhost:3000/book-pool/confirm/<token>`. Open that link directly (e.g. paste it in a new tab) and confirm it shows `Status: Pending`.

- [ ] **Step 2: Verify the approval flow and conflict prevention**

Log in as `superadmin@gcms.com` / `Admin@2024!`, go to `/bookings`, find the booking just submitted (status Pending), click **Approve**, add an optional comment, confirm. Expected: toast "Booking approved", row now shows `Approved`. Reload the public confirmation link from Step 1 — it should now show `Status: Approved` and the review comment if one was entered.

Now submit a *second* public booking at `/book-pool` for the **same venue, same cart** (pick the same venue; if the cart dropdown still lists that cart because your second request's time window doesn't overlap, deliberately pick the exact same date/time window as Step 1 — you may need to inspect the network response or just reuse the same date/time to force an overlap) — actually the simplest reliable check: go to `/bookings`, click **Edit** on a *different* Pending booking for the same venue, set its cart, dates and time to exactly match the now-Approved booking from Step 1, save (this bypasses the availability pre-filter and lets you test the hard server-side conflict check on **Approve**), then click **Approve** on it. Expected: a 409 response — the dialog shows a yellow "Conflicting approved booking" panel naming the other requester and its schedule, and the booking is NOT approved.

- [ ] **Step 2: Verify rejection requires a comment**

Pick any other Pending booking, click **Reject**, leave the comment blank, click Reject. Expected: a toast error "A comment is required when rejecting a booking" and the dialog stays open. Fill in a comment and confirm — expected: toast "Booking rejected", row shows `Rejected`.

- [ ] **Step 3: Verify RBAC on the review actions**

Log out, log in as an Admin-scoped-to-one-venue account (e.g. `admin.lus@gcms.com` / `Admin@2024!` from the earlier dummy-data seeding). Go to `/bookings`. Expected: only bookings for that Admin's own venue are listed (no venue filter dropdown, since that's SuperAdmin-only). Log in as an FA account (e.g. `fa1.lus@gcms.com` / `FA@2024!`). Go to `/bookings`. Expected: the page loads (list view), but no Approve/Reject/Edit/Cancel buttons appear on any row — matches "FA can submit and view, cannot approve/reject" from the spec.

- [ ] **Step 4: Verify the login page**

Log out. At `http://localhost:3000/login`: confirm the title reads "SC - GCMS", subtitle "Golf Car Management System", a "Sign in with Microsoft Authenticator" button below Sign In that shows a toast on click, and "Submit a Request" / "Bookings" links that navigate to `/request` and `/book-pool` respectively.

- [ ] **Step 5: Final check — nothing else broke**

Click through the main nav as SuperAdmin (Dashboard, Fleet, Handover Management, Bookings, Maintenance, Requests, Departments, Stadiums, Reports, Notifications, Users, Settings) and confirm each page still loads without a console error or blank screen — this catches any accidental breakage from the nav-item rename or route changes in Task 8.

No commit for this task — it's verification only. If any step surfaces a bug, fix it in the relevant task's files and amend that task's commit (or add a small follow-up commit), then re-run the failed verification step.
