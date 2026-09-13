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
  const tail = id.replace(/[^a-zA-Z0-9]/g, '').slice(-6).toUpperCase() || 'NONE00';
  return `${prefix}-${year}-${tail}`;
}

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

async function loadBranding() {
  const s = await prisma.systemSettings.findFirst();
  return {
    tournamentName: s?.tournamentName ?? 'GCMS',
    footerText: s?.footerText ?? '',
  };
}

/**
 * Render a PDF with a common header (tournament name + title + reference) and a
 * footer (footer text + "Page X of Y" + generated timestamp). `body` draws the
 * content between them.
 */
export async function renderPdf(
  meta: PdfMeta,
  body: (doc: PDFKit.PDFDocument) => void,
): Promise<Buffer> {
  const brand = await loadBranding();
  const doc = new PDFDocument({ margin: 40, size: 'A4', bufferPages: true });
  const chunks: Buffer[] = [];
  doc.on('data', (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  doc.fontSize(9).fillColor('#666').text(brand.tournamentName, { align: 'right' });
  doc.moveDown(0.3);
  doc.fontSize(18).fillColor('#000').font('Helvetica-Bold').text(meta.title);
  if (meta.subtitle) doc.fontSize(10).font('Helvetica').fillColor('#444').text(meta.subtitle);
  doc.fontSize(9).fillColor('#666').text(`Ref: ${meta.reference}    Generated: ${new Date().toLocaleString()}`);
  doc.moveDown();
  doc.fillColor('#000').font('Helvetica').fontSize(10);

  body(doc);

  const footer = brand.footerText ? `${brand.footerText}  ·  ` : '';
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    doc.fontSize(8).fillColor('#888').text(
      `${footer}Page ${i + 1} of ${range.count}`,
      40,
      doc.page.height - 30,
      { align: 'center', width: doc.page.width - 80 },
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
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000')
          .text(`${r.fleet?.carNumber ?? '—'}  (${r.fleet?.carType ?? '—'})`);
        doc.font('Helvetica').fontSize(9).fillColor('#333');
        doc.text(`Venue: ${r.stadium?.name ?? '—'}    State: ${r.derivedState ?? r.status}`);
        doc.text(`Requester: ${r.requesterName}  ·  FA: ${r.faUser?.accreditationNumber ?? '—'}  ·  ${r.requesterPhone}  ·  ${r.requesterEmail}`);
        doc.text(`Type: ${r.bookingType}    Window: ${r.startDate} ${r.startTime} -> ${r.endDate} ${r.endTime}`);
        if (r.returnedAt) {
          doc.text(`Returned: ${new Date(r.returnedAt).toLocaleString()} by ${r.returnedBy?.name ?? '—'}`);
        }
        doc.fillColor('#000');
      });
    },
  );
}

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

/**
 * Pool car report as a branded PDF. The caller passes an already-assembled
 * data object so this module stays leaf-level (no reports-module import).
 */
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

/**
 * Maintenance fix report as a branded PDF — cart/venue, reporter, and the full
 * workflow timeline. The caller passes already-loaded data so this module stays
 * leaf-level (no maintenance-module import).
 */
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

/** Matches the fillable Golf Cart/UTV Incident Report Form template — see IncidentReportFormModal.tsx. */
export interface IncidentFormData {
  incidentTypes?: string[];
  venueLocationAddress?: string;
  userFullNameFunction?: string;
  userContact?: string;
  witnessFullNameFunction?: string;
  witnessContact?: string;
  injury?: {
    prefix?: string; firstName?: string; lastName?: string; dob?: string; contact?: string;
    designation?: string; designationOther?: string;
    descriptionInjury?: string;
    treatmentReceived?: string;
    treatmentProvidedBy?: string;
  };
  incidentReportedTo?: string[];
  reportCompletedBy?: string;
  reportCompletedByOther?: string;
  reporterName?: string;
  reporterJobTitle?: string;
  reporterContact?: string;
  otherInfo?: string;
  checklist?: Record<string, string>;
}

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
  formData?: IncidentFormData | null;
  formSignedByName?: string | null;
  formSignedAt?: string | null;
  escalatedToContracts?: boolean;
  escalatedToMaintenance?: boolean;
  warnings: Array<{ reference: string; level: number; reason: string; issuedBy: string | null; issuedAt: string; revoked: boolean }>;
}

const CHECKLIST_LABELS: Record<string, string> = {
  headLightsOperational: 'Head lights fully operational (both sides)',
  headLightsLensesOk: 'Head lights free of cracks/missing lenses',
  tailLightsOperational: 'Tail lights / turn signals operational (both sides)',
  tailLightsLensesOk: 'Tail light lenses free of cracks/missing',
  brakeLightsOperational: 'Brake lights fully operational',
  turnSignalsOperational: 'Turn signals fully operational (both sides)',
  tiresNoCracks: 'Tires free of visible cracks/uneven wear',
  tiresNoForeignObjects: 'Tires free of foreign objects (nails/screws)',
  batteryCablesOk: 'Battery cables free of corrosion/cracks',
  brakesOperable: 'Brakes fully operable (stopping ability)',
  brakesNoNoise: 'Brakes free of squeak/squeal/grinding',
  wipersOperable: 'Windshield wipers operable',
  windshieldClear: 'Windshield clear of cracks/scratches',
  hornOperable: 'Horn operable and adequate',
};

/** Branded incident report — the full template fields (when filled) plus every warning issued against it. */
export async function incidentReportPdf(args: { data: IncidentReportPdfData }): Promise<Buffer> {
  const { data } = args;
  const f = data.formData ?? null;
  const kv = (doc: PDFKit.PDFDocument, label: string, value: unknown) => {
    doc.font('Helvetica-Bold').fontSize(9).fillColor('#444').text(`${label}: `, { continued: true });
    doc.font('Helvetica').fillColor('#000').text(value != null && value !== '' ? String(value) : '—');
  };
  const heading = (doc: PDFKit.PDFDocument, t: string) => {
    doc.moveDown(0.6).font('Helvetica-Bold').fontSize(12).fillColor('#000').text(t).moveDown(0.2);
    doc.font('Helvetica').fontSize(10);
  };
  return renderPdf(
    { title: 'Golf Cart/Utility Vehicle Incident Report Form', subtitle: data.subjectName ? `Subject: ${data.subjectName}` : undefined, reference: data.reference },
    (doc) => {
      heading(doc, 'Incident');
      kv(doc, 'Title', data.title);
      kv(doc, 'Status', data.status);
      kv(doc, 'Incident type', f?.incidentTypes?.length ? f.incidentTypes.join(', ') : '—');
      kv(doc, 'Occurred at', new Date(data.occurredAt).toLocaleString());
      kv(doc, 'Venue / location / address', f?.venueLocationAddress || data.stadiumName);
      kv(doc, 'Cart', data.carNumber);
      kv(doc, 'Photos attached', data.photoCount);
      doc.moveDown(0.3).font('Helvetica').fontSize(10).fillColor('#000').text(data.description);

      heading(doc, 'User of the golf cart / UTV when the incident happened');
      kv(doc, 'Full name and function', f?.userFullNameFunction || data.subjectName);
      kv(doc, 'Contact number', f?.userContact);

      heading(doc, 'Witness');
      kv(doc, 'Full name and function', f?.witnessFullNameFunction);
      kv(doc, 'Contact number', f?.witnessContact);

      if (f?.injury && (f.injury.firstName || f.injury.lastName || f.injury.descriptionInjury)) {
        heading(doc, 'Injury / illness and treatment details');
        kv(doc, 'Name', `${f.injury.prefix ?? ''} ${f.injury.firstName ?? ''} ${f.injury.lastName ?? ''}`.trim());
        kv(doc, 'DOB', f.injury.dob);
        kv(doc, 'Contact number', f.injury.contact);
        kv(doc, 'Designation', f.injury.designation === 'Other' ? f.injury.designationOther : f.injury.designation);
        kv(doc, 'Description of injury/illness', f.injury.descriptionInjury);
        kv(doc, 'Treatment received', f.injury.treatmentReceived);
        kv(doc, 'Treatment provided by', f.injury.treatmentProvidedBy);
      }

      heading(doc, 'Reporting');
      kv(doc, 'Incident reported to', f?.incidentReportedTo?.length ? f.incidentReportedTo.join(', ') : '—');
      kv(doc, 'Report completed by', f?.reportCompletedBy === 'Other' ? f.reportCompletedByOther : f?.reportCompletedBy);
      kv(doc, 'Name', f?.reporterName || data.reporterName);
      kv(doc, 'Job title', f?.reporterJobTitle);
      kv(doc, 'Contact no.', f?.reporterContact);
      if (f?.otherInfo) kv(doc, 'Other relevant information', f.otherInfo);

      if (f?.checklist && Object.keys(f.checklist).length) {
        heading(doc, 'Golf Cart/UTV investigation checklist after incident');
        Object.entries(CHECKLIST_LABELS).forEach(([key, label]) => {
          const v = f.checklist?.[key];
          if (v) kv(doc, label, v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v);
        });
        if (f.checklist.roadTestAbnormalities) kv(doc, 'Road test — abnormalities noted', f.checklist.roadTestAbnormalities);
      }

      if (data.formSignedByName) {
        heading(doc, 'Sign-off');
        kv(doc, 'Signed by', data.formSignedByName);
        kv(doc, 'Signed at', data.formSignedAt ? new Date(data.formSignedAt).toLocaleString() : '—');
      }

      if (data.escalatedToContracts || data.escalatedToMaintenance) {
        heading(doc, 'Escalation');
        kv(doc, 'Escalated to Contracts', data.escalatedToContracts ? 'Yes' : 'No');
        kv(doc, 'Escalated to Maintenance', data.escalatedToMaintenance ? 'Yes' : 'No');
      }

      heading(doc, 'People');
      kv(doc, 'Subject', `${data.subjectName ?? '—'}${data.subjectFaCode ? ` (FA ${data.subjectFaCode})` : ''}`);
      kv(doc, 'Reported by', data.reporterName);

      heading(doc, 'Warnings / tickets issued');
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

/** Standalone warning letter (used when no incident is linked). */
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

/**
 * Full handover & return form as a branded PDF. Takes the already-loaded form
 * (with `fleet`, `assignedUser`, signer relations) — the caller fetches it so
 * this module stays leaf-level.
 */
/** Filename-safe code: uppercased, non-alphanumerics stripped, falls back to a generic tag. */
function safeCode(value: string | null | undefined, fallback: string): string {
  const cleaned = (value ?? '').toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned || fallback;
}

/** `{venueCode}-{deptCode}-{carNumber}handover.pdf` / `...handback.pdf`, per the requested naming convention. */
export function handoverFilename(form: any, variant: 'handover' | 'handback'): string {
  const fleet = form.fleet ?? {};
  const venue = safeCode(fleet.stadium?.code, 'VEN');
  const dept = safeCode(fleet.department?.code, 'DEPT');
  const car = safeCode(fleet.carNumber, 'CAR');
  return `${venue}-${dept}-${car}${variant}.pdf`;
}

function sectionBox(doc: PDFKit.PDFDocument, title: string, draw: () => void) {
  doc.moveDown(0.5);
  const startY = doc.y;
  doc.rect(40, startY, doc.page.width - 80, 20).fill('#1f2937');
  doc.fillColor('#fff').font('Helvetica-Bold').fontSize(11).text(title, 46, startY + 5);
  doc.fillColor('#000').moveDown(1.2);
  draw();
}

/**
 * Handover & handback (return) form as a branded PDF. Renders only the phase
 * requested — `variant: 'handover'` covers the pre-use inspection + admin/
 * receiver sign-off; `'handback'` covers the after-use inspection + return
 * sign-off — so the two are downloadable (and nameable) as separate documents
 * even though both live on one HandoverForm record.
 */
export async function handoverFormPdf(
  form: any,
  variant: 'handover' | 'handback' = 'handover',
): Promise<{ buffer: Buffer; reference: string }> {
  const reference = makeReference(variant === 'handback' ? 'HBK' : 'HOF', form.id);
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
    const boxY = doc.y;
    doc.rect(40, boxY, 200, 64).stroke('#ccc');
    if (buf) {
      try { doc.image(buf, 44, boxY + 2, { fit: [192, 60] }); } catch { doc.font('Helvetica').fillColor('#000').text('[signature on file]', 46, boxY + 25); }
    } else {
      doc.font('Helvetica').fillColor('#999').text('[not signed]', 46, boxY + 25);
    }
    doc.y = boxY + 68;
    if (at || by) doc.font('Helvetica').fontSize(8).fillColor('#666').text(`${by ?? ''}${at ? `  ·  ${new Date(at).toLocaleString()}` : ''}`);
    doc.fillColor('#000');
  };

  const buffer = await renderPdf(
    {
      title: variant === 'handback' ? 'Golf Cart Handback (Return) Form' : 'Golf Cart Handover Form',
      subtitle: `Cart ${fleet.carNumber ?? '—'} · ${fleet.stadium?.name ?? '—'} (${fleet.stadium?.code ?? '—'}) · ${fleet.department?.name ?? '—'}`,
      reference,
    },
    (doc) => {
      sectionBox(doc, 'System record', () => {
        line(doc, 'Car number', fleet.carNumber);
        line(doc, 'Car type', fleet.carType);
        line(doc, 'Venue', `${fleet.stadium?.name ?? '—'}${fleet.stadium?.code ? ` (${fleet.stadium.code})` : ''}`);
        line(doc, 'Department', `${fleet.department?.name ?? '—'}${fleet.department?.code ? ` (${fleet.department.code})` : ''}`);
        line(doc, 'Assigned FA', fa.name);
        line(doc, 'FA code', fa.accreditationNumber);
        line(doc, 'FA phone', fa.phone);
        line(doc, 'Status', form.status);
      });

      if (variant === 'handover') {
        sectionBox(doc, 'Handover details', () => {
          line(doc, 'Handover date', form.handoverDate);
          line(doc, 'Approved return date', form.approvedReturnDate);
          line(doc, 'Handover location', form.handoverLocation);
          line(doc, 'Handed over to', form.handedOverTo);
          line(doc, 'Receiver contact', form.receiverContact);
          line(doc, 'Receiver licence no', form.receiverLicenseNo);
          line(doc, 'Issues / notes', form.issuesNotes);
        });
        sectionBox(doc, 'Pre-use inspection sign-off', () => {
          sig(doc, 'Admin signature (handover)', form.adminSignatureData, form.adminSignedAt, form.adminSignedByUser?.name);
          sig(doc, 'Receiver signature (handover)', form.userSignatureData, form.userSignedAt, form.userSignedByUser?.name);
        });

        if (form.finalSignatureData || form.finalName) {
          sectionBox(doc, 'Terms acknowledgement', () => {
            line(doc, 'Name', form.finalName);
            line(doc, 'Date', form.finalDate);
            sig(doc, 'Signature', form.finalSignatureData);
          });
        }
      } else {
        sectionBox(doc, 'Handback / return details', () => {
          line(doc, 'Inspection done', form.inspectionDone);
          line(doc, 'Return date', form.returnDate);
          line(doc, 'Received by', form.receivedBy);
          line(doc, 'Returned by', form.returnedBy);
          if (form.returnNotes) line(doc, 'Return notes', form.returnNotes);
        });
        sectionBox(doc, 'After-use inspection sign-off', () => {
          sig(doc, 'After-use signature (FA)', form.afteruseSignatureData, form.afteruseSignedAt, form.afteruseSignedByUser?.name);
          sig(doc, 'Admin signature (return)', form.returnAdminSigData);
          sig(doc, 'Receiver signature (return)', form.returnUserSigData);
        });
      }
    },
  );
  return { buffer, reference };
}
