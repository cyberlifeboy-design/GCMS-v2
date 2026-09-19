import { prisma } from '../config/database';
import { getFileBuffer } from '../config/storage';
import { htmlToPdf, reportShell, section, kv as kvRow, sigBlock, esc } from './html-pdf.service';

export interface PdfMeta {
  title: string;
  reference: string;
  subtitle?: string;
}

/** Cleans a code to reference-safe uppercase alnum, or null when blank. */
function refPart(value: string | null | undefined): string | null {
  const cleaned = (value ?? '').toString().replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
  return cleaned || null;
}

/**
 * Appends -02, -03... only if `base` would collide with an existing reference,
 * so the common case keeps the plain readable shape and only pathological
 * same-venue/cart/month collisions grow a disambiguating suffix.
 */
export async function dedupeReference(base: string, exists: (candidate: string) => Promise<boolean>): Promise<string> {
  if (!(await exists(base))) return base;
  for (let n = 2; n < 100; n++) {
    const candidate = `${base}-${String(n).padStart(2, '0')}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base}-${Date.now()}`; // pathological fallback, never expected in practice
}

/** Handover-{venue}-{cart}-{dept}-{MM-DD} (or Handback-...) — persisted once per phase, never recomputed. */
export function buildHandoverReference(
  kind: 'Handover' | 'Handback',
  venueCode: string | null | undefined,
  cartNumber: string | null | undefined,
  deptCode: string | null | undefined,
  at: Date = new Date(),
): string {
  const mmdd = `${String(at.getMonth() + 1).padStart(2, '0')}-${String(at.getDate()).padStart(2, '0')}`;
  return [kind, refPart(venueCode) ?? 'VEN', refPart(cartNumber) ?? 'CAR', refPart(deptCode) ?? 'DEPT', mmdd].join('-');
}

/** INC-{venue}-{cart?}-{YYYY}-{MM}-{dept} — cart segment omitted when the incident has no linked cart. */
export function buildIncidentReference(
  venueCode: string | null | undefined,
  cartNumber: string | null | undefined,
  deptCode: string | null | undefined,
  at: Date = new Date(),
): string {
  const parts = ['INC', refPart(venueCode) ?? 'VEN'];
  const cart = refPart(cartNumber);
  if (cart) parts.push(cart);
  parts.push(String(at.getFullYear()), String(at.getMonth() + 1).padStart(2, '0'), refPart(deptCode) ?? 'DEPT');
  return parts.join('-');
}

/** WRN-{venue}-{dept}-{YYYY}-{MM} — a warning is issued to a person, not a cart, so no cart segment. */
export function buildWarningReference(
  venueCode: string | null | undefined,
  deptCode: string | null | undefined,
  at: Date = new Date(),
): string {
  return ['WRN', refPart(venueCode) ?? 'VEN', refPart(deptCode) ?? 'DEPT', String(at.getFullYear()), String(at.getMonth() + 1).padStart(2, '0')].join('-');
}

/** MNT-{venue}-{cart}-{dept}-{YYYY}-{MM} */
export function buildMaintenanceReference(
  venueCode: string | null | undefined,
  cartNumber: string | null | undefined,
  deptCode: string | null | undefined,
  at: Date = new Date(),
): string {
  return ['MNT', refPart(venueCode) ?? 'VEN', refPart(cartNumber) ?? 'CAR', refPart(deptCode) ?? 'DEPT', String(at.getFullYear()), String(at.getMonth() + 1).padStart(2, '0')].join('-');
}

/** {TYPE}-{venue|ALL}-{dept|ALL}-{YYYY}-{MM} — aggregate/multi-row exports spanning many venues/carts; computed fresh each time, never persisted (no single row to store it on). */
export function buildAggregateReference(
  prefix: string,
  venueCode: string | null | undefined,
  deptCode: string | null | undefined,
  at: Date = new Date(),
): string {
  return [prefix, refPart(venueCode) ?? 'ALL', refPart(deptCode) ?? 'ALL', String(at.getFullYear()), String(at.getMonth() + 1).padStart(2, '0')].join('-');
}

/** PNG magic-byte check; anything else attached is a photo so JPEG is a safe default. */
function bufferToDataUri(buf: Buffer): string {
  const isPng = buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  return `data:${isPng ? 'image/png' : 'image/jpeg'};base64,${buf.toString('base64')}`;
}

/** Fetch a stored photo (internal `/api/v1/storage/<bucket>/<file>` path or an external URL) as a Buffer for embedding. */
async function fetchPhotoBuffer(url: string): Promise<Buffer | null> {
  try {
    const internalMatch = url.match(/\/api\/v1\/storage\/([^/]+)\/(.+)$/);
    if (internalMatch) {
      const [, bucket, fileName] = internalMatch;
      return await getFileBuffer(bucket, fileName);
    }
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const res = await fetch(url);
      if (!res.ok) return null;
      return Buffer.from(await res.arrayBuffer());
    }
    return null;
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

/** Render a styled, branded, one-page-oriented PDF from a body of pre-built HTML sections. */
export async function renderPdf(meta: PdfMeta, bodyHtml: string, accent?: string): Promise<Buffer> {
  const brand = await loadBranding();
  const html = reportShell({
    title: meta.title,
    subtitle: meta.subtitle,
    reference: meta.reference,
    bodyHtml,
    accent,
  }).replace('Golf Cart Management System', esc(brand.tournamentName) + (brand.footerText ? ` · ${esc(brand.footerText)}` : ''));
  return htmlToPdf(html);
}

export async function bookingHistoryPdf(args: {
  rows: Array<Record<string, any>>;
  filterSummary: string;
  reference: string;
}): Promise<Buffer> {
  const rowsHtml = args.rows.length === 0
    ? '<p>No bookings match the selected filters.</p>'
    : `<table><thead><tr><th>Car</th><th>Venue</th><th>State</th><th>Requester</th><th>Contact</th><th>Window</th><th>Returned</th></tr></thead><tbody>${args.rows.map((r) => `
        <tr>
          <td>${esc(r.fleet?.carNumber)} <span style="color:#888">(${esc(r.fleet?.carType)})</span></td>
          <td>${esc(r.stadium?.name)}</td>
          <td>${esc(r.derivedState ?? r.status)}</td>
          <td>${esc(r.requesterName)} <span style="color:#888">· FA ${esc(r.faUser?.accreditationNumber)}</span></td>
          <td>${esc(r.requesterPhone)}<br/>${esc(r.requesterEmail)}</td>
          <td>${esc(r.bookingType)}<br/>${esc(r.startDate)} ${esc(r.startTime)} → ${esc(r.endDate)} ${esc(r.endTime)}</td>
          <td>${r.returnedAt ? `${new Date(r.returnedAt).toLocaleString()}<br/>${esc(r.returnedBy?.name)}` : '—'}</td>
        </tr>`).join('')}</tbody></table>`;
  return renderPdf(
    { title: 'Pool Booking History', subtitle: args.filterSummary, reference: args.reference },
    section('Bookings', rowsHtml),
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
  const dict = (o: Record<string, number>) =>
    Object.keys(o).length ? Object.entries(o).map(([k, v]) => `${k}: ${v}`).join(', ') : '—';

  const fleetHtml = [
    kvRow('Total pool cars', data.fleet.total),
    kvRow('By status', dict(data.fleet.byStatus)),
    kvRow('By type', dict(data.fleet.byType)),
    kvRow('Utilization', data.utilizationPct == null ? '—' : `${data.utilizationPct}%`),
    ...data.fleet.byVenue.map(v => kvRow(v.stadiumName, `${v.total} cars (${v.inUse} in use)`)),
  ].join('');
  const bookingsHtml = [
    kvRow('Total', data.bookings.total),
    kvRow('By state', dict(data.bookings.byState)),
    kvRow('Overdue now', data.bookings.overdueCount),
    kvRow('Completed', data.bookings.completedCount),
    kvRow('Avg duration (h)', data.bookings.avgDurationHours ?? '—'),
    ...data.bookings.byCar.slice(0, 15).map(c => kvRow(`Car ${c.carNumber}`, `${c.count} bookings`)),
  ].join('');
  const requestsHtml = [
    kvRow('Pending', data.requests.pending),
    kvRow('Approved', data.requests.approved),
    kvRow('Rejected', data.requests.rejected),
    kvRow('Pool-shared', data.requests.poolShared),
    kvRow('Dedicated', data.requests.dedicated),
  ].join('');

  return renderPdf(
    { title: 'Pool Car Report', subtitle: data.scope.stadiumId ? 'Venue-scoped' : 'All venues', reference: args.reference },
    section('Pool fleet', fleetHtml) + section('Bookings', bookingsHtml) + section('Requests', requestsHtml),
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
  photoUrls?: string[];
  issueDescription?: string | null;
  timeline: PdfTimelineEvent[];
}

/**
 * Maintenance fix report as a branded PDF — cart/venue, reporter, and the full
 * workflow timeline. The caller passes already-loaded data so this module stays
 * leaf-level (no maintenance-module import).
 */
export async function maintenanceReportPdf(args: { data: MaintenanceReportPdfData; reference: string }): Promise<Buffer> {
  const { data } = args;

  const photoUrls = data.photoUrls ?? [];
  const photoBuffers = (
    await Promise.all(photoUrls.map((url) => fetchPhotoBuffer(url)))
  ).filter((b): b is Buffer => !!b);

  const cartHtml = [
    kvRow('Cart number', data.carNumber),
    kvRow('Cart type', data.carType),
    kvRow('Venue', `${data.stadiumName ?? '—'}${data.stadiumCode ? ` (${data.stadiumCode})` : ''}`),
    kvRow('Current status', data.status),
    kvRow('Quotation status', data.quotationStatus),
    kvRow('Fix cost', data.fixCost == null ? '—' : `QAR ${data.fixCost.toFixed(2)}`),
    kvRow('Photos attached', data.photoCount),
  ].join('');
  const reporterHtml = [
    kvRow('Name', data.reporterName),
    kvRow('Role', data.reporterRole),
    kvRow('Contact', data.reporterPhone),
  ].join('');
  const timelineHtml = data.timeline.length === 0
    ? '<p>No timeline events.</p>'
    : data.timeline.map(e => `<div style="margin-bottom:4px;">
        <b>${esc(e.label)}</b>
        <span style="color:#666;font-size:9px;"> — ${e.at ? new Date(e.at).toLocaleString() : 'date not recorded'}${e.by ? ` · ${esc(e.by)}` : ''}</span>
        ${e.detail ? `<div style="color:#333;">${esc(e.detail)}</div>` : ''}
      </div>`).join('');
  const photosHtml = photoBuffers.length === 0 ? '' : section('Attached photos',
    `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;">${photoBuffers.map(buf =>
      `<div style="border:1px solid #ddd;border-radius:4px;height:150px;display:flex;align-items:center;justify-content:center;overflow:hidden;"><img src="${bufferToDataUri(buf)}" style="max-width:100%;max-height:100%;" /></div>`
    ).join('')}</div>`);

  return renderPdf(
    {
      title: 'Maintenance Fix Report',
      subtitle: `Cart ${data.carNumber ?? '—'} · ${data.stadiumName ?? '—'}`,
      reference: args.reference,
    },
    section('Cart & venue', cartHtml)
    + section('Reporter', reporterHtml)
    + (data.issueDescription ? section('Reported issue', `<p>${esc(data.issueDescription)}</p>`) : '')
    + section('Workflow timeline', timelineHtml)
    + photosHtml,
    '#d97706',
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

  const incidentHtml = [
    kvRow('Title', data.title),
    kvRow('Status', data.status),
    kvRow('Incident type', f?.incidentTypes?.length ? f.incidentTypes.join(', ') : '—'),
    kvRow('Occurred at', new Date(data.occurredAt).toLocaleString()),
    kvRow('Venue / location / address', f?.venueLocationAddress || data.stadiumName),
    kvRow('Cart', data.carNumber),
    kvRow('Photos attached', data.photoCount),
  ].join('') + `<p style="margin-top:4px;">${esc(data.description)}</p>`;

  const userHtml = [
    kvRow('Full name and function', f?.userFullNameFunction || data.subjectName),
    kvRow('Contact number', f?.userContact),
  ].join('');
  const witnessHtml = [
    kvRow('Full name and function', f?.witnessFullNameFunction),
    kvRow('Contact number', f?.witnessContact),
  ].join('');

  const hasInjury = f?.injury && (f.injury.firstName || f.injury.lastName || f.injury.descriptionInjury);
  const injuryHtml = !hasInjury ? '' : section('Injury / illness and treatment details', [
    kvRow('Name', `${f!.injury!.prefix ?? ''} ${f!.injury!.firstName ?? ''} ${f!.injury!.lastName ?? ''}`.trim()),
    kvRow('DOB', f!.injury!.dob),
    kvRow('Contact number', f!.injury!.contact),
    kvRow('Designation', f!.injury!.designation === 'Other' ? f!.injury!.designationOther : f!.injury!.designation),
    kvRow('Description of injury/illness', f!.injury!.descriptionInjury),
    kvRow('Treatment received', f!.injury!.treatmentReceived),
    kvRow('Treatment provided by', f!.injury!.treatmentProvidedBy),
  ].join(''));

  const reportingHtml = [
    kvRow('Incident reported to', f?.incidentReportedTo?.length ? f.incidentReportedTo.join(', ') : '—'),
    kvRow('Report completed by', f?.reportCompletedBy === 'Other' ? f.reportCompletedByOther : f?.reportCompletedBy),
    kvRow('Name', f?.reporterName || data.reporterName),
    kvRow('Job title', f?.reporterJobTitle),
    kvRow('Contact no.', f?.reporterContact),
    f?.otherInfo ? kvRow('Other relevant information', f.otherInfo) : '',
  ].join('');

  const hasChecklist = f?.checklist && Object.keys(f.checklist).length;
  const checklistHtml = !hasChecklist ? '' : section('Golf Cart/UTV investigation checklist after incident',
    Object.entries(CHECKLIST_LABELS).map(([key, label]) => {
      const v = f!.checklist?.[key];
      return v ? kvRow(label, v === 'yes' ? 'Yes' : v === 'no' ? 'No' : v) : '';
    }).join('') + (f!.checklist!.roadTestAbnormalities ? kvRow('Road test — abnormalities noted', f!.checklist!.roadTestAbnormalities) : ''));

  const signOffHtml = !data.formSignedByName ? '' : section('Sign-off', [
    kvRow('Signed by', data.formSignedByName),
    kvRow('Signed at', data.formSignedAt ? new Date(data.formSignedAt).toLocaleString() : '—'),
  ].join(''));

  const escalationHtml = !(data.escalatedToContracts || data.escalatedToMaintenance) ? '' : section('Escalation', [
    kvRow('Escalated to Contracts', data.escalatedToContracts ? 'Yes' : 'No'),
    kvRow('Escalated to Maintenance', data.escalatedToMaintenance ? 'Yes' : 'No'),
  ].join(''));

  const peopleHtml = [
    kvRow('Subject', `${data.subjectName ?? '—'}${data.subjectFaCode ? ` (FA ${data.subjectFaCode})` : ''}`),
    kvRow('Reported by', data.reporterName),
  ].join('');

  const warningsHtml = data.warnings.length === 0 ? '<p>None.</p>' : data.warnings.map(w => `
    <div style="margin-bottom:4px;">
      <b style="color:${w.revoked ? '#999' : '#000'};">${esc(w.reference)} — Level ${w.level}${w.revoked ? ' (revoked)' : ''}</b>
      <div style="color:#666;font-size:9px;">${new Date(w.issuedAt).toLocaleString()}${w.issuedBy ? ` · ${esc(w.issuedBy)}` : ''}</div>
      <div style="color:#333;">${esc(w.reason)}</div>
    </div>`).join('');

  return renderPdf(
    { title: 'Golf Cart/Utility Vehicle Incident Report Form', subtitle: data.subjectName ? `Subject: ${data.subjectName}` : undefined, reference: data.reference },
    section('Incident', incidentHtml)
    + section('User of the golf cart / UTV when the incident happened', userHtml)
    + section('Witness', witnessHtml)
    + injuryHtml
    + section('Reporting', reportingHtml)
    + checklistHtml
    + signOffHtml
    + escalationHtml
    + section('People', peopleHtml)
    + section('Warnings / tickets issued', warningsHtml),
    '#dc2626',
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
  const levelLabel = data.level === 1 ? 'Level 1 — soft warning'
    : data.level === 2 ? 'Level 2 — formal warning'
    : 'Level 3 — final warning (account blocked)';
  const body = section('Notice', [
    kvRow('Issued to', `${data.subjectName ?? '—'}${data.subjectFaCode ? ` (FA ${data.subjectFaCode})` : ''}`),
    kvRow('Issued by', data.issuedBy),
    kvRow('Issued at', new Date(data.issuedAt).toLocaleString()),
    kvRow('Warning level', data.level),
    kvRow('Cumulative active warnings', data.activeWarningCount),
    kvRow('Related incident', data.incidentReference),
    kvRow('Account status', data.blocked ? 'BLOCKED — contact the administrator' : 'Active'),
  ].join('') + `<p><b>Reason</b><br/>${esc(data.reason)}</p>
    <p style="color:#666;font-size:9px;">${esc(
      data.level >= 3
        ? 'This is a final warning. Your access to the system has been blocked. Contact the administrator to discuss reinstatement.'
        : 'Continued breaches may lead to further warnings and, at level 3, a block on your system access.',
    )}</p>`);
  return renderPdf({ title: 'Warning Notice', subtitle: levelLabel, reference: data.reference }, body, '#b45309');
}

/** `{venueCode}-{deptCode}-{carNumber}handover.pdf` / `...handback.pdf`, per the requested naming convention. */
export function handoverFilename(form: any, variant: 'handover' | 'handback'): string {
  const fleet = form.fleet ?? {};
  const venue = refPart(fleet.stadium?.code) ?? 'VEN';
  const dept = refPart(fleet.department?.code) ?? 'DEPT';
  const car = refPart(fleet.carNumber) ?? 'CAR';
  return `${venue}-${dept}-${car}${variant}.pdf`;
}

/**
 * Handover & handback (return) form as a branded PDF. Renders only the phase
 * requested — `variant: 'handover'` covers the pre-use inspection + admin/
 * receiver sign-off; `'handback'` covers the after-use inspection + return
 * sign-off — so the two are downloadable (and nameable) as separate documents
 * even though both live on one HandoverForm record. The reference is stamped
 * once (persisted on the form) the first time each phase is generated.
 */
export async function handoverFormPdf(
  form: any,
  variant: 'handover' | 'handback' = 'handover',
): Promise<{ buffer: Buffer; reference: string }> {
  const fleet = form.fleet ?? {};
  const dept = fleet.department ?? {};
  const faName = dept.focalPoint?.name ?? dept.focalPointName;
  const faPhone = dept.focalPoint?.phone ?? dept.focalPointPhone;

  const refField = variant === 'handback' ? 'handbackReference' : 'handoverReference';
  let reference: string = form[refField];
  if (!reference) {
    const base = buildHandoverReference(variant === 'handback' ? 'Handback' : 'Handover', fleet.stadium?.code, fleet.carNumber, dept.code);
    reference = await dedupeReference(base, async (candidate) =>
      (await prisma.handoverForm.count({ where: { [refField]: candidate } })) > 0);
    await prisma.handoverForm.update({ where: { id: form.id }, data: { [refField]: reference } });
  }

  const systemRecordHtml = [
    kvRow('Car number', fleet.carNumber),
    kvRow('Car type', fleet.carType),
    kvRow('Venue', `${fleet.stadium?.name ?? '—'}${fleet.stadium?.code ? ` (${fleet.stadium.code})` : ''}`),
    kvRow('Department', `${dept.name ?? '—'}${dept.code ? ` (${dept.code})` : ''}`),
    kvRow('Assigned FA', faName),
    kvRow('FA phone', faPhone),
    kvRow('Status', form.status),
  ].join('');

  let bodyHtml = section('System record', systemRecordHtml);

  if (variant === 'handover') {
    bodyHtml += section('Handover details', [
      kvRow('Handover date', form.handoverDate),
      kvRow('Approved return date', form.approvedReturnDate),
      kvRow('Handover location', form.handoverLocation),
      kvRow('Handover by (Venue Logistics Rep)', form.handoverBy),
      kvRow('Contact number (Logistics Rep)', form.handoverByContact),
      kvRow('Handed over to', form.handedOverTo),
      kvRow('Receiver contact', form.receiverContact),
      kvRow('Receiver licence no', form.receiverLicenseNo),
      kvRow('Issues / notes', form.issuesNotes),
    ].join(''));
    bodyHtml += section('Pre-use inspection sign-off',
      sigBlock('Admin signature (handover)', form.adminSignatureData, form.adminSignedAt, form.adminSignedByUser?.name)
      + sigBlock('Receiver signature (handover)', form.userSignatureData, form.userSignedAt, form.userSignedByUser?.name));
    if (form.finalSignatureData || form.finalName) {
      bodyHtml += section('Terms acknowledgement',
        kvRow('Name', form.finalName) + kvRow('Date', form.finalDate) + sigBlock('Signature', form.finalSignatureData));
    }
  } else {
    bodyHtml += section('Handback / return details', [
      kvRow('Inspection done', form.inspectionDone),
      kvRow('Return date', form.returnDate),
      kvRow('Received by', form.receivedBy),
      kvRow('Returned by', form.returnedBy),
      form.returnNotes ? kvRow('Return notes', form.returnNotes) : '',
    ].join(''));
    bodyHtml += section('After-use inspection sign-off',
      sigBlock('After-use signature (FA)', form.afteruseSignatureData, form.afteruseSignedAt, form.afteruseSignedByUser?.name)
      + sigBlock('Admin signature (return)', form.returnAdminSigData)
      + sigBlock('Receiver signature (return)', form.returnUserSigData));
  }

  const buffer = await renderPdf(
    {
      title: variant === 'handback' ? 'Golf Cart Handback (Return) Form' : 'Golf Cart Handover Form',
      subtitle: `Cart ${fleet.carNumber ?? '—'} · ${fleet.stadium?.name ?? '—'} (${fleet.stadium?.code ?? '—'}) · ${dept.name ?? '—'}`,
      reference,
    },
    bodyHtml,
    '#14a3ac',
  );
  return { buffer, reference };
}
