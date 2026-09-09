# Phase 3 — Handover / Handback Rework — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the handover form a clear two-step flow — Handover must be fully signed before Handback can start; once it is, the whole Handover section is visually locked and only the Handback section is editable; system-known fields (car number, type, venue, assigned FA + FA code) show as read-only auto-filled values; and the form downloads as a real branded PDF instead of `window.print()`.

**Architecture:** Ordering is already partly enforced in `handover.service.ts` by `HandoverForm.status` checks (`PENDING → ADMIN_SIGNED → COMPLETE → HANDBACK_PENDING → RETURNED`). Phase 3 extracts a pure `deriveHandoverPhase(status)` helper (unit-tested), tightens the remaining gap (creating/re-signing a handover after handback has begun), adds `handoverFormPdf()` to the shared `pdf.service.ts` from Phase 2, and reworks `HandoverFormModal.tsx` so the phase is explicit, the handover section greys out in the handback phase, and a system-fields strip is shown. `getHandoverForm` already includes `fleet.carNumber/carType/stadium/assignedUser{name,phone,accreditationNumber}`, so no schema change is needed.

**Tech Stack:** TypeScript, Express, Prisma, pdfkit, React, Vite, Tailwind, vitest.

**Spec:** `docs/superpowers/specs/2026-09-09-gcms-pool-and-production-design.md` — Phase 3 is §7; shared PDF service is §4 (already built in Phase 2 at `backend/src/services/pdf.service.ts`); NFRs are §2a.

## Global Constraints

- **Roles:** `SuperAdmin`, `Admin`, `FA`, `Observer`, `Contracts`, `MaintenanceTeam`. Handover form create / admin-return stay `requireRole('Admin', 'SuperAdmin')`.
- **HandoverForm.status values (exact):** `PENDING`, `ADMIN_SIGNED`, `COMPLETE`, `HANDBACK_PENDING`, `RETURNED`.
- **Modal modes (exact):** `'admin' | 'user' | 'view' | 'afteruse' | 'admin-return'`.
- **Phase mapping:** `PENDING`/`ADMIN_SIGNED` → `handover`; `COMPLETE` → `handover-done` (handover locked, after-use not yet started); `HANDBACK_PENDING` → `handback`; `RETURNED` → `complete`.
- **No schema change** in this phase.
- **Responsive:** verify the modal at 375 / 768 / 1280 px — it must scroll inside itself, not the page.
- **Bug-free:** `npx tsc --noEmit` clean for touched files (backend + frontend); backend `npm test` green; the PDF endpoint returns a typed JSON error (never a stack trace) when the form is missing.
- **Commits:** one per task, conventional-commit, footer:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01MCjjshnTn7hemX5hA1vLaj
  ```
- **Dev servers:** backend `cd backend && npm run dev` (:3005), frontend `cd frontend && npm run dev` (:3000). Logins: `superadmin@gcms.com` / `Admin@2024!`, `admin@gcms.com` / `Admin@2024!`.

---

## File Structure

**Created:**
- `backend/src/modules/handover/handover-phase.ts` — `deriveHandoverPhase()` + types.
- `backend/src/modules/handover/handover-phase.test.ts` — unit tests.

**Modified:**
- `backend/src/services/pdf.service.ts` — add `handoverFormPdf(fleetId)` + a `dataUriToBuffer()` helper.
- `backend/src/modules/handover/handover.service.ts` — import `deriveHandoverPhase`; tighten `createHandoverForm` guard; force `serialNumber`/`handoverLocation` from the vehicle record.
- `backend/src/modules/handover/handover.controller.ts` — `downloadFormPdf` handler.
- `backend/src/modules/handover/handover.routes.ts` — `GET /forms/:fleetId/pdf`.
- `frontend/src/lib/api.ts` — `handoverApi.downloadFormPdf(fleetId)`.
- `frontend/src/components/handover/HandoverFormModal.tsx` — phase indicator, system-fields strip, `handoverLocked` visual grey, PDF download replacing `window.print()`.
- `frontend/src/pages/HandoverPage.tsx` — "Download PDF" action on COMPLETE/RETURNED records.

---

## Task 1: `deriveHandoverPhase()` + tighten the create guard (TDD)

**Files:**
- Create: `backend/src/modules/handover/handover-phase.ts`
- Test: `backend/src/modules/handover/handover-phase.test.ts`
- Modify: `backend/src/modules/handover/handover.service.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```ts
  export type HandoverPhase = 'handover' | 'handover-done' | 'handback' | 'complete';
  export function deriveHandoverPhase(status: string): HandoverPhase;
  /** true when a handover form may still be created / admin-signed for this status. */
  export function canCreateOrSignHandover(status: string | null | undefined): boolean;
  ```

- [ ] **Step 1: Write the failing test**

Create `backend/src/modules/handover/handover-phase.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { deriveHandoverPhase, canCreateOrSignHandover } from './handover-phase';

describe('deriveHandoverPhase', () => {
  it('maps the handover statuses', () => {
    expect(deriveHandoverPhase('PENDING')).toBe('handover');
    expect(deriveHandoverPhase('ADMIN_SIGNED')).toBe('handover');
  });
  it('maps COMPLETE to handover-done', () => {
    expect(deriveHandoverPhase('COMPLETE')).toBe('handover-done');
  });
  it('maps HANDBACK_PENDING to handback', () => {
    expect(deriveHandoverPhase('HANDBACK_PENDING')).toBe('handback');
  });
  it('maps RETURNED to complete', () => {
    expect(deriveHandoverPhase('RETURNED')).toBe('complete');
  });
  it('treats an unknown status as handover (safe default)', () => {
    expect(deriveHandoverPhase('WHATEVER')).toBe('handover');
  });
});

describe('canCreateOrSignHandover', () => {
  it('allows create/sign only before the form is COMPLETE', () => {
    expect(canCreateOrSignHandover(null)).toBe(true);
    expect(canCreateOrSignHandover(undefined)).toBe(true);
    expect(canCreateOrSignHandover('PENDING')).toBe(true);
    expect(canCreateOrSignHandover('ADMIN_SIGNED')).toBe(true);
  });
  it('blocks it once the handover is done or handback has started', () => {
    expect(canCreateOrSignHandover('COMPLETE')).toBe(false);
    expect(canCreateOrSignHandover('HANDBACK_PENDING')).toBe(false);
    expect(canCreateOrSignHandover('RETURNED')).toBe(false);
  });
});
```

- [ ] **Step 2: Run the test, verify it fails**

Run: `cd backend && npx vitest run src/modules/handover/handover-phase.test.ts`
Expected: FAIL — cannot find module `./handover-phase`.

- [ ] **Step 3: Implement the helper**

Create `backend/src/modules/handover/handover-phase.ts`:

```ts
export type HandoverPhase = 'handover' | 'handover-done' | 'handback' | 'complete';

const PHASE_BY_STATUS: Record<string, HandoverPhase> = {
  PENDING: 'handover',
  ADMIN_SIGNED: 'handover',
  COMPLETE: 'handover-done',
  HANDBACK_PENDING: 'handback',
  RETURNED: 'complete',
};

/** Which of the two steps the form is on. Unknown status falls back to 'handover'. */
export function deriveHandoverPhase(status: string): HandoverPhase {
  return PHASE_BY_STATUS[status] ?? 'handover';
}

/** A handover form may still be created or admin/user-signed only before it is COMPLETE. */
export function canCreateOrSignHandover(status: string | null | undefined): boolean {
  if (!status) return true;
  return status === 'PENDING' || status === 'ADMIN_SIGNED';
}
```

- [ ] **Step 4: Run the test, verify it passes**

Run: `cd backend && npx vitest run src/modules/handover/handover-phase.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Tighten `createHandoverForm` in `handover.service.ts`**

Find (near line 533):

```ts
const existing = await prisma.handoverForm.findUnique({ where: { fleetId: data.fleetId } });
if (existing && existing.status === 'COMPLETE') throw new Error('Handover already completed for this cart');
```

Replace with (add the import at the top of the file:
`import { canCreateOrSignHandover } from './handover-phase';`):

```ts
const existing = await prisma.handoverForm.findUnique({ where: { fleetId: data.fleetId } });
if (existing && !canCreateOrSignHandover(existing.status)) {
    throw new Error('The handover for this cart is already signed — it cannot be changed. Use the handback flow instead.');
}
```

- [ ] **Step 6: Force system fields from the vehicle record**

In both the `prisma.handoverForm.update({ ... })` and `prisma.handoverForm.create({ ... })` calls inside `createHandoverForm`, change these two lines so the client cannot override them:

```ts
serialNumber: vehicle.carNumber,
handoverLocation: vehicle.stadium.name,
```

(Leave `handedOverTo: data.handedOverTo ?? vehicle.assignedUser?.name` and `faCode: data.faCode ?? vehicle.department?.code` as they are.)

- [ ] **Step 7: Full suite + typecheck**

Run: `cd backend && npm test && npx tsc --noEmit 2>&1 | grep -E "handover-phase|handover.service" || echo clean`
Expected: all tests pass; no new tsc errors.

- [ ] **Step 8: Commit**

```bash
git add backend/src/modules/handover/handover-phase.ts backend/src/modules/handover/handover-phase.test.ts backend/src/modules/handover/handover.service.ts
git commit -m "feat: deriveHandoverPhase() + block handover edits once handback has begun; force system fields from the cart"
```

---

## Task 2: Backend — `handoverFormPdf()` + download route

**Files:**
- Modify: `backend/src/services/pdf.service.ts`
- Modify: `backend/src/modules/handover/handover.controller.ts`
- Modify: `backend/src/modules/handover/handover.routes.ts`

**Interfaces:**
- Consumes: `renderPdf`, `makeReference` (Phase 2 `pdf.service.ts`). The controller passes the
  already-loaded form object in — `pdf.service.ts` does NOT import the handover module
  (avoids a cross-module cycle).
- Produces:
  ```ts
  // pdf.service.ts
  export async function handoverFormPdf(form: any): Promise<{ buffer: Buffer; reference: string }>;
  ```
  New route: `GET /api/v1/handover/forms/:fleetId/pdf` (authenticated) → `application/pdf` attachment, or `404 { error }` when the form is missing.

- [ ] **Step 1: Add `dataUriToBuffer` + `handoverFormPdf` to `pdf.service.ts`**

Add near the top (after imports) — no new import, `pdf.service.ts` stays leaf-level:

```ts
/** Decode a "data:image/png;base64,AAAA" string to a Buffer, or null if it isn't one. */
function dataUriToBuffer(uri: string | null | undefined): Buffer | null {
  if (!uri || typeof uri !== 'string') return null;
  const m = uri.match(/^data:image\/[a-zA-Z+]+;base64,(.+)$/);
  if (!m) return null;
  try {
    return Buffer.from(m[1], 'base64');
  } catch {
    return null;
  }
}
```

Then add the builder (takes the already-loaded form; the controller fetches it):

```ts
export async function handoverFormPdf(
  form: any,
): Promise<{ buffer: Buffer; reference: string }> {
  const reference = makeReference('HOF', form.id);
  const fleet = form.fleet ?? {};
  const fa = fleet.assignedUser ?? {};

  const line = (doc: PDFKit.PDFDocument, label: string, value: unknown) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#000').text(value != null && value !== '' ? String(value) : '—');
  };
  const sig = (doc: PDFKit.PDFDocument, label: string, uri: string | null | undefined, at?: string, by?: string) => {
    doc.moveDown(0.3);
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(label);
    const buf = dataUriToBuffer(uri);
    if (buf) {
      try { doc.image(buf, { fit: [160, 60] }); } catch { doc.font('Helvetica').fillColor('#000').text('[signature on file]'); }
    } else {
      doc.font('Helvetica').fillColor('#000').text('[not signed]');
    }
    if (at || by) doc.font('Helvetica').fontSize(8).fillColor('#666').text(`${by ?? ''}${at ? `  ·  ${new Date(at).toLocaleString()}` : ''}`);
    doc.fillColor('#000');
  };

  const buffer = await renderPdf(
    { title: 'Golf Cart Handover & Return Form', subtitle: `Cart ${fleet.carNumber ?? '—'} · ${fleet.stadium?.name ?? '—'}`, reference },
    (doc) => {
      doc.font('Helvetica-Bold').fontSize(11).text('System record');
      line(doc, 'Car number', fleet.carNumber);
      line(doc, 'Car type', fleet.carType);
      line(doc, 'Venue', fleet.stadium?.name);
      line(doc, 'Department', fleet.department?.name);
      line(doc, 'Assigned FA', fa.name);
      line(doc, 'FA code', fa.accreditationNumber);
      line(doc, 'FA phone', fa.phone);
      line(doc, 'Status', form.status);
      doc.moveDown(0.6);

      doc.font('Helvetica-Bold').fontSize(11).text('Handover details');
      line(doc, 'Handover date', form.handoverDate);
      line(doc, 'Approved return date', form.approvedReturnDate);
      line(doc, 'Handover location', form.handoverLocation);
      line(doc, 'Handed over to', form.handedOverTo);
      line(doc, 'Receiver contact', form.receiverContact);
      line(doc, 'Receiver licence no', form.receiverLicenseNo);
      line(doc, 'Issues / notes', form.issuesNotes);
      doc.moveDown(0.4);
      sig(doc, 'Admin signature (handover)', form.adminSignatureData, form.adminSignedAt, form.adminSignedByUser?.name);
      sig(doc, 'Receiver signature (handover)', form.userSignatureData, form.userSignedAt, form.userSignedByUser?.name);

      doc.moveDown(0.8);
      doc.font('Helvetica-Bold').fontSize(11).text('Handback / return');
      line(doc, 'Inspection done', form.inspectionDone);
      line(doc, 'Return date', form.returnDate);
      line(doc, 'Received by', form.receivedBy);
      line(doc, 'Returned by', form.returnedBy);
      line(doc, 'Return notes', form.issuesNotes);
      doc.moveDown(0.4);
      sig(doc, 'After-use signature (FA)', form.afteruseSignatureData, form.afteruseSignedAt, form.afteruseSignedByUser?.name);
      sig(doc, 'Admin signature (return)', form.returnAdminSigData);
      sig(doc, 'Receiver signature (return)', form.returnUserSigData);

      if (form.finalSignatureData || form.finalName) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(11).text('Terms acknowledgement');
        line(doc, 'Name', form.finalName);
        line(doc, 'Date', form.finalDate);
        sig(doc, 'Final signature', form.finalSignatureData);
      }
    },
  );
  return { buffer, reference };
}
```

**Note:** `renderPdf` was created in Phase 2 with `bufferPages: true`; `doc.image` on a Buffer works there.

- [ ] **Step 2: Controller handler**

In `handover.controller.ts` add (imports: `import { handoverFormPdf } from '../../services/pdf.service';`
and reuse the module's existing `handoverService` import):

```ts
static async downloadFormPdf(req: AuthRequest, res: Response) {
    try {
        const fleetId = req.params.fleetId as string;
        const form = await handoverService.getHandoverForm(fleetId);
        if (!form) {
            res.status(404).json({ error: 'No handover form found for this cart' });
            return;
        }
        const result = await handoverFormPdf(form);
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=handover_${result.reference}.pdf`);
        res.end(result.buffer);
    } catch (error) {
        console.error('Handover PDF error:', error);
        res.status(500).json({ error: 'Failed to generate handover PDF' });
    }
}
```

(Check the top of `handover.controller.ts` for how the service is imported — it may be
`import { handoverService } from './handover.service';` or a class; match the existing style.)

- [ ] **Step 3: Route**

In `handover.routes.ts`, in the "Handover Form" group, add this line right after the
`router.get('/forms/:fleetId', ...)` line (Express matches `/forms/:fleetId/pdf` and
`/forms/:fleetId` by path depth, so order between them does not matter):

```ts
router.get('/forms/:fleetId/pdf', authenticate, HandoverController.downloadFormPdf);
```

- [ ] **Step 4: Typecheck**

Run: `cd backend && npx tsc --noEmit 2>&1 | grep -E "pdf.service|handover.controller|handover.routes" || echo clean`
Expected: clean.

- [ ] **Step 5: Manual verification**

Start backend. Find a fleet that has a form:

```bash
SA=$(curl -s -X POST localhost:3005/api/v1/auth/login -H 'Content-Type: application/json' -d '{"email":"superadmin@gcms.com","password":"Admin@2024!"}' | node -pe 'JSON.parse(require("fs").readFileSync(0)).accessToken')
FLEET=$(curl -s "localhost:3005/api/v1/handover/forms/list" -H "Authorization: Bearer $SA" | node -pe 'const d=JSON.parse(require("fs").readFileSync(0)); (d.data?.[0]||d.forms?.[0]||d[0]||{}).fleetId || ""')
echo "fleet=$FLEET"
curl -s "localhost:3005/api/v1/handover/forms/$FLEET/pdf" -H "Authorization: Bearer $SA" -o /tmp/hof.pdf -D - | head -12
file /tmp/hof.pdf   # -> PDF document
# missing form -> 404 json
curl -s "localhost:3005/api/v1/handover/forms/does-not-exist/pdf" -H "Authorization: Bearer $SA" -w " [%{http_code}]\n"
```
Expected: real form → `Content-Type: application/pdf`, `file` reports "PDF document", opens with the system-record block, handover + handback sections, an `HOF-` reference and page footer. Unknown fleet → `{"error":"No handover form found for this cart"} [404]`.

- [ ] **Step 6: Commit**

```bash
git add backend/src/services/pdf.service.ts backend/src/modules/handover/handover.controller.ts backend/src/modules/handover/handover.routes.ts
git commit -m "feat: downloadable handover form PDF (GET /handover/forms/:fleetId/pdf) via shared pdf.service"
```

---

## Task 3: Frontend — phase indicator + read-only system-fields strip

**Files:**
- Modify: `frontend/src/components/handover/HandoverFormModal.tsx`

**Interfaces:**
- Consumes: `form.fleet` (already loaded by `handoverApi.getHandoverForm`) with `carNumber`, `carType`, `stadium.name`, `department.name`, `assignedUser.{name,phone,accreditationNumber}`; `form.status`.
- Produces: no exports.

- [ ] **Step 1: Compute the phase**

Near the other derived flags (around line 295-298, where `isComplete`, `isReturned` are), add:

```ts
const phaseLabel =
    form?.status === 'RETURNED' ? 'Complete'
    : form?.status === 'HANDBACK_PENDING' ? 'Step 2 of 2 · Handback'
    : form?.status === 'COMPLETE' ? 'Handover signed · awaiting handback'
    : 'Step 1 of 2 · Handover';
```

- [ ] **Step 2: Render the phase badge + system-fields strip**

In the modal header area (near the status badge around line 528-544, the `bg-zinc-800` bar), add the phase label next to the status, e.g.:

```tsx
<span className="text-xs rounded bg-white/10 px-2 py-0.5">{phaseLabel}</span>
```

Then, directly below the header bar and above `Section 1`, insert a system-record strip (uses the existing `f`/`form` in scope — `form.fleet`):

```tsx
<div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-1 px-4 py-3 bg-muted/40 border-b text-sm">
    <div><span className="text-muted-foreground">Car #:</span> <b>{form?.fleet?.carNumber ?? '—'}</b></div>
    <div><span className="text-muted-foreground">Type:</span> <b>{form?.fleet?.carType ?? '—'}</b></div>
    <div><span className="text-muted-foreground">Venue:</span> <b>{form?.fleet?.stadium?.name ?? '—'}</b></div>
    <div><span className="text-muted-foreground">Assigned FA:</span> <b>{form?.fleet?.assignedUser?.name ?? '—'}</b></div>
    <div><span className="text-muted-foreground">FA code:</span> <b>{form?.fleet?.assignedUser?.accreditationNumber ?? '—'}</b></div>
    <div><span className="text-muted-foreground">FA phone:</span> <b>{form?.fleet?.assignedUser?.phone ?? '—'}</b></div>
</div>
```

(If `form` typing lacks `fleet`, widen the local `HandoverForm`/props type in this file — search for the `interface` around line 14-17 with `status: string;` and add
`fleet?: { carNumber?: string; carType?: string; stadium?: { name?: string }; department?: { name?: string }; assignedUser?: { name?: string; phone?: string; accreditationNumber?: string } };`)

- [ ] **Step 3: Make `serialNumber` always read-only**

Find the `serialNumber` input (around line 556): change `readOnly={isAdminReadonly}` to `readOnly` (always), and set its value to prefer the system record:

```tsx
value={f.serialNumber || form?.fleet?.carNumber || ''} readOnly
```

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep HandoverFormModal || echo clean`

- [ ] **Step 5: Manual verification (browser)**

Log in as `admin@gcms.com` → Handover Management. Open a form (Sign Form or View Form). Expect: a phase badge ("Step 1 of 2 · Handover" etc.) in the header, and a grey strip showing Car #, Type, Venue, Assigned FA, FA code, FA phone from the system. The Serial Number field is not editable.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/handover/HandoverFormModal.tsx
git commit -m "feat: handover modal shows a phase indicator and a read-only system-fields strip"
```

---

## Task 4: Frontend — visually lock the Handover section during Handback

**Files:**
- Modify: `frontend/src/components/handover/HandoverFormModal.tsx`

**Interfaces:**
- Consumes: `mode`, `form.status`.
- Produces: no exports.

- [ ] **Step 1: Compute `handoverLocked`**

Next to `phaseLabel` from Task 3:

```ts
const handoverLocked =
    mode === 'afteruse' || mode === 'admin-return'
    || form?.status === 'HANDBACK_PENDING' || form?.status === 'RETURNED';
```

- [ ] **Step 2: Wrap the handover sections**

The handover-only content is **Section 1 (Handover Details)**, **Section 2 (Golf Cart Information)**, the **pre-use** column of the Condition table, **Section 4 (Additional Drivers)**, **Section 5 (Issues)** input, and **Section 7 (Terms & handover signature)**. Wrap that run of JSX (from the Section 1 `SectionHeader` down to the end of Section 7 / handover signature block, i.e. up to but **not including** the `{mode === 'afteruse' && (` block around line 831) in:

```tsx
<div className={handoverLocked ? 'opacity-50 pointer-events-none select-none' : ''} aria-disabled={handoverLocked}>
    {handoverLocked && (
        <div className="mb-3 rounded-md bg-amber-50 border border-amber-200 text-amber-800 text-xs px-3 py-2">
            Handover is signed and locked. Only the handback section below is editable.
        </div>
    )}
    {/* … existing Section 1–7 JSX … */}
</div>
```

Keep the `ConditionTable`'s `disableAft` prop as-is (the after-use column must stay editable in `afteruse`/`admin-return`) — so if the Condition table is *inside* the wrapped block, instead pull just the **pre** column into the locked wrapper conceptually by leaving `ConditionTable` where it is but relying on `disablePre={mode !== 'admin'}` (already true) — do **not** put `pointer-events-none` on the after-use inputs. Simplest correct approach: wrap Sections 1, 2, 4, 5, 7 in the locked `<div>`, and leave the Condition table (Section 3) outside the wrapper so its after-use column keeps working; the pre-use column is already disabled by `disablePre`.

- [ ] **Step 3: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep HandoverFormModal || echo clean`

- [ ] **Step 4: Manual verification (browser)**

Need a form in `HANDBACK_PENDING`. On the Handover Management page, find a cart with the "Handback Pending" badge and open its return flow (mode `admin-return`), or open a `RETURNED` record in `view`. Expect: Sections 1/2/4/5/7 are greyed at 50% opacity and do not accept clicks; the amber "locked" note shows; the after-use / return section below is fully interactive. In `admin` mode on a `PENDING` form, nothing is greyed.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/handover/HandoverFormModal.tsx
git commit -m "feat: grey out and lock the handover section once handback has started"
```

---

## Task 5: Frontend — download the real PDF instead of window.print()

**Files:**
- Modify: `frontend/src/lib/api.ts`
- Modify: `frontend/src/components/handover/HandoverFormModal.tsx`
- Modify: `frontend/src/pages/HandoverPage.tsx`

**Interfaces:**
- Consumes: `GET /handover/forms/:fleetId/pdf` (Task 2).
- Produces: `handoverApi.downloadFormPdf(fleetId: string)` → `Promise<AxiosResponse<Blob>>`.

- [ ] **Step 1: API client**

In `frontend/src/lib/api.ts`, inside `handoverApi`, add:

```ts
downloadFormPdf: (fleetId: string) =>
    apiClient.get(`/handover/forms/${fleetId}/pdf`, { responseType: 'blob' }),
```

- [ ] **Step 2: Replace `handlePrint` in the modal**

In `HandoverFormModal.tsx`, replace:

```ts
const handlePrint = () => window.print();
```

with:

```ts
const handlePrint = async () => {
    if (!fleetId) return;
    try {
        const res = await handoverApi.downloadFormPdf(fleetId);
        const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `handover_${form?.fleet?.carNumber || fleetId}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
    } catch {
        toast.error('Could not download the PDF');
    }
};
```

(`fleetId` is a prop on this modal; `toast` from `sonner` — confirm it is imported, else add `import { toast } from 'sonner';`. Keep the button text but change "Print / Save PDF" / "Save PDF" labels to "Download PDF".) You may also delete the `@media print` `<style>` block and `no-print` reliance is harmless if left.

- [ ] **Step 3: "Download PDF" in the Handover Management list**

In `frontend/src/pages/HandoverPage.tsx`, in the forms/records list where each `record` is rendered with a "View Form" button (around line 685), add for completed/returned records:

```tsx
{(record.status === 'COMPLETE' || record.status === 'RETURNED') && (
    <Button variant="outline" size="sm" onClick={async () => {
        try {
            const res = await handoverApi.downloadFormPdf(record.fleetId);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = `handover_${record.fleetId}.pdf`; a.click();
            URL.revokeObjectURL(url);
        } catch { toast.error('Download failed'); }
    }}>
        Download PDF
    </Button>
)}
```

(Confirm `toast` is imported in `HandoverPage.tsx`; add if missing.)

- [ ] **Step 4: Typecheck**

Run: `cd frontend && npx tsc --noEmit 2>&1 | grep -E "HandoverFormModal|HandoverPage|lib/api" || echo clean`

- [ ] **Step 5: Manual verification (browser)**

Open a `COMPLETE` handover form → click **Download PDF** in the modal footer: a `handover_<car>.pdf` downloads and opens with the branded header, the system-record block, both sections, signatures and an `HOF-` reference. On the Handover Management list, a `COMPLETE`/`RETURNED` row shows a **Download PDF** button that downloads the same file. Confirm `window.print()` is no longer called anywhere in the modal (grep).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.ts frontend/src/components/handover/HandoverFormModal.tsx frontend/src/pages/HandoverPage.tsx
git commit -m "feat: download the server-generated handover PDF; drop window.print()"
```

---

## Phase 3 Done-When

- `cd backend && npm test` green (adds the `handover-phase` suite).
- Calling `POST /handover/forms` for a cart whose form is `COMPLETE` / `HANDBACK_PENDING` / `RETURNED` returns a 400 with the "already signed" message.
- `POST /handover/forms/afteruse` still requires the form to be `COMPLETE` first (unchanged, verified).
- The handover form modal shows a phase indicator and a read-only system-record strip; Serial Number is not editable; in the handback phase Sections 1/2/4/5/7 are visibly greyed and inert while the after-use/return section stays editable.
- `GET /handover/forms/:fleetId/pdf` returns a branded PDF (system record + both sections + signature images + `HOF-` reference); a missing form returns `404` JSON.
- The modal's "Download PDF" and the Handover Management list's "Download PDF" both download that PDF; `window.print()` is gone from the modal.
- `npx tsc --noEmit` clean in `backend/` and `frontend/` for touched files; modal usable at 375 / 768 / 1280 px.

## Self-Review Notes

- **Spec coverage:** §7.1 → Task 1 (guard tightening; the `PENDING→ADMIN_SIGNED→COMPLETE→HANDBACK_PENDING→RETURNED` ordering was already enforced by existing status checks in `userSignHandoverForm` / `saveAfterUse` — Task 1 closes the create/re-sign gap). §7.2 → Tasks 3 (phase indicator) + 4 (visual lock). §7.3 → Task 1 Step 6 (server forces `serialNumber`/`handoverLocation`) + Task 3 (read-only system strip, non-editable Serial). §7.4 → Task 2 (PDF) + Task 5 (wire-up, drop `window.print()`).
- **No schema change:** `getHandoverForm` already returns every field the PDF and the strip need.
- **Condition table nuance:** Section 3's after-use column must remain editable in `afteruse`/`admin-return`; Task 4 Step 2 explicitly keeps `ConditionTable` outside the locked wrapper and relies on the existing `disablePre`/`disableAft` props — do not blanket-disable it.
- **No automated UI tests:** consistent with Phases 1–2; unit tests cover the phase logic; manual steps are explicit. Full harness is Phase 7.
