# Phase 4B — Reports, FA Audit Detail & Print Labels — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Pool report (JSON + Excel + PDF) with role-scoped pool fleet / booking / request analytics; fold no-login public pool bookers into the User report with their FA code + contact; expand the FA audit trail with explicit check-in / check-out / handover-signing timestamps and possession duration; and redesign the print-label PDF to one car per page — event logo + banner header, huge centered car number, `FA: <accreditation>` beneath, branded footer — tuned for print-and-laminate.

**Architecture:** All server work lands in the existing `reports` module. Three pure, unit-tested helpers carry the logic that is worth testing (`summarizePoolBookings`, `buildPublicBookerRows`, `possessionMinutes` / `labelCarFontSize`); everything else is Prisma aggregation + pdfkit/exceljs rendering that follows the patterns already in `reports.controller.ts`. The shared `pdf.service.ts` gains a `poolReportPdf()` renderer next to `bookingHistoryPdf()`. Frontend adds a "Pool" tab to `ReportsPage.tsx` and enriches the existing FA-audit and Labels tabs; `reportsApi` gets `getPoolReport` / `exportPoolReport`.

**Tech Stack:** TypeScript, Express, Prisma, ExcelJS, pdfkit (+ shared `pdf.service.ts`), vitest, React, Vite, Tailwind, Radix UI.

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` — §8.2 (pool report), §8.3 (no-login bookers in user report), §8.4 (FA audit trail detail), §8.5 (print label redesign), §8.6 acceptance. NFRs §2a. Cross-cutting PDF service §4.

## Global Constraints

- **Roles (exact strings):** `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`. All `/reports/*` routes are already gated `requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam')`; the new pool routes match that list.
- **Venue scoping:** every new report path resolves its stadium filter through `resolveStadiumScope(req.user, req.query.stadiumId)` from `backend/src/modules/reports/reports.scope.ts` — Admin/FA are locked to their own venue and any `?stadiumId=` override is ignored; a `'__none__'` result means "return empty".
- **Booking entity:** `PoolBookingRequest` (NOT the deprecated `PoolBooking`). Statuses `Pending | Approved | Rejected | Cancelled | Completed`; derived states via `deriveBookingState(window, now)` from `backend/src/modules/pool-booking-requests/booking-state.ts` → `Pending | Upcoming | Active | Overdue | Completed | Rejected | Cancelled`. Date/time fields are strings (`startDate`/`endDate` = `"YYYY-MM-DD"`, `startTime`/`endTime` = `"HH:mm"`).
- **Pool cars:** `Fleet.isPool: Boolean @default(false)`. Pool report inventory = `Fleet` where `isPool: true`.
- **PDF references:** use `makeReference(prefix, id)` from `pdf.service.ts` → `PREFIX-YYYY-XXXXXX`. Pool report prefix `POOL`. Reference is derived from a per-request nonce id (e.g. `crypto.randomUUID()`), since the report is not a stored entity.
- **PDF rendering:** reuse `renderPdf(meta, body)` / add `poolReportPdf()` in `backend/src/services/pdf.service.ts`. Do not import anything from the `reports` module into `pdf.service.ts` (keep it leaf-level) — the controller passes already-loaded data in.
- **Email:** not used in this phase.
- **Responsive:** verify `ReportsPage.tsx` Pool tab + FA-audit table at 375 / 768 / 1280 px (horizontal scroll wrapper on wide tables, never a body scrollbar).
- **Bug-free gate:** backend `cd backend && npm test` green (currently 27 tests / 4 files); backend + frontend `npx tsc --noEmit` exit 0 for touched files; every new endpoint has a typed JSON error path (`res.status(500).json({ error: '...' })`).
- **Windows/Prisma:** no schema changes in this phase, so no migration / `prisma generate` needed. If a dev server holds a file lock, stop the backend task before any prisma command.
- **Commits:** one per task, conventional-commit subject, footer exactly:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (:3005), frontend `cd frontend && npm run dev` (:3000). Logins: `superadmin@gcms.com` / `Admin@2024!` (full scope), `admin@gcms.com` / `Admin@2024!` (venue-locked).

---

## File Structure

**Created:**
- `backend/src/modules/reports/pool-report.ts` — pure helpers: `summarizePoolBookings(bookings, now)` + `PoolBookingSummary` type.
- `backend/src/modules/reports/pool-report.test.ts` — vitest for `summarizePoolBookings`.
- `backend/src/modules/reports/public-bookers.ts` — pure helper: `buildPublicBookerRows(bookings, knownEmails)` + `PublicBookerRow` type.
- `backend/src/modules/reports/public-bookers.test.ts` — vitest for `buildPublicBookerRows`.
- `backend/src/modules/reports/fa-trail-detail.ts` — pure helpers: `possessionMinutes(start, end)`, `formatDuration(minutes)`.
- `backend/src/modules/reports/fa-trail-detail.test.ts` — vitest for both.
- `backend/src/modules/reports/label-layout.ts` — pure helper: `labelCarFontSize(carNumber, availW, availH)`.
- `backend/src/modules/reports/label-layout.test.ts` — vitest for `labelCarFontSize`.

**Modified:**
- `backend/src/modules/reports/reports.service.ts` — new `getPoolReport(filters)`; `getUserReports` gains a `publicBookers` aggregate; `getFaAuditTrail` rows gain timestamp detail.
- `backend/src/services/pdf.service.ts` — new `poolReportPdf({ data, reference })`.
- `backend/src/modules/reports/reports.controller.ts` — new `getPoolReport` / `exportPoolReport` / `exportPoolReportPdf`; `exportUserReport` + `exportUserReportPdf` gain a "Public bookers" section; `getFaAuditTrail` response unchanged shape but richer rows; `exportLabelsPdf` fully rewritten (portrait, one per page, FA line); Labels-tab helper text.
- `backend/src/modules/reports/reports.routes.ts` — three `/pool*` routes.
- `frontend/src/lib/api.ts` — `reportsApi.getPoolReport`, `reportsApi.exportPoolReport`.
- `frontend/src/pages/ReportsPage.tsx` — new "Pool" tab; FA-audit table columns; Labels tab copy.

---

## Task 1: Pure pool-booking summary helper

**Files:**
- Create: `backend/src/modules/reports/pool-report.ts`
- Test: `backend/src/modules/reports/pool-report.test.ts`

**Interfaces:**
- Consumes: `deriveBookingState` from `../pool-booking-requests/booking-state` (`booking-state.ts`), signature `deriveBookingState(b: BookingWindow, now: Date): BookingDerivedState` where `BookingWindow = { status: string; startDate: string; endDate: string; startTime: string; endTime: string; returnedAt: Date | string | null }`.
- Produces:
  ```ts
  export interface PoolBookingInput {
    id: string;
    status: string;
    startDate: string; endDate: string; startTime: string; endTime: string;
    returnedAt: Date | string | null;
    createdAt: Date | string;
    fleetId: string;
    carNumber: string;
    stadiumName: string;
  }
  export interface PoolBookingSummary {
    total: number;
    byState: Record<string, number>;      // Upcoming/Active/Overdue/Completed/Pending/Rejected/Cancelled -> count
    byCar: Array<{ carNumber: string; count: number }>;   // desc by count, then carNumber asc
    byVenue: Array<{ stadiumName: string; count: number }>; // desc by count, then name asc
    overdueCount: number;                 // current derived state === 'Overdue'
    completedCount: number;
    avgDurationHours: number | null;      // mean of (returnedAt - createdAt) over rows with returnedAt, 1dp; null if none
  }
  export function summarizePoolBookings(bookings: PoolBookingInput[], now: Date): PoolBookingSummary;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/reports/pool-report.test.ts
import { describe, it, expect } from 'vitest';
import { summarizePoolBookings, PoolBookingInput } from './pool-report';

const base: Omit<PoolBookingInput, 'id' | 'status'> = {
  startDate: '2026-09-09', endDate: '2026-09-09', startTime: '08:00', endTime: '10:00',
  returnedAt: null, createdAt: '2026-09-09T07:00:00Z', fleetId: 'f1',
  carNumber: 'C-1', stadiumName: 'Lusail',
};
const now = new Date('2026-09-09T09:00:00');

describe('summarizePoolBookings', () => {
  it('counts totals and derived states', () => {
    const rows: PoolBookingInput[] = [
      { ...base, id: '1', status: 'Approved' },                         // Active (08:00-10:00, now 09:00)
      { ...base, id: '2', status: 'Approved', startTime: '06:00', endTime: '07:00' }, // Overdue
      { ...base, id: '3', status: 'Pending' },                          // Pending
      { ...base, id: '4', status: 'Approved', returnedAt: '2026-09-09T09:30:00Z', createdAt: '2026-09-09T07:30:00Z' }, // Completed, 2h
    ];
    const s = summarizePoolBookings(rows, now);
    expect(s.total).toBe(4);
    expect(s.byState.Active).toBe(1);
    expect(s.byState.Overdue).toBe(1);
    expect(s.byState.Pending).toBe(1);
    expect(s.byState.Completed).toBe(1);
    expect(s.overdueCount).toBe(1);
    expect(s.completedCount).toBe(1);
    expect(s.avgDurationHours).toBe(2);
  });

  it('groups by car and venue sorted by count desc', () => {
    const rows: PoolBookingInput[] = [
      { ...base, id: '1', status: 'Approved', carNumber: 'C-2', stadiumName: 'Lusail' },
      { ...base, id: '2', status: 'Approved', carNumber: 'C-2', stadiumName: 'Lusail' },
      { ...base, id: '3', status: 'Approved', carNumber: 'C-1', stadiumName: 'Al Bayt' },
    ];
    const s = summarizePoolBookings(rows, now);
    expect(s.byCar[0]).toEqual({ carNumber: 'C-2', count: 2 });
    expect(s.byCar[1]).toEqual({ carNumber: 'C-1', count: 1 });
    expect(s.byVenue[0]).toEqual({ stadiumName: 'Lusail', count: 2 });
  });

  it('returns null avg duration when nothing returned', () => {
    const s = summarizePoolBookings([{ ...base, id: '1', status: 'Approved' }], now);
    expect(s.avgDurationHours).toBeNull();
  });

  it('handles an empty list', () => {
    const s = summarizePoolBookings([], now);
    expect(s).toEqual({
      total: 0, byState: {}, byCar: [], byVenue: [],
      overdueCount: 0, completedCount: 0, avgDurationHours: null,
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/modules/reports/pool-report.test.ts`
Expected: FAIL — `Cannot find module './pool-report'`.

- [ ] **Step 3: Write the implementation**

```ts
// backend/src/modules/reports/pool-report.ts
import { deriveBookingState } from '../pool-booking-requests/booking-state';

export interface PoolBookingInput {
  id: string;
  status: string;
  startDate: string; endDate: string; startTime: string; endTime: string;
  returnedAt: Date | string | null;
  createdAt: Date | string;
  fleetId: string;
  carNumber: string;
  stadiumName: string;
}

export interface PoolBookingSummary {
  total: number;
  byState: Record<string, number>;
  byCar: Array<{ carNumber: string; count: number }>;
  byVenue: Array<{ stadiumName: string; count: number }>;
  overdueCount: number;
  completedCount: number;
  avgDurationHours: number | null;
}

function rank(map: Map<string, number>): Array<{ k: string; count: number }> {
  return [...map.entries()]
    .map(([k, count]) => ({ k, count }))
    .sort((a, b) => b.count - a.count || a.k.localeCompare(b.k));
}

export function summarizePoolBookings(bookings: PoolBookingInput[], now: Date): PoolBookingSummary {
  const byState: Record<string, number> = {};
  const carMap = new Map<string, number>();
  const venueMap = new Map<string, number>();
  let overdueCount = 0;
  let completedCount = 0;
  const durationsMs: number[] = [];

  for (const b of bookings) {
    const state = deriveBookingState(
      { status: b.status, startDate: b.startDate, endDate: b.endDate, startTime: b.startTime, endTime: b.endTime, returnedAt: b.returnedAt },
      now,
    );
    byState[state] = (byState[state] ?? 0) + 1;
    if (state === 'Overdue') overdueCount++;
    if (state === 'Completed') completedCount++;

    carMap.set(b.carNumber, (carMap.get(b.carNumber) ?? 0) + 1);
    venueMap.set(b.stadiumName, (venueMap.get(b.stadiumName) ?? 0) + 1);

    if (b.returnedAt) {
      const ms = new Date(b.returnedAt).getTime() - new Date(b.createdAt).getTime();
      if (Number.isFinite(ms) && ms >= 0) durationsMs.push(ms);
    }
  }

  const avgDurationHours = durationsMs.length
    ? Math.round((durationsMs.reduce((a, c) => a + c, 0) / durationsMs.length / 3_600_000) * 10) / 10
    : null;

  return {
    total: bookings.length,
    byState,
    byCar: rank(carMap).map(({ k, count }) => ({ carNumber: k, count })),
    byVenue: rank(venueMap).map(({ k, count }) => ({ stadiumName: k, count })),
    overdueCount,
    completedCount,
    avgDurationHours,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/modules/reports/pool-report.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/reports/pool-report.ts backend/src/modules/reports/pool-report.test.ts
git commit -m "feat(reports): summarizePoolBookings() pure aggregation helper

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 2: `getPoolReport` service method

**Files:**
- Modify: `backend/src/modules/reports/reports.service.ts` (add method + interface near the other `interface *Report` blocks around line 43–76 and the method after `getUserReports`, ~line 691)

**Interfaces:**
- Consumes: `summarizePoolBookings` + `PoolBookingSummary` from `./pool-report` (Task 1); `this.prisma` (already a field).
- Produces:
  ```ts
  export interface PoolReport {
    scope: { stadiumId: string | null };
    fleet: {
      total: number;
      byStatus: Record<string, number>;
      byType: Record<string, number>;
      byVenue: Array<{ stadiumName: string; total: number; inUse: number }>;
    };
    bookings: PoolBookingSummary;
    requests: { pending: number; approved: number; rejected: number; poolShared: number; dedicated: number };
    utilizationPct: number | null; // inUse pool cars / total pool cars * 100, 1dp; null if no pool cars
  }
  // on ReportsService:
  async getPoolReport(filters: { stadiumId?: string }): Promise<PoolReport>
  ```

- [ ] **Step 1: Add the interface**

Add near the other report interfaces in `reports.service.ts` (after `ActiveCarUsage`, ~line 76):

```ts
import { summarizePoolBookings, PoolBookingSummary } from './pool-report';

export interface PoolReport {
  scope: { stadiumId: string | null };
  fleet: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byVenue: Array<{ stadiumName: string; total: number; inUse: number }>;
  };
  bookings: PoolBookingSummary;
  requests: { pending: number; approved: number; rejected: number; poolShared: number; dedicated: number };
  utilizationPct: number | null;
}
```

(Put the `import` at the top with the other imports; keep the `export interface` above the class.)

- [ ] **Step 2: Add the method**

Add to `ReportsService` after `getUserReports` (~line 691):

```ts
async getPoolReport(filters: { stadiumId?: string } = {}): Promise<PoolReport> {
  const fleetWhere: any = { isPool: true };
  if (filters.stadiumId) fleetWhere.stadiumId = filters.stadiumId;

  const bookingWhere: any = {};
  if (filters.stadiumId) bookingWhere.stadiumId = filters.stadiumId;

  const requestWhere: any = {};
  if (filters.stadiumId) requestWhere.stadiumId = filters.stadiumId;

  const [poolFleet, bookingRows, reqPending, reqApproved, reqRejected, reqPoolShared, reqDedicated] = await Promise.all([
    this.prisma.fleet.findMany({
      where: fleetWhere,
      select: { id: true, carNumber: true, carType: true, status: true, stadium: { select: { name: true } } },
    }),
    this.prisma.poolBookingRequest.findMany({
      where: bookingWhere,
      select: {
        id: true, status: true, startDate: true, endDate: true, startTime: true, endTime: true,
        returnedAt: true, createdAt: true, fleetId: true,
        fleet: { select: { carNumber: true } },
        stadium: { select: { name: true } },
      },
    }),
    this.prisma.carRequest.count({ where: { ...requestWhere, status: 'Pending' } }),
    this.prisma.carRequest.count({ where: { ...requestWhere, status: 'Approved' } }),
    this.prisma.carRequest.count({ where: { ...requestWhere, status: 'Rejected' } }),
    this.prisma.carRequest.count({ where: { ...requestWhere, requestType: 'pool-shared' } }),
    this.prisma.carRequest.count({ where: { ...requestWhere, requestType: 'dedicated' } }),
  ]);

  const byStatus: Record<string, number> = {};
  const byType: Record<string, number> = {};
  const venueMap = new Map<string, { total: number; inUse: number }>();
  for (const c of poolFleet) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    byType[c.carType] = (byType[c.carType] ?? 0) + 1;
    const v = venueMap.get(c.stadium.name) ?? { total: 0, inUse: 0 };
    v.total++;
    if (c.status === 'Dispatched' || c.status === 'InUse') v.inUse++;
    venueMap.set(c.stadium.name, v);
  }
  const byVenue = [...venueMap.entries()]
    .map(([stadiumName, v]) => ({ stadiumName, ...v }))
    .sort((a, b) => b.total - a.total || a.stadiumName.localeCompare(b.stadiumName));

  const totalInUse = byVenue.reduce((a, c) => a + c.inUse, 0);
  const utilizationPct = poolFleet.length
    ? Math.round((totalInUse / poolFleet.length) * 1000) / 10
    : null;

  const bookings = summarizePoolBookings(
    bookingRows.map(r => ({
      id: r.id, status: r.status,
      startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime,
      returnedAt: r.returnedAt, createdAt: r.createdAt, fleetId: r.fleetId,
      carNumber: r.fleet?.carNumber ?? '—', stadiumName: r.stadium?.name ?? '—',
    })),
    new Date(),
  );

  return {
    scope: { stadiumId: filters.stadiumId ?? null },
    fleet: { total: poolFleet.length, byStatus, byType, byVenue },
    bookings,
    requests: { pending: reqPending, approved: reqApproved, rejected: reqRejected, poolShared: reqPoolShared, dedicated: reqDedicated },
    utilizationPct,
  };
}
```

- [ ] **Step 3: Typecheck**

Run: `cd backend && npx tsc --noEmit`
Expected: exit 0 (no errors in `reports.service.ts` / `pool-report.ts`).

- [ ] **Step 4: Smoke the query shape**

Run (backend dev server up):
```bash
curl -s -X POST localhost:3005/api/v1/auth/login -H 'content-type: application/json' \
  -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | python -c "import sys,json;print(json.load(sys.stdin)['token'])"
```
Keep the token for Task 3's check. No endpoint yet — this task is service-only; if `tsc` is clean, proceed.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/reports/reports.service.ts
git commit -m "feat(reports): getPoolReport() — pool fleet, bookings, requests, utilization

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 3: Pool report routes + JSON / Excel / PDF controllers

**Files:**
- Modify: `backend/src/services/pdf.service.ts` (add `poolReportPdf`)
- Modify: `backend/src/modules/reports/reports.controller.ts` (add 3 static methods; imports for `poolReportPdf`, `randomUUID`, `makeReference`)
- Modify: `backend/src/modules/reports/reports.routes.ts` (3 routes)

**Interfaces:**
- Consumes: `reportsService.getPoolReport({ stadiumId })` (Task 2); `resolveStadiumScope` (already imported in the controller); `ExcelJS` (already imported); `renderPdf` / `makeReference` from `../../services/pdf.service`.
- Produces on `pdf.service.ts`:
  ```ts
  export async function poolReportPdf(args: {
    data: import('../modules/reports/pool-report').PoolBookingSummary extends never ? never : any; // see note
    reference: string;
  }): Promise<Buffer>
  ```
  **Note:** to keep `pdf.service.ts` leaf-level, type `data` as a local structural interface `PoolReportPdfData` declared in `pdf.service.ts` (NOT imported from the reports module), matching the `PoolReport` shape it needs.
- Produces on the controller: `getPoolReport`, `exportPoolReport`, `exportPoolReportPdf` (all `static async (req: AuthRequest, res: Response)`).

- [ ] **Step 1: Add `poolReportPdf` to `pdf.service.ts`**

Append after `bookingHistoryPdf` (before `handoverFormPdf`):

```ts
export interface PoolReportPdfData {
  scope: { stadiumId: string | null };
  fleet: {
    total: number;
    byStatus: Record<string, number>;
    byType: Record<string, number>;
    byVenue: Array<{ stadiumName: string; total: number; inUse: number }>;
  };
  bookings: {
    total: number;
    byState: Record<string, number>;
    byCar: Array<{ carNumber: string; count: number }>;
    byVenue: Array<{ stadiumName: string; count: number }>;
    overdueCount: number;
    completedCount: number;
    avgDurationHours: number | null;
  };
  requests: { pending: number; approved: number; rejected: number; poolShared: number; dedicated: number };
  utilizationPct: number | null;
}

export async function poolReportPdf(args: { data: PoolReportPdfData; reference: string }): Promise<Buffer> {
  const { data } = args;
  const kv = (doc: PDFKit.PDFDocument, label: string, value: unknown) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#000').text(value != null && value !== '' ? String(value) : '—');
  };
  const heading = (doc: PDFKit.PDFDocument, t: string) => {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#000').text(t).moveDown(0.2);
    doc.font('Helvetica').fontSize(10);
  };
  const dict = (o: Record<string, number>) =>
    Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k}: ${v}`).join('   ') : '—';

  return renderPdf(
    { title: 'Pool Car Report', subtitle: data.scope.stadiumId ? 'Venue-scoped' : 'All venues', reference: args.reference },
    (doc) => {
      heading(doc, 'Pool fleet');
      kv(doc, 'Total pool cars', data.fleet.total);
      kv(doc, 'By status', dict(data.fleet.byStatus));
      kv(doc, 'By type', dict(data.fleet.byType));
      kv(doc, 'Utilization', data.utilizationPct == null ? '—' : `${data.utilizationPct}%`);
      data.fleet.byVenue.forEach(v => kv(doc, `  ${v.stadiumName}`, `${v.total} cars (${v.inUse} in use)`));

      heading(doc, 'Bookings');
      kv(doc, 'Total', data.bookings.total);
      kv(doc, 'By state', dict(data.bookings.byState));
      kv(doc, 'Overdue now', data.bookings.overdueCount);
      kv(doc, 'Completed', data.bookings.completedCount);
      kv(doc, 'Avg duration (h)', data.bookings.avgDurationHours ?? '—');
      data.bookings.byCar.slice(0, 15).forEach(c => kv(doc, `  Car ${c.carNumber}`, `${c.count} bookings`));

      heading(doc, 'Requests');
      kv(doc, 'Pending', data.requests.pending);
      kv(doc, 'Approved', data.requests.approved);
      kv(doc, 'Rejected', data.requests.rejected);
      kv(doc, 'Pool-shared', data.requests.poolShared);
      kv(doc, 'Dedicated', data.requests.dedicated);
    },
  );
}
```

- [ ] **Step 2: Add controller methods**

At the top of `reports.controller.ts`, extend the pdf import and add crypto:

```ts
import { poolReportPdf, makeReference } from '../../services/pdf.service';
import { randomUUID } from 'crypto';
```

Add these three methods to `ReportsController` (place them just before `// ==================== PRINT LABELS ====================`):

```ts
static async getPoolReport(req: AuthRequest, res: Response) {
  try {
    const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
    if (stadiumId === '__none__') {
      res.status(200).json({ scope: { stadiumId: null }, fleet: { total: 0, byStatus: {}, byType: {}, byVenue: [] }, bookings: { total: 0, byState: {}, byCar: [], byVenue: [], overdueCount: 0, completedCount: 0, avgDurationHours: null }, requests: { pending: 0, approved: 0, rejected: 0, poolShared: 0, dedicated: 0 }, utilizationPct: null });
      return;
    }
    const report = await reportsService.getPoolReport({ stadiumId });
    res.status(200).json(report);
  } catch (error) {
    console.error('Failed to get pool report:', error);
    res.status(500).json({ error: 'Failed to get pool report' });
  }
}

static async exportPoolReport(req: AuthRequest, res: Response) {
  try {
    const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
    const report = await reportsService.getPoolReport({ stadiumId: stadiumId === '__none__' ? '__none__' : stadiumId });
    const wb = new ExcelJS.Workbook();

    const fleet = wb.addWorksheet('Pool Fleet');
    fleet.columns = [{ header: 'Metric', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 40 }];
    fleet.addRow({ k: 'Total pool cars', v: report.fleet.total });
    fleet.addRow({ k: 'Utilization %', v: report.utilizationPct ?? '—' });
    Object.entries(report.fleet.byStatus).forEach(([k, v]) => fleet.addRow({ k: `Status: ${k}`, v }));
    Object.entries(report.fleet.byType).forEach(([k, v]) => fleet.addRow({ k: `Type: ${k}`, v }));

    const venues = wb.addWorksheet('By Venue');
    venues.columns = [
      { header: 'Venue', key: 'stadiumName', width: 28 },
      { header: 'Pool cars', key: 'total', width: 12 },
      { header: 'In use', key: 'inUse', width: 12 },
    ];
    report.fleet.byVenue.forEach(v => venues.addRow(v));

    const bookings = wb.addWorksheet('Bookings');
    bookings.columns = [{ header: 'Metric', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 40 }];
    bookings.addRow({ k: 'Total bookings', v: report.bookings.total });
    bookings.addRow({ k: 'Overdue now', v: report.bookings.overdueCount });
    bookings.addRow({ k: 'Completed', v: report.bookings.completedCount });
    bookings.addRow({ k: 'Avg duration (h)', v: report.bookings.avgDurationHours ?? '—' });
    Object.entries(report.bookings.byState).forEach(([k, v]) => bookings.addRow({ k: `State: ${k}`, v }));
    report.bookings.byCar.forEach(c => bookings.addRow({ k: `Car ${c.carNumber}`, v: `${c.count} bookings` }));

    const requests = wb.addWorksheet('Requests');
    requests.columns = [{ header: 'Metric', key: 'k', width: 28 }, { header: 'Value', key: 'v', width: 20 }];
    Object.entries(report.requests).forEach(([k, v]) => requests.addRow({ k, v }));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=pool_report.xlsx');
    await wb.xlsx.write(res);
    res.end();
  } catch (error) {
    console.error('Failed to export pool report:', error);
    res.status(500).json({ error: 'Failed to export pool report' });
  }
}

static async exportPoolReportPdf(req: AuthRequest, res: Response) {
  try {
    const stadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
    const report = await reportsService.getPoolReport({ stadiumId: stadiumId === '__none__' ? '__none__' : stadiumId });
    const buffer = await poolReportPdf({ data: report, reference: makeReference('POOL', randomUUID()) });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=pool_report.pdf');
    res.send(buffer);
  } catch (error) {
    console.error('Failed to export pool report PDF:', error);
    res.status(500).json({ error: 'Failed to export pool report PDF' });
  }
}
```

**Note:** `getPoolReport({ stadiumId: '__none__' })` on the service — `'__none__'` is a real string so Prisma `where.stadiumId = '__none__'` matches nothing, which is the intended empty result. That is acceptable; no extra guard needed in the service.

- [ ] **Step 3: Add routes**

In `reports.routes.ts`, after the `// ==================== USER REPORTS ====================` block (before `// ==================== PRINT LABELS ====================`):

```ts
// ==================== POOL REPORT ====================
router.get('/pool', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), auditLog(), ReportsController.getPoolReport);
router.get('/pool/export', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), auditLog(), ReportsController.exportPoolReport);
router.get('/pool/export/pdf', requireRole('SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'), auditLog(), ReportsController.exportPoolReportPdf);
```

- [ ] **Step 4: Typecheck + verify via curl**

Run: `cd backend && npx tsc --noEmit` → exit 0.

With backend dev server up and `$TOKEN` from Task 2:
```bash
curl -s localhost:3005/api/v1/reports/pool -H "Authorization: Bearer $TOKEN" | head -c 400
curl -s localhost:3005/api/v1/reports/pool/export/pdf -H "Authorization: Bearer $TOKEN" -o /tmp/pool.pdf -w '%{http_code} %{size_download}\n'
head -c 5 /tmp/pool.pdf   # expect %PDF-
curl -s localhost:3005/api/v1/reports/pool/export -H "Authorization: Bearer $TOKEN" -o /tmp/pool.xlsx -w '%{http_code} %{size_download}\n'
```
Expected: JSON with `fleet`/`bookings`/`requests`/`utilizationPct`; PDF starts `%PDF-`, non-zero size; xlsx 200 non-zero. (If a transient 0-byte PDF appears mid tsx-watch reload, `sleep 3` and retry.)

Also confirm venue scoping — login as `admin@gcms.com` and check `scope.stadiumId` is that admin's venue and `?stadiumId=<other>` is ignored.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/pdf.service.ts backend/src/modules/reports/reports.controller.ts backend/src/modules/reports/reports.routes.ts
git commit -m "feat(reports): GET /reports/pool + Excel/PDF exports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 4: Pool tab in ReportsPage

**Files:**
- Modify: `frontend/src/lib/api.ts` (`reportsApi` — add 2 methods near line 283–289)
- Modify: `frontend/src/pages/ReportsPage.tsx` (new `TabsTrigger value="pool"` + `TabsContent`, a `loadPoolReport` loader, state, and export buttons)

**Interfaces:**
- Consumes: `apiClient` (already imported in `api.ts`); the `/reports/pool*` endpoints from Task 3. In `ReportsPage.tsx`: existing `allStadiums`, `isStadiumLocked`, `role`, `handleExport*` pattern, `<Tabs>`, `<Card>`, `<Select>`, `<Button>`, `<Table>` imports.
- Produces: `reportsApi.getPoolReport(params?)`, `reportsApi.exportPoolReport(format: 'xlsx' | 'pdf', params?)`.

- [ ] **Step 1: Add API methods**

In `frontend/src/lib/api.ts`, inside `reportsApi` (next to the user-report methods):

```ts
    getPoolReport: (params?: Record<string, any>) =>
        apiClient.get('/reports/pool', { params }),
    exportPoolReport: (format: 'xlsx' | 'pdf', params?: Record<string, any>) =>
        apiClient.get(`/reports/pool/export${format === 'pdf' ? '/pdf' : ''}`, { params, responseType: 'blob' }),
```

- [ ] **Step 2: Add the tab trigger**

In `ReportsPage.tsx`, add after the `users` trigger (~line 344), matching the sibling markup:

```tsx
                    <TabsTrigger value="pool" className="flex items-center gap-2">
                        <Car className="w-4 h-4" />
                        <span className="hidden sm:inline">Pool</span>
                    </TabsTrigger>
```

(Use whichever icon is already imported for cars/fleet — `Car` if present; otherwise reuse an imported one like `LayoutGrid`. Do not add a new import if an equivalent is already in the file.)

- [ ] **Step 3: Add state + loader**

Near the other `use*` report state (e.g. beside `userReports`):

```tsx
    const [poolReport, setPoolReport] = useState<any>(null);
    const [poolLoading, setPoolLoading] = useState(false);
    const [poolStadiumFilter, setPoolStadiumFilter] = useState('');

    const loadPoolReport = async () => {
        setPoolLoading(true);
        try {
            const params: Record<string, any> = {};
            if (poolStadiumFilter) params.stadiumId = poolStadiumFilter;
            const res = await reportsApi.getPoolReport(params);
            setPoolReport(res.data);
        } catch {
            toast.error('Failed to load pool report');
        } finally {
            setPoolLoading(false);
        }
    };

    const handleExportPool = async (format: 'xlsx' | 'pdf') => {
        setExporting('pool');
        try {
            const params: Record<string, any> = {};
            if (poolStadiumFilter) params.stadiumId = poolStadiumFilter;
            const res = await reportsApi.exportPoolReport(format, params);
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `pool_report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to export pool report');
        } finally {
            setExporting(null);
        }
    };
```

(Match the existing file's export/download idiom — if other `handleExport*` use a shared `downloadBlob` helper, use that instead of the inline `createObjectURL` above.)

- [ ] **Step 4: Add the tab content**

After the `users` `TabsContent` closes (~line 757), add:

```tsx
                <TabsContent value="pool">
                    <Card>
                        <CardHeader>
                            <CardTitle>Pool Car Report</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Pool fleet inventory, booking activity, request mix and utilization
                                {role === 'Admin' ? ' for your venue.' : ' across all venues.'}
                            </p>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex gap-3 flex-wrap items-end">
                                {!isStadiumLocked && (
                                    <div className="space-y-1 min-w-[180px]">
                                        <p className="text-xs font-medium text-muted-foreground">Stadium</p>
                                        <Select value={poolStadiumFilter || '__all__'} onValueChange={v => setPoolStadiumFilter(v === '__all__' ? '' : v)}>
                                            <SelectTrigger className="w-48"><SelectValue placeholder="All Stadiums" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">All Stadiums</SelectItem>
                                                {allStadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}
                                <Button size="sm" onClick={loadPoolReport} disabled={poolLoading}>
                                    {poolLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                                    Load Report
                                </Button>
                                <Button size="sm" variant="outline" onClick={() => handleExportPool('pdf')} disabled={exporting === 'pool' || !poolReport}>PDF</Button>
                                <Button size="sm" variant="outline" onClick={() => handleExportPool('xlsx')} disabled={exporting === 'pool' || !poolReport}>Excel</Button>
                            </div>

                            {poolReport ? (
                                <div className="grid gap-4 md:grid-cols-2">
                                    <div className="rounded-md border p-4">
                                        <h4 className="font-medium mb-2">Pool fleet</h4>
                                        <p className="text-sm">Total pool cars: <b>{poolReport.fleet.total}</b></p>
                                        <p className="text-sm">Utilization: <b>{poolReport.utilizationPct ?? '—'}{poolReport.utilizationPct != null ? '%' : ''}</b></p>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {Object.entries(poolReport.fleet.byStatus).map(([k, v]) => `${k}: ${v}`).join('  ·  ') || '—'}
                                        </p>
                                    </div>
                                    <div className="rounded-md border p-4">
                                        <h4 className="font-medium mb-2">Bookings</h4>
                                        <p className="text-sm">Total: <b>{poolReport.bookings.total}</b></p>
                                        <p className="text-sm">Overdue now: <b>{poolReport.bookings.overdueCount}</b> · Completed: <b>{poolReport.bookings.completedCount}</b></p>
                                        <p className="text-sm">Avg duration: <b>{poolReport.bookings.avgDurationHours ?? '—'}</b> h</p>
                                    </div>
                                    <div className="rounded-md border p-4">
                                        <h4 className="font-medium mb-2">Requests</h4>
                                        <p className="text-sm">Pending {poolReport.requests.pending} · Approved {poolReport.requests.approved} · Rejected {poolReport.requests.rejected}</p>
                                        <p className="text-sm">Pool-shared {poolReport.requests.poolShared} · Dedicated {poolReport.requests.dedicated}</p>
                                    </div>
                                    <div className="rounded-md border p-4">
                                        <h4 className="font-medium mb-2">Top cars by bookings</h4>
                                        <ul className="text-sm text-muted-foreground space-y-0.5">
                                            {poolReport.bookings.byCar.slice(0, 8).map((c: any) => (
                                                <li key={c.carNumber}>{c.carNumber}: {c.count}</li>
                                            ))}
                                            {poolReport.bookings.byCar.length === 0 && <li>—</li>}
                                        </ul>
                                    </div>
                                </div>
                            ) : (
                                <div className="text-center py-12 text-muted-foreground">
                                    <p>Click "Load Report" to view pool analytics.</p>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
```

- [ ] **Step 5: Typecheck + browser check**

Run: `cd frontend && npx tsc --noEmit` → exit 0.

Browser (frontend + backend up), login `superadmin@gcms.com`: open Reports → **Pool** tab → Load Report → cards populate; PDF + Excel buttons download files. Login `admin@gcms.com`: no Stadium selector (locked), numbers are venue-scoped. Check the tab strip + cards at 375 / 768 / 1280 px — no horizontal body scroll.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/pages/ReportsPage.tsx
git commit -m "feat(reports): Pool tab in ReportsPage with PDF/Excel export

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 5: No-login public bookers in the User report

**Files:**
- Create: `backend/src/modules/reports/public-bookers.ts`
- Test: `backend/src/modules/reports/public-bookers.test.ts`
- Modify: `backend/src/modules/reports/reports.service.ts` (`getUserReports` return + a `getPublicBookers` helper method)
- Modify: `backend/src/modules/reports/reports.controller.ts` (`exportUserReport` Excel: add a "Public Bookers" sheet; `exportUserReportPdf`: add a "Public bookers" section)

**Interfaces:**
- Consumes: nothing external for the pure helper.
- Produces:
  ```ts
  export interface PublicBookingRow {
    requesterEmail: string;
    requesterName: string;
    requesterPhone: string;
    faAccreditationNumber: string | null;
    createdAt: Date | string;
  }
  export interface PublicBookerRow {
    email: string;
    name: string;
    phone: string;
    faCode: string | null;
    bookingCount: number;
    lastBookingAt: string | null;   // ISO
    source: 'public-booking';
  }
  export function buildPublicBookerRows(bookings: PublicBookingRow[], knownEmails: Set<string>): PublicBookerRow[];
  ```
  On `ReportsService`: `async getPublicBookers(filters: { stadiumId?: string }): Promise<PublicBookerRow[]>`.
  `getUserReports` return type unchanged (array of `UserReport`) — the public bookers are a **separate** method so existing callers keep working; the controller composes both.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/reports/public-bookers.test.ts
import { describe, it, expect } from 'vitest';
import { buildPublicBookerRows, PublicBookingRow } from './public-bookers';

const row = (over: Partial<PublicBookingRow>): PublicBookingRow => ({
  requesterEmail: 'ext@x.com', requesterName: 'Ext User', requesterPhone: '999',
  faAccreditationNumber: 'FA-1', createdAt: '2026-09-01T10:00:00Z', ...over,
});

describe('buildPublicBookerRows', () => {
  it('excludes bookers who have a user account', () => {
    const rows = buildPublicBookerRows(
      [row({ requesterEmail: 'staff@gcms.com' }), row({ requesterEmail: 'ext@x.com' })],
      new Set(['staff@gcms.com']),
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].email).toBe('ext@x.com');
    expect(rows[0].source).toBe('public-booking');
  });

  it('aggregates by email: count + latest date, case-insensitive', () => {
    const rows = buildPublicBookerRows([
      row({ requesterEmail: 'ext@x.com', createdAt: '2026-09-01T00:00:00Z' }),
      row({ requesterEmail: 'EXT@x.com', createdAt: '2026-09-05T00:00:00Z' }),
    ], new Set());
    expect(rows).toHaveLength(1);
    expect(rows[0].bookingCount).toBe(2);
    expect(rows[0].lastBookingAt).toBe('2026-09-05T00:00:00.000Z');
  });

  it('carries name/phone/faCode from the most recent booking', () => {
    const rows = buildPublicBookerRows([
      row({ createdAt: '2026-09-01T00:00:00Z', requesterName: 'Old', faAccreditationNumber: 'FA-OLD' }),
      row({ createdAt: '2026-09-09T00:00:00Z', requesterName: 'New', faAccreditationNumber: 'FA-NEW', requesterPhone: '111' }),
    ], new Set());
    expect(rows[0].name).toBe('New');
    expect(rows[0].phone).toBe('111');
    expect(rows[0].faCode).toBe('FA-NEW');
  });

  it('returns [] for no input', () => {
    expect(buildPublicBookerRows([], new Set())).toEqual([]);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './public-bookers'`)

Run: `cd backend && npx vitest run src/modules/reports/public-bookers.test.ts`

- [ ] **Step 3: Implement**

```ts
// backend/src/modules/reports/public-bookers.ts
export interface PublicBookingRow {
  requesterEmail: string;
  requesterName: string;
  requesterPhone: string;
  faAccreditationNumber: string | null;
  createdAt: Date | string;
}

export interface PublicBookerRow {
  email: string;
  name: string;
  phone: string;
  faCode: string | null;
  bookingCount: number;
  lastBookingAt: string | null;
  source: 'public-booking';
}

export function buildPublicBookerRows(
  bookings: PublicBookingRow[],
  knownEmails: Set<string>,
): PublicBookerRow[] {
  const known = new Set([...knownEmails].map(e => e.toLowerCase()));
  const acc = new Map<string, { latest: number; row: PublicBookingRow; count: number }>();

  for (const b of bookings) {
    const key = b.requesterEmail.toLowerCase();
    if (known.has(key)) continue;
    const ts = new Date(b.createdAt).getTime();
    const cur = acc.get(key);
    if (!cur) {
      acc.set(key, { latest: ts, row: b, count: 1 });
    } else {
      cur.count++;
      if (ts >= cur.latest) { cur.latest = ts; cur.row = b; }
    }
  }

  return [...acc.entries()]
    .map(([email, v]) => ({
      email,
      name: v.row.requesterName,
      phone: v.row.requesterPhone,
      faCode: v.row.faAccreditationNumber ?? null,
      bookingCount: v.count,
      lastBookingAt: Number.isFinite(v.latest) ? new Date(v.latest).toISOString() : null,
      source: 'public-booking' as const,
    }))
    .sort((a, b) => b.bookingCount - a.bookingCount || a.email.localeCompare(b.email));
}
```

- [ ] **Step 4: Run — expect PASS** (4 tests)

Run: `cd backend && npx vitest run src/modules/reports/public-bookers.test.ts`

- [ ] **Step 5: Add the service method**

In `reports.service.ts`, `import { buildPublicBookerRows, PublicBookerRow } from './public-bookers';` and add:

```ts
async getPublicBookers(filters: { stadiumId?: string } = {}): Promise<PublicBookerRow[]> {
  const where: any = {};
  if (filters.stadiumId) where.stadiumId = filters.stadiumId;

  const [bookings, users] = await Promise.all([
    this.prisma.poolBookingRequest.findMany({
      where,
      select: {
        requesterEmail: true, requesterName: true, requesterPhone: true, createdAt: true,
        faUser: { select: { accreditationNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    this.prisma.user.findMany({ select: { email: true } }),
  ]);

  return buildPublicBookerRows(
    bookings.map(b => ({
      requesterEmail: b.requesterEmail,
      requesterName: b.requesterName,
      requesterPhone: b.requesterPhone,
      faAccreditationNumber: b.faUser?.accreditationNumber ?? null,
      createdAt: b.createdAt,
    })),
    new Set(users.map(u => u.email)),
  );
}
```

- [ ] **Step 6: Wire into the three user-report endpoints**

`reports.controller.ts`:

- `getUserReports`: return `{ users: reports, publicBookers }` — **breaking the response shape**. Check `ReportsPage.tsx` `loadUserReports` (~line 208): it currently does `setUserReports(res.data)`. Update it to `setUserReports(res.data.users ?? res.data)` and add `setPublicBookers(res.data.publicBookers ?? [])`. Keep it backward-tolerant with the `?? res.data` fallback.

  ```ts
  static async getUserReports(req: AuthRequest, res: Response) {
    try {
      const { role } = req.query as any;
      const filterStadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
      const [users, publicBookers] = await Promise.all([
        reportsService.getUserReports({ stadiumId: filterStadiumId, role }),
        reportsService.getPublicBookers({ stadiumId: filterStadiumId }),
      ]);
      res.status(200).json({ users, publicBookers });
    } catch (error) {
      res.status(500).json({ error: 'Failed to get user reports' });
    }
  }
  ```

- `exportUserReport` (Excel): after the existing sheets, add:

  ```ts
  const publicBookers = await reportsService.getPublicBookers({ stadiumId: filterStadiumId });
  const pbSheet = workbook.addWorksheet('Public Bookers');
  pbSheet.columns = [
    { header: 'Name', key: 'name', width: 25 },
    { header: 'FA Code', key: 'faCode', width: 16 },
    { header: 'Phone', key: 'phone', width: 18 },
    { header: 'Email', key: 'email', width: 30 },
    { header: 'Bookings', key: 'bookingCount', width: 10 },
    { header: 'Last Booking', key: 'lastBookingAt', width: 22 },
    { header: 'Source', key: 'source', width: 16 },
  ];
  publicBookers.forEach(b => pbSheet.addRow({
    ...b,
    faCode: b.faCode || '—',
    lastBookingAt: b.lastBookingAt ? new Date(b.lastBookingAt).toLocaleString() : '—',
  }));
  ```

- `exportUserReportPdf`: after the "Total Users" summary line, add a section:

  ```ts
  const publicBookers = await reportsService.getPublicBookers({ stadiumId: filterStadiumId });
  if (publicBookers.length) {
    doc.addPage();
    doc.font('Helvetica-Bold').fontSize(14).text('Public Bookers (no login)', { align: 'center' });
    doc.moveDown();
    doc.fontSize(9);
    const pbHeaders = ['Name', 'FA Code', 'Phone', 'Email', 'Bookings', 'Last Booking'];
    const pbWidths = [110, 70, 90, 170, 55, 110];
    let py = doc.y;
    let px = 30;
    doc.font('Helvetica-Bold');
    pbHeaders.forEach((h, i) => { doc.text(h, px, py, { width: pbWidths[i] }); px += pbWidths[i]; });
    py += 16;
    doc.font('Helvetica').fontSize(8);
    publicBookers.forEach(b => {
      px = 30;
      const cells = [
        b.name, b.faCode || '—', b.phone, b.email, String(b.bookingCount),
        b.lastBookingAt ? new Date(b.lastBookingAt).toLocaleDateString() : '—',
      ];
      cells.forEach((c, i) => { doc.text(c, px, py, { width: pbWidths[i] }); px += pbWidths[i]; });
      py += 14;
      if (py > doc.page.height - 40) { doc.addPage(); py = 30; }
    });
  }
  ```

- [ ] **Step 7: Frontend — render the public bookers**

In `ReportsPage.tsx`:
- add `const [publicBookers, setPublicBookers] = useState<any[]>([]);`
- in `loadUserReports`: `setUserReports(res.data.users ?? res.data); setPublicBookers(res.data.publicBookers ?? []);`
- in the `users` `TabsContent`, after the existing users table, add a second table when `publicBookers.length > 0`:

  ```tsx
  {publicBookers.length > 0 && (
      <div className="mt-6 space-y-2">
          <h4 className="font-medium">Public bookers (no login)</h4>
          <div className="overflow-x-auto rounded-md border">
              <Table>
                  <TableHeader>
                      <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>FA Code</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Bookings</TableHead>
                          <TableHead>Last Booking</TableHead>
                      </TableRow>
                  </TableHeader>
                  <TableBody>
                      {publicBookers.map((b) => (
                          <TableRow key={b.email}>
                              <TableCell className="text-sm font-medium">{b.name}</TableCell>
                              <TableCell className="font-mono text-xs">{b.faCode || '—'}</TableCell>
                              <TableCell className="text-sm">{b.phone}</TableCell>
                              <TableCell className="text-sm">{b.email}</TableCell>
                              <TableCell>{b.bookingCount}</TableCell>
                              <TableCell className="text-xs">{b.lastBookingAt ? new Date(b.lastBookingAt).toLocaleDateString() : '—'}</TableCell>
                          </TableRow>
                      ))}
                  </TableBody>
              </Table>
          </div>
      </div>
  )}
  ```

- [ ] **Step 8: Typecheck + verify**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` → both exit 0.
Run: `cd backend && npm test` → still green (expect 35 tests / 6 files: +4 pool-report, +4 public-bookers — adjust the count if Task 1's file already merged).

Browser: seed at least one public pool booking (submit `/book-pool` with an email that is NOT a user), then Reports → Users → Load → the "Public bookers" table shows it; Export PDF + Excel contain the section. As `admin@gcms.com`, the list is venue-scoped.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/reports/public-bookers.ts backend/src/modules/reports/public-bookers.test.ts backend/src/modules/reports/reports.service.ts backend/src/modules/reports/reports.controller.ts frontend/src/pages/ReportsPage.tsx
git commit -m "feat(reports): user report includes no-login public pool bookers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 6: FA audit trail — timestamp detail

**Files:**
- Create: `backend/src/modules/reports/fa-trail-detail.ts`
- Test: `backend/src/modules/reports/fa-trail-detail.test.ts`
- Modify: `backend/src/modules/reports/reports.service.ts` (`getFaAuditTrail` — enrich each mapped row)
- Modify: `frontend/src/pages/ReportsPage.tsx` (FA-audit table columns)

**Interfaces:**
- Produces:
  ```ts
  export function possessionMinutes(start: Date | string | null | undefined, end: Date | string | null | undefined): number | null;
  export function formatDuration(minutes: number | null): string;   // "—", "45m", "3h 12m", "2d 4h"
  ```
- `getFaAuditTrail` row gains: `checkedInAt: string | null`, `checkOutAt: string | null`, `handoverSignedAt: string | null`, `userSignedAt: string | null`, `afteruseSignedAt: string | null`, `possessionMinutes: number | null`, `possessionLabel: string`. Existing fields unchanged.

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/reports/fa-trail-detail.test.ts
import { describe, it, expect } from 'vitest';
import { possessionMinutes, formatDuration } from './fa-trail-detail';

describe('possessionMinutes', () => {
  it('returns whole minutes between two instants', () => {
    expect(possessionMinutes('2026-09-09T08:00:00Z', '2026-09-09T09:30:00Z')).toBe(90);
  });
  it('is null when either bound is missing', () => {
    expect(possessionMinutes(null, '2026-09-09T09:30:00Z')).toBeNull();
    expect(possessionMinutes('2026-09-09T08:00:00Z', undefined)).toBeNull();
  });
  it('is null when end precedes start', () => {
    expect(possessionMinutes('2026-09-09T10:00:00Z', '2026-09-09T09:00:00Z')).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats null as a dash', () => expect(formatDuration(null)).toBe('—'));
  it('formats minutes only', () => expect(formatDuration(45)).toBe('45m'));
  it('formats hours and minutes', () => expect(formatDuration(192)).toBe('3h 12m'));
  it('formats days and hours', () => expect(formatDuration(60 * 52)).toBe('2d 4h'));
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && npx vitest run src/modules/reports/fa-trail-detail.test.ts`

- [ ] **Step 3: Implement**

```ts
// backend/src/modules/reports/fa-trail-detail.ts
export function possessionMinutes(
  start: Date | string | null | undefined,
  end: Date | string | null | undefined,
): number | null {
  if (start == null || end == null) return null;
  const s = new Date(start).getTime();
  const e = new Date(end).getTime();
  if (!Number.isFinite(s) || !Number.isFinite(e) || e < s) return null;
  return Math.floor((e - s) / 60000);
}

export function formatDuration(minutes: number | null): string {
  if (minutes == null) return '—';
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = minutes % 60;
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}
```

- [ ] **Step 4: Run — expect PASS** (7 tests)

Run: `cd backend && npx vitest run src/modules/reports/fa-trail-detail.test.ts`

- [ ] **Step 5: Enrich `getFaAuditTrail`**

In `reports.service.ts` `getFaAuditTrail`:
- add to the `handoverLog.findMany` `include.fleet.select`: `checkedInAt: true`, and `handoverForm: { select: { adminSignedAt: true, userSignedAt: true, afteruseSignedAt: true } }`.
- add `import { possessionMinutes, formatDuration } from './fa-trail-detail';`
- after fetching `handoverLogs`, for the check-out timestamp use the log itself when `action === 'CheckedOut'`, else look up the latest `CheckedOut` log for that `fleetId` among the page (cheap: one extra `handoverLog.findMany` for `fleetId in [...] , action: 'CheckedOut'` ordered desc, first-per-fleet into a Map — mirror the pattern already in `getActiveCarsUsage` lines ~740–758).
- extend each mapped row:

  ```ts
  const checkedInAt = log.fleet.checkedInAt ?? null;
  const checkOutAt = log.action === 'CheckedOut' ? log.timestamp : (latestCheckOutMap.get(log.fleetId) ?? null);
  const pm = possessionMinutes(checkedInAt, checkOutAt);
  return {
    // ...existing fields...
    checkedInAt,
    checkOutAt,
    handoverSignedAt: log.fleet.handoverForm?.adminSignedAt ?? null,
    userSignedAt: log.fleet.handoverForm?.userSignedAt ?? null,
    afteruseSignedAt: log.fleet.handoverForm?.afteruseSignedAt ?? null,
    possessionMinutes: pm,
    possessionLabel: formatDuration(pm),
  };
  ```

- [ ] **Step 6: Surface in the FA-audit table**

In `ReportsPage.tsx` `fa-audit` `TabsContent` table (~line 818): add `<TableHead>Checked in</TableHead>`, `<TableHead>Checked out</TableHead>`, `<TableHead>Possession</TableHead>` after the existing `Notes` head (or before it), and matching `<TableCell>`s:

```tsx
<TableCell className="text-xs whitespace-nowrap">{log.checkedInAt ? new Date(log.checkedInAt).toLocaleString() : '—'}</TableCell>
<TableCell className="text-xs whitespace-nowrap">{log.checkOutAt ? new Date(log.checkOutAt).toLocaleString() : '—'}</TableCell>
<TableCell className="text-xs whitespace-nowrap">{log.possessionLabel || '—'}</TableCell>
```

Keep the table inside its existing `overflow-x-auto` wrapper.

- [ ] **Step 7: FA-trail in exports**

`getFaAuditTrail` feeds the FA-trail JSON only; there is no dedicated FA-trail export endpoint today. The handover export (`exportHandoverLogs`) is separate. Spec §8.4 says "Excel/PDF export" — the intended target is the **handover** export used for FA activity. Add the same 4 timestamp columns (`Checked In`, `Checked Out`, `Handover Signed`, `Possession`) to `exportHandoverLogs` in `reports.controller.ts` (it already iterates handover logs with `fleet` + `user`): extend its `include` with `fleet: { select: { checkedInAt: true, handoverForm: { select: { adminSignedAt: true } } } }` and add the columns + `possessionMinutes(fleet.checkedInAt, <checkout ts>)` per row. If `exportHandoverLogs` currently uses `reportsService.getHandoverReports`, add the fields there instead and keep the controller thin. Match whichever pattern the file already uses.

- [ ] **Step 8: Typecheck + verify**

Run: `cd backend && npx tsc --noEmit`, `cd frontend && npx tsc --noEmit` → exit 0.
Run: `cd backend && npm test` → green (now +3 fa-trail tests).
Browser: Reports → FA Audit Trail → Load Trail → new columns show timestamps / possession; handover Excel export has the new columns.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/reports/fa-trail-detail.ts backend/src/modules/reports/fa-trail-detail.test.ts backend/src/modules/reports/reports.service.ts backend/src/modules/reports/reports.controller.ts frontend/src/pages/ReportsPage.tsx
git commit -m "feat(reports): FA audit trail shows check-in/out + signing timestamps and possession

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 7: Print label redesign

**Files:**
- Create: `backend/src/modules/reports/label-layout.ts`
- Test: `backend/src/modules/reports/label-layout.test.ts`
- Modify: `backend/src/modules/reports/reports.controller.ts` (`exportLabelsPdf` full rewrite; `exportLabelsDocx` / `exportLabelsPptx` — swap the dept-code line for the FA line)
- Modify: `frontend/src/pages/ReportsPage.tsx` (Labels tab helper copy)

**Interfaces:**
- Consumes: `reportsService.getLabelsData({ stadiumId })` — already returns `{ carNumber, carType, status, stadium, faName, faAccreditationNumber, departmentCode, departmentName }`.
- Produces:
  ```ts
  export function labelCarFontSize(carNumber: string, availW: number, availH: number): number;
  // clamps to [60, 260]; shrinks for width when carNumber.length > 3
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/reports/label-layout.test.ts
import { describe, it, expect } from 'vitest';
import { labelCarFontSize } from './label-layout';

describe('labelCarFontSize', () => {
  it('caps at 260 for a short number in a tall box', () => {
    expect(labelCarFontSize('7', 400, 900)).toBe(260);
  });
  it('never returns below the 60 floor', () => {
    expect(labelCarFontSize('ABCDEFGHIJ', 120, 80)).toBe(60);
  });
  it('shrinks with width for longer numbers', () => {
    const short = labelCarFontSize('12', 300, 300);
    const long = labelCarFontSize('123456', 300, 300);
    expect(long).toBeLessThan(short);
  });
  it('is deterministic', () => {
    expect(labelCarFontSize('C-142', 500, 400)).toBe(labelCarFontSize('C-142', 500, 400));
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && npx vitest run src/modules/reports/label-layout.test.ts`

- [ ] **Step 3: Implement**

```ts
// backend/src/modules/reports/label-layout.ts
const MIN = 60;
const MAX = 260;

export function labelCarFontSize(carNumber: string, availW: number, availH: number): number {
  let size = Math.min(availH * 0.7, MAX);
  const len = Math.max(carNumber.length, 1);
  if (len > 3) {
    size = Math.min(size, Math.floor((availW * 0.8) / len));
  }
  return Math.max(MIN, Math.round(size));
}
```

- [ ] **Step 4: Run — expect PASS** (4 tests)

Run: `cd backend && npx vitest run src/modules/reports/label-layout.test.ts`

- [ ] **Step 5: Rewrite `exportLabelsPdf`**

Replace the body of `exportLabelsPdf` in `reports.controller.ts` with a **portrait A5, one car per page** layout. Key changes from the current landscape version:
- `new PDFDocument({ margin: 0, size: 'A5', layout: 'portrait' })` (A5 portrait ≈ 419.5 × 595.28 pt).
- Header: `headerBuffer` full-width banner at `y=0`; the `logoBuffer` centered under it (or top-left) + `settings.tournamentName` centered.
- Middle: `labelCarFontSize(label.carNumber, availW, availH)` for the car number, vertically centered in the space between header and the FA line.
- **Directly beneath the car number:** `FA: ${label.faAccreditationNumber || '—'}` in a bold ~28–40pt font, centered. (Replaces the current `deptCode` line.)
- Footer: `footerBuffer` full-width banner pinned to the bottom, then `settings.footerText` + `settings.tournamentName` centered above/below it.
- Keep the existing `fetchImageBuffer` calls and the empty-state message.
- Keep `res.setHeader('Content-Disposition', 'attachment; filename=labels.pdf')`.

Reference skeleton (adapt spacing to A5):

```ts
static async exportLabelsPdf(req: AuthRequest, res: Response) {
  try {
    const filterStadiumId = resolveStadiumScope(req.user, req.query.stadiumId);
    const [labelsData, settings] = await Promise.all([
      reportsService.getLabelsData({ stadiumId: filterStadiumId }),
      prisma.systemSettings.findFirst(),
    ]);
    const [logoBuffer, headerBuffer, footerBuffer] = await Promise.all([
      fetchImageBuffer(settings?.logoUrl),
      fetchImageBuffer(settings?.headerUrl),
      fetchImageBuffer(settings?.footerUrl),
    ]);

    const doc = new PDFDocument({ margin: 0, size: 'A5', layout: 'portrait' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename=labels.pdf');
    doc.pipe(res);

    const pageW = doc.page.width;
    const pageH = doc.page.height;
    const margin = 28;
    const HEADER_IMG_H = 64;
    const LOGO_SIZE = 46;
    const FOOTER_IMG_H = 48;

    labelsData.forEach((label, index) => {
      if (index > 0) doc.addPage();

      let top = 0;
      if (headerBuffer) {
        doc.image(headerBuffer, 0, 0, { width: pageW, height: HEADER_IMG_H, cover: [pageW, HEADER_IMG_H] });
        top = HEADER_IMG_H + 8;
      } else {
        top = margin;
      }

      if (logoBuffer) {
        doc.image(logoBuffer, (pageW - LOGO_SIZE) / 2, top, { fit: [LOGO_SIZE, LOGO_SIZE] });
        top += LOGO_SIZE + 6;
      }
      if (settings?.tournamentName) {
        doc.font('Helvetica-Bold').fontSize(13).fillColor('#222')
          .text(settings.tournamentName, margin, top, { width: pageW - margin * 2, align: 'center', lineBreak: false });
        top += 20;
      }

      const footerTextH = settings?.footerText ? 16 : 0;
      const footerBlockH = (footerBuffer ? FOOTER_IMG_H : 0) + footerTextH + 10;
      const footerTop = pageH - footerBlockH;

      const faLineH = 42;
      const availTop = top + 10;
      const availH = footerTop - availTop - faLineH - 16;
      const availW = pageW - margin * 2;

      const carFont = labelCarFontSize(label.carNumber, availW, availH);
      const carY = availTop + (availH - carFont * 0.9) / 2;
      doc.font('Helvetica-Bold').fontSize(carFont).fillColor('#000')
        .text(label.carNumber, margin, carY, { width: availW, align: 'center', lineBreak: false });

      doc.font('Helvetica-Bold').fontSize(Math.min(38, Math.max(24, carFont * 0.22))).fillColor('#333')
        .text(`FA: ${label.faAccreditationNumber || '—'}`, margin, carY + carFont * 0.92, { width: availW, align: 'center', lineBreak: false });

      let fy = footerTop;
      if (footerBuffer) {
        doc.image(footerBuffer, 0, fy, { width: pageW, height: FOOTER_IMG_H, cover: [pageW, FOOTER_IMG_H] });
        fy += FOOTER_IMG_H + 4;
      }
      if (settings?.footerText) {
        doc.font('Helvetica').fontSize(8).fillColor('#666')
          .text(`${settings.footerText}${settings.tournamentName ? '  ·  ' + settings.tournamentName : ''}`, margin, fy, { width: pageW - margin * 2, align: 'center' });
      }
    });

    if (labelsData.length === 0) {
      doc.font('Helvetica').fontSize(14).fillColor('#666')
        .text('No assigned cars found for the selected criteria.', margin, pageH / 2, { align: 'center', width: doc.page.width - margin * 2 });
    }

    doc.end();
  } catch (error) {
    console.error('Failed to export labels PDF:', error);
    res.status(500).json({ error: 'Failed to export labels PDF' });
  }
}
```

- [ ] **Step 6: docx / pptx — FA line instead of dept code**

In `exportLabelsDocx` and `exportLabelsPptx`, find the paragraph/text that renders `label.departmentCode` beneath the car number and change it to `FA: ${label.faAccreditationNumber || '—'}`. Do not restructure these exporters otherwise — PDF is canonical; these stay as a convenience.

- [ ] **Step 7: Labels tab copy**

In `ReportsPage.tsx` `labels` `TabsContent`, update the "Label Format" `<ul>` and the header `<p>` to describe the new layout: portrait, one car per page, event logo + banner header, large centered car number, `FA: <code>` beneath, branded footer. Remove the "Landscape" / "Department code" / "size 220" lines.

- [ ] **Step 8: Typecheck + verify**

Run: `cd backend && npx tsc --noEmit`, `cd frontend && npx tsc --noEmit` → exit 0.
Run: `cd backend && npm test` → green (+4 label-layout).
Browser / curl: `GET /api/v1/reports/labels/pdf` with a SuperAdmin token → `%PDF-`, one page per assigned car; open it — header banner, big car number, `FA: <accreditation>` beneath, footer. Try a stadium filter. `admin@gcms.com` → only their venue's assigned cars.

- [ ] **Step 9: Commit**

```bash
git add backend/src/modules/reports/label-layout.ts backend/src/modules/reports/label-layout.test.ts backend/src/modules/reports/reports.controller.ts frontend/src/pages/ReportsPage.tsx
git commit -m "feat(reports): print-label PDF redesign — portrait, one per car, FA code beneath number

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 8: Phase 4B verification sweep

**Files:** none (verification only; fixups committed if needed).

- [ ] **Step 1: Full backend test run**

Run: `cd backend && npm test`
Expected: all green. New files add 4 + 4 + 3 + 4 = **15 tests** over 4 new files → **42 tests / 8 files** (adjust if any pre-existing count shifted).

- [ ] **Step 2: Typecheck both packages**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: exit 0 both.

- [ ] **Step 3: Acceptance walk-through (spec §8.6, the 4B rows)**

With backend + frontend up:
- [ ] `/reports/pool/export/pdf` as SuperAdmin → populated pool report PDF; as `admin@gcms.com` → venue-scoped, `?stadiumId=<other>` ignored.
- [ ] User report PDF/Excel list external pool bookers with FA + contact (seed one public `/book-pool` first).
- [ ] FA audit trail shows check-in / check-out timestamps in the table and in the handover Excel export.
- [ ] Label PDF: logo/banner header, large centered car number, `FA: <code>` beneath, footer; one car per page, portrait.

- [ ] **Step 4: Responsive check**

`ReportsPage.tsx` Pool tab + FA-audit table at 375 / 768 / 1280 px — tab strip wraps/scrolls, wide tables scroll inside their own container, no body horizontal scrollbar.

- [ ] **Step 5: Reset any dev-only state**

No dev-only toggles were flipped in 4B (unlike 4A's request window). Confirm `git status` is clean and the branch builds.

- [ ] **Step 6: Final commit if fixups were made**

```bash
git add -A
git commit -m "test: Phase 4B verification fixups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Self-Review

**1. Spec coverage:**
- §8.2 Pool report (JSON + `/export` Excel + `/export/pdf`, content = fleet inventory / bookings by car+venue / requests / utilization / overdue / avg duration, Admin auto-scoped, Pool tab) → Tasks 1–4. ✅
- §8.3 User report no-login bookers (pseudo-rows keyed by `requesterEmail`, FA code of linked `faUser`, phone, email, count, last date, `source: "public-booking"`, PDF/Excel section) → Task 5. ✅
- §8.4 FA audit trail detail (check-in `fleet.checkedInAt`, check-out, handover/user/after-use signed-at, possession duration; UI + export columns) → Task 6. ✅ (admin-return-at: `HandoverForm` has no `returnAdminSigAt`/`adminReturnAt` column — only `afteruseSignedAt` exists for the handback side; plan surfaces the three real signing timestamps. Noted as a spec/schema gap, not a task omission.)
- §8.5 Print label redesign (one car/page, logo+banner header, huge centered car number, `FA: <accreditationNumber>` beneath, footer + tournament name, print-laminate sizing; docx/pptx updated to match) → Task 7. ✅
- §8.6 acceptance → Task 8. ✅

**2. Placeholder scan:** No TBD / "handle edge cases" / "similar to Task N" / bare "add validation". Every code step has real code. Font-size / duration / aggregation edge cases are covered by explicit test cases. ✅

**3. Type consistency:**
- `PoolBookingSummary` shape identical in `pool-report.ts` (Task 1), the `import` in `reports.service.ts` (Task 2), and `PoolReportPdfData.bookings` (Task 3, structurally duplicated on purpose to keep `pdf.service.ts` leaf-level — flagged inline).
- `PublicBookerRow` identical in `public-bookers.ts` (Task 5) and consumed unchanged by controller + frontend.
- `getUserReports` controller response becomes `{ users, publicBookers }` — Task 5 Steps 6–7 update the one frontend caller with a `?? res.data` fallback. Flagged as the one breaking-shape change.
- `labelCarFontSize(carNumber, availW, availH)` — same signature in Task 7 Step 3 and Step 5 skeleton.
- `possessionMinutes` / `formatDuration` — same signatures in Task 6 test, impl, and both call sites (service + handover export).

**4. Gap check:** `getPoolReport({ stadiumId: '__none__' })` — `'__none__'` flows into Prisma as a literal string that matches no stadium (empty result), which is the intended venue-lock-with-no-venue behavior; the controller also short-circuits the JSON path. Acceptable, noted in Task 3.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-09-phase-4b-reports-labels.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints (matches how Phases 1–4A were run here).
