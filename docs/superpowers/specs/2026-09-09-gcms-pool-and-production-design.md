# GCMS — Pool Car Management, Ticketing & Azure Production Readiness — Design Spec

**Date:** 2026-09-09
**Branch:** `feature/pool-booking-system`
**Status:** Draft — awaiting user review

## 1. Overview

This spec covers a batch of enhancements on top of the pool-booking system, plus the
work to make GCMS production-ready for hosting on the company's **Azure Container Apps**.
It is delivered in seven phases in the order **Foundation → Features → Hardening**. Each
phase becomes its own implementation plan.

The work spans: pool-car visibility in fleet/booking/dashboard, booking history with
downloads, a handover→handback workflow rework with real PDFs, request-type and reporting
enhancements, a redesigned print label, maintenance report email, a new incident/warning/
ban ("ticketing") module, and the Azure migration (PostgreSQL, Blob Storage, single
container, SMTP email, deployment guide).

## 2. Goals

- Pool cars are first-class and visible: manageable in Fleet Management, surfaced on the
  Admin/SuperAdmin dashboard (daily bookings, available cars, booked cars, overdue).
- Every operational report (booking history, handover form, maintenance, pool, user, FA
  audit) is downloadable as a clean, fully-detailed PDF with reference numbers.
- Handover must complete before handback; once handover is signed its section locks and
  only the handback section is editable. The form auto-fills all system-known fields.
- Requests distinguish **Dedicated** vs **Pool shared resource** and show full requester
  identity (FA code + contact).
- A 3-level cumulative warning system, optionally attached to an incident report,
  culminating in a full account block at level 3.
- Logout returns the user to the login page with a full reload.
- The whole app runs as a **single container** on Azure Container Apps against Azure
  Database for PostgreSQL and Azure Blob Storage, with a written transfer/deployment guide.

## 2a. Non-Functional Requirements (apply to every phase)

- **Responsive:** every page and new component must be usable on phone, tablet and
  desktop. No horizontal body scroll at 320px width. Tables become card lists or
  horizontally-scroll inside their own container on small screens. Modals and forms fit a
  phone viewport. Test each change at 375px, 768px and 1280px.
- **Fast:** no N+1 query regressions (batch Prisma reads); list endpoints paginate;
  frontend list views virtualise or paginate beyond ~100 rows; new blocking work on the
  request path is avoided (PDF/email generation runs after the response where possible).
- **Bug-free:** no TypeScript `any` added without cause; `tsc --noEmit` and `eslint` pass
  clean for touched files; every new endpoint has an explicit error path that returns a
  typed JSON error and never leaks a stack trace; every new mutation is covered by a
  backend test.
- **Consistent:** reuse existing `@/components/ui/*` primitives and Tailwind tokens; match
  the existing page layout patterns (header block, filter row, content card).

## 3. Non-Goals

- Real Microsoft Entra / Azure AD SSO (the login button stays a placeholder).
- CI/CD pipeline or infra-as-code (Bicep/Terraform) — provisioning is documented, not automated.
- Pixel-identical PDF reproduction of on-screen forms — PDFs are newly designed clean documents.
- Redesigning recurrence logic — recurring bookings are surfaced, not re-modelled.
- Creating real `User` rows for public no-login bookers — they appear in reports only.
- Per-event / seasonal reset of warning counts — warnings are cumulative for the account's lifetime.

## 4. Cross-Cutting: Shared PDF Service

New `backend/src/services/pdf.service.ts` built on `pdfkit` (already a dependency).

- **Common chrome:** header with `SystemSettings.logoUrl` / `headerUrl` and `tournamentName`;
  footer with `SystemSettings.footerText` + `Page X of Y` + generated-at timestamp.
- **Reference numbers:** every generated document carries a human-readable reference
  (e.g. `HOF-2026-000123` for a handover form, `INC-2026-000045` for an incident,
  `MNT-...`, `BKH-...`). Derived deterministically from the record id + a type prefix.
- **Typed builders:** `handoverFormPdf(formId)`, `incidentReportPdf(incidentId)`,
  `bookingHistoryPdf(filters)`, `maintenanceReportPdf(logId)`, and refactors of the
  existing `reports.controller` PDF exporters (stadium, user, labels) onto this service.
- **Delivery:** builders return a `Buffer` + suggested filename; HTTP handlers stream as
  `Content-Disposition: attachment`; the email service attaches the same buffer.

## 5. Phase 1 — Foundation / Quick Wins

### 5.1 Logout returns to login page
`frontend/src/stores/authStore.ts` — `logout()` clears `accessToken` / `refreshToken`
from `localStorage`, resets store state, then `window.location.assign('/login')` so the
SPA fully reloads and no in-memory state survives. `ProtectedRoute` already redirects
unauthenticated users; this makes logout deterministic and drops cached query data.

### 5.2 Login page request/booking buttons
`frontend/src/pages/LoginPage.tsx` — below the credentials form, a single row with two
equal-width buttons side by side: **"Submit a Request"** (left → `/request`) and
**"Bookings"** (right → `/book-pool`). Responsive: stack on narrow screens.

### 5.3 Dashboard venue scoping
- Audit every dashboard/report endpoint in `backend/src/modules/reports/reports.controller.ts`.
  For `req.user.role === 'Admin'`, force `stadiumId = req.user.stadiumId` and **ignore any
  client-supplied `stadiumId`**. For `FA`, scope to the user's own records only. For
  `SuperAdmin / Observer / Contracts / MaintenanceTeam`, allow global + optional filter.
- Add `Contracts` and `MaintenanceTeam` to `requireRole(...)` on the report routes they
  are already shown in the nav for (`/reports/*` read/export).
- `frontend/src/pages/DashboardPage.tsx` — hide the venue selector for `Admin` and `FA`;
  render whatever scope the API returns; show the active scope as a label
  ("Showing: <venue>" / "Showing: your activity").

### 5.4 Acceptance
- Logging out from any page lands on `/login` with a fresh load; back button does not
  re-enter the app.
- An `Admin` calling any dashboard/report endpoint with `?stadiumId=<other>` still only
  receives their own venue's data.
- Login page shows the two buttons; both navigate to the correct public pages.

## 6. Phase 2 — Pool Car Visibility & Bookings

### 6.1 Fleet Management — Pool Cars section
`frontend/src/pages/FleetManagementPage.tsx` gains a **"Pool Cars"** tab/section:

- Lists `Fleet` where `isPool = true`, venue-scoped for `Admin`.
- Columns: car number, type, stadium, status (`Available` / `Booked until <time>` /
  **`Overdue`**), currently-assigned FA code (if any), active booking driver.
- Actions: add-to-pool / remove-from-pool (toggles `isPool`), open booking history for
  that car.
- Backend: extend `fleet` service/controller with an `isPool` filter and a
  `PATCH /fleet/:id/pool` toggle (Admin scoped to own venue).

### 6.2 Booking Management page
`frontend/src/pages/BookingsPage.tsx` reworked into three panels:

1. **Available pool cars** — `isPool` cars at the venue with no active `PoolBooking`.
2. **Active bookings** — each `PoolBooking` with `status = 'Active'`: driver, checkout
   time, expected return, and a red **"OVERDUE — return now"** badge when
   `now > expectedReturnAt`. "Mark Returned" action (sets `returnedAt`, `returnedById`,
   `status = 'Returned'`).
3. **Upcoming approved requests** — `PoolBookingRequest` with `status = 'Approved'` and a
   future window.

Backend: `GET /pool-bookings` already lists; add `overdue` computed field and a
`?status=` / `?stadiumId=` filter. Overdue = `status Active && expectedReturnAt < now`.

### 6.3 Booker detail on the Bookings page
Each active/historical booking row expands to show: booker full name, **FA code**
(`faUser.accreditationNumber`), phone, email, scheduled start/end, expected return,
booking type (**Single** / **Recurring**) and, for recurring, the date range + daily
time window. Data joined from `PoolBookingRequest` (when the booking originated from a
request) and `PoolBooking`.

### 6.4 Booking history + download
- `GET /pool-bookings/history` — filters: date range, stadium, car, status, booker.
  Returns paginated rows; Admin auto-scoped to their venue.
- "Download" button offering **PDF** (`bookingHistoryPdf`) and **Excel** (existing
  `exceljs` pattern in `reports.controller`). PDF includes filter summary + reference
  number + full per-booking detail.

### 6.5 Dashboard booking widget (Admin + SuperAdmin)
`DashboardPage` gains a **Bookings today** card:
- count + list of today's bookings (checkout today or active today), venue-scoped for Admin;
- available pool cars count, booked pool cars count, overdue count (each links to the
  Bookings page filtered accordingly).
- Backend: `GET /reports/dashboard` (or the existing dashboard-stats endpoint) extended
  with `poolToday: { bookings, available, booked, overdue }`.

### 6.6 Acceptance
- A pool car booked with `expectedReturnAt` in the past shows **Overdue** on the Fleet
  Management pool list, the Bookings page, and the dashboard count.
- Marking a booking returned clears it from "Active" and the availability count updates.
- Booking history PDF downloads with every field from 6.3 and a reference number.
- An Admin's dashboard booking widget only counts their own venue.

## 7. Phase 3 — Handover / Handback Rework

### 7.1 Enforce ordering
`backend/src/modules/handover/handover.service.ts`:
- A cart's handback path (`saveAfterUse`, `adminReturn`) is rejected unless handover is
  complete (`handoverSigned = true` and the `HandoverForm` has both admin + user
  signatures). Error: `"Handover must be completed before handback"`.
- Handover actions (`createHandoverForm`, `userSignHandoverForm`) are rejected once the
  cart has entered `HandbackPending` / `Returned`.
- Derive an explicit `phase` in the form payload: `handover` | `handback` | `complete`.

### 7.2 Section locking in the form UI
`frontend/src/components/handover/HandoverFormModal.tsx`:
- When `phase !== 'handover'`, the entire **Handover Details / pre-use inspection /
  handover signatures** block renders read-only and visually greyed (existing
  `disabled` / `readOnly` plumbing, driven off `phase` instead of `mode`/`isAdminReadonly`).
- Only the **Handback (after-use inspection + admin return)** block is editable in the
  handback phase.
- A phase indicator at the top ("Step 1 of 2: Handover" / "Step 2 of 2: Handback").

### 7.3 System auto-fill
The form loads `faCode` (`fleet.assignedUser.accreditationNumber`), `carNumber`
(`fleet.carNumber`), `carType` (`fleet.carType`), stadium, and assigned FA name/phone
directly from records. These render as **read-only** system fields in every phase — no
manual entry, no override. Only inspection notes, condition ratings, dates and signatures
are user-entered.

### 7.4 Real downloadable PDF
- `GET /handover/forms/:id/pdf` → `handoverFormPdf(formId)`: both sections, all inspection
  items, all signatures (rendered from stored signature data URLs), timestamps, T&C text,
  and a `HOF-YYYY-NNNNNN` reference.
- The form modal's "Save PDF" button and a "Download PDF" action in Handover Management
  call this endpoint instead of `window.print()`. `window.print()` path removed.

### 7.5 Acceptance
- Attempting after-use inspection on a cart whose handover is not fully signed returns a
  400 with the ordering error.
- In the handback phase the handover fields are visibly greyed and reject input; handback
  fields accept input.
- FA code / car number / car type appear pre-filled and cannot be edited.
- The downloaded PDF contains both phases, signatures, timestamps and a reference number.

## 8. Phase 4 — Requests, Reports, FA Audit, Labels

### 8.1 Request type
- `CarRequest.requestType` currently `"one-time" | "dedicated"`. Migrate values to
  **`"dedicated"`** and **`"pool-shared"`** (map legacy `one-time` → `pool-shared`).
- Public request form (`PublicRequestPage.tsx`) and internal review
  (`RequestsManagementPage.tsx`): a **Request Type** selector — "Dedicated" or
  "Pool shared resource" — with a filter on the management list.
- Request list/detail show requester full name, **FA code** (`accreditationNumber`),
  phone, email prominently.

### 8.2 Pool report
- New `getPoolReport` in `reports.service.ts` + `GET /reports/pool` (JSON) and
  `/reports/pool/export` (Excel) + `/reports/pool/export/pdf`.
- Content: pool fleet inventory, bookings (count, by car, by venue), requests (approved/
  rejected/pending), utilization of `isPool` cars, overdue history, average booking
  duration. Admin auto-scoped to venue.
- Add a "Pool" tab to `ReportsPage.tsx`.

### 8.3 User report includes no-login bookers
`getUserReports` in `reports.service.ts` also aggregates `PoolBookingRequest` rows where
the requester is external (no matching `User`), emitting pseudo-rows keyed by
`requesterEmail` with: name, **FA code** of the linked `faUser`, phone, email, booking
count, last booking date, and a `source: "public-booking"` marker. PDF/Excel exports
include a "Public bookers" section.

### 8.4 FA audit trail detail
`getFaAuditTrail` in `reports.controller.ts` / `reports.service.ts`: each row expanded
with explicit **check-in** (`fleet.checkedInAt`), **check-out** timestamps, handover
signed-at, user signed-at, after-use signed-at, admin-return-at, and computed
possession duration. Surface these columns in `ReportsPage` FA-trail view and in the
Excel/PDF export.

### 8.5 Print label redesign
`reports.controller.ts` `exportLabelsPdf` layout, one car per page (A4/A5 portrait):
- **Header:** event logo (`logoUrl`) + banner (`headerUrl`), full width.
- **Middle:** car number in a very large centered font.
- **Directly beneath:** `FA: <accreditationNumber>` of the currently-assigned FA
  (or `FA: —` if unassigned / pool).
- **Footer:** `footerText` + tournament name.
- Margins/sizing tuned for print-and-laminate. `docx` / `pptx` label exporters updated to
  match or deprecated (decide during planning; PDF is the canonical one).

### 8.6 Acceptance
- A request can be created and filtered as Dedicated or Pool shared resource; legacy rows
  read as Pool shared resource.
- `/reports/pool/export/pdf` returns a populated pool report scoped correctly by role.
- User report PDF lists external pool bookers with FA + contact details.
- FA audit trail shows check-in/check-out timestamps in UI and exports.
- Label PDF: logo/banner header, large centered car number, FA code beneath, footer.

## 9. Phase 5 — Maintenance

### 9.1 Enriched report
`maintenanceReportPdf(logId)` + the Excel export include the full workflow timeline:
reported (who/when, issue type, description, photos) → quotation requested → quotation
submitted (description, timeline, cost) → cost submitted → cost approved / rejected
(reason) → contracts escalation (who/when) → resolved (notes, when). All actors and
timestamps from `MaintenanceLog`. Reference `MNT-YYYY-NNNNNN`.

### 9.2 Email report button
- `POST /maintenance/:id/email-report` — body: optional extra recipients + note.
  Generates `maintenanceReportPdf` and sends via the email service with the PDF attached.
  Default recipients: `SystemSettings.maintenanceNotificationEmails`. Writes an audit-log
  entry. RBAC: `SuperAdmin`, `Admin` (own venue), `Contracts`, `MaintenanceTeam`.
- `MaintenancePage.tsx`: an "Email report" action on each log opening a small dialog
  (recipients prefilled, optional note), then calls the endpoint and toasts success.

### 9.3 Acceptance
- "Email report" on a maintenance log delivers an email with a PDF attachment containing
  the full timeline; the send is recorded in the audit log.

## 10. Phase 6 — Ticketing: Incident & Warning System (new module)

### 10.1 Data model

```prisma
model Incident {
  id             String    @id @default(cuid())
  reference      String    @unique          // INC-YYYY-NNNNNN, assigned on create
  subjectUserId  String                      // the user the incident is about
  subjectUser    User      @relation("IncidentSubject", fields: [subjectUserId], references: [id])
  reportedById   String                      // any authenticated user may report
  reportedBy     User      @relation("IncidentReporter", fields: [reportedById], references: [id])
  fleetId        String?
  fleet          Fleet?    @relation(fields: [fleetId], references: [id])
  stadiumId      String?
  stadium        Stadium?  @relation(fields: [stadiumId], references: [id])
  title          String
  description    String
  photosUrls     String?   @default("[]")    // JSON string, BUCKETS.INCIDENT_PHOTOS
  occurredAt     DateTime
  status         String    @default("Open")  // Open, UnderReview, Closed
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt
  warnings       Warning[]
  @@index([subjectUserId])
  @@index([status])
}

model Warning {
  id            String    @id @default(cuid())
  reference     String    @unique             // WRN-YYYY-NNNNNN
  userId        String
  user          User      @relation("WarningUser", fields: [userId], references: [id])
  incidentId    String?                        // OPTIONAL — a warning may be standalone
  incident      Incident? @relation(fields: [incidentId], references: [id])
  level         Int                             // 1 = soft, 2 = level-2, 3 = ban + block
  reason        String
  issuedById    String
  issuedBy      User      @relation("WarningIssuer", fields: [issuedById], references: [id])
  issuedAt      DateTime  @default(now())
  acknowledgedAt DateTime?
  revoked       Boolean   @default(false)      // SuperAdmin can revoke a warning
  revokedById   String?
  revokedAt     DateTime?
  createdAt     DateTime  @default(now())
  @@index([userId])
  @@index([level])
}
```

`User` gains inverse relations and keeps existing `isBlocked`. Add `blockedAt`,
`blockedReason`, `blockedById` for auditability.

### 10.2 Behaviour

- **Reporting an incident** is available to any authenticated user (FA included) via an
  "Report incident" action (from a booking, a handover, a fleet car, or standalone).
  Creating an incident does **not** by itself issue a warning.
- When an **Admin / SuperAdmin** views an incident (or a user), a **"Issue a warning"**
  toggle reveals a 3-level control (Level 1 soft / Level 2 / Level 3 ban). A warning can
  be issued **with** an incident attached or **standalone** (no incident).
- **Cumulative count:** the user's non-revoked warning count is always shown. The chosen
  level is manual (not auto-derived), but the UI recommends `lastLevel + 1`.
- **Level 3** sets `user.isBlocked = true` + `blockedAt/Reason/ById`. 
- **Enforcement:** `backend/src/middleware/auth.middleware.ts` and
  `auth.service.ts` login reject `isBlocked` users with
  `403 { error: "Your account has been blocked. Contact the administrator." }`.
- **Unblock:** SuperAdmin only, from the user detail page (`PATCH /users/:id/unblock`).
  Unblocking does **not** reset the warning count. Revoking a level-3 warning offers to
  unblock in the same action.
- **Delivery:** issuing a warning creates a `Notification` for the user (type `warning`,
  linking the warning/incident) **and** sends an email with `incidentReportPdf` attached
  when an incident is linked, otherwise a warning-letter PDF.

### 10.3 API + UI

- Module `backend/src/modules/incidents/` — routes `/incidents` (CRUD, list with filters,
  venue-scoped for Admin), `/incidents/:id/warnings` (issue), `/warnings` (list/revoke),
  `/incidents/:id/pdf`.
- `frontend/src/pages/IncidentsPage.tsx` at `/incidents` — nav item for `SuperAdmin`,
  `Admin`. List + detail + "issue warning" flow. A user's warning history appears on
  their profile / the Users detail page.
- FA-facing: a lightweight "Report an incident" entry (modal) from the Bookings / Handover
  pages, and warnings visible on the FA's own profile + notifications.

### 10.4 Acceptance
- An FA can file an incident; no warning is created until an Admin/SuperAdmin issues one.
- The "issue a warning" toggle issues a level 1/2/3 warning, standalone or incident-linked.
- Three cumulative non-revoked warnings (or one level-3) block the user; the blocked user
  cannot log in and sees the block message.
- SuperAdmin can unblock; the warning count remains.
- Every issued warning produces an in-app notification and an email with a PDF.

## 11. Phase 7 — Azure Production Hardening & Transfer

### 11.1 Single container
- One multi-stage `Dockerfile` at repo root: build frontend (`vite build`) → build
  backend (`tsc`) → runtime image (node:22-alpine, non-root user) that runs the Express
  server, which **also serves the built frontend** as static files (`express.static` +
  SPA fallback to `index.html`). One Azure Container App, one image in ACR.
- `docker-compose.yml` kept for local dev only (Postgres + the app); dev overrides remain.
- `.dockerignore`, `HEALTHCHECK` hitting `/api/v1/health`.

### 11.2 PostgreSQL
- `schema.prisma` datasource `provider = "postgresql"`; `DATABASE_URL` from env only
  (no default).
- Re-baseline migrations: archive the SQLite migration history, generate a fresh
  `0001_init` against Postgres. Convert `String`-as-JSON columns (`grantedPages`,
  `exportPreferences`, `photosUrls`, `additionalDrivers`, `handoverTcCheckboxes`) to
  Prisma `Json` where the code paths are safe; otherwise leave as `String` and note it.
- Seed script (`prisma/seed.ts`) works against Postgres; a documented one-shot
  bootstrap for the first SuperAdmin.

### 11.3 Azure Blob Storage
- `backend/src/config/storage.ts` gets an **Azure Blob** implementation behind the
  existing `uploadFile` / `getFile` abstraction, selected by
  `STORAGE_DRIVER = azure-blob | minio | local`. Envs:
  `AZURE_STORAGE_CONNECTION_STRING`, `AZURE_STORAGE_CONTAINER` (single container, the
  existing `BUCKETS.*` become path prefixes).
- Local disk fallback stays for dev.

### 11.4 Email via SMTP
- `email.service.ts` gets an `SmtpTransport` (nodemailer) selected when
  `EMAIL_DRIVER = smtp`. Envs: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`,
  `SMTP_PASS`, `EMAIL_FROM`. Works with Azure Communication Services SMTP or company
  O365 relay. MailHog stays as the dev default; no hard-coded prod fallback.

### 11.5 Config & security audit
- All secrets/URLs from env; commit a complete `.env.example`; nothing sensitive baked
  into the image.
- `helmet` for security headers, `CORS_ORIGIN` from env (comma list), `trust proxy` set
  for Container Apps ingress, `express-rate-limit` tuned per route class, request-size
  limits, structured JSON logging (`winston`) at `info` in prod, error handler that never
  leaks stack traces to clients.
- `/api/v1/health` (liveness) + `/api/v1/health/ready` (DB + storage check) for
  Container Apps probes.

### 11.6 Deliverable: deployment guide
`docs/deployment/azure-container-apps.md`:
- Provision: Resource Group, ACR, Azure Database for PostgreSQL Flexible Server (+
  firewall / private endpoint), Storage Account + container, Container Apps Environment,
  Log Analytics.
- Secrets: how to set them as Container App secrets / env vars (`DATABASE_URL`,
  `JWT_*`, `AZURE_STORAGE_*`, `SMTP_*`, `CORS_ORIGIN`, `EMAIL_FROM`).
- Build & push image to ACR; create the Container App; set ingress + custom domain + TLS.
- First deploy: run `prisma migrate deploy`, seed the first admin.
- Operations: viewing logs, scaling rules, rollback to a previous revision, backup/restore
  of Postgres and Blob.
- Go-live checklist.
- Plus hands-on support during the actual cutover.

### 11.7 Acceptance
- `docker build` produces a single image that serves both API and UI; `docker run` with
  a Postgres `DATABASE_URL` + the documented envs comes up healthy with no MinIO/MailHog.
- `prisma migrate deploy` applies cleanly to an empty Postgres database.
- File uploads and report/incident emails work against Azure Blob + SMTP when those
  drivers are selected.
- The deployment guide walks an operator from empty subscription to running app.

## 12. Phase Dependencies & Sequencing

1. **Phase 1** (foundation) — no dependencies.
2. **Phase 2** (pool visibility) — depends on Phase 1 dashboard scoping.
3. **Phase 3** (handover rework) — depends on §4 PDF service (built in Phase 2).
4. **Phase 4** (requests/reports/labels) — depends on §4 PDF service (built in Phase 2);
   Phase 2 for pool report.
5. **Phase 5** (maintenance email) — depends on §4 PDF service.
6. **Phase 6** (ticketing) — depends on §4 PDF service, Phase 1 (dashboard/RBAC), notifications.
7. **Phase 7** (Azure) — last; touches every module's config; no feature work after it.

The shared PDF service (§4) is built at the start of **Phase 2** (its first consumer is
booking-history download, §6.4) and reused by Phases 3–6.

## 13. Open Questions

_None outstanding. All resolved during brainstorming 2026-09-09:_
- Azure host: **Container Apps**, single merged container.
- PDF: **clean pdfkit documents** with full detail + reference numbers.
- Warnings: **optional incident link**, manual 3-level, cumulative for account lifetime,
  level 3 = block; SuperAdmin unblock without count reset.
- Dashboard: Admin venue-scoped, FA own-data, others global; booking widget on Admin +
  SuperAdmin dashboards.
- Email: Azure-mandated **SMTP** relay via env.
