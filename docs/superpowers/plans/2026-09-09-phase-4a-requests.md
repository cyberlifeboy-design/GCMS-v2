# Phase 4A — Requests: window control, request type, requester notifications — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** SuperAdmin can open / close / schedule the public request & booking channels; the login-page buttons disable with a message when closed and the server rejects submissions; a manual "Announce" button notifies all FA/users; requests are labelled **Dedicated** vs **Pool shared resource** with the requester's FA code + contact shown; and approving/rejecting a request now notifies the requester by email + in-app.

**Architecture:** Four new `SystemSettings` columns drive an `isRequestWindowOpen()` pure function (unit-tested). `GET /settings/public` exposes the derived window state; the two public POST endpoints (`/public/requests`, `/public/pool-booking-requests`) call the same guard. `CarRequest.requestType` values migrate `one-time → pool-shared` (keeping `dedicated`). Approve/reject in `requests.service.ts` and `pool-booking-requests.service.ts` gain a requester notification using the existing `emailService.send()` and `notificationService`. A new `POST /settings/request-window/announce` broadcasts.

**Tech Stack:** TypeScript, Express, Prisma, zod, nodemailer (via existing `email.service.ts`), React, Vite, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` — §8.0 (request window), §8.0a (requester notification), §8.1 (request type + requester detail). NFRs §2a. Phase 4B covers the reports/labels part of §8.

## Global Constraints

- **Roles:** `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`. Announce + window settings are `requireRole('SuperAdmin')`.
- **`requestWindowMode` values (exact):** `open`, `closed`, `scheduled`.
- **`CarRequest.requestType` values after this phase (exact):** `dedicated`, `pool-shared`. Legacy `one-time` rows are migrated to `pool-shared`.
- **Window-open logic:** `open` → open; `closed` → closed; `scheduled` → open iff `now >= start` (or no start) AND `now <= end` (or no end).
- **Email:** call `emailService.send({ to, subject, text, html? })` — transport selection already lives in `email.service.ts` (Phase 7 refines env config; do not touch it here).
- **Responsive:** verify the login page and the Settings card at 375 / 768 / 1280 px.
- **Bug-free:** `npx tsc --noEmit` clean for touched files (backend + frontend); backend `npm test` green; every new endpoint has a typed JSON error path.
- **Commits:** one per task, conventional-commit, footer:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (:3005), frontend `cd frontend && npm run dev` (:3000). Logins: `superadmin@gcms.com` / `Admin@2024!`, `admin@gcms.com` / `Admin@2024!`.
- **Windows/Prisma:** `prisma migrate dev` fails to regen the client while the backend dev server holds the query-engine DLL — stop the backend task first, run the migration, `npx prisma generate`, then restart the dev server.

---

## File Structure

**Created:**
- `backend/src/modules/settings/request-window.ts` — `isRequestWindowOpen()` + `RequestWindowConfig` type.
- `backend/src/modules/settings/request-window.test.ts` — unit tests.
- `backend/prisma/migrations/<ts>_request_window/migration.sql` — generated + a data-backfill line.

**Modified:**
- `backend/prisma/schema.prisma` — `SystemSettings` gains 4 fields; `CarRequest.requestType` comment.
- `backend/src/modules/settings/settings.service.ts` — `update()` type gains the 4 fields.
- `backend/src/modules/settings/settings.controller.ts` — `updateSettingsSchema` gains the 4 fields; new `announceWindow` handler.
- `backend/src/modules/settings/settings.routes.ts` — `/public` returns `requestWindow`; new `POST /request-window/announce`.
- `backend/src/modules/requests/requests.controller.ts` — `createRequestSchema` requestType enum; window guard in `createPublic`.
- `backend/src/modules/requests/requests.service.ts` — requester notify on approve/reject; default `requestType` `pool-shared`.
- `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts` — window guard in `createPublic`.
- `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts` — requester notify on approve/reject.
- `frontend/src/lib/api.ts` — `settingsApi.announceWindow`; widen `publicSettingsApi.getBranding` result usage.
- `frontend/src/pages/LoginPage.tsx` — disable the two buttons + message when the window is closed.
- `frontend/src/pages/PublicRequestPage.tsx` + `PoolBookingRequestPage.tsx` — "requests closed" notice; request-type relabel (PublicRequestPage).
- `frontend/src/pages/RequestsManagementPage.tsx` — relabel request type, add a type filter, show FA code in the row.
- `frontend/src/pages/SettingsPage.tsx` — "Request Window" card.

---

## Task 1: Schema — request-window fields + requestType value migration

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: migration (generated) + a hand-added backfill line

**Interfaces:**
- Consumes: nothing.
- Produces: `SystemSettings.requestWindowMode: string` (default `"open"`), `requestWindowStart: DateTime?`, `requestWindowEnd: DateTime?`, `requestWindowClosedMessage: string?`.

- [ ] **Step 1: Edit the model**

In `backend/prisma/schema.prisma`, in `model SystemSettings`, add near the feature-toggle block:

```prisma
  // Request / booking window control
  requestWindowMode           String    @default("open") // open | closed | scheduled
  requestWindowStart          DateTime?
  requestWindowEnd            DateTime?
  requestWindowClosedMessage  String?
```

In `model CarRequest`, update the comment on `requestType`:

```prisma
  requestType      String    @default("pool-shared") // dedicated | pool-shared
```

- [ ] **Step 2: Stop the backend dev task, then create the migration**

```bash
# stop the backend dev server first (Windows DLL lock), then:
cd backend && npx prisma migrate dev --name request_window --create-only
```

- [ ] **Step 3: Add the data backfill to the generated migration**

Open the new `backend/prisma/migrations/<ts>_request_window/migration.sql` and append:

```sql
-- Backfill legacy request type values
UPDATE "CarRequest" SET "requestType" = 'pool-shared' WHERE "requestType" = 'one-time';
```

(SQLite: the table name may be unquoted `CarRequest` — match the style the rest of the file uses.)

- [ ] **Step 4: Apply + regenerate**

```bash
cd backend && npx prisma migrate dev --name request_window && npx prisma generate
```
Then restart the backend dev server.

- [ ] **Step 5: Verify**

```bash
cd backend && node -e "const{PrismaClient}=require('@prisma/client');const p=new PrismaClient();(async()=>{const s=await p.systemSettings.findFirst({select:{requestWindowMode:true,requestWindowStart:true}});console.log('settings',s);const c=await p.carRequest.groupBy({by:['requestType'],_count:{_all:true}});console.log('requestType counts',c);process.exit(0)})().catch(e=>{console.error(e.message);process.exit(1)})"
```
Expected: prints `settings { requestWindowMode: 'open', ... }` and no `requestType` group equal to `'one-time'`.

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): request-window settings + migrate CarRequest.requestType one-time -> pool-shared"
```

---

## Task 2: `isRequestWindowOpen()` pure helper (TDD)

**Files:**
- Create: `backend/src/modules/settings/request-window.ts`
- Test: `backend/src/modules/settings/request-window.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export interface RequestWindowConfig {
    requestWindowMode: string;                 // open | closed | scheduled
    requestWindowStart: Date | string | null;
    requestWindowEnd: Date | string | null;
    requestWindowClosedMessage?: string | null;
  }
  export interface RequestWindowState {
    isOpen: boolean;
    opensAt: string | null;   // ISO, only when scheduled + in the future
    closesAt: string | null;  // ISO, only when scheduled + open now
    message: string | null;
  }
  export function computeRequestWindow(cfg: RequestWindowConfig, now: Date): RequestWindowState;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/settings/request-window.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeRequestWindow, RequestWindowConfig } from './request-window';

const at = (s: string) => new Date(s);
const cfg = (o: Partial<RequestWindowConfig>): RequestWindowConfig => ({
  requestWindowMode: 'open', requestWindowStart: null, requestWindowEnd: null, requestWindowClosedMessage: null, ...o,
});

describe('computeRequestWindow', () => {
  it('mode "open" is always open', () => {
    expect(computeRequestWindow(cfg({ requestWindowMode: 'open' }), at('2026-06-01T00:00:00')).isOpen).toBe(true);
  });

  it('mode "closed" is always closed and carries the custom message', () => {
    const s = computeRequestWindow(cfg({ requestWindowMode: 'closed', requestWindowClosedMessage: 'Back in July' }), at('2026-06-01T00:00:00'));
    expect(s.isOpen).toBe(false);
    expect(s.message).toBe('Back in July');
  });

  it('mode "scheduled" is open inside [start, end]', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: '2026-06-01T09:00:00', requestWindowEnd: '2026-06-10T17:00:00' });
    expect(computeRequestWindow(c, at('2026-06-05T12:00:00')).isOpen).toBe(true);
    expect(computeRequestWindow(c, at('2026-06-01T09:00:00')).isOpen).toBe(true);
    expect(computeRequestWindow(c, at('2026-06-10T17:00:00')).isOpen).toBe(true);
  });

  it('mode "scheduled" is closed before start (and reports opensAt)', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: '2026-06-01T09:00:00', requestWindowEnd: '2026-06-10T17:00:00' });
    const s = computeRequestWindow(c, at('2026-05-30T00:00:00'));
    expect(s.isOpen).toBe(false);
    expect(s.opensAt).toBe(new Date('2026-06-01T09:00:00').toISOString());
  });

  it('mode "scheduled" is closed after end', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: '2026-06-01T09:00:00', requestWindowEnd: '2026-06-10T17:00:00' });
    expect(computeRequestWindow(c, at('2026-06-11T00:00:00')).isOpen).toBe(false);
  });

  it('scheduled with only an end bound is open until that end', () => {
    const c = cfg({ requestWindowMode: 'scheduled', requestWindowStart: null, requestWindowEnd: '2026-06-10T17:00:00' });
    expect(computeRequestWindow(c, at('2026-06-05T00:00:00')).isOpen).toBe(true);
    expect(computeRequestWindow(c, at('2026-06-20T00:00:00')).isOpen).toBe(false);
  });

  it('an unknown mode is treated as open (safe default)', () => {
    expect(computeRequestWindow(cfg({ requestWindowMode: 'weird' }), at('2026-06-01T00:00:00')).isOpen).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

Run: `cd backend && npx vitest run src/modules/settings/request-window.test.ts`
Expected: FAIL — cannot find module `./request-window`.

- [ ] **Step 3: Implement**

Create `backend/src/modules/settings/request-window.ts`:

```ts
export interface RequestWindowConfig {
  requestWindowMode: string;
  requestWindowStart: Date | string | null;
  requestWindowEnd: Date | string | null;
  requestWindowClosedMessage?: string | null;
}

export interface RequestWindowState {
  isOpen: boolean;
  opensAt: string | null;
  closesAt: string | null;
  message: string | null;
}

function toDate(v: Date | string | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

export function computeRequestWindow(cfg: RequestWindowConfig, now: Date): RequestWindowState {
  const message = cfg.requestWindowClosedMessage?.trim() || null;
  const start = toDate(cfg.requestWindowStart);
  const end = toDate(cfg.requestWindowEnd);

  if (cfg.requestWindowMode === 'closed') {
    return { isOpen: false, opensAt: null, closesAt: null, message };
  }
  if (cfg.requestWindowMode === 'scheduled') {
    const afterStart = !start || now.getTime() >= start.getTime();
    const beforeEnd = !end || now.getTime() <= end.getTime();
    const isOpen = afterStart && beforeEnd;
    return {
      isOpen,
      opensAt: !isOpen && start && now.getTime() < start.getTime() ? start.toISOString() : null,
      closesAt: isOpen && end ? end.toISOString() : null,
      message,
    };
  }
  // 'open' or any unknown value
  return { isOpen: true, opensAt: null, closesAt: null, message: null };
}
```

- [ ] **Step 4: Run, verify pass**

Run: `cd backend && npx vitest run src/modules/settings/request-window.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Full suite + typecheck**

Run: `cd backend && npm test && npx tsc --noEmit 2>&1 | grep request-window || echo clean`

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/settings/request-window.ts backend/src/modules/settings/request-window.test.ts
git commit -m "feat: computeRequestWindow() — open/closed/scheduled window state"
```

---

## Task 3: Backend — expose window state + enforce on both public POSTs

**Files:**
- Modify: `backend/src/modules/settings/settings.service.ts`
- Modify: `backend/src/modules/settings/settings.controller.ts`
- Modify: `backend/src/modules/settings/settings.routes.ts`
- Modify: `backend/src/modules/requests/requests.controller.ts`
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts`

**Interfaces:**
- Consumes: `computeRequestWindow` (Task 2).
- Produces:
  - `GET /api/v1/settings/public` response gains `requestWindow: RequestWindowState`.
  - A shared guard: both public create endpoints return `403 { error: "The request window is currently closed." }` (plus `message` when set) when `!isOpen`.
  - `settingsService.getRequestWindowState(): Promise<RequestWindowState>`.

- [ ] **Step 1: `settings.service.ts` — window state helper + update type**

Add the import `import { computeRequestWindow, RequestWindowState } from './request-window';` and:

```ts
async getRequestWindowState(): Promise<RequestWindowState> {
    const s = await this.get();
    return computeRequestWindow(
        {
            requestWindowMode: s.requestWindowMode,
            requestWindowStart: s.requestWindowStart,
            requestWindowEnd: s.requestWindowEnd,
            requestWindowClosedMessage: s.requestWindowClosedMessage,
        },
        new Date(),
    );
}
```

In the `update(data: Partial<{ ... }>)` type, add:

```ts
        requestWindowMode: string;
        requestWindowStart: Date | null;
        requestWindowEnd: Date | null;
        requestWindowClosedMessage: string | null;
```

- [ ] **Step 2: `settings.controller.ts` — schema fields**

In `updateSettingsSchema`, add:

```ts
    requestWindowMode: z.enum(['open', 'closed', 'scheduled']).optional(),
    requestWindowStart: coerceDate,
    requestWindowEnd: coerceDate,
    requestWindowClosedMessage: z.string().optional().nullable(),
```

- [ ] **Step 3: `settings.routes.ts` — `/public` returns the window**

Change the `/public` handler to also compute + include the window. Replace its body's `res.json({...})` with one that adds:

```ts
const windowState = await settingsService.getRequestWindowState();
res.json({
    tournamentName: settings?.tournamentName || 'GCMS',
    logoUrl: settings?.logoUrl || null,
    headerUrl: settings?.headerUrl || null,
    footerUrl: settings?.footerUrl || null,
    footerText: settings?.footerText || null,
    handoverTcEnTitle: settings?.handoverTcEnTitle || null,
    handoverTcEnBody: settings?.handoverTcEnBody || null,
    handoverTcArTitle: settings?.handoverTcArTitle || null,
    handoverTcArBody: settings?.handoverTcArBody || null,
    handoverTcCheckboxes: settings?.handoverTcCheckboxes || null,
    requestWindow: windowState,
});
```

Add `import { settingsService } from './settings.service';` at the top of the routes file if not present. On the catch fallback, add `requestWindow: { isOpen: true, opensAt: null, closesAt: null, message: null }` so a settings read failure never blocks submissions.

- [ ] **Step 4: `requests.controller.ts` — guard `createPublic` + widen the enum**

Change `requestType: z.enum(['one-time', 'dedicated']).default('one-time')` to
`requestType: z.enum(['dedicated', 'pool-shared']).default('pool-shared')`.

At the very top of `createPublic` (before parsing), add:

```ts
import { settingsService } from '../settings/settings.service';
// …
const windowState = await settingsService.getRequestWindowState();
if (!windowState.isOpen) {
    res.status(403).json({ error: windowState.message || 'The request window is currently closed.' });
    return;
}
```

- [ ] **Step 5: `pool-booking-requests.controller.ts` — guard `createPublic`**

Add the same import + guard at the top of `createPublic` (before `createSchema.parse`).

- [ ] **Step 6: Typecheck**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "settings|requests.controller|pool-booking-requests.controller" || echo clean`

- [ ] **Step 7: Manual verification**

Start the backend. As SuperAdmin, set the window closed, then confirm both public POSTs 403 and `/settings/public` reports it:

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
# close the window
curl -s -X PUT localhost:3005/api/v1/settings -H "Authorization: Bearer $SA" -H 'Content-Type: application/json' -d '{"requestWindowMode":"closed","requestWindowClosedMessage":"Collection reopens 5 Jan"}' -o /dev/null -w "PUT %{http_code}\n"
curl -s localhost:3005/api/v1/settings/public | node -pe 'JSON.stringify(JSON.parse(require("fs").readFileSync(0)).requestWindow)'
curl -s -X POST localhost:3005/api/v1/public/requests -H 'Content-Type: application/json' -d '{"requesterName":"x","requesterEmail":"x@y.com","departmentId":"d","stadiumId":"s","cargoCount":1}' -w " [%{http_code}]\n"
curl -s -X POST localhost:3005/api/v1/public/pool-booking-requests -H 'Content-Type: application/json' -d '{}' -w " [%{http_code}]\n"
# reopen
curl -s -X PUT localhost:3005/api/v1/settings -H "Authorization: Bearer $SA" -H 'Content-Type: application/json' -d '{"requestWindowMode":"open"}' -o /dev/null -w "reopen %{http_code}\n"
curl -s localhost:3005/api/v1/settings/public | node -pe 'JSON.parse(require("fs").readFileSync(0)).requestWindow.isOpen'
```
Expected: with the window closed, `requestWindow` shows `isOpen:false` + the message, and both POSTs return `403` with `{"error":"Collection reopens 5 Jan"}`. After reopening, `isOpen` is `true`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/settings backend/src/modules/requests/requests.controller.ts backend/src/modules/pool-booking-requests/pool-booking-requests.controller.ts
git commit -m "feat: request-window state on /settings/public + 403 guard on both public submit endpoints"
```

---

## Task 4: Backend — notify the requester on approve / reject

**Files:**
- Modify: `backend/src/modules/requests/requests.service.ts`
- Modify: `backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts`

**Interfaces:**
- Consumes: `emailService.send`, `notificationService.create`, `prisma.user`.
- Produces: no new exports; `approveRequest` / `rejectRequest` (and the pool `approve` / `reject`) now also email `requesterEmail` and, if a `User` has that email, create an in-app `Notification`.

- [ ] **Step 1: Add a shared helper in `requests.service.ts`**

Add the import `import { emailService } from '../../services/email.service';` and a private method on `RequestsService`:

```ts
private async notifyRequester(args: {
    email: string; name: string; status: 'Approved' | 'Rejected';
    reviewNotes?: string; reference: string; kind: string;
}) {
    const subject = `${args.kind} ${args.status}: ${args.reference}`;
    const body =
        `Hello ${args.name},\n\n` +
        `Your ${args.kind.toLowerCase()} (${args.reference}) has been ${args.status.toLowerCase()}.\n` +
        (args.reviewNotes ? `\nReviewer notes: ${args.reviewNotes}\n` : '') +
        `\nThank you,\nGCMS`;
    try {
        await emailService.send({ to: args.email, subject, text: body });
    } catch (e) {
        console.error('Requester email failed:', e);
    }
    const user = await prisma.user.findUnique({ where: { email: args.email }, select: { id: true } });
    if (user) {
        await notificationService.create({
            type: args.status === 'Approved' ? 'RequestApproved' : 'RequestRejected',
            title: `${args.kind} ${args.status}`,
            message: `${args.reference} — ${args.status}${args.reviewNotes ? `: ${args.reviewNotes}` : ''}`,
            entityType: 'CarRequest',
            entityId: args.reference,
            userId: user.id,
        });
    }
}
```

(If `notificationService.create` requires a different shape, match the signature already used elsewhere in this file — `createForRoles` is used above; `create` takes `{ type, title, message, entityType, entityId, userId }` per `pool-booking-requests.service.ts`.)

- [ ] **Step 2: Call it from `approveRequest` / `rejectRequest`**

After each `prisma.carRequest.update(...)` returns `request`, before `return request`, add:

```ts
await this.notifyRequester({
    email: request.requesterEmail,
    name: request.requesterName,
    status: 'Approved', // or 'Rejected' in rejectRequest
    reviewNotes,
    reference: request.id,
    kind: 'Car request',
});
```

- [ ] **Step 3: Same for `pool-booking-requests.service.ts`**

Add `import { emailService } from '../../services/email.service';`. In `approve` and `reject`, after the `prisma.poolBookingRequest.update(...)` (`updated`), add an email to `updated.requesterEmail` and — since these already do `if (updated.createdById) notificationService.create(...)` — also look up a user by `updated.requesterEmail` and notify them if they weren't the creator:

```ts
try {
    await emailService.send({
        to: updated.requesterEmail,
        subject: `Pool booking ${updated.status}: ${updated.fleet.carNumber}`,
        text: `Hello ${updated.requesterName},\n\nYour pool booking for ${updated.fleet.carNumber} at ${updated.stadium.name} has been ${updated.status.toLowerCase()}.` +
              (reviewComment ? `\n\nReviewer notes: ${reviewComment}` : ''),
    });
} catch (e) { console.error('Pool booking requester email failed:', e); }
```

- [ ] **Step 4: Typecheck + suite**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "requests.service|pool-booking-requests.service" || echo clean; npm test`

- [ ] **Step 5: Manual verification (MailHog)**

Ensure MailHog is running (`docker compose --profile dev up mailhog`, or skip if the SMTP transport just logs). Approve a pending car request via the API and confirm a mail is queued:

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
RID=$(curl -s "localhost:3005/api/v1/requests?status=Pending" -H "Authorization: Bearer $SA" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); (d.data?.[0]||{}).id || ""')
curl -s -X POST "localhost:3005/api/v1/requests/$RID/approve" -H "Authorization: Bearer $SA" -H 'Content-Type: application/json' -d '{"reviewNotes":"approved for testing"}' -w " [%{http_code}]\n"
# check backend log for "Email sent via SMTP" or the MailHog UI at http://localhost:8025
```
Expected: 200; backend log shows an email send attempt (or MailHog shows the message); no unhandled error even if SMTP is unavailable (the send is wrapped in try/catch).

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/requests/requests.service.ts backend/src/modules/pool-booking-requests/pool-booking-requests.service.ts
git commit -m "feat: notify the requester (email + in-app) when a car/pool request is approved or rejected"
```

---

## Task 5: Backend — "Announce window is open" endpoint

**Files:**
- Modify: `backend/src/modules/settings/settings.controller.ts`
- Modify: `backend/src/modules/settings/settings.routes.ts`

**Interfaces:**
- Consumes: `prisma.user`, `emailService.send`, `notificationService.createForUsers` (or a loop of `create`).
- Produces: `POST /api/v1/settings/request-window/announce` (SuperAdmin) → `{ notified: number }`. Emails + in-app-notifies every active `FA` and plain user that the collection window is open.

- [ ] **Step 1: Controller handler**

Add to `SettingsController` (imports: `emailService`, `notificationService`, `prisma`):

```ts
static async announceWindow(req: AuthRequest, res: Response) {
    try {
        const state = await settingsService.getRequestWindowState();
        const closesLine = state.closesAt ? ` Submit your requests by ${new Date(state.closesAt).toLocaleString()}.` : '';
        const recipients = await prisma.user.findMany({
            where: { isActive: true, role: { in: ['FA'] } },
            select: { id: true, email: true, name: true },
        });
        const subject = 'Requirement collection is now open';
        const text = `The GCMS request window is now open.${closesLine}\n\nSubmit at: ${process.env.FRONTEND_URL || ''}/request`;
        for (const u of recipients) {
            try { await emailService.send({ to: u.email, subject, text }); } catch (e) { console.error('announce email failed', u.email, e); }
        }
        if (recipients.length) {
            await notificationService.createForUsers(
                { type: 'RequestWindowOpen', title: subject, message: `The request window is open.${closesLine}`, entityType: 'SystemSettings', entityId: 'request-window' },
                recipients.map((u) => u.id),
            );
        }
        res.json({ notified: recipients.length });
    } catch (error) {
        console.error('announceWindow error:', error);
        res.status(500).json({ error: 'Failed to announce the window' });
    }
}
```

(Confirm `notificationService.createForUsers(data, userIds)` signature against `notification.service.ts` — it exists per the Phase 4 exploration. If the role set should include plain non-FA users, widen the `role: { in: [...] }` — keep it `['FA']` for now since Admin/SuperAdmin/Observer are staff.)

- [ ] **Step 2: Route**

In `settings.routes.ts`, after the `PUT '/'` route:

```ts
router.post('/request-window/announce', requireRole('SuperAdmin'), SettingsController.announceWindow);
```

- [ ] **Step 3: Typecheck + manual check**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep settings || echo clean`

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
curl -s -X POST localhost:3005/api/v1/settings/request-window/announce -H "Authorization: Bearer $SA" -w "\n[%{http_code}]\n"
```
Expected: `{"notified": <n>}` with `n` ≥ 1; backend log shows email attempts; a follow-up `GET /api/v1/notifications` as an FA user shows the new "Requirement collection is now open" notification.

- [ ] **Step 4: Commit**

```bash
git add backend/src/modules/settings/settings.controller.ts backend/src/modules/settings/settings.routes.ts
git commit -m "feat: POST /settings/request-window/announce — email + notify all FA that the window is open"
```

---

## Task 6: Frontend — login page disabled-button state

**Files:**
- Modify: `frontend/src/pages/LoginPage.tsx`

**Interfaces:**
- Consumes: `publicSettingsApi.getBranding()` → response now includes `requestWindow: { isOpen, opensAt, closesAt, message }`.
- Produces: no exports.

- [ ] **Step 1: Read the window from branding**

`LoginPage` already does `setBranding(res.data || {})`. Extend the local `branding` state type with
`requestWindow?: { isOpen: boolean; opensAt: string | null; closesAt: string | null; message: string | null }`.

- [ ] **Step 2: Disable the two buttons when closed**

Replace the Request/Bookings button row (added in Phase 1) with:

```tsx
{(() => {
    const w = branding.requestWindow;
    const open = w ? w.isOpen : true;
    const note = !open
        ? (w?.message
            || (w?.opensAt ? `Requirement collection opens ${new Date(w.opensAt).toLocaleDateString()}` : 'Requests are currently closed'))
        : null;
    return (
        <div className="mt-4 space-y-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Button asChild={open} variant="secondary" className="w-full" disabled={!open}>
                    {open ? <Link to="/request">Submit a Request</Link> : <span>Submit a Request</span>}
                </Button>
                <Button asChild={open} variant="secondary" className="w-full" disabled={!open}>
                    {open ? <Link to="/book-pool">Bookings</Link> : <span>Bookings</span>}
                </Button>
            </div>
            {note && <p className="text-xs text-center text-muted-foreground">{note}</p>}
        </div>
    );
})()}
```

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep LoginPage || echo clean`

- [ ] **Step 4: Manual verification (browser)**

Set the window to `closed` (Task 8 UI, or the curl from Task 3). Reload `/login`: both buttons are greyed/disabled with the message line; navigating directly to `/request` shows the closed notice (Task 7). Set it back to `open`: buttons work. Check 375 px — buttons stack, note stays centered.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/LoginPage.tsx
git commit -m "feat: login page disables Request/Bookings with a message when the window is closed"
```

---

## Task 7: Frontend — closed notice on the public pages + request-type relabel

**Files:**
- Modify: `frontend/src/pages/PublicRequestPage.tsx`
- Modify: `frontend/src/pages/PoolBookingRequestPage.tsx`

**Interfaces:**
- Consumes: `publicSettingsApi.getBranding()` `requestWindow`.
- Produces: no exports.

- [ ] **Step 1: `PublicRequestPage` — closed notice + relabel**

This page already loads branding. Add `requestWindow` to its branding type. When `branding.requestWindow && !branding.requestWindow.isOpen`, render — in place of the form card — a notice:

```tsx
<Card className="max-w-lg mx-auto">
    <CardContent className="py-10 text-center space-y-2">
        <h2 className="text-xl font-semibold">Requests are currently closed</h2>
        <p className="text-muted-foreground">
            {branding.requestWindow?.message
                || (branding.requestWindow?.opensAt
                    ? `Requirement collection opens ${new Date(branding.requestWindow.opensAt).toLocaleString()}.`
                    : 'Please check back later.')}
        </p>
    </CardContent>
</Card>
```

Change the request-type `<SelectItem>`s:

```tsx
<SelectItem value="dedicated">Dedicated</SelectItem>
<SelectItem value="pool-shared">Pool shared resource</SelectItem>
```

and the form's initial `requestType: 'one-time'` → `requestType: 'pool-shared'`.

- [ ] **Step 2: `PoolBookingRequestPage` — closed notice**

Same pattern: when the window is closed, render the closed notice instead of the booking form. (No request-type field on this page.)

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "PublicRequestPage|PoolBookingRequestPage" || echo clean`

- [ ] **Step 4: Manual verification (browser)**

With the window closed, `/request` and `/book-pool` show the closed notice, not the form. With it open, both forms render; the request form's Type dropdown shows "Dedicated" / "Pool shared resource" and a submitted request stores `pool-shared` by default.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/PublicRequestPage.tsx frontend/src/pages/PoolBookingRequestPage.tsx
git commit -m "feat: public request/booking pages show a closed notice; request type relabelled Dedicated / Pool shared resource"
```

---

## Task 8: Frontend — Requests management relabel + filter + FA code; Settings "Request Window" card

**Files:**
- Modify: `frontend/src/pages/RequestsManagementPage.tsx`
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/pages/SettingsPage.tsx`

**Interfaces:**
- Consumes: `requestsApi.getAll({ ... })`; `settingsApi.update` (FormData); new `settingsApi.announceWindow()`.
- Produces: `settingsApi.announceWindow: () => apiClient.post('/settings/request-window/announce')`.

- [ ] **Step 1: `lib/api.ts` — announce method**

In `settingsApi` add:

```ts
announceWindow: () => apiClient.post('/settings/request-window/announce'),
```

- [ ] **Step 2: `RequestsManagementPage` — relabel + filter + FA code**

- Where the request type renders (search `requestType === 'dedicated'`), change the mapping to:
  `req.requestType === 'dedicated' ? 'Dedicated' : 'Pool shared resource'`.
- In the list row (near `req.requesterEmail` around line 428), add the FA code:
  `{req.accreditationNumber && <p className="text-xs text-muted-foreground">FA {req.accreditationNumber}</p>}`.
- Add a **Type** filter next to the existing status filter — a `<Select>` with `All` / `Dedicated` / `Pool shared resource`; pass `requestType` into `requestsApi.getAll` params, and add `requestType` handling to `requests.service.ts` `getAll` filters (`CarRequestFilters` gains `requestType?`, applied as `where.requestType`).

  Backend one-liner in `requests.service.ts` `getAll`:
  ```ts
  if (filters.requestType) where.requestType = filters.requestType;
  ```
  and in `requests.controller.ts` `getAll`, read `req.query.requestType` into the filters object.

- [ ] **Step 3: `SettingsPage` — "Request Window" card**

In the `system` tab's `<TabsContent value="system">` (SuperAdmin), add a card. It reads `settings.requestWindowMode` / `...Start` / `...End` / `...ClosedMessage` from the loaded settings and writes them through the existing `settingsApi.update(fd)` FormData flow (append the four keys to the `FormData` in the save handler — for dates send ISO strings or empty). Card contents:

```tsx
<Card>
  <CardHeader><CardTitle>Request Window</CardTitle>
    <CardDescription>Controls the public “Submit a Request” and “Bookings” channels.</CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex flex-wrap gap-4">
      {(['open', 'closed', 'scheduled'] as const).map((m) => (
        <label key={m} className="flex items-center gap-2 text-sm">
          <input type="radio" name="rwMode" value={m}
            checked={form.requestWindowMode === m}
            onChange={() => setForm({ ...form, requestWindowMode: m })} />
          <span className="capitalize">{m}</span>
        </label>
      ))}
    </div>
    {form.requestWindowMode === 'scheduled' && (
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div><Label>Opens</Label><Input type="datetime-local" value={form.requestWindowStart}
          onChange={(e) => setForm({ ...form, requestWindowStart: e.target.value })} /></div>
        <div><Label>Closes</Label><Input type="datetime-local" value={form.requestWindowEnd}
          onChange={(e) => setForm({ ...form, requestWindowEnd: e.target.value })} /></div>
      </div>
    )}
    {form.requestWindowMode !== 'open' && (
      <div><Label>Closed message (optional)</Label>
        <Input value={form.requestWindowClosedMessage}
          onChange={(e) => setForm({ ...form, requestWindowClosedMessage: e.target.value })}
          placeholder="Requirement collection opens 5 Jan 2027" /></div>
    )}
    <div className="pt-2 border-t">
      <Button type="button" variant="outline" onClick={async () => {
        if (!confirm('Email and notify every FA that the request window is open?')) return;
        try {
          const res = await settingsApi.announceWindow();
          toast.success(`Announced to ${res.data.notified} people`);
        } catch { toast.error('Announce failed'); }
      }}>Announce window is open</Button>
    </div>
  </CardContent>
</Card>
```

Wire `requestWindowMode` / `requestWindowStart` / `requestWindowEnd` / `requestWindowClosedMessage` into the page's settings `form` state (initialised from the loaded `settings`, dates sliced to `datetime-local` shape `YYYY-MM-DDTHH:mm`) and into the FormData built by the existing save handler.

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "RequestsManagementPage|SettingsPage|lib/api" || echo clean`

- [ ] **Step 5: Manual verification (browser)**

As SuperAdmin → Settings → System → Request Window:
- Switch to **Closed** with a message, Save. Reload `/login` (incognito or after logout) → buttons disabled with the message; `/request` shows the closed notice.
- Switch to **Scheduled** with a future Opens date, Save → login note reads "Requirement collection opens \<date\>".
- Switch to **Open**, Save → everything works again.
- Click **Announce window is open** → toast "Announced to N people"; an FA login shows the notification.
- Requests page: the Type column reads "Dedicated" / "Pool shared resource"; the Type filter narrows the list; FA code shows under the requester.
- 375 / 768 / 1280 px: the card's radios wrap, date inputs stack.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/RequestsManagementPage.tsx frontend/src/pages/SettingsPage.tsx frontend/src/lib/api.ts backend/src/modules/requests
git commit -m "feat: Request Window settings card + announce button; requests relabelled Dedicated / Pool shared resource with a type filter and FA code"
```

---

## Phase 4A Done-When

- `cd backend && npm test` green (adds the `request-window` suite).
- Setting the window `closed` (or a future `scheduled` range) makes `GET /settings/public` report `isOpen:false` with the message, disables the login-page buttons, shows the closed notice on `/request` + `/book-pool`, and makes `POST /public/requests` + `POST /public/pool-booking-requests` return `403`.
- Setting it `open` restores all of the above.
- "Announce window is open" emails + in-app-notifies every active FA and returns `{ notified: n }`.
- Approving/rejecting a car request or a pool booking request emails the requester and, if they have an account, creates an in-app notification.
- No `CarRequest` row has `requestType = 'one-time'`; the UI shows "Dedicated" / "Pool shared resource" everywhere and offers a type filter with the FA code in each row.
- `npx tsc --noEmit` clean in `backend/` and `frontend/` for touched files; login page + Settings card verified at 375 / 768 / 1280 px.

## Self-Review Notes

- **Spec coverage:** §8.0 → Tasks 1–3 (data + helper + exposure/enforcement) + 6–8 (login disable, closed notices, Settings card, Announce). §8.0a → Task 4. §8.1 → Task 1 (value migration) + Task 7 (public relabel) + Task 8 (management relabel + filter + FA code).
- **Deferred to Phase 4B:** the Pool report, no-login bookers in the user report, FA audit check-in/out timestamps, and the print-label redesign (all still §8, but the reports/labels half).
- **Email transport:** unchanged — `emailService.send()` already picks Resend/SMTP/MailHog. Phase 7 hardens the env wiring; sends here are wrapped in try/catch so a missing SMTP host never breaks approve/reject.
- **No automated UI/HTTP tests:** consistent with Phases 1–3; the window logic is unit-tested; manual steps are explicit.
