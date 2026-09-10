# Phase 6 — Ticketing: Incident & Warning System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Any authenticated user can file an **incident** about another user (from a booking, handover, fleet car, or standalone) without that creating a warning. An Admin/SuperAdmin can then issue a manual, cumulative **warning** — level 1 (soft), 2, or 3 (ban) — either linked to an incident or standalone. A level-3 warning, or a 3rd non-revoked warning, sets `user.isBlocked = true`; blocked users are rejected at login and on every authenticated request with a 403. SuperAdmin can unblock (warning count is preserved) and revoke warnings. Every issued warning creates an in-app notification for the subject and emails them a PDF — the incident report when one is linked, otherwise a warning letter.

**Architecture:** New Prisma models `Incident` + `Warning`; `User` gains `blockedAt/blockedReason/blockedById` and the inverse relations. A pure, unit-tested `warning-rules.ts` decides the recommended next level and whether a user should be blocked. A new `backend/src/modules/incidents/` module owns incident CRUD (`/incidents`) and, via a `warnings.service.ts` in the same module, the whole warning lifecycle (`POST /incidents/:id/warnings`, `POST /warnings`, `GET /warnings`, `PATCH /warnings/:id/revoke`). Two renderers — `incidentReportPdf`, `warningLetterPdf` — join the shared `pdf.service.ts`. `auth.middleware.ts` + `auth.service.ts` gain an `isBlocked` gate; `users` gets `PATCH /users/:id/unblock` (SuperAdmin). Frontend adds an `IncidentsPage` at `/incidents` (nav for SuperAdmin/Admin), a warning-history panel on the Users detail page, and a shared "Report incident" modal surfaced from the Bookings page.

**Tech Stack:** TypeScript, Express, Prisma (SQLite dev), pdfkit (shared `pdf.service.ts`), nodemailer/Resend (attachments — added in Phase 5), zod, vitest, React, Vite, Tailwind, Radix UI, sonner.

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` — §10.1 (data model), §10.2 (behaviour), §10.3 (API + UI), §10.4 acceptance. Cross-cutting PDF service §4. NFRs §2a.

## Global Constraints

- **Roles (exact strings):** `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`.
- **Report incident:** any authenticated user (`router.use(authenticate)` only — no `requireRole`).
- **Issue / revoke warning, view all incidents:** `requireRole('SuperAdmin', 'Admin')`. Admin is venue-scoped — an Admin may only see/act on incidents whose `stadiumId` is their `req.user.stadiumId`, or (when `stadiumId` is null) whose `subjectUser.stadiumId` is theirs; enforce in the controller, mirroring `resolveStadiumScope` semantics (load, 403 on mismatch).
- **Revoke warning, unblock user:** `requireRole('SuperAdmin')` only.
- **Warning levels (exact):** integer `1` | `2` | `3`. Level is **manual** — never auto-derived; the API accepts whatever valid level is sent. The UI *recommends* `min(lastNonRevokedLevel + 1, 3)` (or `1` when none).
- **Block trigger:** after an issue, `user.isBlocked` becomes true iff `level === 3` OR the user's non-revoked warning count (including the new one) `>= 3`. Blocking also sets `blockedAt = now`, `blockedReason = "<WRN reference>: <reason>"`, `blockedById = issuer`. Blocking never lowers on its own — only `PATCH /users/:id/unblock` or revoking the blocking warning (which offers unblock) clears it.
- **Unblock:** clears `isBlocked`, `blockedAt`, `blockedReason`, `blockedById`. Does **NOT** touch warnings.
- **Blocked-user rejection message (exact):** `Your account has been blocked. Contact the administrator.` — HTTP **403** at login (`POST /auth/login`) and on every authenticated request (`auth.middleware.ts`).
- **References:** `makeReference('INC', incident.id)` → `INC-YYYY-XXXXXX`; `makeReference('WRN', warning.id)` → `WRN-YYYY-XXXXXX` (from `backend/src/services/pdf.service.ts`). Stored on the row (`reference` column, `@unique`) at create time — generate from the freshly-created `id` with a second `update`, or precompute a cuid. Use the create-then-update pattern (create row, `makeReference` from its id, `update` to set `reference`) for simplicity.
- **Photos:** incident photos go to `BUCKETS.INCIDENT_PHOTOS` via `uploadIncidentPhoto` / `uploadFile` (already in `backend/src/config/storage.ts`); stored as a JSON string array in `photosUrls`, exactly like `MaintenanceLog`.
- **Notifications:** `notificationService.create({ type: 'warning', title, message, entityType: 'Warning', entityId: <warning.id>, userId: <subjectUser.id> })`.
- **Email:** `emailService.send({ to, subject, text, attachments: [{ filename, content: Buffer, contentType: 'application/pdf' }] })` — attachments support landed in Phase 5. Wrap the send in try/catch: a failed email must **not** roll back an issued warning (the warning + block + notification still stand); log the failure.
- **PDF rendering:** reuse `renderPdf(meta, body)`; add `incidentReportPdf()` + `warningLetterPdf()` to `pdf.service.ts`. Leaf-level — the caller passes already-loaded data; `pdf.service.ts` declares its own local structural types, no import from the incidents module.
- **Bug-free gate:** backend `cd backend && npm test` green (currently 50 tests / 9 files); backend + frontend `npx tsc --noEmit` exit 0 for touched files; every new endpoint has a typed JSON error path.
- **Windows/Prisma:** `prisma migrate dev` needs the backend dev server stopped first (it holds `query_engine-windows.dll`). Sequence: stop backend task → `npx prisma migrate dev --name incidents_warnings` → `npx prisma generate` → restart. The workflow test is excluded from vitest; no test-DB concern.
- **Commits:** one per task, conventional-commit subject, footer exactly:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (:3005), frontend `cd frontend && npm run dev` (:3000). Logins: `superadmin@gcms.com` / `Admin@2024!`, `admin@gcms.com` / `Admin@2024!`. MailHog is down locally — verify email via the fake-SMTP sink at `scratchpad/fake-smtp.js` (`node fake-smtp.js` → listens on 127.0.0.1:1025) or accept the logged failure; the warning/block/notification still succeed.

---

## File Structure

**Created:**
- `backend/src/modules/incidents/warning-rules.ts` — pure `recommendNextLevel()` + `shouldBlock()` + types.
- `backend/src/modules/incidents/warning-rules.test.ts` — vitest.
- `backend/src/modules/incidents/incidents.service.ts` — incident CRUD, venue scope, `getIncidentForPdf`.
- `backend/src/modules/incidents/warnings.service.ts` — issue (linked + standalone), list, revoke, block side-effect, notify + email.
- `backend/src/modules/incidents/incidents.controller.ts` — incident + warning HTTP handlers, zod schemas, multer for photos.
- `backend/src/modules/incidents/incidents.routes.ts` — `/incidents*` + `/warnings*` routes.
- `frontend/src/pages/IncidentsPage.tsx` — list + detail + issue-warning flow.
- `frontend/src/components/incidents/ReportIncidentModal.tsx` — shared "Report incident" modal.

**Modified:**
- `backend/prisma/schema.prisma` — `Incident`, `Warning` models; `User` block fields + inverse relations; `Fleet` + `Stadium` inverse `Incident[]`.
- `backend/prisma/migrations/<ts>_incidents_warnings/migration.sql` — generated.
- `backend/src/services/pdf.service.ts` — `incidentReportPdf()`, `warningLetterPdf()`.
- `backend/src/middleware/auth.middleware.ts` — `isBlocked` in `select` + 403 gate (both `authenticate` and the optional variant).
- `backend/src/modules/auth/auth.service.ts` — `isBlocked` check in `login` (throws `Error('ACCOUNT_BLOCKED')`).
- `backend/src/modules/auth/auth.controller.ts` — map `ACCOUNT_BLOCKED` → 403 with the exact message.
- `backend/src/modules/users/users.routes.ts` — `PATCH /:id/unblock` (SuperAdmin).
- `backend/src/modules/users/users.controller.ts` — `unblock` handler.
- `backend/src/modules/users/users.service.ts` — `unblockUser(id)`; include warning history in `getById`.
- `backend/src/app.ts` — mount `incidentsRoutes`.
- `frontend/src/lib/api.ts` — `incidentsApi`, `warningsApi`, `usersApi.unblock`.
- `frontend/src/App.tsx` — `/incidents` route.
- `frontend/src/components/layout/MainLayout.tsx` — "Incidents" nav item.
- `frontend/src/pages/UsersPage.tsx` (or the user-detail component) — warning-history panel + unblock button.
- `frontend/src/pages/BookingsPage.tsx` — "Report incident" action wired to the shared modal.

---

## Task 1: Schema — Incident, Warning, User block fields

**Files:**
- Modify: `backend/prisma/schema.prisma`
- Create: `backend/prisma/migrations/<ts>_incidents_warnings/migration.sql` (generated)

**Interfaces:**
- Produces: Prisma models `Incident`, `Warning`; `User.blockedAt/blockedReason/blockedById/blockedBy` + relations `incidentsAbout`, `incidentsReported`, `warnings` (as subject), `warningsIssued`, `warningsRevoked`, `blockedUsers`/`blockedBy`.

- [ ] **Step 1: Add the models**

Append to `schema.prisma`:

```prisma
model Incident {
  id             String    @id @default(cuid())
  reference      String    @unique
  subjectUserId  String
  subjectUser    User      @relation("IncidentSubject", fields: [subjectUserId], references: [id])
  reportedById   String
  reportedBy     User      @relation("IncidentReporter", fields: [reportedById], references: [id])
  fleetId        String?
  fleet          Fleet?    @relation(fields: [fleetId], references: [id])
  stadiumId      String?
  stadium        Stadium?  @relation(fields: [stadiumId], references: [id])
  title          String
  description    String
  photosUrls     String?   @default("[]")
  occurredAt     DateTime
  status         String    @default("Open") // Open, UnderReview, Closed
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  warnings       Warning[]

  @@index([subjectUserId])
  @@index([status])
}

model Warning {
  id             String    @id @default(cuid())
  reference      String    @unique
  userId         String
  user           User      @relation("WarningUser", fields: [userId], references: [id])
  incidentId     String?
  incident       Incident? @relation(fields: [incidentId], references: [id])
  level          Int       // 1 soft, 2, 3 ban + block
  reason         String
  issuedById     String
  issuedBy       User      @relation("WarningIssuer", fields: [issuedById], references: [id])
  issuedAt       DateTime  @default(now())
  acknowledgedAt DateTime?
  revoked        Boolean   @default(false)
  revokedById    String?
  revokedBy      User?     @relation("WarningRevoker", fields: [revokedById], references: [id])
  revokedAt      DateTime?
  createdAt      DateTime  @default(now())

  @@index([userId])
  @@index([level])
}
```

- [ ] **Step 2: Extend `User`**

Inside `model User { ... }` add fields:
```prisma
  blockedAt           DateTime?
  blockedReason       String?
  blockedById         String?
  blockedBy           User?           @relation("UserBlockedBy", fields: [blockedById], references: [id])
  blockedUsers        User[]          @relation("UserBlockedBy")
  incidentsAbout      Incident[]      @relation("IncidentSubject")
  incidentsReported   Incident[]      @relation("IncidentReporter")
  warnings            Warning[]       @relation("WarningUser")
  warningsIssued      Warning[]       @relation("WarningIssuer")
  warningsRevoked     Warning[]       @relation("WarningRevoker")
```

- [ ] **Step 3: Add inverse relations to `Fleet` and `Stadium`**

`model Fleet { ... }` add: `incidents Incident[]`
`model Stadium { ... }` add: `incidents Incident[]`

- [ ] **Step 4: Migrate**

Stop the backend dev server (kill the `npm run dev` task) so Prisma can rewrite the client DLL, then:
```bash
cd backend
npx prisma migrate dev --name incidents_warnings
npx prisma generate
```
Expected: migration applies cleanly (no data-loss prompt — all new tables + nullable columns). Restart `npm run dev`.

- [ ] **Step 5: Typecheck**

Run: `cd backend && npx tsc --noEmit` → no NEW errors (the generated client now knows `Incident`/`Warning`).

- [ ] **Step 6: Commit**

```bash
git add backend/prisma/schema.prisma backend/prisma/migrations
git commit -m "feat(db): Incident + Warning models; User block audit fields

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 2: Pure `warning-rules` helper

**Files:**
- Create: `backend/src/modules/incidents/warning-rules.ts`
- Test: `backend/src/modules/incidents/warning-rules.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface WarningRow { level: number; revoked: boolean }
  /** Non-revoked warnings only are counted. */
  export function activeWarningCount(warnings: WarningRow[]): number;
  /** Highest non-revoked level, or 0 if none. */
  export function lastActiveLevel(warnings: WarningRow[]): number;
  /** UI recommendation: min(lastActiveLevel + 1, 3); 1 when there are none. */
  export function recommendNextLevel(warnings: WarningRow[]): 1 | 2 | 3;
  /** Block iff the just-issued level is 3, or the resulting active count is >= 3. */
  export function shouldBlock(newLevel: number, activeCountIncludingNew: number): boolean;
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/incidents/warning-rules.test.ts
import { describe, it, expect } from 'vitest';
import { activeWarningCount, lastActiveLevel, recommendNextLevel, shouldBlock } from './warning-rules';

const w = (level: number, revoked = false) => ({ level, revoked });

describe('activeWarningCount', () => {
  it('counts only non-revoked', () => {
    expect(activeWarningCount([w(1), w(2, true), w(1)])).toBe(2);
  });
  it('is 0 for empty', () => expect(activeWarningCount([])).toBe(0));
});

describe('lastActiveLevel', () => {
  it('is the max non-revoked level', () => {
    expect(lastActiveLevel([w(1), w(3, true), w(2)])).toBe(2);
  });
  it('is 0 when all revoked or none', () => {
    expect(lastActiveLevel([w(3, true)])).toBe(0);
    expect(lastActiveLevel([])).toBe(0);
  });
});

describe('recommendNextLevel', () => {
  it('recommends 1 when there are no active warnings', () => {
    expect(recommendNextLevel([])).toBe(1);
    expect(recommendNextLevel([w(2, true)])).toBe(1);
  });
  it('recommends lastActiveLevel + 1', () => {
    expect(recommendNextLevel([w(1)])).toBe(2);
    expect(recommendNextLevel([w(2)])).toBe(3);
  });
  it('caps at 3', () => {
    expect(recommendNextLevel([w(3)])).toBe(3);
  });
});

describe('shouldBlock', () => {
  it('blocks on a level-3 regardless of count', () => {
    expect(shouldBlock(3, 1)).toBe(true);
  });
  it('blocks when the active count reaches 3', () => {
    expect(shouldBlock(1, 3)).toBe(true);
    expect(shouldBlock(2, 4)).toBe(true);
  });
  it('does not block for level 1-2 below 3 active', () => {
    expect(shouldBlock(1, 1)).toBe(false);
    expect(shouldBlock(2, 2)).toBe(false);
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `cd backend && npx vitest run src/modules/incidents/warning-rules.test.ts`

- [ ] **Step 3: Implement**

```ts
// backend/src/modules/incidents/warning-rules.ts
export interface WarningRow { level: number; revoked: boolean }

export function activeWarningCount(warnings: WarningRow[]): number {
  return warnings.filter(w => !w.revoked).length;
}

export function lastActiveLevel(warnings: WarningRow[]): number {
  return warnings.filter(w => !w.revoked).reduce((max, w) => Math.max(max, w.level), 0);
}

export function recommendNextLevel(warnings: WarningRow[]): 1 | 2 | 3 {
  const next = lastActiveLevel(warnings) + 1;
  if (next <= 1) return 1;
  if (next >= 3) return 3;
  return 2;
}

export function shouldBlock(newLevel: number, activeCountIncludingNew: number): boolean {
  return newLevel === 3 || activeCountIncludingNew >= 3;
}
```

- [ ] **Step 4: Run — expect PASS** (10 assertions across 4 groups)

Run: `cd backend && npx vitest run src/modules/incidents/warning-rules.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/incidents/warning-rules.ts backend/src/modules/incidents/warning-rules.test.ts
git commit -m "feat(incidents): warning-rules — cumulative level recommendation + block trigger

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 3: PDF renderers — incident report & warning letter

**Files:**
- Modify: `backend/src/services/pdf.service.ts` (add both, after `maintenanceReportPdf`)

**Interfaces:**
- Consumes: `renderPdf`, `makeReference`, `dataUriToBuffer` (in-file).
- Produces:
  ```ts
  export interface IncidentReportPdfData {
    reference: string;
    title: string;
    description: string;
    status: string;
    occurredAt: string;            // ISO
    subjectName: string | null;
    subjectFaCode: string | null;
    reporterName: string | null;
    carNumber: string | null;
    stadiumName: string | null;
    photoCount: number;
    warnings: Array<{ reference: string; level: number; reason: string; issuedBy: string | null; issuedAt: string; revoked: boolean }>;
  }
  export async function incidentReportPdf(args: { data: IncidentReportPdfData }): Promise<Buffer>;

  export interface WarningLetterPdfData {
    reference: string;
    level: number;
    reason: string;
    subjectName: string | null;
    subjectFaCode: string | null;
    issuedBy: string | null;
    issuedAt: string;              // ISO
    activeWarningCount: number;
    incidentReference: string | null;
    blocked: boolean;
  }
  export async function warningLetterPdf(args: { data: WarningLetterPdfData }): Promise<Buffer>;
  ```

- [ ] **Step 1: Add both renderers**

```ts
export interface IncidentReportPdfData {
  reference: string;
  title: string;
  description: string;
  status: string;
  occurredAt: string;
  subjectName: string | null;
  subjectFaCode: string | null;
  reporterName: string | null;
  carNumber: string | null;
  stadiumName: string | null;
  photoCount: number;
  warnings: Array<{ reference: string; level: number; reason: string; issuedBy: string | null; issuedAt: string; revoked: boolean }>;
}

export async function incidentReportPdf(args: { data: IncidentReportPdfData }): Promise<Buffer> {
  const { data } = args;
  const kv = (doc: PDFKit.PDFDocument, label: string, value: unknown) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#000').text(value != null && value !== '' ? String(value) : '—');
  };
  const heading = (doc: PDFKit.PDFDocument, t: string) => {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#000').text(t).moveDown(0.2);
    doc.font('Helvetica').fontSize(10);
  };
  return renderPdf(
    { title: 'Incident Report', subtitle: data.subjectName ? `Subject: ${data.subjectName}` : undefined, reference: data.reference },
    (doc) => {
      heading(doc, 'Incident');
      kv(doc, 'Title', data.title);
      kv(doc, 'Status', data.status);
      kv(doc, 'Occurred at', new Date(data.occurredAt).toLocaleString());
      kv(doc, 'Venue', data.stadiumName);
      kv(doc, 'Cart', data.carNumber);
      kv(doc, 'Photos attached', data.photoCount);
      doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#000').text(data.description);

      heading(doc, 'People');
      kv(doc, 'Subject', `${data.subjectName ?? '—'}${data.subjectFaCode ? ` (FA ${data.subjectFaCode})` : ''}`);
      kv(doc, 'Reported by', data.reporterName);

      heading(doc, 'Warnings issued');
      if (data.warnings.length === 0) {
        doc.text('None.');
      } else {
        data.warnings.forEach((w, i) => {
          if (i > 0) doc.moveDown(0.3);
          doc.font('Helvetica-Bold').fontSize(10).fillColor(w.revoked ? '#999' : '#000')
            .text(`${w.reference} — Level ${w.level}${w.revoked ? ' (revoked)' : ''}`);
          doc.font('Helvetica').fontSize(9).fillColor('#666')
            .text(`${new Date(w.issuedAt).toLocaleString()}${w.issuedBy ? `  ·  ${w.issuedBy}` : ''}`);
          doc.font('Helvetica').fontSize(9).fillColor('#333').text(w.reason);
          doc.fillColor('#000');
        });
      }
    },
  );
}

export interface WarningLetterPdfData {
  reference: string;
  level: number;
  reason: string;
  subjectName: string | null;
  subjectFaCode: string | null;
  issuedBy: string | null;
  issuedAt: string;
  activeWarningCount: number;
  incidentReference: string | null;
  blocked: boolean;
}

export async function warningLetterPdf(args: { data: WarningLetterPdfData }): Promise<Buffer> {
  const { data } = args;
  const kv = (doc: PDFKit.PDFDocument, label: string, value: unknown) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#000').text(value != null && value !== '' ? String(value) : '—');
  };
  const levelLabel = data.level === 1 ? 'Level 1 — soft warning'
    : data.level === 2 ? 'Level 2 — formal warning'
    : 'Level 3 — final warning (account blocked)';
  return renderPdf(
    { title: 'Warning Notice', subtitle: levelLabel, reference: data.reference },
    (doc) => {
      kv(doc, 'Issued to', `${data.subjectName ?? '—'}${data.subjectFaCode ? ` (FA ${data.subjectFaCode})` : ''}`);
      kv(doc, 'Issued by', data.issuedBy);
      kv(doc, 'Issued at', new Date(data.issuedAt).toLocaleString());
      kv(doc, 'Warning level', data.level);
      kv(doc, 'Cumulative active warnings', data.activeWarningCount);
      kv(doc, 'Related incident', data.incidentReference);
      kv(doc, 'Account status', data.blocked ? 'BLOCKED — contact the administrator' : 'Active');
      doc.moveDown(0.5).font('Helvetica-Bold').fontSize(10).fillColor('#000').text('Reason');
      doc.font('Helvetica').fontSize(10).text(data.reason);
      doc.moveDown(0.8).font('Helvetica').fontSize(9).fillColor('#666').text(
        data.level >= 3
          ? 'This is a final warning. Your access to the system has been blocked. Contact the administrator to discuss reinstatement.'
          : 'Continued breaches may lead to further warnings and, at level 3, a block on your system access.',
      );
    },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit` → no new errors in `pdf.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/pdf.service.ts
git commit -m "feat(incidents): incidentReportPdf + warningLetterPdf renderers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 4: `incidents` module — incident CRUD

**Files:**
- Create: `backend/src/modules/incidents/incidents.service.ts`
- Create: `backend/src/modules/incidents/incidents.controller.ts`
- Create: `backend/src/modules/incidents/incidents.routes.ts`
- Modify: `backend/src/app.ts` (import + `app.use('/api/v1/incidents', incidentsRoutes)`)

**Interfaces:**
- Consumes: `prisma`, `makeReference`, `incidentReportPdf` (Task 3), `uploadFile` + `BUCKETS` (`config/storage`), `AuthRequest`, `requireRole`, `authenticate`, `auditLog`.
- Produces on `incidentsService`:
  ```ts
  const INCIDENT_INCLUDE = { subjectUser: {...}, reportedBy: {...}, fleet: {...}, stadium: {...}, warnings: { include: { issuedBy: {...} } } }
  create(data: { subjectUserId; reportedById; title; description; occurredAt: Date; fleetId?; stadiumId?; photosUrls?: string[] }): Promise<Incident>
  list(filters: { stadiumId?; subjectUserId?; status? }, page?, limit?): Promise<{ data; total }>
  getById(id: string): Promise<Incident | null>
  updateStatus(id: string, status: 'Open'|'UnderReview'|'Closed'): Promise<Incident>
  buildPdf(id: string): Promise<{ buffer: Buffer; reference: string } | null>
  ```
  `create` does: `prisma.incident.create({ data: { ...fields, reference: 'PENDING', photosUrls: JSON.stringify(photos ?? []) } })` then `makeReference('INC', row.id)` then `prisma.incident.update({ where: { id: row.id }, data: { reference }, include: INCIDENT_INCLUDE })`.
- Produces on the controller: `report`, `list`, `getById`, `updateStatus`, `downloadPdf` (all `static async (req: AuthRequest, res: Response)`), plus `uploadMiddleware = multer(...).array('photos', 5)`.
- **Venue scoping helper (controller-local):**
  ```ts
  function scopeCheck(user, incident): boolean {
    if (user.role === 'SuperAdmin') return true;
    if (user.role !== 'Admin') return true; // reporter-level reads handled per-route
    const venue = incident.stadiumId ?? incident.subjectUser?.stadiumId ?? null;
    return !!user.stadiumId && venue === user.stadiumId;
  }
  ```

- [ ] **Step 1: `incidents.service.ts`**

```ts
import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { makeReference } from '../../services/pdf.service';
import { incidentReportPdf } from '../../services/pdf.service';

const INCIDENT_INCLUDE = {
  subjectUser: { select: { id: true, name: true, email: true, accreditationNumber: true, stadiumId: true, isBlocked: true } },
  reportedBy: { select: { id: true, name: true, role: true } },
  fleet: { select: { id: true, carNumber: true } },
  stadium: { select: { id: true, name: true } },
  warnings: {
    orderBy: { issuedAt: 'desc' as const },
    include: { issuedBy: { select: { name: true } } },
  },
};

export interface CreateIncidentData {
  subjectUserId: string;
  reportedById: string;
  title: string;
  description: string;
  occurredAt: Date;
  fleetId?: string;
  stadiumId?: string;
  photosUrls?: string[];
}

export class IncidentsService {
  async create(data: CreateIncidentData) {
    const row = await prisma.incident.create({
      data: {
        reference: randomUUID(), // transient, unique; replaced immediately below
        subjectUserId: data.subjectUserId,
        reportedById: data.reportedById,
        title: data.title,
        description: data.description,
        occurredAt: data.occurredAt,
        fleetId: data.fleetId ?? null,
        stadiumId: data.stadiumId ?? null,
        photosUrls: JSON.stringify(data.photosUrls ?? []),
      },
    });
    return prisma.incident.update({
      where: { id: row.id },
      data: { reference: makeReference('INC', row.id) },
      include: INCIDENT_INCLUDE,
    });
  }

  async list(filters: { stadiumId?: string; subjectUserId?: string; status?: string }, page = 1, limit = 50) {
    const where: any = {};
    if (filters.status) where.status = filters.status;
    if (filters.subjectUserId) where.subjectUserId = filters.subjectUserId;
    if (filters.stadiumId) {
      where.OR = [{ stadiumId: filters.stadiumId }, { stadiumId: null, subjectUser: { stadiumId: filters.stadiumId } }];
    }
    const [data, total] = await Promise.all([
      prisma.incident.findMany({ where, include: INCIDENT_INCLUDE, orderBy: { createdAt: 'desc' }, skip: (page - 1) * limit, take: limit }),
      prisma.incident.count({ where }),
    ]);
    return { data, total };
  }

  getById(id: string) {
    return prisma.incident.findUnique({ where: { id }, include: INCIDENT_INCLUDE });
  }

  updateStatus(id: string, status: string) {
    return prisma.incident.update({ where: { id }, data: { status }, include: INCIDENT_INCLUDE });
  }

  async buildPdf(id: string): Promise<{ buffer: Buffer; reference: string } | null> {
    const inc = await this.getById(id);
    if (!inc) return null;
    let photoCount = 0;
    try { photoCount = (JSON.parse((inc.photosUrls as string) || '[]') as unknown[]).length; } catch { photoCount = 0; }
    const buffer = await incidentReportPdf({
      data: {
        reference: inc.reference,
        title: inc.title,
        description: inc.description,
        status: inc.status,
        occurredAt: inc.occurredAt.toISOString(),
        subjectName: inc.subjectUser?.name ?? null,
        subjectFaCode: inc.subjectUser?.accreditationNumber ?? null,
        reporterName: inc.reportedBy?.name ?? null,
        carNumber: inc.fleet?.carNumber ?? null,
        stadiumName: inc.stadium?.name ?? null,
        photoCount,
        warnings: inc.warnings.map((w: any) => ({
          reference: w.reference, level: w.level, reason: w.reason,
          issuedBy: w.issuedBy?.name ?? null, issuedAt: w.issuedAt.toISOString(), revoked: w.revoked,
        })),
      },
    });
    return { buffer, reference: inc.reference };
  }
}

export const incidentsService = new IncidentsService();
```

- [ ] **Step 2: `incidents.controller.ts`** (incident handlers only — warning handlers added in Task 5)

```ts
import { Response } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { AuthRequest } from '../../middleware/auth.middleware';
import { incidentsService } from './incidents.service';
import { uploadFile, BUCKETS } from '../../config/storage';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

const reportSchema = z.object({
  subjectUserId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  occurredAt: z.string().datetime().or(z.string().min(1)),
  fleetId: z.string().optional(),
  stadiumId: z.string().optional(),
});
const statusSchema = z.object({ status: z.enum(['Open', 'UnderReview', 'Closed']) });

function adminCanTouch(user: any, incident: any): boolean {
  if (user?.role === 'SuperAdmin') return true;
  if (user?.role !== 'Admin') return true;
  const venue = incident.stadiumId ?? incident.subjectUser?.stadiumId ?? null;
  return !!user.stadiumId && venue === user.stadiumId;
}

export class IncidentsController {
  static uploadMiddleware = upload.array('photos', 5);

  static async report(req: AuthRequest, res: Response) {
    try {
      const body = reportSchema.parse(req.body);
      let photosUrls: string[] = [];
      if (Array.isArray(req.files) && req.files.length) {
        const files = req.files as Express.Multer.File[];
        photosUrls = await Promise.all(files.map((f, i) =>
          uploadFile(BUCKETS.INCIDENT_PHOTOS, `inc_${Date.now()}_${i}_${f.originalname.replace(/[^\w.-]/g, '')}`, f.buffer, f.mimetype),
        ));
      }
      const incident = await incidentsService.create({
        subjectUserId: body.subjectUserId,
        reportedById: req.user!.userId,
        title: body.title,
        description: body.description,
        occurredAt: new Date(body.occurredAt),
        fleetId: body.fleetId,
        stadiumId: body.stadiumId,
        photosUrls,
      });
      res.status(201).json({ message: 'Incident filed', data: incident });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else { console.error('Incident report failed:', error); res.status(500).json({ error: 'Failed to file incident' }); }
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const { status, subjectUserId, page, limit } = req.query as Record<string, string>;
      const stadiumId = req.user?.role === 'Admin' ? req.user.stadiumId : undefined;
      const result = await incidentsService.list(
        { status, subjectUserId, stadiumId },
        page ? parseInt(page) : undefined,
        limit ? parseInt(limit) : undefined,
      );
      res.status(200).json(result);
    } catch (error) {
      console.error('Incident list failed:', error);
      res.status(500).json({ error: 'Failed to list incidents' });
    }
  }

  static async getById(req: AuthRequest, res: Response) {
    try {
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      res.status(200).json({ data: inc });
    } catch (error) {
      res.status(500).json({ error: 'Failed to fetch incident' });
    }
  }

  static async updateStatus(req: AuthRequest, res: Response) {
    try {
      const body = statusSchema.parse(req.body);
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const updated = await incidentsService.updateStatus(inc.id, body.status);
      res.status(200).json({ data: updated });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else res.status(500).json({ error: 'Failed to update incident' });
    }
  }

  static async downloadPdf(req: AuthRequest, res: Response) {
    try {
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const out = await incidentsService.buildPdf(inc.id);
      if (!out) { res.status(404).json({ error: 'Incident not found' }); return; }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=${out.reference}.pdf`);
      res.send(out.buffer);
    } catch (error) {
      console.error('Incident PDF failed:', error);
      res.status(500).json({ error: 'Failed to generate incident PDF' });
    }
  }
}
```

- [ ] **Step 3: `incidents.routes.ts`**

```ts
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { IncidentsController } from './incidents.controller';
// WarningsController is added in Task 5

const router = Router();
router.use(authenticate);

// Any authenticated user can file an incident
router.post('/', IncidentsController.uploadMiddleware, auditLog(), IncidentsController.report);

// Admin / SuperAdmin management
router.get('/', requireRole('SuperAdmin', 'Admin'), IncidentsController.list);
router.get('/:id', requireRole('SuperAdmin', 'Admin'), IncidentsController.getById);
router.patch('/:id/status', requireRole('SuperAdmin', 'Admin'), auditLog(), IncidentsController.updateStatus);
router.get('/:id/pdf', requireRole('SuperAdmin', 'Admin'), IncidentsController.downloadPdf);

export default router;
```

- [ ] **Step 4: Register in `app.ts`**

Add `import incidentsRoutes from './modules/incidents/incidents.routes';` with the other imports and `app.use('/api/v1/incidents', incidentsRoutes);` with the other mounts (after `pool-bookings`).

- [ ] **Step 5: Typecheck + verify**

Run: `cd backend && npx tsc --noEmit` → clean for the incidents files + `app.ts`.

With backend up + a SuperAdmin `$TOKEN` and an FA `$FATOKEN` (login `fa1.lus@gcms.com` / `Admin@2024!` — if that fails, pick any FA from `GET /users?role=FA`), and a subject user id `$SUID`:
```bash
# FA files an incident
curl -s -X POST localhost:3005/api/v1/incidents -H "Authorization: Bearer $FATOKEN" -H 'content-type: application/json' \
  -d "{\"subjectUserId\":\"$SUID\",\"title\":\"Reckless driving\",\"description\":\"Sped through pit lane\",\"occurredAt\":\"2026-09-10T09:00:00Z\"}" -w '\n%{http_code}\n'
# SuperAdmin lists + reads + status + pdf
curl -s localhost:3005/api/v1/incidents -H "Authorization: Bearer $TOKEN" | head -c 300
INC=$(curl -s localhost:3005/api/v1/incidents -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>console.log(JSON.parse(d).data[0].id))")
curl -s -X PATCH localhost:3005/api/v1/incidents/$INC/status -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"status":"UnderReview"}' -w '\n%{http_code}\n'
curl -s localhost:3005/api/v1/incidents/$INC/pdf -H "Authorization: Bearer $TOKEN" -o /tmp/inc.pdf -w '%{http_code} %{size_download}b\n' && head -c 5 /tmp/inc.pdf
```
Expected: FA POST → 201 with an `INC-YYYY-XXXXXX` reference; list returns it; status → 200; PDF → `%PDF-`. Confirm an Admin from a *different* venue gets 403 on `GET /incidents/:id`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/incidents/incidents.service.ts backend/src/modules/incidents/incidents.controller.ts backend/src/modules/incidents/incidents.routes.ts backend/src/app.ts
git commit -m "feat(incidents): /incidents module — file, list (venue-scoped), status, PDF

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 5: Warning lifecycle — issue, list, revoke, block, notify, email

**Files:**
- Create: `backend/src/modules/incidents/warnings.service.ts`
- Modify: `backend/src/modules/incidents/incidents.controller.ts` (add `WarningsController` OR warning methods on a new export)
- Modify: `backend/src/modules/incidents/incidents.routes.ts` (warning routes)

**Interfaces:**
- Consumes: `prisma`, `warning-rules` (Task 2), `makeReference` + `warningLetterPdf` + `incidentReportPdf` (Task 3), `notificationService`, `emailService`, `incidentsService.buildPdf`.
- Produces on `warningsService`:
  ```ts
  issue(data: { userId: string; issuedById: string; level: 1|2|3; reason: string; incidentId?: string }): Promise<{ warning: Warning; blocked: boolean }>
  list(filters: { userId?: string; level?: number; revoked?: boolean }): Promise<Warning[]>
  revoke(id: string, revokedById: string, alsoUnblock: boolean): Promise<{ warning: Warning; unblocked: boolean }>
  ```
  `issue` steps:
  1. load subject `user` + their existing `warnings` (`select: { level, revoked }`); 404 if no user.
  2. `create` the warning with `reference: 'PENDING'`, then `makeReference('WRN', id)`, then `update` to set it; `include: { incident: true, issuedBy: {select:{name}}, user: {select:{...}} }`.
  3. `activeCount = activeWarningCount([...existing, { level, revoked: false }])`.
  4. `blocked = shouldBlock(level, activeCount)`; if blocked and not already blocked → `prisma.user.update({ where: { id: userId }, data: { isBlocked: true, blockedAt: new Date(), blockedReason: `${reference}: ${reason}`, blockedById: issuedById } })`.
  5. `notificationService.create({ type: 'warning', title: `Warning issued — Level ${level}`, message: reason, entityType: 'Warning', entityId: warning.id, userId })`.
  6. email (try/catch, non-fatal): if `incidentId` → attach `incidentsService.buildPdf(incidentId)` buffer; else `warningLetterPdf(...)`. `to: user.email`, subject `Warning notice ${reference} — Level ${level}`.
  7. return `{ warning, blocked }`.
  `revoke` steps: set `revoked: true, revokedById, revokedAt: new Date()`; if `alsoUnblock` AND the revoked warning was the block cause (`user.blockedReason?.startsWith(warning.reference)`) → clear block fields. Return `{ warning, unblocked }`.

- [ ] **Step 1: `warnings.service.ts`**

Write the service per the interface above. Key snippet for the block + notify + email:

```ts
import { randomUUID } from 'crypto';
import { prisma } from '../../config/database';
import { activeWarningCount, shouldBlock } from './warning-rules';
import { makeReference, warningLetterPdf } from '../../services/pdf.service';
import { notificationService } from '../notifications/notification.service';
import { emailService } from '../../services/email.service';
import { incidentsService } from './incidents.service';

export class WarningsService {
  async issue(data: { userId: string; issuedById: string; level: number; reason: string; incidentId?: string }) {
    const user = await prisma.user.findUnique({
      where: { id: data.userId },
      select: { id: true, name: true, email: true, accreditationNumber: true, isBlocked: true, warnings: { select: { level: true, revoked: true } } },
    });
    if (!user) throw new Error('USER_NOT_FOUND');

    const created = await prisma.warning.create({
      data: {
        reference: randomUUID(), // transient, unique; replaced immediately below
        userId: data.userId,
        issuedById: data.issuedById,
        level: data.level,
        reason: data.reason,
        incidentId: data.incidentId ?? null,
      },
    });
    const reference = makeReference('WRN', created.id);
    const warning = await prisma.warning.update({
      where: { id: created.id },
      data: { reference },
      include: { incident: { select: { reference: true } }, issuedBy: { select: { name: true } } },
    });

    const activeCount = activeWarningCount([...user.warnings, { level: data.level, revoked: false }]);
    const blocked = shouldBlock(data.level, activeCount);
    if (blocked && !user.isBlocked) {
      await prisma.user.update({
        where: { id: user.id },
        data: { isBlocked: true, blockedAt: new Date(), blockedReason: `${reference}: ${data.reason}`, blockedById: data.issuedById },
      });
    }

    await notificationService.create({
      type: 'warning',
      title: `Warning issued — Level ${data.level}`,
      message: data.reason,
      entityType: 'Warning',
      entityId: warning.id,
      userId: user.id,
    });

    try {
      let attachment: { filename: string; content: Buffer; contentType: string };
      if (data.incidentId) {
        const inc = await incidentsService.buildPdf(data.incidentId);
        attachment = { filename: `${inc?.reference ?? reference}.pdf`, content: inc!.buffer, contentType: 'application/pdf' };
      } else {
        const buf = await warningLetterPdf({
          data: {
            reference, level: data.level, reason: data.reason,
            subjectName: user.name, subjectFaCode: user.accreditationNumber ?? null,
            issuedBy: warning.issuedBy?.name ?? null, issuedAt: warning.issuedAt.toISOString(),
            activeWarningCount: activeCount, incidentReference: warning.incident?.reference ?? null, blocked,
          },
        });
        attachment = { filename: `${reference}.pdf`, content: buf, contentType: 'application/pdf' };
      }
      await emailService.send({
        to: user.email,
        subject: `Warning notice ${reference} — Level ${data.level}`,
        text: `A level ${data.level} warning (${reference}) has been issued to you.\n\nReason: ${data.reason}\n${blocked ? '\nYour account has been blocked. Contact the administrator.\n' : ''}\n— GCMS`,
        attachments: [attachment],
      });
    } catch (err) {
      console.error('Warning email failed (non-fatal):', err);
    }

    return { warning, blocked };
  }

  list(filters: { userId?: string; level?: number; revoked?: boolean }) {
    const where: any = {};
    if (filters.userId) where.userId = filters.userId;
    if (filters.level != null) where.level = filters.level;
    if (filters.revoked != null) where.revoked = filters.revoked;
    return prisma.warning.findMany({
      where,
      orderBy: { issuedAt: 'desc' },
      include: {
        user: { select: { id: true, name: true, accreditationNumber: true } },
        issuedBy: { select: { name: true } },
        revokedBy: { select: { name: true } },
        incident: { select: { id: true, reference: true } },
      },
    });
  }

  async revoke(id: string, revokedById: string, alsoUnblock: boolean) {
    const existing = await prisma.warning.findUnique({ where: { id }, include: { user: { select: { id: true, blockedReason: true } } } });
    if (!existing) throw new Error('WARNING_NOT_FOUND');
    const warning = await prisma.warning.update({
      where: { id },
      data: { revoked: true, revokedById, revokedAt: new Date() },
      include: { user: { select: { id: true } } },
    });
    let unblocked = false;
    if (alsoUnblock && existing.user.blockedReason?.startsWith(existing.reference)) {
      await prisma.user.update({
        where: { id: existing.user.id },
        data: { isBlocked: false, blockedAt: null, blockedReason: null, blockedById: null },
      });
      unblocked = true;
    }
    return { warning, unblocked };
  }
}

export const warningsService = new WarningsService();
```

- [ ] **Step 2: Controller — warning handlers**

Append `WarningsController` to `incidents.controller.ts` (or a new `warnings` section):

```ts
const issueSchema = z.object({
  userId: z.string().min(1).optional(),   // required for standalone POST /warnings; taken from incident for POST /incidents/:id/warnings
  level: z.number().int().min(1).max(3),
  reason: z.string().min(1),
  incidentId: z.string().optional(),
});
const revokeSchema = z.object({ unblock: z.boolean().optional() });

export class WarningsController {
  static async issueForIncident(req: AuthRequest, res: Response) {
    try {
      const inc = await incidentsService.getById(req.params.id as string);
      if (!inc) { res.status(404).json({ error: 'Incident not found' }); return; }
      if (!adminCanTouch(req.user, inc)) { res.status(403).json({ error: 'Access denied' }); return; }
      const body = issueSchema.parse({ ...req.body, incidentId: inc.id });
      const { warning, blocked } = await warningsService.issue({
        userId: inc.subjectUserId,
        issuedById: req.user!.userId,
        level: body.level,
        reason: body.reason,
        incidentId: inc.id,
      });
      res.status(201).json({ message: blocked ? 'Warning issued — user blocked' : 'Warning issued', data: warning, blocked });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else if ((error as any)?.message === 'USER_NOT_FOUND') res.status(404).json({ error: 'Subject user not found' });
      else { console.error('Issue warning failed:', error); res.status(500).json({ error: 'Failed to issue warning' }); }
    }
  }

  static async issueStandalone(req: AuthRequest, res: Response) {
    try {
      const body = issueSchema.parse(req.body);
      if (!body.userId) { res.status(400).json({ error: 'userId is required' }); return; }
      // Admin venue check on the subject user
      if (req.user?.role === 'Admin') {
        const u = await prisma.user.findUnique({ where: { id: body.userId }, select: { stadiumId: true } });
        if (!u || !req.user.stadiumId || u.stadiumId !== req.user.stadiumId) { res.status(403).json({ error: 'Access denied' }); return; }
      }
      const { warning, blocked } = await warningsService.issue({
        userId: body.userId,
        issuedById: req.user!.userId,
        level: body.level,
        reason: body.reason,
        incidentId: body.incidentId,
      });
      res.status(201).json({ message: blocked ? 'Warning issued — user blocked' : 'Warning issued', data: warning, blocked });
    } catch (error) {
      if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else if ((error as any)?.message === 'USER_NOT_FOUND') res.status(404).json({ error: 'Subject user not found' });
      else { console.error('Issue warning failed:', error); res.status(500).json({ error: 'Failed to issue warning' }); }
    }
  }

  static async list(req: AuthRequest, res: Response) {
    try {
      const { userId, level, revoked } = req.query as Record<string, string>;
      const rows = await warningsService.list({
        userId,
        level: level ? parseInt(level) : undefined,
        revoked: revoked == null ? undefined : revoked === 'true',
      });
      res.status(200).json({ data: rows });
    } catch (error) {
      res.status(500).json({ error: 'Failed to list warnings' });
    }
  }

  static async revoke(req: AuthRequest, res: Response) {
    try {
      const body = revokeSchema.parse(req.body);
      const { warning, unblocked } = await warningsService.revoke(req.params.id as string, req.user!.userId, !!body.unblock);
      res.status(200).json({ message: unblocked ? 'Warning revoked — user unblocked' : 'Warning revoked', data: warning, unblocked });
    } catch (error) {
      if ((error as any)?.message === 'WARNING_NOT_FOUND') res.status(404).json({ error: 'Warning not found' });
      else if (error instanceof z.ZodError) res.status(400).json({ error: 'Validation error', details: error.errors });
      else res.status(500).json({ error: 'Failed to revoke warning' });
    }
  }
}
```
Add `import { warningsService } from './warnings.service';` and `import { prisma } from '../../config/database';` to the controller.

- [ ] **Step 3: Routes**

In `incidents.routes.ts` add:
```ts
import { WarningsController } from './incidents.controller';

router.post('/:id/warnings', requireRole('SuperAdmin', 'Admin'), auditLog(), WarningsController.issueForIncident);

// mounted at /api/v1/warnings via a second router export — see Step 4
```

**Step 3b:** Because `/warnings` is a sibling path, create `backend/src/modules/incidents/warnings.routes.ts`:
```ts
import { Router } from 'express';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';
import { WarningsController } from './incidents.controller';

const router = Router();
router.use(authenticate);

router.get('/', requireRole('SuperAdmin', 'Admin'), WarningsController.list);
router.post('/', requireRole('SuperAdmin', 'Admin'), auditLog(), WarningsController.issueStandalone);
router.patch('/:id/revoke', requireRole('SuperAdmin'), auditLog(), WarningsController.revoke);

export default router;
```
And in `app.ts`: `import warningsRoutes from './modules/incidents/warnings.routes';` + `app.use('/api/v1/warnings', warningsRoutes);`.

- [ ] **Step 4: Typecheck + verify the full flow**

Run: `cd backend && npx tsc --noEmit` → clean.

Start the fake SMTP sink: `node <scratchpad>/fake-smtp.js` (so the email step returns 200-style success and the block/notify still run either way).

With `$TOKEN` (SuperAdmin), `$SUID` (a disposable FA subject user), `$INC` (an incident about `$SUID` from Task 4):
```bash
# Level 1 via incident
curl -s -X POST localhost:3005/api/v1/incidents/$INC/warnings -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"level":1,"reason":"First offence"}' -w '\n%{http_code}\n'
# Level 1 standalone
curl -s -X POST localhost:3005/api/v1/warnings -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"userId\":\"$SUID\",\"level\":1,\"reason\":\"Second, unrelated\"}" -w '\n%{http_code}\n'
# Level 2 -> now 3 active -> should block
curl -s -X POST localhost:3005/api/v1/warnings -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d "{\"userId\":\"$SUID\",\"level\":2,\"reason\":\"Third\"}" -w '\n%{http_code}\n'
# confirm blocked
curl -s localhost:3005/api/v1/users/$SUID -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{const u=JSON.parse(d);console.log('isBlocked:',u.data?.isBlocked ?? u.isBlocked)})"
# list warnings for the user
curl -s "localhost:3005/api/v1/warnings?userId=$SUID" -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).data.map(w=>({ref:w.reference,lvl:w.level,revoked:w.revoked})))})"
# the blocked user cannot log in
curl -s -X POST localhost:3005/api/v1/auth/login -H 'content-type: application/json' -d '{"email":"<SUBJECT_EMAIL>","password":"Admin@2024!"}' -w '\n%{http_code}\n'
# revoke the level-2 with unblock
WID=$(curl -s "localhost:3005/api/v1/warnings?userId=$SUID" -H "Authorization: Bearer $TOKEN" | node -e "let d='';process.stdin.on('data',c=>d+=c).on('end',()=>{console.log(JSON.parse(d).data.find(w=>w.level===2).id)})")
curl -s -X PATCH localhost:3005/api/v1/warnings/$WID/revoke -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"unblock":true}' -w '\n%{http_code}\n'
```
Expected: first two → 201 `blocked:false`; the third → 201 `blocked:true` + message "user blocked"; `isBlocked:true`; warnings list shows 3 rows; the blocked login → **403** with `Your account has been blocked. Contact the administrator.` (this proves Task 6's gate too — do this check again after Task 6 if login still 401s here); revoke with `unblock:true` → 200 "user unblocked". Also verify: an in-app `Notification` (`type: 'warning'`) exists for `$SUID` per issue (`GET /notifications` as that user, or query the DB).

**Cleanup:** unblock / delete the disposable subject user, or leave it blocked-then-unblocked as the script ends. Do NOT leave a seeded login broken.

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/incidents/warnings.service.ts backend/src/modules/incidents/incidents.controller.ts backend/src/modules/incidents/incidents.routes.ts backend/src/modules/incidents/warnings.routes.ts backend/src/app.ts
git commit -m "feat(incidents): warning lifecycle — issue (linked/standalone), list, revoke, block, notify, email

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 6: `isBlocked` enforcement — middleware, login, unblock endpoint

**Files:**
- Modify: `backend/src/middleware/auth.middleware.ts`
- Modify: `backend/src/modules/auth/auth.service.ts`
- Modify: `backend/src/modules/auth/auth.controller.ts`
- Modify: `backend/src/modules/users/users.routes.ts`, `users.controller.ts`, `users.service.ts`

**Interfaces:**
- Produces: 403 `{ error: 'Your account has been blocked. Contact the administrator.' }` at login and on authenticated requests; `PATCH /users/:id/unblock` (SuperAdmin) → `usersService.unblockUser(id)`.

- [ ] **Step 1: `auth.middleware.ts`**

In `authenticate`, add `isBlocked: true` to the user `select` (line ~46), and after the `isActive` check add:
```ts
        if (user.isBlocked) {
            res.status(403).json({ error: 'Your account has been blocked. Contact the administrator.' });
            return;
        }
```
Do the same in the optional-auth variant (line ~109 select + ~112 guard: only attach `req.user` when `user.isActive && !user.isBlocked`).

- [ ] **Step 2: `auth.service.ts` login**

After the `if (!user.isActive)` throw (~line 79) add:
```ts
        if (user.isBlocked) {
            throw new Error('ACCOUNT_BLOCKED');
        }
```
(`user` here must already select `isBlocked` — check the `findUnique`/`findFirst` select in `login`; add `isBlocked: true` if absent.)

- [ ] **Step 3: `auth.controller.ts` login catch**

In the `login` catch, before the generic `Error` → 401 branch:
```ts
            if (error instanceof Error && error.message === 'ACCOUNT_BLOCKED') {
                res.status(403).json({ error: 'Your account has been blocked. Contact the administrator.' });
                return;
            }
```

- [ ] **Step 4: `users.service.ts`**

```ts
async unblockUser(id: string) {
    return prisma.user.update({
        where: { id },
        data: { isBlocked: false, blockedAt: null, blockedReason: null, blockedById: null },
        select: { id: true, name: true, email: true, isBlocked: true },
    });
}
```
Also extend the existing `getById` `include`/`select` with the warning history:
```ts
warnings: { orderBy: { issuedAt: 'desc' }, include: { issuedBy: { select: { name: true } }, incident: { select: { id: true, reference: true } } } },
```
(add `blockedAt`, `blockedReason` to the selected scalar fields too.)

- [ ] **Step 5: `users.controller.ts` + `users.routes.ts`**

Controller:
```ts
static async unblock(req: AuthRequest, res: Response) {
    try {
        const user = await usersService.unblockUser(req.params.id as string);
        res.status(200).json({ message: 'User unblocked', data: user });
    } catch (error) {
        console.error('Unblock failed:', error);
        res.status(500).json({ error: 'Failed to unblock user' });
    }
}
```
Route (SuperAdmin only), next to `/:id/blocked`:
```ts
router.patch('/:id/unblock', requireRole('SuperAdmin'), auditLog(), UsersController.unblock);
```

- [ ] **Step 6: Typecheck + verify**

Run: `cd backend && npx tsc --noEmit` → clean for the 5 files.

- Re-run the Task 5 "blocked user cannot log in" curl → now **403** with the exact message (if it was 401 before Task 6).
- Block a disposable user (issue a level-3), then `curl` any authed endpoint with *that user's* still-valid token → **403** same message.
- `PATCH /users/<id>/unblock` as SuperAdmin → 200; the user can log in again; `GET /users/<id>` still lists their (now historical) warnings — count unchanged.
- `PATCH /users/<id>/unblock` as Admin → 403 (route is SuperAdmin-only).

- [ ] **Step 7: Commit**

```bash
git add backend/src/middleware/auth.middleware.ts backend/src/modules/auth/auth.service.ts backend/src/modules/auth/auth.controller.ts backend/src/modules/users/users.routes.ts backend/src/modules/users/users.controller.ts backend/src/modules/users/users.service.ts
git commit -m "feat(auth): reject blocked users at login + on every request; SuperAdmin unblock

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 7: Frontend — Incidents page, warning history, report-incident modal

**Files:**
- Modify: `frontend/src/lib/api.ts` — `incidentsApi`, `warningsApi`, `usersApi.unblock`
- Create: `frontend/src/pages/IncidentsPage.tsx`
- Create: `frontend/src/components/incidents/ReportIncidentModal.tsx`
- Modify: `frontend/src/App.tsx` — `/incidents` route
- Modify: `frontend/src/components/layout/MainLayout.tsx` — nav item
- Modify: `frontend/src/pages/UsersPage.tsx` — warning-history panel + unblock button on the user detail view
- Modify: `frontend/src/pages/BookingsPage.tsx` — "Report incident" action

**Interfaces:**
- Consumes: `apiClient`; the Task 4–6 endpoints.
- Produces:
  ```ts
  incidentsApi = {
    list: (params?) => apiClient.get('/incidents', { params }),
    get: (id) => apiClient.get(`/incidents/${id}`),
    report: (formData: FormData) => apiClient.post('/incidents', formData),   // multipart
    setStatus: (id, status) => apiClient.patch(`/incidents/${id}/status`, { status }),
    downloadPdf: (id) => apiClient.get(`/incidents/${id}/pdf`, { responseType: 'blob' }),
    issueWarning: (id, data: { level: number; reason: string }) => apiClient.post(`/incidents/${id}/warnings`, data),
  };
  warningsApi = {
    list: (params?: { userId?: string }) => apiClient.get('/warnings', { params }),
    issue: (data: { userId: string; level: number; reason: string; incidentId?: string }) => apiClient.post('/warnings', data),
    revoke: (id, unblock: boolean) => apiClient.patch(`/warnings/${id}/revoke`, { unblock }),
  };
  // usersApi
  unblock: (id: string) => apiClient.patch(`/users/${id}/unblock`),
  ```

- [ ] **Step 1: API methods** — add the three blocks to `frontend/src/lib/api.ts`.

- [ ] **Step 2: `ReportIncidentModal.tsx`**

A `<Dialog>` with: subject user `<Select>` (fetched via `usersApi.getAll`), title `<Input>`, description `<Textarea>`, `occurredAt` datetime-local, optional `photos` `<input type=file multiple>`, optional hidden `fleetId` / `stadiumId` props (passed by the caller when opened from a booking/handover). On submit build a `FormData`, `incidentsApi.report(fd)`, `toast.success('Incident filed — reference <ref>')`, close. Props: `{ open, onOpenChange, subjectUserId?, fleetId?, stadiumId?, onFiled? }`.

- [ ] **Step 3: `IncidentsPage.tsx`** at `/incidents`

- Filters: status (`All/Open/UnderReview/Closed`), subject search.
- Table: reference, subject (name + FA code), reporter, venue, occurred, status badge, warning count.
- Row click → detail `<Dialog>`: full description, photos (thumbnails), the incident's warnings list, a **status** `<Select>`, a **"Download PDF"** button (`incidentsApi.downloadPdf`), and an **"Issue a warning"** collapsible:
  - a toggle (`Checkbox`/`Switch`) "Issue a warning";
  - when on: a level `<Select>` (1 / 2 / 3) defaulted to the recommended level — compute client-side from the incident's `subjectUser` warnings if present, else default 1 — with helper text "Recommended: Level N (cumulative: M active warnings)";
  - a reason `<Textarea>`;
  - a **red note** when level 3 is selected: "Level 3 will block this user from the system.";
  - "Issue warning" button → `incidentsApi.issueWarning(id, { level, reason })` → toast (includes "user blocked" when `res.data.blocked`), refresh.
- A top-right **"Report incident"** button opening `ReportIncidentModal` (standalone, no subject preset).

- [ ] **Step 4: Route + nav**

`App.tsx`: `<Route path="/incidents" element={<PageGuard pageKey="incidents"><IncidentsPage /></PageGuard>} />` (lazy import alongside the others).
`MainLayout.tsx` `navItems`: `{ name: 'Incidents', href: '/incidents', icon: ShieldAlert, roles: ['SuperAdmin', 'Admin'], pageKey: 'incidents' }` (import `ShieldAlert` from lucide-react; if absent use `AlertTriangle`).

- [ ] **Step 5: Users detail — warning history + unblock**

On the user detail view in `UsersPage.tsx`:
- a "Warnings" section listing `user.warnings` (level badge, reason, issuedBy, issuedAt, revoked state) — data already comes from the extended `getById` (Task 6 Step 4); if the detail view fetches a lighter payload, call `warningsApi.list({ userId })` instead.
- when `user.isBlocked`: a red banner "Blocked — <blockedReason>" with an **Unblock** button (visible to SuperAdmin only) → `usersApi.unblock(id)` → toast, refresh.
- an **"Issue warning"** button (SuperAdmin/Admin) opening a small dialog (level + reason) → `warningsApi.issue({ userId, level, reason })`.

- [ ] **Step 6: Bookings page hook**

In `BookingsPage.tsx`, add a "Report incident" item (row action or detail-dialog button) that opens `ReportIncidentModal` with `subjectUserId` = the booking's `faUserId` (or leave unset for the user to pick), `fleetId` = the booking's `fleetId`, `stadiumId` = the booking's `stadiumId`.

- [ ] **Step 7: Typecheck + browser**

Run: `cd frontend && npx tsc --noEmit` → exit 0.
Browser (backend + frontend up, fake-smtp running), login `superadmin@gcms.com`:
- **Incidents** appears in the nav → page lists incidents filed via the API.
- "Report incident" → modal files one; it appears in the list.
- Open an incident → toggle "Issue a warning" → level defaults to recommended → issue level 1, then level 2, then level 3 → after level 3 the detail shows the subject as blocked; toast said "user blocked".
- Users → open that user → red "Blocked" banner + **Unblock** → click → banner clears; warning history still lists 3 rows.
- Login as that user's email → blocked message on the login page (the 403 body surfaces).
- Check 375 / 768 / 1280 px on IncidentsPage table + dialogs.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/pages/IncidentsPage.tsx frontend/src/components/incidents/ReportIncidentModal.tsx frontend/src/App.tsx frontend/src/components/layout/MainLayout.tsx frontend/src/pages/UsersPage.tsx frontend/src/pages/BookingsPage.tsx
git commit -m "feat(incidents): IncidentsPage, report-incident modal, warning history + unblock UI

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 8: Phase 6 verification sweep

**Files:** none (verification only; fixups committed if needed).

- [ ] **Step 1: Backend tests** — `cd backend && npm test` → green. Expect **60 tests / 10 files** (+10 assertions in `warning-rules.test.ts` as 1 new file; adjust if counts shifted).

- [ ] **Step 2: Typecheck** — `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit` → no new errors in touched files.

- [ ] **Step 3: Acceptance (spec §10.4)**
  - [ ] An FA files an incident via `POST /incidents`; no `Warning` row exists for the subject afterwards.
  - [ ] `POST /incidents/:id/warnings` and `POST /warnings` each issue a level 1/2/3 warning; incident-linked and standalone both work.
  - [ ] Three cumulative non-revoked warnings **or** one level-3 → `user.isBlocked = true`; that user gets **403 + the block message** at `POST /auth/login` and on an authenticated request.
  - [ ] `PATCH /users/:id/unblock` (SuperAdmin) clears the block; `GET /users/:id` still shows all warnings (count unchanged). Admin calling it → 403.
  - [ ] Each issued warning creates a `Notification` (`type: 'warning'`, `userId` = subject) and sends an email with a PDF attached (incident report when linked, warning letter otherwise) — verified via fake-smtp (200) with the block/notification still succeeding when the email path is exercised.
  - [ ] `GET /incidents/:id/pdf` → branded `INC-YYYY-XXXXXX` PDF listing the incident + its warnings.
  - [ ] Admin venue scoping: an Admin cannot GET / act on an incident outside their venue (403).

- [ ] **Step 4: Responsive check** — IncidentsPage table + issue-warning dialog + ReportIncidentModal at 375 / 768 / 1280 px; wide table scrolls in its own container, no body horizontal scroll.

- [ ] **Step 5: Clean-up & tree** — ensure any disposable/blocked test user is unblocked (no seeded login left broken); stop the fake-smtp sink; `git status` clean; branch builds.

- [ ] **Step 6: Final fixup commit (only if needed)**

```bash
git add -A
git commit -m "test: Phase 6 verification fixups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Self-Review

**1. Spec coverage:**
- §10.1 data model — `Incident` + `Warning` exactly as specced (standalone warning via nullable `incidentId`; `revoked` + revoker); `User` gains `blockedAt/blockedReason/blockedById` (Task 1). ✅
- §10.2 behaviour — reporting open to any authed user, no auto-warning (Task 4); "issue a warning" toggle with manual 3-level control, incident-linked or standalone (Tasks 5, 7); cumulative non-revoked count shown, UI recommends `lastLevel+1` (`recommendNextLevel`, Task 2 + 7); level-3 sets `isBlocked` + audit fields (Task 5); enforcement in `auth.middleware.ts` + `auth.service.ts` with the exact 403 message (Task 6); SuperAdmin-only unblock that preserves the warning count, revoke-with-unblock (Tasks 5, 6); delivery = notification + email with `incidentReportPdf` (linked) or warning-letter PDF (standalone) (Tasks 3, 5). ✅
- §10.3 API + UI — module `backend/src/modules/incidents/` with `/incidents` CRUD (venue-scoped for Admin), `/incidents/:id/warnings`, `/warnings` list/revoke, `/incidents/:id/pdf` (Tasks 4, 5); `IncidentsPage.tsx` at `/incidents`, nav for SuperAdmin/Admin, list + detail + issue-warning flow; warning history on the Users detail page; FA-facing "Report an incident" modal from Bookings (Task 7). ✅ (Handover-page entry point folded into "the shared modal is reusable from any page" — Bookings is wired; Handover can reuse `ReportIncidentModal` later without new backend work. Noted as the one deliberate trim.)
- §10.4 acceptance — Task 8. ✅

**2. Placeholder scan:** No TBD / vague error handling — every endpoint lists its status codes and typed bodies; the pure rules are covered by explicit tests. The frontend task describes concrete components, props, and calls rather than "build the UI". ✅

**3. Type consistency:**
- `WarningRow { level, revoked }` (Task 2) — the exact `select` used in `warnings.service.issue` (`{ level: true, revoked: true }`) and passed to `activeWarningCount`.
- `shouldBlock(newLevel, activeCountIncludingNew)` — Task 2 signature, called in Task 5 with `activeWarningCount([...existing, {level, revoked:false}])`.
- `makeReference(prefix, id)` — already exported from `pdf.service.ts` (used in Phases 2–5); `'INC'` / `'WRN'` prefixes new.
- `IncidentReportPdfData` / `WarningLetterPdfData` (Task 3) — field-for-field what `incidentsService.buildPdf` and `warningsService.issue` construct.
- `emailService.send` `attachments` — shape `{ filename, content: Buffer, contentType }` matches the Phase 5 addition.
- `notificationService.create` — `{ type, title, message, entityType?, entityId?, userId? }` per `CreateNotificationData`; `type: 'warning'` is a new value (the model's `type` is a free string).
- Block sentinel: service throws `Error('ACCOUNT_BLOCKED')`, controller matches `error.message === 'ACCOUNT_BLOCKED'` — same pattern as Phase 5's `NO_RECIPIENTS`.

**4. Migration safety:** all-new tables + nullable `User` columns; no backfill, no non-null-without-default. The `reference` columns are `@unique` and set via create-then-update (transient `'PENDING'` is only ever in-flight within one request; two concurrent creates could both hold `'PENDING'` — so create must not include `reference` in a way that collides: `'PENDING'` is not `@default` and the immediate `update` replaces it, but a unique constraint on two simultaneous `'PENDING'` rows WOULD collide). **Fix:** in Task 4/5, set `reference` at create time to a guaranteed-unique transient — use the row's own cuid isn't known pre-create, so use `reference: crypto.randomUUID()` at create, then `update` to the `makeReference` value. Update Task 4 Step 1 and Task 5 Step 1 accordingly (`import { randomUUID } from 'crypto'`).

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-phase-6-incidents-warnings.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints (matches how Phases 1–5 were run here).
