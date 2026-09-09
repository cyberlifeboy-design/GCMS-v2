# Phase 5 — Maintenance: Enriched Report & Email Report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the browser-print HTML maintenance report with a real branded pdfkit PDF (`maintenanceReportPdf`) that lays out the full workflow timeline — reported → escalated → quotation requested → cost submitted → cost approved/rejected → resolved — with every actor and timestamp and a `MNT-YYYY-XXXXXX` reference; enrich the CSV export with the same timeline columns; and add `POST /maintenance/:id/email-report` that emails that PDF as an attachment to the configured maintenance recipients plus any extra addresses, with a "Email report" dialog on `MaintenancePage`.

**Architecture:** A pure, unit-tested `maintenanceTimeline(log)` helper turns a `MaintenanceLog` row into an ordered list of `{ key, label, at, by, detail }` events. A new `maintenanceReportPdf({ log, timeline, reference })` renderer lives in the shared `pdf.service.ts` next to `poolReportPdf` (leaf-level — the controller passes loaded data in). `email.service.ts` gains an `attachments` field on `EmailOptions`, threaded through both the Resend and SMTP transports. A new `maintenanceService.emailReport()` composes the PDF + recipient list and calls `emailService.send`; the route carries `auditLog()` so the send is recorded like every other maintenance action. Frontend adds `maintenanceApi.emailReport` / `downloadReportPdf` and an "Email report" dialog.

**Tech Stack:** TypeScript, Express, Prisma, pdfkit (+ shared `pdf.service.ts`), nodemailer / Resend, vitest, React, Vite, Tailwind, Radix UI, sonner.

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` — §9.1 (enriched report), §9.2 (email report button), §9.3 acceptance. Cross-cutting PDF service §4. NFRs §2a.

## Global Constraints

- **Roles (exact strings):** `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`.
- **`POST /maintenance/:id/email-report` RBAC:** `requireRole('SuperAdmin', 'Admin', 'Contracts', 'MaintenanceTeam')`. Admin is additionally restricted to their own venue inside the controller (mirror the `getByFleet` pattern: load the log, 403 if `log.fleet.stadiumId !== req.user.stadiumId`).
- **`GET /maintenance/:id/report.pdf` RBAC:** match the existing `/:id/pdf` route — `requireRole('SuperAdmin', 'Admin', 'Contracts', 'Observer')`.
- **PDF reference:** `makeReference('MNT', log.id)` from `backend/src/services/pdf.service.ts` → `MNT-YYYY-XXXXXX`. Not a stored value.
- **PDF rendering:** reuse `renderPdf(meta, body)`; add `maintenanceReportPdf()` in `pdf.service.ts`. Do NOT import anything from the `maintenance` module into `pdf.service.ts` — the controller/service passes the already-loaded `log` (with `FULL_INCLUDE` relations) and the computed `timeline` in. `pdf.service.ts` declares its own local structural type for what it needs.
- **Email recipients:** default list = `SystemSettings.maintenanceNotificationEmails` (a comma-separated `String?`), split on `,`, trimmed, empties dropped. Request body may add `recipients: string[]` and an optional `note: string`. If the combined, de-duplicated recipient list is empty → `400 { error: 'No recipients configured. Set maintenance notification emails in Settings or pass recipients.' }`.
- **Email failure semantics:** unlike the best-effort notifications elsewhere, the email-report endpoint is an explicit user action — if `emailService.send` throws, return `502 { error: 'Failed to send the report email.' }` (do not swallow). The audit-log middleware entry is still written (it fires on `res.send` regardless of status).
- **Existing HTML report:** the current `GET /maintenance/:id/pdf` (returns a self-printing HTML page via `generatePdfReport`) STAYS as-is for this phase — it is a separate route. The new real PDF is `GET /maintenance/:id/report.pdf`. Do not delete `generatePdfReport`.
- **Excel vs CSV:** the module's existing export is CSV (`exportToCsv` → `text/csv`). Spec §9.1 says "the Excel export" but the live artifact is CSV; enrich the CSV in place (add the timeline columns) rather than introducing an ExcelJS path here.
- **Money formatting:** costs are `Float?` in QAR; render as `QAR 1234.00` (2 dp) or `—` when null, matching `exportToCsv` / `generatePdfReport`.
- **Bug-free gate:** backend `cd backend && npm test` green (currently 46 tests / 8 files); backend + frontend `npx tsc --noEmit` exit 0 for touched files; every new endpoint has a typed JSON error path.
- **Windows/Prisma:** no schema changes in this phase — no migration / `prisma generate`.
- **Commits:** one per task, conventional-commit subject, footer exactly:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (:3005), frontend `cd frontend && npm run dev` (:3000). Logins: `superadmin@gcms.com` / `Admin@2024!`, `admin@gcms.com` / `Admin@2024!`. MailHog/SMTP is NOT running locally — email sends will throw; verify the 502 path and (where possible) inspect the composed message via a unit test / a temporary log, not a real delivery.

---

## File Structure

**Created:**
- `backend/src/modules/maintenance/maintenance-timeline.ts` — pure `maintenanceTimeline(log)` + `TimelineEvent` type.
- `backend/src/modules/maintenance/maintenance-timeline.test.ts` — vitest.

**Modified:**
- `backend/src/services/pdf.service.ts` — `maintenanceReportPdf()` + local `MaintenanceReportPdfData` type.
- `backend/src/services/email.service.ts` — `EmailOptions.attachments`; thread through Resend + SMTP transports.
- `backend/src/modules/maintenance/maintenance.service.ts` — `getReportPdf(id)`, `emailReport(id, opts)`; enrich `exportToCsv`.
- `backend/src/modules/maintenance/maintenance.controller.ts` — `downloadReportPdf`, `emailReport` handlers + zod schema.
- `backend/src/modules/maintenance/maintenance.routes.ts` — 2 routes.
- `frontend/src/lib/api.ts` — `maintenanceApi.downloadReportPdf`, `maintenanceApi.emailReport`.
- `frontend/src/pages/MaintenancePage.tsx` — "Email report" dialog + row/detail action; "Download PDF" action.

---

## Task 1: Pure `maintenanceTimeline` helper

**Files:**
- Create: `backend/src/modules/maintenance/maintenance-timeline.ts`
- Test: `backend/src/modules/maintenance/maintenance-timeline.test.ts`

**Interfaces:**
- Consumes: nothing external.
- Produces:
  ```ts
  export interface TimelineLog {
    reportedAt: Date | string | null;
    issueType: string | null;
    issueDescription: string;
    reportedBy?: { name: string | null; role: string | null; phone: string | null } | null;
    contractsEscalatedAt: Date | string | null;
    contractsEscalatedBy?: { name: string | null } | null;
    quotationRequestedAt: Date | string | null;
    costSubmittedAt: Date | string | null;
    quotationDescription: string | null;
    quotationTimeline: string | null;
    fixCost: number | null;
    costApprovedAt: Date | string | null;
    approvedBy?: { name: string | null } | null;
    rejectedAt: Date | string | null;
    rejectionReason: string | null;
    resolvedAt: Date | string | null;
    resolutionNotes: string | null;
  }
  export interface TimelineEvent {
    key: 'reported' | 'escalated' | 'quotation-requested' | 'cost-submitted' | 'cost-approved' | 'quotation-rejected' | 'resolved';
    label: string;
    at: string | null;      // ISO, or null if that step has no timestamp
    by: string | null;      // actor name, or null
    detail: string | null;  // one-line human summary, or null
  }
  // Ordered by workflow stage (NOT by timestamp); steps with no timestamp AND no detail are omitted.
  export function maintenanceTimeline(log: TimelineLog): TimelineEvent[];
  ```

- [ ] **Step 1: Write the failing test**

```ts
// backend/src/modules/maintenance/maintenance-timeline.test.ts
import { describe, it, expect } from 'vitest';
import { maintenanceTimeline, TimelineLog } from './maintenance-timeline';

const empty: TimelineLog = {
  reportedAt: null, issueType: null, issueDescription: '', reportedBy: null,
  contractsEscalatedAt: null, contractsEscalatedBy: null,
  quotationRequestedAt: null, costSubmittedAt: null, quotationDescription: null,
  quotationTimeline: null, fixCost: null, costApprovedAt: null, approvedBy: null,
  rejectedAt: null, rejectionReason: null, resolvedAt: null, resolutionNotes: null,
};

describe('maintenanceTimeline', () => {
  it('always emits the reported event first, with reporter + issue detail', () => {
    const t = maintenanceTimeline({
      ...empty,
      reportedAt: '2026-09-01T08:00:00Z',
      issueType: 'Brake issue',
      issueDescription: 'Pedal soft',
      reportedBy: { name: 'Sam FA', role: 'FA', phone: '999' },
    });
    expect(t[0].key).toBe('reported');
    expect(t[0].at).toBe('2026-09-01T08:00:00.000Z');
    expect(t[0].by).toBe('Sam FA');
    expect(t[0].detail).toContain('Brake issue');
    expect(t[0].detail).toContain('Pedal soft');
  });

  it('emits stages in workflow order, skipping stages with no data', () => {
    const t = maintenanceTimeline({
      ...empty,
      reportedAt: '2026-09-01T08:00:00Z',
      issueDescription: 'x',
      quotationRequestedAt: '2026-09-02T00:00:00Z',
      costSubmittedAt: '2026-09-03T00:00:00Z',
      fixCost: 1200,
      quotationTimeline: '3 days',
      costApprovedAt: '2026-09-04T00:00:00Z',
      approvedBy: { name: 'Cora Contracts' },
      resolvedAt: '2026-09-05T00:00:00Z',
      resolutionNotes: 'Replaced pads',
    });
    expect(t.map(e => e.key)).toEqual([
      'reported', 'quotation-requested', 'cost-submitted', 'cost-approved', 'resolved',
    ]);
    expect(t.find(e => e.key === 'cost-submitted')!.detail).toContain('QAR 1200.00');
    expect(t.find(e => e.key === 'cost-submitted')!.detail).toContain('3 days');
    expect(t.find(e => e.key === 'cost-approved')!.by).toBe('Cora Contracts');
    expect(t.find(e => e.key === 'resolved')!.detail).toBe('Replaced pads');
  });

  it('includes escalation and rejection when present', () => {
    const t = maintenanceTimeline({
      ...empty,
      reportedAt: '2026-09-01T08:00:00Z',
      issueDescription: 'x',
      contractsEscalatedAt: '2026-09-01T12:00:00Z',
      contractsEscalatedBy: { name: 'Ann Admin' },
      rejectedAt: '2026-09-03T00:00:00Z',
      rejectionReason: 'Too expensive',
    });
    const keys = t.map(e => e.key);
    expect(keys).toContain('escalated');
    expect(keys).toContain('quotation-rejected');
    expect(t.find(e => e.key === 'escalated')!.by).toBe('Ann Admin');
    expect(t.find(e => e.key === 'quotation-rejected')!.detail).toBe('Too expensive');
    // escalated comes right after reported
    expect(keys.indexOf('escalated')).toBe(1);
  });

  it('reported event still emits when reportedAt is null (uses description only)', () => {
    const t = maintenanceTimeline({ ...empty, issueDescription: 'No date issue' });
    expect(t).toHaveLength(1);
    expect(t[0].key).toBe('reported');
    expect(t[0].at).toBeNull();
    expect(t[0].detail).toContain('No date issue');
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`Cannot find module './maintenance-timeline'`)

Run: `cd backend && npx vitest run src/modules/maintenance/maintenance-timeline.test.ts`

- [ ] **Step 3: Implement**

```ts
// backend/src/modules/maintenance/maintenance-timeline.ts
export interface TimelineLog {
  reportedAt: Date | string | null;
  issueType: string | null;
  issueDescription: string;
  reportedBy?: { name: string | null; role: string | null; phone: string | null } | null;
  contractsEscalatedAt: Date | string | null;
  contractsEscalatedBy?: { name: string | null } | null;
  quotationRequestedAt: Date | string | null;
  costSubmittedAt: Date | string | null;
  quotationDescription: string | null;
  quotationTimeline: string | null;
  fixCost: number | null;
  costApprovedAt: Date | string | null;
  approvedBy?: { name: string | null } | null;
  rejectedAt: Date | string | null;
  rejectionReason: string | null;
  resolvedAt: Date | string | null;
  resolutionNotes: string | null;
}

export interface TimelineEvent {
  key: 'reported' | 'escalated' | 'quotation-requested' | 'cost-submitted' | 'cost-approved' | 'quotation-rejected' | 'resolved';
  label: string;
  at: string | null;
  by: string | null;
  detail: string | null;
}

const iso = (d: Date | string | null): string | null => {
  if (d == null) return null;
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

const money = (n: number | null): string | null => (n == null ? null : `QAR ${n.toFixed(2)}`);

export function maintenanceTimeline(log: TimelineLog): TimelineEvent[] {
  const events: TimelineEvent[] = [];

  // 1. Reported — always present
  const reportedDetail = [
    log.issueType ? `[${log.issueType}]` : null,
    log.issueDescription || null,
  ].filter(Boolean).join(' ') || null;
  events.push({
    key: 'reported',
    label: 'Issue reported',
    at: iso(log.reportedAt),
    by: log.reportedBy?.name ?? null,
    detail: reportedDetail,
  });

  // 2. Escalated to Contracts
  if (log.contractsEscalatedAt || log.contractsEscalatedBy?.name) {
    events.push({
      key: 'escalated',
      label: 'Escalated to Contracts',
      at: iso(log.contractsEscalatedAt),
      by: log.contractsEscalatedBy?.name ?? null,
      detail: null,
    });
  }

  // 3. Quotation requested
  if (log.quotationRequestedAt) {
    events.push({
      key: 'quotation-requested',
      label: 'Quotation requested',
      at: iso(log.quotationRequestedAt),
      by: null,
      detail: null,
    });
  }

  // 4. Cost / quotation submitted
  if (log.costSubmittedAt || log.fixCost != null || log.quotationDescription) {
    const detail = [
      money(log.fixCost),
      log.quotationTimeline ? `timeline ${log.quotationTimeline}` : null,
      log.quotationDescription || null,
    ].filter(Boolean).join(' · ') || null;
    events.push({
      key: 'cost-submitted',
      label: 'Quotation submitted',
      at: iso(log.costSubmittedAt),
      by: null,
      detail,
    });
  }

  // 5. Cost approved
  if (log.costApprovedAt || log.approvedBy?.name) {
    events.push({
      key: 'cost-approved',
      label: 'Cost approved',
      at: iso(log.costApprovedAt),
      by: log.approvedBy?.name ?? null,
      detail: money(log.fixCost),
    });
  }

  // 6. Quotation rejected
  if (log.rejectedAt || log.rejectionReason) {
    events.push({
      key: 'quotation-rejected',
      label: 'Quotation rejected',
      at: iso(log.rejectedAt),
      by: null,
      detail: log.rejectionReason || null,
    });
  }

  // 7. Resolved
  if (log.resolvedAt || log.resolutionNotes) {
    events.push({
      key: 'resolved',
      label: 'Resolved',
      at: iso(log.resolvedAt),
      by: null,
      detail: log.resolutionNotes || null,
    });
  }

  return events;
}
```

- [ ] **Step 4: Run — expect PASS** (4 tests)

Run: `cd backend && npx vitest run src/modules/maintenance/maintenance-timeline.test.ts`

- [ ] **Step 5: Commit**

```bash
git add backend/src/modules/maintenance/maintenance-timeline.ts backend/src/modules/maintenance/maintenance-timeline.test.ts
git commit -m "feat(maintenance): maintenanceTimeline() — ordered workflow event list

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 2: `maintenanceReportPdf` renderer

**Files:**
- Modify: `backend/src/services/pdf.service.ts` (add renderer + local type, after `poolReportPdf`, before `handoverFormPdf`)

**Interfaces:**
- Consumes: `renderPdf`, `makeReference` (already in the file).
- Produces:
  ```ts
  export interface MaintenanceReportPdfData {
    id: string;
    status: string;
    quotationStatus: string | null;
    carNumber: string | null;
    carType: string | null;
    stadiumName: string | null;
    stadiumCode: string | null;
    reporterName: string | null;
    reporterRole: string | null;
    reporterPhone: string | null;
    fixCost: number | null;
    photoCount: number;
    timeline: import('X').TimelineEvent[]; // see note
  }
  export async function maintenanceReportPdf(args: { data: MaintenanceReportPdfData; reference: string }): Promise<Buffer>;
  ```
  **Note:** to keep `pdf.service.ts` leaf-level, do NOT import `TimelineEvent` from the maintenance module. Re-declare the minimal shape inline:
  ```ts
  type PdfTimelineEvent = { label: string; at: string | null; by: string | null; detail: string | null };
  ```
  and type `timeline: PdfTimelineEvent[]`.

- [ ] **Step 1: Add the renderer**

```ts
type PdfTimelineEvent = { label: string; at: string | null; by: string | null; detail: string | null };

export interface MaintenanceReportPdfData {
  id: string;
  status: string;
  quotationStatus: string | null;
  carNumber: string | null;
  carType: string | null;
  stadiumName: string | null;
  stadiumCode: string | null;
  reporterName: string | null;
  reporterRole: string | null;
  reporterPhone: string | null;
  fixCost: number | null;
  photoCount: number;
  timeline: PdfTimelineEvent[];
}

export async function maintenanceReportPdf(args: { data: MaintenanceReportPdfData; reference: string }): Promise<Buffer> {
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
    {
      title: 'Maintenance Fix Report',
      subtitle: `Cart ${data.carNumber ?? '—'} · ${data.stadiumName ?? '—'}`,
      reference: args.reference,
    },
    (doc) => {
      heading(doc, 'Cart & venue');
      kv(doc, 'Cart number', data.carNumber);
      kv(doc, 'Cart type', data.carType);
      kv(doc, 'Venue', `${data.stadiumName ?? '—'}${data.stadiumCode ? ` (${data.stadiumCode})` : ''}`);
      kv(doc, 'Current status', data.status);
      kv(doc, 'Quotation status', data.quotationStatus);
      kv(doc, 'Fix cost', data.fixCost == null ? '—' : `QAR ${data.fixCost.toFixed(2)}`);
      kv(doc, 'Photos attached', data.photoCount);

      heading(doc, 'Reporter');
      kv(doc, 'Name', data.reporterName);
      kv(doc, 'Role', data.reporterRole);
      kv(doc, 'Contact', data.reporterPhone);

      heading(doc, 'Workflow timeline');
      if (data.timeline.length === 0) {
        doc.text('No timeline events.');
      } else {
        data.timeline.forEach((e, i) => {
          if (i > 0) doc.moveDown(0.35);
          doc.font('Helvetica-Bold').fontSize(10).fillColor('#000').text(e.label, { continued: true });
          doc.font('Helvetica').fontSize(9).fillColor('#666')
            .text(`   ${e.at ? new Date(e.at).toLocaleString() : 'date not recorded'}${e.by ? `  ·  ${e.by}` : ''}`);
          if (e.detail) doc.font('Helvetica').fontSize(9).fillColor('#333').text(e.detail);
          doc.fillColor('#000');
        });
      }
    },
  );
}
```

- [ ] **Step 2: Typecheck**

Run: `cd backend && npx tsc --noEmit` → no new errors in `pdf.service.ts`.

- [ ] **Step 3: Commit**

```bash
git add backend/src/services/pdf.service.ts
git commit -m "feat(maintenance): maintenanceReportPdf() branded PDF with workflow timeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 3: Email attachment support in `email.service.ts`

**Files:**
- Modify: `backend/src/services/email.service.ts`

**Interfaces:**
- Produces: `EmailOptions.attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>` — consumed by `emailService.send()`.

- [ ] **Step 1: Extend the interface**

```ts
export interface EmailOptions {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
    from?: string;
    attachments?: Array<{ filename: string; content: Buffer; contentType?: string }>;
}
```

- [ ] **Step 2: Thread through `ResendTransport.send`**

In the `emailData` object add, after `subject`:
```ts
        if (options.attachments?.length) {
            (emailData as any).attachments = options.attachments.map(a => ({
                filename: a.filename,
                content: a.content,               // Resend accepts a Buffer
                ...(a.contentType ? { content_type: a.contentType } : {}),
            }));
        }
```

- [ ] **Step 3: Thread through `SmtpTransport.send`**

In the `sendMail(...)` call add:
```ts
                attachments: options.attachments?.map(a => ({
                    filename: a.filename,
                    content: a.content,
                    ...(a.contentType ? { contentType: a.contentType } : {}),
                })),
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit` → no new errors in `email.service.ts`.

- [ ] **Step 5: Commit**

```bash
git add backend/src/services/email.service.ts
git commit -m "feat(email): EmailOptions.attachments — threaded through Resend + SMTP transports

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 4: Enrich the CSV export with the full timeline

**Files:**
- Modify: `backend/src/modules/maintenance/maintenance.service.ts` (`exportToCsv`, ~line 387; extend the `FULL_INCLUDE`-based rows — all fields are already on `MaintenanceLog`)

**Interfaces:**
- Consumes: `this.getAll` (unchanged). No signature change to `exportToCsv`.

- [ ] **Step 1: Add the timeline columns**

Replace the `rows` mapping and `header` array in `exportToCsv` so each row also carries:
`issueType`, `quotationRequestedAt`, `costSubmittedAt`, `costApprovedAt`, `approvedBy?.name`, `contractsEscalatedAt`, `contractsEscalatedBy?.name`, `rejectionReason`, `rejectedAt`.

```ts
        const rows = data.data.map((r: any) => [
            r.id,
            r.fleet?.carNumber || '',
            r.fleet?.stadium?.name || '',
            r.issueType || '',
            r.reportedBy?.name || '',
            r.reportedBy?.phone || '',
            r.issueDescription,
            r.status,
            r.quotationStatus || '',
            r.fixCost != null ? `QAR ${r.fixCost.toFixed(2)}` : '',
            r.quotationDescription || '',
            r.quotationTimeline || '',
            r.reportedAt ? new Date(r.reportedAt).toISOString() : '',
            r.contractsEscalatedAt ? new Date(r.contractsEscalatedAt).toISOString() : '',
            r.contractsEscalatedBy?.name || '',
            r.quotationRequestedAt ? new Date(r.quotationRequestedAt).toISOString() : '',
            r.costSubmittedAt ? new Date(r.costSubmittedAt).toISOString() : '',
            r.costApprovedAt ? new Date(r.costApprovedAt).toISOString() : '',
            r.approvedBy?.name || '',
            r.rejectionReason || '',
            r.rejectedAt ? new Date(r.rejectedAt).toISOString() : '',
            r.resolutionNotes || '',
            r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '',
        ]);

        const header = ['ID', 'Cart Number', 'Venue', 'Issue Type', 'Reporter', 'Phone', 'Issue', 'Status', 'Quotation Status', 'Fix Cost', 'Quotation Description', 'Timeline', 'Reported At', 'Escalated At', 'Escalated By', 'Quotation Requested At', 'Cost Submitted At', 'Cost Approved At', 'Approved By', 'Rejection Reason', 'Rejected At', 'Resolution Notes', 'Resolved At'];
```

- [ ] **Step 2: Typecheck + smoke**

Run: `cd backend && npx tsc --noEmit` → clean for `maintenance.service.ts`.
With backend up + a SuperAdmin token:
```bash
curl -s localhost:3005/api/v1/maintenance/export -H "Authorization: Bearer $TOKEN" | head -2
```
Expected: header row has the new columns; one data row per log.

- [ ] **Step 3: Commit**

```bash
git add backend/src/modules/maintenance/maintenance.service.ts
git commit -m "feat(maintenance): CSV export carries the full workflow timeline

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 5: `getReportPdf` + `emailReport` service/controller/routes

**Files:**
- Modify: `backend/src/modules/maintenance/maintenance.service.ts` (2 methods + imports)
- Modify: `backend/src/modules/maintenance/maintenance.controller.ts` (2 handlers + zod schema + imports)
- Modify: `backend/src/modules/maintenance/maintenance.routes.ts` (2 routes)

**Interfaces:**
- Consumes: `getById` (FULL_INCLUDE), `maintenanceTimeline` (Task 1), `maintenanceReportPdf` + `makeReference` (Task 2), `emailService.send` w/ attachments (Task 3), `prisma.systemSettings`.
- Produces on `MaintenanceService`:
  ```ts
  async getReportPdf(id: string): Promise<{ buffer: Buffer; reference: string; carNumber: string | null }>
  async emailReport(id: string, opts: { recipients?: string[]; note?: string; actorName?: string }): Promise<{ sentTo: string[]; reference: string }>
  ```
  `getReportPdf` throws `Error('Maintenance log not found')` when missing (controller maps to 404).
  `emailReport` throws `Error('NO_RECIPIENTS')` when the merged list is empty (controller maps to 400) and lets an `emailService.send` rejection propagate (controller maps to 502).

- [ ] **Step 1: Add `getReportPdf` to the service**

At the top of `maintenance.service.ts`:
```ts
import { maintenanceTimeline } from './maintenance-timeline';
import { maintenanceReportPdf, makeReference } from '../../services/pdf.service';
import { emailService } from '../../services/email.service';
```

Add:
```ts
async getReportPdf(id: string): Promise<{ buffer: Buffer; reference: string; carNumber: string | null }> {
    const log = await this.getById(id);
    if (!log) throw new Error('Maintenance log not found');

    const reference = makeReference('MNT', log.id);
    const photoCount = (() => {
        try { return (JSON.parse((log.photosUrls as string) || '[]') as unknown[]).length; }
        catch { return 0; }
    })();

    const buffer = await maintenanceReportPdf({
        reference,
        data: {
            id: log.id,
            status: log.status,
            quotationStatus: log.quotationStatus ?? null,
            carNumber: log.fleet?.carNumber ?? null,
            carType: log.fleet?.carType ?? null,
            stadiumName: log.fleet?.stadium?.name ?? null,
            stadiumCode: log.fleet?.stadium?.code ?? null,
            reporterName: log.reportedBy?.name ?? null,
            reporterRole: log.reportedBy?.role ?? null,
            reporterPhone: log.reportedBy?.phone ?? null,
            fixCost: log.fixCost ?? null,
            photoCount,
            timeline: maintenanceTimeline(log as any),
        },
    });
    return { buffer, reference, carNumber: log.fleet?.carNumber ?? null };
}
```

- [ ] **Step 2: Add `emailReport` to the service**

```ts
async emailReport(id: string, opts: { recipients?: string[]; note?: string; actorName?: string }): Promise<{ sentTo: string[]; reference: string }> {
    const { buffer, reference, carNumber } = await this.getReportPdf(id);

    const settings = await prisma.systemSettings.findFirst();
    const configured = (settings?.maintenanceNotificationEmails ?? '')
        .split(',').map(s => s.trim()).filter(Boolean);
    const extra = (opts.recipients ?? []).map(s => s.trim()).filter(Boolean);
    const sentTo = [...new Set([...configured, ...extra])];
    if (sentTo.length === 0) throw new Error('NO_RECIPIENTS');

    const subject = `Maintenance report ${reference}${carNumber ? ` — Cart ${carNumber}` : ''}`;
    const lines = [
        `Maintenance fix report ${reference}${carNumber ? ` for cart ${carNumber}` : ''} is attached as a PDF.`,
        opts.note ? `\nNote from ${opts.actorName ?? 'the sender'}:\n${opts.note}` : '',
        `\n— GCMS`,
    ].filter(Boolean);

    await emailService.send({
        to: sentTo,
        subject,
        text: lines.join('\n'),
        attachments: [{ filename: `${reference}.pdf`, content: buffer, contentType: 'application/pdf' }],
    });

    return { sentTo, reference };
}
```

- [ ] **Step 3: Add controller handlers**

At the top of `maintenance.controller.ts` add:
```ts
import { prisma } from '../../config/database';
```
(only if not already imported — `getByFleet` currently does a dynamic `await import`; a top-level import is fine and simpler).

Add the schema near the others:
```ts
const emailReportSchema = z.object({
    recipients: z.array(z.string().email()).optional(),
    note: z.string().max(2000).optional(),
});
```

Add handlers:
```ts
static async downloadReportPdf(req: AuthRequest, res: Response) {
    try {
        const id = req.params['id'] as string;
        if (req.user?.role === 'Admin' && req.user.stadiumId) {
            const log = await maintenanceService.getById(id);
            if (log && log.fleet?.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
        }
        const { buffer, reference } = await maintenanceService.getReportPdf(id);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=${reference}.pdf`);
        res.send(buffer);
    } catch (error: any) {
        if (error?.message === 'Maintenance log not found') {
            res.status(404).json({ error: error.message });
        } else {
            console.error('Maintenance report PDF failed:', error);
            res.status(500).json({ error: 'Failed to generate maintenance report PDF' });
        }
    }
}

static async emailReport(req: AuthRequest, res: Response) {
    try {
        const id = req.params['id'] as string;
        const body = emailReportSchema.parse(req.body);

        if (req.user?.role === 'Admin' && req.user.stadiumId) {
            const log = await maintenanceService.getById(id);
            if (!log) { res.status(404).json({ error: 'Maintenance log not found' }); return; }
            if (log.fleet?.stadiumId !== req.user.stadiumId) {
                res.status(403).json({ error: 'Access denied' });
                return;
            }
        }

        const result = await maintenanceService.emailReport(id, {
            recipients: body.recipients,
            note: body.note,
            actorName: req.user?.name,
        });
        res.status(200).json({ message: `Report emailed to ${result.sentTo.length} recipient(s)`, ...result });
    } catch (error: any) {
        if (error instanceof z.ZodError) {
            res.status(400).json({ error: 'Validation error', details: error.errors });
        } else if (error?.message === 'Maintenance log not found') {
            res.status(404).json({ error: error.message });
        } else if (error?.message === 'NO_RECIPIENTS') {
            res.status(400).json({ error: 'No recipients configured. Set maintenance notification emails in Settings or pass recipients.' });
        } else {
            console.error('Maintenance email-report failed:', error);
            res.status(502).json({ error: 'Failed to send the report email.' });
        }
    }
}
```
**Note:** `req.user?.name` — confirm `AuthRequest['user']` carries `name`. If it only has `userId`/`role`/`stadiumId`/`email`, drop `actorName` (the service already defaults it to `'the sender'`). Check `backend/src/middleware/auth.middleware.ts`.

- [ ] **Step 4: Add routes**

In `maintenance.routes.ts`, after the existing `/:id/pdf` route:
```ts
// GET /api/v1/maintenance/:id/report.pdf — real branded PDF (workflow timeline)
router.get('/:id/report.pdf', requireRole('SuperAdmin', 'Admin', 'Contracts', 'Observer'), MaintenanceController.downloadReportPdf);

// POST /api/v1/maintenance/:id/email-report — email the PDF report
router.post('/:id/email-report', requireRole('SuperAdmin', 'Admin', 'Contracts', 'MaintenanceTeam'), auditLog(), MaintenanceController.emailReport);
```
**Route-order note:** Express matches in order. `/:id/report.pdf` and `/:id/email-report` have distinct literal suffixes, so they won't collide with `/:id` or `/:id/pdf`. Place them next to `/:id/pdf` for readability.

- [ ] **Step 5: Typecheck + verify**

Run: `cd backend && npx tsc --noEmit` → clean for the 3 maintenance files.

With backend up + SuperAdmin `$TOKEN` and a real maintenance log id `$MID` (`curl -s localhost:3005/api/v1/maintenance -H "Authorization: Bearer $TOKEN"` → take `data[0].id`):
```bash
# real PDF download
curl -s "localhost:3005/api/v1/maintenance/$MID/report.pdf" -H "Authorization: Bearer $TOKEN" -o /tmp/mnt.pdf -w '%{http_code} %{size_download}b\n'
head -c 5 /tmp/mnt.pdf          # %PDF-
# email with no configured recipients and none passed -> 400
curl -s -X POST "localhost:3005/api/v1/maintenance/$MID/email-report" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}' -w '\n%{http_code}\n'
# email with an explicit recipient -> 502 locally (no SMTP), 200 in a real env
curl -s -X POST "localhost:3005/api/v1/maintenance/$MID/email-report" -H "Authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{"recipients":["ops@example.com"],"note":"pls review"}' -w '\n%{http_code}\n'
```
Expected: PDF `%PDF-`, non-zero; `{}` → `400` with the "No recipients" message; explicit recipient → `502` locally (MailHog down) — confirm the log line `Maintenance email-report failed:` shows a connection error, not a code bug. Also confirm an `AuditLog` row exists: `POST /maintenance/<id>/email-report`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/modules/maintenance/maintenance.service.ts backend/src/modules/maintenance/maintenance.controller.ts backend/src/modules/maintenance/maintenance.routes.ts
git commit -m "feat(maintenance): GET /:id/report.pdf + POST /:id/email-report

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 6: Frontend — "Email report" dialog + PDF download

**Files:**
- Modify: `frontend/src/lib/api.ts` (`maintenanceApi`)
- Modify: `frontend/src/pages/MaintenancePage.tsx`

**Interfaces:**
- Consumes: `apiClient`; the two new endpoints.
- Produces: `maintenanceApi.downloadReportPdf(id)` (blob), `maintenanceApi.emailReport(id, { recipients?, note? })`.

- [ ] **Step 1: API methods**

In `maintenanceApi` (next to `getPdfReportUrl`, ~line 181-183):
```ts
    downloadReportPdf: (id: string) =>
        apiClient.get(`/maintenance/${id}/report.pdf`, { responseType: 'blob' }),
    emailReport: (id: string, data: { recipients?: string[]; note?: string }) =>
        apiClient.post(`/maintenance/${id}/email-report`, data),
```

- [ ] **Step 2: Dialog state + handlers in `MaintenancePage.tsx`**

Add `import { toast } from 'sonner';` (not currently imported).

Near the other dialog state (`const [reportOpen, setReportOpen] = useState(false);` etc.):
```tsx
    const [emailReportIssue, setEmailReportIssue] = useState<any | null>(null);
    const [emailRecipients, setEmailRecipients] = useState('');
    const [emailNote, setEmailNote] = useState('');
    const [emailSending, setEmailSending] = useState(false);
```

Handlers (near `openPdfReport`):
```tsx
    const downloadReportPdf = async (id: string) => {
        try {
            const res = await maintenanceApi.downloadReportPdf(id);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `maintenance_${id.slice(-8)}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to download the report PDF');
        }
    };

    const submitEmailReport = async () => {
        if (!emailReportIssue) return;
        setEmailSending(true);
        try {
            const recipients = emailRecipients.split(',').map(s => s.trim()).filter(Boolean);
            const res = await maintenanceApi.emailReport(emailReportIssue.id, {
                recipients: recipients.length ? recipients : undefined,
                note: emailNote.trim() || undefined,
            });
            toast.success(res.data.message || 'Report emailed');
            setEmailReportIssue(null);
            setEmailRecipients('');
            setEmailNote('');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to email the report');
        } finally {
            setEmailSending(false);
        }
    };
```

- [ ] **Step 3: Row action + detail-dialog action**

In the table row action cluster (near the "PDF Report" `<Button>` at ~line 502-505) add two buttons:
```tsx
<Button variant="ghost" size="sm" onClick={() => downloadReportPdf(issue.id)} title="Download PDF report">
    <Download className="w-4 h-4" />
</Button>
<Button variant="ghost" size="sm" onClick={() => { setEmailReportIssue(issue); setEmailRecipients(''); setEmailNote(''); }} title="Email report">
    <Mail className="w-4 h-4" />
</Button>
```
Use icon names already imported in the file if `Download` / `Mail` aren't present — check the `lucide-react` import block (line 12-16) and add `Download, Mail` to it if missing.

In the detail dialog `<DialogFooter>` (~line 634-641), add next to the existing "open PDF" button:
```tsx
<Button variant="outline" onClick={() => downloadReportPdf(detailIssue.id)}>Download PDF</Button>
<Button variant="outline" onClick={() => { setEmailReportIssue(detailIssue); setEmailRecipients(''); setEmailNote(''); }}>Email report</Button>
```

- [ ] **Step 4: The Email-report dialog**

Add near the other `<Dialog>` blocks (e.g. after the detail dialog closes, ~line 643):
```tsx
<Dialog open={!!emailReportIssue} onOpenChange={open => !open && setEmailReportIssue(null)}>
    <DialogContent>
        <DialogHeader>
            <DialogTitle>Email maintenance report</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
                The full report PDF for cart <strong>{emailReportIssue?.fleet?.carNumber || '—'}</strong> will
                be sent to the configured maintenance recipients. Add extra addresses below (comma-separated).
            </p>
            <div className="space-y-1">
                <Label htmlFor="er-recipients">Additional recipients</Label>
                <Input id="er-recipients" placeholder="a@x.com, b@y.com"
                    value={emailRecipients} onChange={e => setEmailRecipients(e.target.value)} />
            </div>
            <div className="space-y-1">
                <Label htmlFor="er-note">Note (optional)</Label>
                <Textarea id="er-note" rows={3} value={emailNote} onChange={e => setEmailNote(e.target.value)} />
            </div>
        </div>
        <DialogFooter>
            <Button variant="outline" onClick={() => setEmailReportIssue(null)} disabled={emailSending}>Cancel</Button>
            <Button onClick={submitEmailReport} disabled={emailSending}>
                {emailSending ? 'Sending…' : 'Send email'}
            </Button>
        </DialogFooter>
    </DialogContent>
</Dialog>
```

- [ ] **Step 5: Typecheck + browser**

Run: `cd frontend && npx tsc --noEmit` → exit 0.
Browser (backend + frontend up), login `superadmin@gcms.com` → Maintenance:
- a row's **Download PDF** icon downloads `maintenance_XXXX.pdf` (`%PDF-`);
- a row's **Email report** icon opens the dialog; **Send email** with an address → toast shows the 502 error text locally ("Failed to send the report email.") — that proves the wiring; in a real SMTP env it would toast success;
- **Send email** with the recipients box empty and no configured emails → toast "No recipients configured…".
- Check the dialog at 375 / 768 / 1280 px.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/pages/MaintenancePage.tsx
git commit -m "feat(maintenance): Email report dialog + PDF download on MaintenancePage

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Task 7: Phase 5 verification sweep

**Files:** none (verification only).

- [ ] **Step 1: Backend tests**

Run: `cd backend && npm test`
Expected: green — **50 tests / 9 files** (+4 from `maintenance-timeline.test.ts`).

- [ ] **Step 2: Typecheck both packages**

Run: `cd backend && npx tsc --noEmit` and `cd frontend && npx tsc --noEmit`
Expected: no new errors in touched files (`maintenance*`, `pdf.service.ts`, `email.service.ts`, `api.ts`, `MaintenancePage.tsx`); pre-existing unrelated errors unchanged.

- [ ] **Step 3: Acceptance (spec §9.3)**

- [ ] `GET /maintenance/:id/report.pdf` → a branded PDF whose body shows the cart/venue block, reporter block, and the workflow timeline (reported → … → resolved) with actors + timestamps and a `MNT-YYYY-XXXXXX` ref. Decode the PDF streams to confirm the timeline labels are present.
- [ ] `POST /maintenance/:id/email-report` with a recipient composes an email with the PDF attached (verified via the 502-with-connection-error path locally + the unit-tested service logic; note in the summary that a live SMTP env is needed for real delivery).
- [ ] An `AuditLog` row (`action` = `POST /maintenance/<id>/email-report`) is written on each call.
- [ ] CSV export contains the escalation / quotation / approval / rejection / resolution timestamp columns.
- [ ] Admin calling either endpoint for a cart outside their venue → 403.

- [ ] **Step 4: Responsive check**

`MaintenancePage` Email-report dialog at 375 / 768 / 1280 px — inputs and footer buttons wrap cleanly, no body horizontal scroll.

- [ ] **Step 5: Confirm clean tree**

`git status` clean; branch builds. No dev-only state was toggled this phase.

- [ ] **Step 6: Final fixup commit (only if needed)**

```bash
git add -A
git commit -m "test: Phase 5 verification fixups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj"
```

---

## Self-Review

**1. Spec coverage:**
- §9.1 enriched report — `maintenanceReportPdf(logId)` real PDF with full timeline + `MNT-` ref (Tasks 1–2, 5); CSV export carries the timeline (Task 4). ✅ (Live artifact is CSV not Excel — noted in Global Constraints; the timeline data is fully present.)
- §9.2 email report button — `POST /maintenance/:id/email-report` with `recipients` + `note`, default recipients from `SystemSettings.maintenanceNotificationEmails`, PDF attached via `emailService`, audit-log entry via `auditLog()` middleware, RBAC `SuperAdmin/Admin(own venue)/Contracts/MaintenanceTeam`; `MaintenancePage` dialog (Tasks 3, 5, 6). ✅
- §9.3 acceptance — Task 7. ✅

**2. Placeholder scan:** No TBD / vague "handle errors" — every error branch has a status + typed body; timeline edge cases are covered by explicit tests. The one deliberate "check this in the codebase" note (does `AuthRequest.user` carry `name`?) has a concrete fallback if it doesn't. ✅

**3. Type consistency:**
- `TimelineEvent` (Task 1) vs `PdfTimelineEvent` (Task 2) — deliberately re-declared structurally in `pdf.service.ts` to keep it leaf-level; the two shapes share `{ label, at, by, detail }` and `maintenanceTimeline(...)` output is assignable to `PdfTimelineEvent[]` (extra `key` field is fine). Flagged inline.
- `getReportPdf` return `{ buffer, reference, carNumber }` — consumed by both `downloadReportPdf` (buffer, reference) and `emailReport` (all three). Matches.
- `emailReport` opts `{ recipients?, note?, actorName? }` — controller passes exactly these; `actorName` optional and defaulted.
- `EmailOptions.attachments` element `{ filename, content: Buffer, contentType? }` — identical at the definition (Task 3) and the call site (Task 5).
- `maintenanceApi.emailReport(id, { recipients?, note? })` — body matches `emailReportSchema`.

**4. Ordering / collision check:** new routes `/:id/report.pdf` and `/:id/email-report` have unique literal suffixes and sit beside `/:id/pdf`; no shadowing of `/:id`. The legacy HTML `/:id/pdf` is untouched.

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-10-phase-5-maintenance.md`. Two execution options:

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks.
2. **Inline Execution** — execute tasks in this session with checkpoints (matches how Phases 1–4B were run here).
