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
