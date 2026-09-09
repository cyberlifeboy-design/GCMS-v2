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
