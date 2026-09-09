# Phase 2 — Pool Car Visibility & Bookings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make pool cars and their bookings visible and manageable — a Pool Cars section in Fleet Management, a reworked Bookings page with Available / Active-&-Overdue / Upcoming panels and a return action, downloadable booking history, and a pool-bookings widget on the Admin/SuperAdmin dashboard.

**Architecture:** The live booking entity is `PoolBookingRequest` (not the deprecated `PoolBooking`). We add a return lifecycle to it (`Completed` status + `returnedAt`/`returnedById`) and a pure `deriveBookingState()` function that maps a booking + "now" to `Upcoming | Active | Overdue | Completed | Pending | Rejected | Cancelled`. All read endpoints reuse Phase 1's `resolveStadiumScope`. A new shared `pdf.service.ts` (the spec's §4 cross-cutting piece) is introduced here for the history download and reused by Phases 3–6.

**Tech Stack:** TypeScript, Express, Prisma (SQLite dev / PostgreSQL prod later), pdfkit, exceljs, React, Vite, Tailwind, Radix Tabs, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` — Phase 2 is §6 (see §6.0 for the model correction); cross-cutting PDF service is §4; NFRs are §2a.

## Global Constraints

- **Roles:** `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`.
- **Venue scoping:** always via `resolveStadiumScope(req.user, req.query.stadiumId)` from `backend/src/modules/reports/reports.scope.ts`. Admin/FA are locked to their own venue; a client `stadiumId` is ignored for them. `'__none__'` sentinel ⇒ empty result.
- **Booking states** (derived, never stored) for an `Approved`, not-returned `PoolBookingRequest`: `Upcoming` (now < window start), `Active` (now within window), `Overdue` (now > window end). `returnedAt != null` ⇒ `Completed`. Other stored statuses pass through as `Pending` / `Rejected` / `Cancelled`.
- **Dates/times:** `PoolBookingRequest` stores `startDate`/`endDate` as `"YYYY-MM-DD"` and `startTime`/`endTime` as `"HH:mm"`. Compare by building `Date` from `\`${date}T${time}:00\``; treat as server-local (a timezone-correct comparison is out of scope until Phase 7 wires `SystemSettings.timezone`).
- **Responsive:** verify every changed page at 375 / 768 / 1280 px; tables scroll inside their own container or become stacked cards on phone; no horizontal body scroll at 320px.
- **Bug-free:** `npx tsc --noEmit` clean for touched files in both `backend/` and `frontend/`; backend `npm test` green; every new endpoint has a typed JSON error path that never leaks a stack trace.
- **Commits:** one per task, conventional-commit, footer:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (:3005, tsx watch), frontend `cd frontend && npm run dev` (:3000). Logins: `superadmin@gcms.com` / `Admin@2024!`; `admin@gcms.com` / `Admin@2024!` (Admin @ Al Bayet).
- **Lint note:** backend has no eslint config; frontend eslint is broken (ESLint 9, no flat config) — both are Phase 7 fixes. `tsc --noEmit` is the gate for this plan.

---

## File Structure

**Created:**
- `backend/src/modules/pool-booking-requests/booking-state.ts` — `deriveBookingState()` + types.
- `backend/src/modules/pool-booking-requests/booking-state.test.ts` — unit tests.
- `backend/src/services/pdf.service.ts` — shared PDF builder (header/footer/reference) + `bookingHistoryPdf()`.
- `backend/prisma/migrations/<ts>_add_pool_booking_return/migration.sql` — generated.

**Modified:**
- `backend/prisma/schema.prisma` — `PoolBookingRequest`: `returnedAt`, `returnedById`, `returnedBy` relation; `User` inverse relation; status comment gains `Completed`.
- `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts` — `BOOKING_INCLUDE` gains `faUser.accreditationNumber` + `returnedBy`; `getAll` returns `derivedState`; new `markReturned()`, `getHistory()`.
- `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts` — `resolveStadiumScope`; `return` + `history` handlers.
- `backend/src/modules/pool-booking-requests/pool-booking-requests.routes.ts` — `PATCH /pool-booking-requests/:id/return`, `GET /pool-booking-requests/history`, `GET /pool-booking-requests/history/export`.
- `backend/src/modules/pool-bookings/pool-bookings.controller.ts` — inline `role === 'Admin'` → `resolveStadiumScope`.
- `backend/src/modules/pool-bookings/pool-bookings.service.ts` — `getPoolFleet` attaches the current Approved-not-returned `PoolBookingRequest` per cart.
- `backend/src/modules/reports/reports.service.ts` — `getDashboardStats` returns `poolToday`.
- `frontend/src/lib/api.ts` — `poolBookingRequestsApi`: `markReturned`, `getHistory`, `exportHistory`; keep `getAll` params typed with `derivedState`.
- `frontend/src/pages/FleetManagementPage.tsx` — new "Pool Cars" tab.
- `frontend/src/pages/BookingsPage.tsx` — Available / Active-&-Overdue / Upcoming panels, row expand, Mark Returned, history Download.
- `frontend/src/pages/DashboardPage.tsx` — "Pool bookings today" card.

---

## Task 1: Schema — return lifecycle on `PoolBookingRequest`

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration (generated by prisma)

**Interfaces:**
- Consumes: nothing.
- Produces: `PoolBookingRequest.returnedAt: DateTime | null`, `PoolBookingRequest.returnedById: string | null`, `PoolBookingRequest.returnedBy: User | null`; `User.returnedPoolBookingRequests: PoolBookingRequest[]`.

- [ ] **Step 1: Edit the model**

In `backend/prisma/schema.prisma`, in `model PoolBookingRequest`, change the status comment and add fields after `reviewComment`:

```prisma
  status         String    @default("Pending") // Pending, Approved, Rejected, Cancelled, Completed
  reviewedById   String?
  reviewedBy     User?     @relation("PoolBookingRequestReviewer", fields: [reviewedById], references: [id])
  reviewedAt     DateTime?
  reviewComment  String?

  returnedAt     DateTime?
  returnedById   String?
  returnedBy     User?     @relation("PoolBookingRequestReturnedBy", fields: [returnedById], references: [id])
```

In `model User`, add next to the other pool-booking-request relations:

```prisma
  returnedPoolBookingRequests PoolBookingRequest[] @relation("PoolBookingRequestReturnedBy")
```

- [ ] **Step 2: Create the migration**

Run: `cd backend && npx prisma migrate dev --name add_pool_booking_return`
Expected: a new folder under `prisma/migrations/`, "Database schema is up to date", client regenerated.

- [ ] **Step 3: Verify the client has the field**

Run:
```bash
cd backend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();p.poolBookingRequest.findFirst({select:{id:true,returnedAt:true,returnedById:true}}).then(r=>{console.log('ok',r);process.exit(0)}).catch(e=>{console.error(e.message);process.exit(1)})"
```
Expected: prints `ok ...` (no "Unknown field" error).

- [ ] **Step 4: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): add return lifecycle (returnedAt/returnedById + Completed) to PoolBookingRequest"
```

---

## Task 2: `deriveBookingState()` pure function (TDD)

**Files:**
- Create: `backend/src/modules/pool-booking-requests/booking-state.ts`
- Test: `backend/src/modules/pool-booking-requests/booking-state.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type BookingDerivedState =
    | 'Pending' | 'Upcoming' | 'Active' | 'Overdue' | 'Completed' | 'Rejected' | 'Cancelled';

  export interface BookingWindow {
    status: string;                 // stored PoolBookingRequest.status
    startDate: string;              // "YYYY-MM-DD"
    endDate: string;                // "YYYY-MM-DD"
    startTime: string;              // "HH:mm"
    endTime: string;                // "HH:mm"
    returnedAt: Date | string | null;
  }

  export function deriveBookingState(b: BookingWindow, now: Date): BookingDerivedState;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/pool-booking-requests/booking-state.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveBookingState, BookingWindow } from './booking-state';

const base: BookingWindow = {
  status: 'Approved',
  startDate: '2026-06-10', endDate: '2026-06-10',
  startTime: '09:00', endTime: '17:00',
  returnedAt: null,
};
const at = (s: string) => new Date(s);

describe('deriveBookingState', () => {
  it('passes non-approved statuses straight through', () => {
    expect(deriveBookingState({ ...base, status: 'Pending' }, at('2026-06-10T10:00:00'))).toBe('Pending');
    expect(deriveBookingState({ ...base, status: 'Rejected' }, at('2026-06-10T10:00:00'))).toBe('Rejected');
    expect(deriveBookingState({ ...base, status: 'Cancelled' }, at('2026-06-10T10:00:00'))).toBe('Cancelled');
  });

  it('is Completed when returnedAt is set, whatever the clock says', () => {
    expect(deriveBookingState({ ...base, returnedAt: new Date() }, at('2026-06-10T10:00:00'))).toBe('Completed');
    expect(deriveBookingState({ ...base, status: 'Completed', returnedAt: '2026-06-10T12:00:00Z' }, at('2026-06-11T00:00:00'))).toBe('Completed');
  });

  it('is Upcoming before the window starts', () => {
    expect(deriveBookingState(base, at('2026-06-10T08:59:00'))).toBe('Upcoming');
    expect(deriveBookingState(base, at('2026-06-09T23:00:00'))).toBe('Upcoming');
  });

  it('is Active inside the window (inclusive of the bounds)', () => {
    expect(deriveBookingState(base, at('2026-06-10T09:00:00'))).toBe('Active');
    expect(deriveBookingState(base, at('2026-06-10T13:00:00'))).toBe('Active');
    expect(deriveBookingState(base, at('2026-06-10T17:00:00'))).toBe('Active');
  });

  it('is Overdue after the window ends and not returned', () => {
    expect(deriveBookingState(base, at('2026-06-10T17:01:00'))).toBe('Overdue');
    expect(deriveBookingState(base, at('2026-06-12T00:00:00'))).toBe('Overdue');
  });

  it('handles multi-day windows', () => {
    const multi = { ...base, startDate: '2026-06-10', endDate: '2026-06-14' };
    expect(deriveBookingState(multi, at('2026-06-12T03:00:00'))).toBe('Active');
    expect(deriveBookingState(multi, at('2026-06-14T17:30:00'))).toBe('Overdue');
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd backend && npx vitest run src/modules/pool-booking-requests/booking-state.test.ts`
Expected: FAIL — cannot find module `./booking-state`.

- [ ] **Step 3: Implement**

Create `backend/src/modules/pool-booking-requests/booking-state.ts`:

```ts
export type BookingDerivedState =
  | 'Pending' | 'Upcoming' | 'Active' | 'Overdue' | 'Completed' | 'Rejected' | 'Cancelled';

export interface BookingWindow {
  status: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  returnedAt: Date | string | null;
}

/** Build a Date from "YYYY-MM-DD" + "HH:mm", interpreted as server-local time. */
function combine(date: string, time: string): Date {
  return new Date(`${date}T${time}:00`);
}

export function deriveBookingState(b: BookingWindow, now: Date): BookingDerivedState {
  if (b.returnedAt) return 'Completed';
  if (b.status === 'Pending') return 'Pending';
  if (b.status === 'Rejected') return 'Rejected';
  if (b.status === 'Cancelled') return 'Cancelled';
  if (b.status === 'Completed') return 'Completed';
  // status === 'Approved' (or anything else treated as a live booking)
  const start = combine(b.startDate, b.startTime).getTime();
  const end = combine(b.endDate, b.endTime).getTime();
  const t = now.getTime();
  if (t < start) return 'Upcoming';
  if (t <= end) return 'Active';
  return 'Overdue';
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd backend && npx vitest run src/modules/pool-booking-requests/booking-state.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `cd backend && npm test && npx tsc --noEmit 2>&1 | grep booking-state || echo "no booking-state errors"`
Expected: all tests pass; no new tsc errors.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/pool-booking-requests/booking-state.ts backend/src/modules/pool-booking-requests/booking-state.test.ts
git commit -m "feat: deriveBookingState() — Upcoming/Active/Overdue/Completed from a booking window"
```

---

## Task 3: Backend — return endpoint, derivedState in list, venue scoping

**Files:**
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts`
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts`
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.routes.ts`
- Modify: `backend/src/modules/pool-bookings/pool-bookings.controller.ts`
- Modify: `backend/src/modules/pool-bookings/pool-bookings.service.ts`

**Interfaces:**
- Consumes: `deriveBookingState` (Task 2), `resolveStadiumScope` (Phase 1).
- Produces:
  - `poolBookingRequestsService.markReturned(id: string, userId: string): Promise<PoolBookingRequest>` — sets `returnedAt`, `returnedById`, `status = 'Completed'`; throws `Error('Only an approved booking can be returned')` if `status !== 'Approved'`.
  - `getAll(filters)` results each carry `derivedState: BookingDerivedState` and `faUser.accreditationNumber`.
  - New routes: `PATCH /api/v1/pool-booking-requests/:id/return` (SuperAdmin, Admin), returns the updated booking with `derivedState`.

- [ ] **Step 1: Extend `BOOKING_INCLUDE` and `getAll`**

In `pool-booking-requests.service.ts`:

```ts
const BOOKING_INCLUDE = {
    stadium: { select: { id: true, name: true, code: true } },
    fleet: { select: { id: true, carNumber: true, carType: true } },
    faUser: { select: { id: true, name: true, accreditationNumber: true, phone: true } },
    reviewedBy: { select: { id: true, name: true } },
    returnedBy: { select: { id: true, name: true } },
    createdByUser: { select: { id: true, name: true } },
};
```

Add the import at the top: `import { deriveBookingState } from './booking-state';`

Change `getAll` to decorate rows:

```ts
async getAll(filters: { status?: string; stadiumId?: string; derivedState?: string }) {
    const where: Record<string, unknown> = {};
    if (filters.status) where.status = filters.status;
    if (filters.stadiumId) where.stadiumId = filters.stadiumId;
    const rows = await prisma.poolBookingRequest.findMany({ where, include: BOOKING_INCLUDE, orderBy: { createdAt: 'desc' } });
    const now = new Date();
    const decorated = rows.map((r) => ({ ...r, derivedState: deriveBookingState(r, now) }));
    return filters.derivedState
        ? decorated.filter((r) => r.derivedState === filters.derivedState)
        : decorated;
}
```

- [ ] **Step 2: Add `markReturned`**

Add to `PoolBookingRequestsService`:

```ts
async markReturned(id: string, userId: string) {
    const existing = await prisma.poolBookingRequest.findUnique({ where: { id } });
    if (!existing) throw new Error('Booking request not found');
    if (existing.status !== 'Approved') throw new Error('Only an approved booking can be returned');
    const updated = await prisma.poolBookingRequest.update({
        where: { id },
        data: { status: 'Completed', returnedAt: new Date(), returnedById: userId },
        include: BOOKING_INCLUDE,
    });
    return { ...updated, derivedState: deriveBookingState(updated, new Date()) };
}
```

- [ ] **Step 3: Controller — scoping + return handler**

In `pool-booking-requests.controller.ts`, add `import { resolveStadiumScope } from '../reports/reports.scope';`. In `getAll`, replace any inline `req.user?.role === 'Admin'` stadium logic with:

```ts
const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
const rows = await poolBookingRequestsService.getAll({
    status: req.query.status as string | undefined,
    stadiumId,
    derivedState: req.query.derivedState as string | undefined,
});
res.json({ data: rows });
```

Add:

```ts
static async markReturned(req: AuthRequest, res: Response) {
    try {
        const updated = await poolBookingRequestsService.markReturned(req.params['id'] as string, req.user!.userId);
        // Admin may only return a booking at their own venue
        if (req.user?.role === 'Admin' && updated.stadiumId !== req.user.stadiumId) {
            res.status(403).json({ error: 'Access denied to this venue' });
            return;
        }
        res.json({ data: updated });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to mark returned' });
    }
}
```

(The venue check runs after the update returns the row so we know its stadium; because `markReturned` is idempotent-ish and only Admin/SuperAdmin reach it, this is acceptable. If you prefer, fetch `getById` first and check before mutating — do that instead if it is a small change.)

Prefer the pre-check version:

```ts
static async markReturned(req: AuthRequest, res: Response) {
    try {
        const id = req.params['id'] as string;
        const existing = await poolBookingRequestsService.getById(id);
        if (!existing) { res.status(404).json({ error: 'Booking request not found' }); return; }
        if (req.user?.role === 'Admin' && existing.stadiumId !== req.user.stadiumId) {
            res.status(403).json({ error: 'Access denied to this venue' }); return;
        }
        const updated = await poolBookingRequestsService.markReturned(id, req.user!.userId);
        res.json({ data: updated });
    } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to mark returned' });
    }
}
```

- [ ] **Step 4: Route**

In `pool-booking-requests.routes.ts`, add after the `reject` route:

```ts
router.patch('/pool-booking-requests/:id/return', authenticate, requireRole('SuperAdmin', 'Admin'), (req: Request, res: Response) =>
    PoolBookingRequestsController.markReturned(req as any, res),
);
```

- [ ] **Step 5: `pool-bookings.controller.ts` — use `resolveStadiumScope`**

Replace both `let stadiumId = req.query.stadiumId as string | undefined; if (req.user?.role === 'Admin') stadiumId = req.user.stadiumId;` blocks (in `getPoolFleet` and `getBookings`) with:

```ts
const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
```

Add the import: `import { resolveStadiumScope } from '../reports/reports.scope';`

- [ ] **Step 6: `pool-bookings.service.ts` — attach current booking to pool fleet**

Change `getPoolFleet` so each cart carries its current Approved, not-returned request:

```ts
async getPoolFleet(stadiumId?: string) {
    const where: any = { isPool: true };
    if (stadiumId) where.stadiumId = stadiumId;
    const carts = await prisma.fleet.findMany({
        where,
        include: {
            ...FLEET_INCLUDE,
            assignedUser: { select: { id: true, name: true, accreditationNumber: true } },
            poolBookingRequests: {
                where: { status: 'Approved', returnedAt: null },
                orderBy: { startDate: 'asc' },
                include: { faUser: { select: { id: true, name: true, accreditationNumber: true } } },
            },
        },
        orderBy: { carNumber: 'asc' },
    });
    const now = new Date();
    return carts.map((c) => {
        const current = c.poolBookingRequests.find((b) => {
            const s = deriveBookingState(b, now);
            return s === 'Active' || s === 'Overdue';
        }) || null;
        return {
            ...c,
            currentBooking: current
                ? { ...current, derivedState: deriveBookingState(current, now) }
                : null,
        };
    });
}
```

Add `import { deriveBookingState } from '../pool-booking-requests/booking-state';` at the top.

- [ ] **Step 7: Typecheck**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "pool-booking" || echo "no pool-booking errors"`
Expected: clean.

- [ ] **Step 8: Manual verification**

Start backend. Then:

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
# list bookings with derivedState
curl -s "localhost:3005/api/v1/pool-booking-requests" -H "Authorization: Bearer $SA" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)).data; d.slice(0,5).map(b=>({id:b.id,status:b.status,derivedState:b.derivedState,fa:b.faUser?.accreditationNumber}))'
# pick an Approved one and return it
ID=$(curl -s "localhost:3005/api/v1/pool-booking-requests?status=Approved" -H "Authorization: Bearer $SA" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)).data; (d[0]||{}).id || ""')
curl -s -X PATCH "localhost:3005/api/v1/pool-booking-requests/$ID/return" -H "Authorization: Bearer $SA" | head -c 300; echo
# confirm it is now Completed
curl -s "localhost:3005/api/v1/pool-booking-requests?status=Completed" -H "Authorization: Bearer $SA" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.length + " completed"'
```
Expected: list rows carry `derivedState` and `fa`; the PATCH returns the booking with `status:"Completed"` and `derivedState:"Completed"`; the Completed count increased by 1.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/pool-booking-requests backend/src/modules/pool-bookings
git commit -m "feat: pool booking return endpoint + derivedState on list; scope via resolveStadiumScope"
```

---

## Task 4: Backend — shared PDF service + booking history endpoint

**Files:**
- Create: `backend/src/services/pdf.service.ts`
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts` (add `getHistory`)
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts` (add `history`, `exportHistory`)
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.routes.ts`

**Interfaces:**
- Consumes: `pdfkit`, `exceljs`, `SystemSettings` (branding), `deriveBookingState`, `resolveStadiumScope`.
- Produces:
  ```ts
  // pdf.service.ts
  export interface PdfMeta { title: string; reference: string; subtitle?: string; }
  export function makeReference(prefix: string, id: string): string; // e.g. "BKH-2026-1A2B3C"
  export async function renderPdf(meta: PdfMeta, body: (doc: PDFKit.PDFDocument) => void): Promise<Buffer>;
  export async function bookingHistoryPdf(args: {
    rows: Array<Record<string, unknown>>; filterSummary: string; reference: string;
  }): Promise<Buffer>;

  // service
  poolBookingRequestsService.getHistory(filters): Promise<DecoratedBooking[]>
  ```

- [ ] **Step 1: Create `pdf.service.ts`**

```ts
import PDFDocument from 'pdfkit';
import { prisma } from '../config/database';

export interface PdfMeta {
  title: string;
  reference: string;
  subtitle?: string;
}

/** Human-readable document reference, e.g. BKH-2026-1A2B3C (last 6 of the id, upper). */
export function makeReference(prefix: string, id: string): string {
  const year = new Date().getFullYear();
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase();
  return `${prefix}-${year}-${tail}`;
}

async function loadBranding() {
  const s = await prisma.systemSettings.findFirst();
  return {
    tournamentName: s?.tournamentName ?? 'GCMS',
    footerText: s?.footerText ?? '',
  };
}

/**
 * Render a PDF with a common header (tournament name + title + reference) and a
 * footer (footer text + "Page X" + generated timestamp). `body` draws the content.
 */
export async function renderPdf(meta: PdfMeta, body: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  const brand = await loadBranding();
  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  const chunks: Buffer[] = [];
  doc.on('data', (c) => chunks.push(c as Buffer));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.fontSize(9).fillColor('#666').text(brand.tournamentName, { align: 'right' });
  doc.moveDown(0.3);
  doc.fontSize(18).fillColor('#000').font('Helvetica-Bold').text(meta.title);
  if (meta.subtitle) doc.fontSize(10).font('Helvetica').fillColor('#444').text(meta.subtitle);
  doc.fontSize(9).fillColor('#666').text(`Ref: ${meta.reference}    Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();
  doc.fillColor('#000').font('Helvetica');

  body(doc);

  const footer = brand.footerText ? `${brand.footerText}  ·  ` : '';
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fontSize(8).fillColor('#888').text(
      `${footer}Page ${i + 1} of ${range.count}`,
      40, doc.page.height - 30, { align: 'center', width: doc.page.width - 80 },
    );
  }

  doc.end();
  return done;
}

export async function bookingHistoryPdf(args: {
  rows: Array<Record<string, any>>;
  filterSummary: string;
  reference: string;
}): Promise<Buffer> {
  return renderPdf(
    { title: 'Pool Booking History', subtitle: args.filterSummary, reference: args.reference },
    (doc) => {
      if (args.rows.length === 0) {
        doc.text('No bookings match the selected filters.');
        return;
      }
      args.rows.forEach((r, idx) => {
        if (idx > 0) doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(11).text(`${r.fleet?.carNumber ?? '—'}  (${r.fleet?.carType ?? '—'})`);
        doc.font('Helvetica').fontSize(9).fillColor('#333');
        doc.text(`Venue: ${r.stadium?.name ?? '—'}    State: ${r.derivedState ?? r.status}`);
        doc.text(`Requester: ${r.requesterName}  ·  FA: ${r.faUser?.accreditationNumber ?? '—'}  ·  ${r.requesterPhone}  ·  ${r.requesterEmail}`);
        doc.text(`Type: ${r.bookingType}    Window: ${r.startDate} ${r.startTime} → ${r.endDate} ${r.endTime}`);
        if (r.returnedAt) doc.text(`Returned: ${new Date(r.returnedAt).toLocaleString()} by ${r.returnedBy?.name ?? '—'}`);
        doc.fillColor('#000');
      });
    },
  );
}
```

- [ ] **Step 2: Add `getHistory` to the service**

```ts
async getHistory(filters: {
    stadiumId?: string; fleetId?: string; status?: string; derivedState?: string;
    fromDate?: string; toDate?: string; q?: string;
}) {
    const where: Record<string, any> = {};
    if (filters.stadiumId) where.stadiumId = filters.stadiumId;
    if (filters.fleetId) where.fleetId = filters.fleetId;
    if (filters.status) where.status = filters.status;
    if (filters.fromDate) where.startDate = { ...(where.startDate || {}), gte: filters.fromDate };
    if (filters.toDate) where.startDate = { ...(where.startDate || {}), lte: filters.toDate };
    if (filters.q) {
        where.OR = [
            { requesterName: { contains: filters.q } },
            { requesterEmail: { contains: filters.q } },
            { requesterPhone: { contains: filters.q } },
        ];
    }
    const rows = await prisma.poolBookingRequest.findMany({ where, include: BOOKING_INCLUDE, orderBy: { startDate: 'desc' } });
    const now = new Date();
    const decorated = rows.map((r) => ({ ...r, derivedState: deriveBookingState(r, now) }));
    return filters.derivedState ? decorated.filter((r) => r.derivedState === filters.derivedState) : decorated;
}
```

- [ ] **Step 3: Controller handlers**

Add to `pool-booking-requests.controller.ts` (imports: `resolveStadiumScope`, `bookingHistoryPdf`, `makeReference` from `'../../services/pdf.service'`, `ExcelJS from 'exceljs'`):

```ts
static async history(req: AuthRequest, res: Response) {
    try {
        const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
        const rows = await poolBookingRequestsService.getHistory({
            stadiumId,
            fleetId: req.query.fleetId as string | undefined,
            status: req.query.status as string | undefined,
            derivedState: req.query.derivedState as string | undefined,
            fromDate: req.query.fromDate as string | undefined,
            toDate: req.query.toDate as string | undefined,
            q: req.query.q as string | undefined,
        });
        res.json({ data: rows });
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to load booking history' });
    }
}

static async exportHistory(req: AuthRequest, res: Response) {
    try {
        const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
        const format = (req.query.format as string) || 'pdf';
        const rows = await poolBookingRequestsService.getHistory({
            stadiumId,
            fleetId: req.query.fleetId as string | undefined,
            status: req.query.status as string | undefined,
            derivedState: req.query.derivedState as string | undefined,
            fromDate: req.query.fromDate as string | undefined,
            toDate: req.query.toDate as string | undefined,
            q: req.query.q as string | undefined,
        });
        const summaryParts = [
            stadiumId ? `venue=${stadiumId}` : 'all venues',
            req.query.fromDate ? `from ${req.query.fromDate}` : null,
            req.query.toDate ? `to ${req.query.toDate}` : null,
            req.query.status ? `status=${req.query.status}` : null,
        ].filter(Boolean).join('  ·  ');
        const reference = makeReference('BKH', rows[0]?.id ?? 'NONE00');

        if (format === 'xlsx') {
            const wb = new ExcelJS.Workbook();
            const ws = wb.addWorksheet('Booking History');
            ws.columns = [
                { header: 'Car', key: 'car', width: 14 }, { header: 'Type', key: 'type', width: 14 },
                { header: 'Venue', key: 'venue', width: 22 }, { header: 'State', key: 'state', width: 12 },
                { header: 'Requester', key: 'req', width: 22 }, { header: 'FA', key: 'fa', width: 12 },
                { header: 'Phone', key: 'phone', width: 16 }, { header: 'Email', key: 'email', width: 26 },
                { header: 'Booking type', key: 'btype', width: 12 },
                { header: 'From', key: 'from', width: 18 }, { header: 'To', key: 'to', width: 18 },
                { header: 'Returned At', key: 'ret', width: 20 },
            ];
            rows.forEach((r: any) => ws.addRow({
                car: r.fleet?.carNumber, type: r.fleet?.carType, venue: r.stadium?.name,
                state: r.derivedState, req: r.requesterName, fa: r.faUser?.accreditationNumber ?? '',
                phone: r.requesterPhone, email: r.requesterEmail, btype: r.bookingType,
                from: `${r.startDate} ${r.startTime}`, to: `${r.endDate} ${r.endTime}`,
                ret: r.returnedAt ? new Date(r.returnedAt).toLocaleString() : '',
            }));
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', `attachment; filename=booking_history_${reference}.xlsx`);
            await wb.xlsx.write(res);
            res.end();
            return;
        }

        const pdf = await bookingHistoryPdf({ rows, filterSummary: summaryParts || 'all bookings', reference });
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=booking_history_${reference}.pdf`);
        res.end(pdf);
    } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to export booking history' });
    }
}
```

- [ ] **Step 4: Routes**

In `pool-booking-requests.routes.ts` add (both authenticated, all review roles + Contracts/MaintenanceTeam for read):

```ts
router.get('/pool-booking-requests/history', authenticate, requireRole('SuperAdmin', 'Admin', 'Observer', 'FA', 'Contracts', 'MaintenanceTeam'), (req: Request, res: Response) =>
    PoolBookingRequestsController.history(req as any, res),
);
router.get('/pool-booking-requests/history/export', authenticate, requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), (req: Request, res: Response) =>
    PoolBookingRequestsController.exportHistory(req as any, res),
);
```

**Important:** these must be registered **before** the `router.patch('/pool-booking-requests/:id', ...)` amend route is fine (GET vs PATCH), but register them before any `GET '/pool-booking-requests/:something'` GET param route to avoid `/history` being captured as an `:id`. Check the file: the only GET is `/pool-booking-requests` (exact) — so order is safe, but place the two new GETs directly after it.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "pdf.service|pool-booking-requests" || echo clean`
Expected: clean.

- [ ] **Step 6: Manual verification**

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s "localhost:3005/api/v1/pool-booking-requests/history?status=Approved" -H "Authorization: Bearer $SA" | node -pe 'JSON.parse(require("fs").readFileSync(0)).data.length + " rows"'
curl -s "localhost:3005/api/v1/pool-booking-requests/history/export?format=pdf" -H "Authorization: Bearer $SA" -o /tmp/bk.pdf -w "%{http_code} %{content_type}\n"
file /tmp/bk.pdf   # expect: PDF document
curl -s "localhost:3005/api/v1/pool-booking-requests/history/export?format=xlsx" -H "Authorization: Bearer $SA" -o /tmp/bk.xlsx -w "%{http_code} %{content_type}\n"
```
Expected: history returns rows; the PDF response is `application/pdf`, `file` says "PDF document", opens in a viewer with the header/reference/footer; xlsx downloads.

- [ ] **Step 7: Commit**

```bash
git add backend/src/services/pdf.service.ts backend/src/modules/pool-booking-requests
git commit -m "feat: shared pdf.service + pool booking history endpoint (JSON + PDF/Excel export)"
```

---

## Task 5: Backend — `poolToday` on dashboard stats

**Files:**
- Modify: `backend/src/modules/reports/reports.service.ts` (`getDashboardStats`)

**Interfaces:**
- Consumes: `deriveBookingState`, Prisma.
- Produces: `getDashboardStats({ stadiumId })` result gains
  `poolToday: { bookings: number; available: number; booked: number; overdue: number }`.

- [ ] **Step 1: Add the computation**

In `reports.service.ts`, import `deriveBookingState` from `'../pool-booking-requests/booking-state'`. Inside `getDashboardStats`, after the existing queries, add:

```ts
const poolWhere: any = { isPool: true };
if (filters.stadiumId) poolWhere.stadiumId = filters.stadiumId;
const [poolCarts, liveBookings] = await Promise.all([
    this.prisma.fleet.count({ where: poolWhere }),
    this.prisma.poolBookingRequest.findMany({
        where: {
            status: 'Approved',
            returnedAt: null,
            ...(filters.stadiumId ? { stadiumId: filters.stadiumId } : {}),
        },
        select: { startDate: true, endDate: true, startTime: true, endTime: true, status: true, returnedAt: true },
    }),
]);
const now = new Date();
const todayStr = now.toISOString().slice(0, 10);
let booked = 0, overdue = 0, bookingsToday = 0;
for (const b of liveBookings) {
    const s = deriveBookingState(b as any, now);
    if (s === 'Active') booked++;
    if (s === 'Overdue') overdue++;
    if (b.startDate <= todayStr && b.endDate >= todayStr) bookingsToday++;
}
const poolToday = {
    bookings: bookingsToday,
    available: Math.max(0, poolCarts - booked),
    booked,
    overdue,
};
```

Add `poolToday` to the returned object.

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep reports.service || echo clean`

- [ ] **Step 3: Manual verification**

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
AD=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"admin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s localhost:3005/api/v1/reports/utilization -H "Authorization: Bearer $SA" | node -pe 'JSON.parse(require("fs").readFileSync(0)).poolToday'
curl -s localhost:3005/api/v1/reports/utilization -H "Authorization: Bearer $AD" | node -pe 'JSON.parse(require("fs").readFileSync(0)).poolToday'
```
Expected: both print a `poolToday` object; the Admin numbers are ≤ the SuperAdmin numbers (venue subset).

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/reports/reports.service.ts
git commit -m "feat: dashboard stats include poolToday {bookings, available, booked, overdue}"
```

---

## Task 6: Frontend — Fleet Management "Pool Cars" tab

**Files:**
- Modify: `frontend/src/lib/api.ts` (`poolBookingsApi` types — already has `getPoolFleet`)
- Modify: `frontend/src/pages/FleetManagementPage.tsx`

**Interfaces:**
- Consumes: `poolBookingsApi.getPoolFleet({ stadiumId? })` → `{ data: PoolCart[] }` where each `PoolCart` has `id, carNumber, carType, isPool, stadium, assignedUser?, currentBooking?: { derivedState, faUser, requesterName, endDate, endTime } | null`.
- Produces: no exports.

- [ ] **Step 1: Add a "Pool Cars" tab trigger + content**

In `FleetManagementPage.tsx`, in the `<TabsList>` (after the "history" trigger) add:

```tsx
<TabsTrigger value="pool"><Car className="w-4 h-4 mr-2 inline" />Pool Cars</TabsTrigger>
```

(import `Car` from `lucide-react` if not already imported.)

After the existing `<TabsContent value="history">` block add a new one:

```tsx
<TabsContent value="pool" className="space-y-4">
    <PoolCarsPanel selectedStadium={selectedStadium} />
</TabsContent>
```

- [ ] **Step 2: Implement `PoolCarsPanel`**

Add this component in the same file (above `export function FleetManagementPage`):

```tsx
function PoolCarsPanel({ selectedStadium }: { selectedStadium: string }) {
    const [carts, setCarts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    const load = async () => {
        setLoading(true);
        try {
            const params = selectedStadium && selectedStadium !== 'all' ? { stadiumId: selectedStadium } : undefined;
            const res = await poolBookingsApi.getPoolFleet(params);
            setCarts(res.data.data ?? res.data ?? []);
        } finally {
            setLoading(false);
        }
    };
    useEffect(() => { load(); /* eslint-disable-next-line */ }, [selectedStadium]);

    const toggle = async (id: string, isPool: boolean) => {
        try {
            await poolBookingsApi.togglePool(id, isPool);
            toast.success(isPool ? 'Added to pool' : 'Removed from pool');
            load();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Failed');
        }
    };

    const statusFor = (c: any) => {
        const b = c.currentBooking;
        if (!b) return { label: 'Available', cls: 'text-green-600' };
        if (b.derivedState === 'Overdue') return { label: 'Overdue', cls: 'text-red-600 font-semibold' };
        return { label: `Booked until ${b.endDate} ${b.endTime}`, cls: 'text-amber-600' };
    };

    if (loading) return <p className="text-muted-foreground">Loading pool cars…</p>;
    if (carts.length === 0) return <p className="text-muted-foreground">No pool cars at this venue. Toggle a cart into the pool from the Assignment Matrix.</p>;

    return (
        <div className="overflow-x-auto rounded-md border">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Cart #</TableHead><TableHead>Type</TableHead>
                        <TableHead>Venue</TableHead><TableHead>Status</TableHead>
                        <TableHead>Assigned FA</TableHead><TableHead>Current booking</TableHead>
                        <TableHead className="text-right">Pool</TableHead>
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {carts.map((c) => {
                        const st = statusFor(c);
                        return (
                            <TableRow key={c.id}>
                                <TableCell className="font-medium">{c.carNumber}</TableCell>
                                <TableCell>{c.carType}</TableCell>
                                <TableCell>{c.stadium?.name ?? '—'}</TableCell>
                                <TableCell className={st.cls}>{st.label}</TableCell>
                                <TableCell>{c.assignedUser?.accreditationNumber ?? '—'}</TableCell>
                                <TableCell>{c.currentBooking?.requesterName ?? '—'}</TableCell>
                                <TableCell className="text-right">
                                    <Button size="sm" variant={c.isPool ? 'outline' : 'default'}
                                        onClick={() => toggle(c.id, !c.isPool)}>
                                        {c.isPool ? 'Remove' : 'Add'}
                                    </Button>
                                </TableCell>
                            </TableRow>
                        );
                    })}
                </TableBody>
            </Table>
        </div>
    );
}
```

Ensure `poolBookingsApi` and `toast` are imported in the file (add `import { toast } from 'sonner';` and `poolBookingsApi` to the `@/lib/api` import if missing).

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep FleetManagementPage || echo clean`

- [ ] **Step 4: Manual verification (browser)**

Log in as `superadmin@gcms.com` → Fleet Management → **Pool Cars** tab. Expect a table of pool carts with a Status column showing "Available" / "Booked until …" / red "Overdue". Toggle one Remove/Add — toast appears, row updates. Log in as `admin@gcms.com` → the tab shows only Al Bayet pool carts. Check 375px: table scrolls horizontally inside its border, page itself does not.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/FleetManagementPage.tsx frontend/src/lib/api.ts
git commit -m "feat: Pool Cars tab in Fleet Management (status, assigned FA, current booking, pool toggle)"
```

---

## Task 7: Frontend — Bookings page panels, return action, history download

**Files:**
- Modify: `frontend/src/lib/api.ts` (`poolBookingRequestsApi`)
- Modify: `frontend/src/pages/BookingsPage.tsx`

**Interfaces:**
- Consumes:
  - `poolBookingRequestsApi.getAll({ status?, stadiumId?, derivedState? })` → rows now include `derivedState`, `faUser.accreditationNumber`, `returnedAt`, `returnedBy`.
  - `poolBookingRequestsApi.markReturned(id)` → `PATCH /pool-booking-requests/:id/return`.
  - `poolBookingRequestsApi.getHistory(params)` → `GET /pool-booking-requests/history`.
  - `poolBookingRequestsApi.exportHistory(params & { format })` → blob.
- Produces: no exports.

- [ ] **Step 1: Extend the API client**

In `frontend/src/lib/api.ts`, in `poolBookingRequestsApi` add:

```ts
markReturned: (id: string) =>
    apiClient.patch(`/pool-booking-requests/${id}/return`),
getHistory: (params?: Record<string, string | undefined>) =>
    apiClient.get('/pool-booking-requests/history', { params }),
exportHistory: (params: Record<string, string | undefined>) =>
    apiClient.get('/pool-booking-requests/history/export', { params, responseType: 'blob' }),
```

And widen `getAll`'s param type to include `derivedState?: string`.

- [ ] **Step 2: Add a tabbed layout to BookingsPage**

`BookingsPage.tsx` currently renders one table (the review queue) with a status filter. Wrap the content in `<Tabs defaultValue="review">` (import from `@/components/ui/tabs`) with triggers: **Review queue** (existing table), **Active & Overdue**, **Upcoming**, **Available cars**, **History**.

- `Review queue` — the existing table & dialogs, unchanged.
- `Active & Overdue` — `getAll({ stadiumId?, derivedState: 'Active' })` + `getAll({ derivedState: 'Overdue' })` (or fetch once with `status=Approved` and filter client-side by `row.derivedState`). Each row shows car, requester, FA code, window; an **"OVERDUE — should be returned"** red badge when `derivedState === 'Overdue'`; a **Mark Returned** button.
- `Upcoming` — rows where `derivedState === 'Upcoming'`, read-only.
- `Available cars` — reuse `poolBookingsApi.getPoolFleet` and list carts whose `currentBooking` is null.
- `History` — filter row (date from/to, status) + a results table + a **Download ▾** (PDF / Excel) button calling `exportHistory`.

Concrete snippets:

```tsx
// Mark Returned handler
const markReturned = async (id: string) => {
    try {
        await poolBookingRequestsApi.markReturned(id);
        toast.success('Booking marked returned');
        load();
    } catch (e: any) {
        toast.error(e.response?.data?.error || 'Failed to mark returned');
    }
};

// Overdue badge
{row.derivedState === 'Overdue' && (
    <span className="ml-2 rounded bg-red-100 text-red-700 text-xs px-2 py-0.5 font-semibold">
        OVERDUE — should be returned
    </span>
)}

// Download
const downloadHistory = async (format: 'pdf' | 'xlsx') => {
    const res = await poolBookingRequestsApi.exportHistory({ ...historyFilters, format });
    downloadBlob(res.data, `booking_history.${format}`);
};
```

Reuse the `downloadBlob` helper pattern already in `DashboardPage.tsx` (copy it into a `frontend/src/lib/download.ts` if you want it shared — optional; inline is fine for this task).

- [ ] **Step 3: Row expand for booker detail (§6.3)**

In the Active/Overdue, Upcoming and History tables, make each row expandable (reuse the `expanded`/`setExpanded` pattern from `DashboardPage.tsx`'s `CartCard`). The expanded panel shows:

```tsx
<div className="text-sm grid gap-1 p-3 bg-muted/40">
    <div>Requester: <b>{row.requesterName}</b> · FA {row.faUser?.accreditationNumber ?? '—'}</div>
    <div>{row.requesterPhone} · {row.requesterEmail}</div>
    <div>Type: <b>{row.bookingType}</b>{row.bookingType === 'Recurring' && ' — daily window repeats across the date range'}</div>
    <div>Window: {row.startDate} {row.startTime} → {row.endDate} {row.endTime}</div>
    {row.returnedAt && <div>Returned {new Date(row.returnedAt).toLocaleString()} by {row.returnedBy?.name ?? '—'}</div>}
</div>
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep BookingsPage || echo clean`

- [ ] **Step 5: Manual verification (browser)**

As `superadmin@gcms.com` → Bookings:
- **Active & Overdue** tab lists approved bookings that are live; an overdue one shows the red badge; clicking **Mark Returned** removes it from the tab and a toast confirms; re-open the tab — it's gone; check the **Review queue** filtered to `Completed` (or History) — it's there with a returned-at line.
- **Upcoming** shows future approved bookings, no return button.
- **Available cars** lists pool carts with no active booking.
- **History** — set a date range, results update; **Download → PDF** saves a file that opens with header + `BKH-` ref; **Download → Excel** saves an xlsx.
- Expand a row → requester name, FA code, phone, email, Single/Recurring, window all shown.
- As `admin@gcms.com` → every tab shows only Al Bayet data.
- 375 / 768 / 1280 px: tabs wrap/scroll, tables scroll inside their container, no page-level horizontal scroll.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/BookingsPage.tsx frontend/src/lib/api.ts
git commit -m "feat: Bookings page — Active/Overdue/Upcoming/Available/History tabs, Mark Returned, history download, booker detail"
```

---

## Task 8: Frontend — Dashboard "Pool bookings today" widget

**Files:**
- Modify: `frontend/src/pages/DashboardPage.tsx`

**Interfaces:**
- Consumes: `stats.poolToday` (`{ bookings, available, booked, overdue }`) from the existing `reportsApi.getUtilization` call already made in `DashboardPage`.
- Produces: no exports.

- [ ] **Step 1: Render the card**

In the main (non-FA) dashboard return, after the stat-cards row, add a card:

```tsx
{stats?.poolToday && (
    <Card className="border shadow-sm">
        <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
                <Layers className="w-4 h-4" /> Pool bookings today
            </CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {([
                ['Today', stats.poolToday.bookings, ''],
                ['Available', stats.poolToday.available, 'text-green-600'],
                ['In use', stats.poolToday.booked, 'text-amber-600'],
                ['Overdue', stats.poolToday.overdue, 'text-red-600'],
            ] as const).map(([label, value, cls]) => (
                <button key={label} onClick={() => navigate('/bookings')}
                    className="rounded-md border p-3 text-left hover:bg-muted/50">
                    <div className={`text-2xl font-bold ${cls}`}>{value}</div>
                    <div className="text-xs text-muted-foreground">{label}</div>
                </button>
            ))}
        </CardContent>
    </Card>
)}
```

Import `Layers` from `lucide-react` if not present; `navigate` from `useNavigate()` is already used in the file (confirm; if not, add `const navigate = useNavigate();`).

- [ ] **Step 2: Add `poolToday` to the `DashboardStats` type**

Find the `DashboardStats` interface/type in `DashboardPage.tsx` and add:

```ts
poolToday?: { bookings: number; available: number; booked: number; overdue: number };
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep DashboardPage || echo clean`

- [ ] **Step 4: Manual verification (browser)**

As `superadmin@gcms.com` → Dashboard shows the "Pool bookings today" card with 4 numbers; clicking any tile navigates to `/bookings`. As `admin@gcms.com` → numbers reflect only Al Bayet (≤ the SuperAdmin numbers). 375px: tiles are 2×2, no overflow.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/DashboardPage.tsx
git commit -m "feat: dashboard Pool bookings today widget (available / in use / overdue)"
```

---

## Phase 2 Done-When

- `cd backend && npm test` green (adds the `booking-state` suite; `resolveStadiumScope` still passes).
- A pool cart with an approved booking whose window end has passed shows **Overdue** in Fleet Management → Pool Cars, on the Bookings page, and in the dashboard widget count.
- **Mark Returned** on the Bookings page sets the booking `Completed`, drops it from Active/Overdue, and bumps the Available count.
- Booking history downloads as a PDF (with `BKH-` reference, header, footer) and as Excel.
- Every pool view is venue-scoped: an `admin@gcms.com` session only ever sees Al Bayet; adding `?stadiumId=<other>` to any of the endpoints changes nothing.
- `npx tsc --noEmit` clean in `backend/` and `frontend/` for all touched files.
- All changed pages verified at 375 / 768 / 1280 px with no page-level horizontal scroll.

## Self-Review Notes

- **Spec coverage:** §6.0 → Tasks 1–2; §6.1 → Task 6; §6.2 → Tasks 3 (return + list) & 7 (UI); §6.3 → Tasks 3 (`BOOKING_INCLUDE`) & 7 (expand); §6.4 → Task 4 & 7; §6.5 → Tasks 5 & 8. §4 shared PDF service → Task 4.
- **Deferred within spec bounds:** timezone-correct "now" (§ Global Constraints) — string/`Date` comparison in server-local time is used now; `SystemSettings.timezone` wiring is Phase 7.
- **`pool-bookings.service.getBookings`** (legacy `PoolBooking` reader) is left in place — it still serves any legacy rows and is not on the Phase 2 UI path. No migration of legacy `PoolBooking` rows is attempted.
- **No automated UI/HTTP tests:** matches Phase 1; unit tests cover the derive logic; manual steps are explicit. Full harness is Phase 7.
