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

/**
 * Full handover & return form as a branded PDF. Takes the already-loaded form
 * (with `fleet`, `assignedUser`, signer relations) — the caller fetches it so
 * this module stays leaf-level.
 */
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
    {
      title: 'Golf Cart Handover & Return Form',
      subtitle: `Cart ${fleet.carNumber ?? '—'} · ${fleet.stadium?.name ?? '—'}`,
      reference,
    },
    (doc) => {
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('System record');
      line(doc, 'Car number', fleet.carNumber);
      line(doc, 'Car type', fleet.carType);
      line(doc, 'Venue', fleet.stadium?.name);
      line(doc, 'Department', fleet.department?.name);
      line(doc, 'Assigned FA', fa.name);
      line(doc, 'FA code', fa.accreditationNumber);
      line(doc, 'FA phone', fa.phone);
      line(doc, 'Status', form.status);
      doc.moveDown(0.6);

      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Handover details');
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
      doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Handback / return');
      line(doc, 'Inspection done', form.inspectionDone);
      line(doc, 'Return date', form.returnDate);
      line(doc, 'Received by', form.receivedBy);
      line(doc, 'Returned by', form.returnedBy);
      doc.moveDown(0.4);
      sig(doc, 'After-use signature (FA)', form.afteruseSignatureData, form.afteruseSignedAt, form.afteruseSignedByUser?.name);
      sig(doc, 'Admin signature (return)', form.returnAdminSigData);
      sig(doc, 'Receiver signature (return)', form.returnUserSigData);

      if (form.finalSignatureData || form.finalName) {
        doc.moveDown(0.6);
        doc.font('Helvetica-Bold').fontSize(11).fillColor('#000').text('Terms acknowledgement');
        line(doc, 'Name', form.finalName);
        line(doc, 'Date', form.finalDate);
        sig(doc, 'Final signature', form.finalSignatureData);
      }
    },
  );
  return { buffer, reference };
}
