import { prisma } from '../../config/database';
import { uploadFile } from '../../config/storage';
import { notificationService } from '../notifications/notification.service';

const FULL_INCLUDE = {
    fleet: { include: { stadium: true } },
    reportedBy: { select: { id: true, name: true, phone: true, email: true, role: true } },
    approvedBy: { select: { id: true, name: true, role: true } },
    contractsEscalatedBy: { select: { id: true, name: true, role: true } },
};

export class MaintenanceService {
    async getAll(filters: {
        stadiumId?: string;
        status?: string;
        fleetId?: string;
        reportedById?: string;
    }, pagination?: { page?: number; limit?: number }) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.status && { status: filters.status }),
            ...(filters.reportedById && { reportedById: filters.reportedById }),
        };

        if (filters.stadiumId) {
            where.fleet = { stadiumId: filters.stadiumId };
        }

        const [data, total] = await Promise.all([
            prisma.maintenanceLog.findMany({
                where,
                include: FULL_INCLUDE,
                orderBy: { reportedAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.maintenanceLog.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async getById(id: string) {
        return prisma.maintenanceLog.findUnique({
            where: { id },
            include: FULL_INCLUDE,
        });
    }

    async getByFleet(fleetId: string) {
        return prisma.maintenanceLog.findMany({
            where: { fleetId },
            include: FULL_INCLUDE,
            orderBy: { reportedAt: 'desc' },
        });
    }

    async reportIssue(data: {
        fleetId: string;
        reportedById: string;
        issueType?: string;
        issueDescription: string;
        photosUrls?: string[];
        updateFleetStatus?: boolean;
    }) {
        const log = await prisma.$transaction(async (tx) => {
            const created = await tx.maintenanceLog.create({
                data: {
                    fleetId: data.fleetId,
                    reportedById: data.reportedById,
                    issueType: data.issueType || null,
                    issueDescription: data.issueDescription,
                    photosUrls: JSON.stringify(data.photosUrls || []),
                    status: 'Open',
                },
                include: FULL_INCLUDE,
            });

            if (data.updateFleetStatus !== false) {
                await tx.fleet.update({
                    where: { id: data.fleetId },
                    data: { status: 'Under Maintenance' },
                });
            }

            return created;
        });

        try {
            const stadiumId = log.fleet?.stadiumId;
            const issueLabel = data.issueType ? `[${data.issueType}] ` : '';
            const shortDesc = data.issueDescription.length > 80 ? data.issueDescription.substring(0, 80) + '...' : data.issueDescription;
            await notificationService.createForRoles(
                {
                    type: 'IssueReported',
                    title: `Issue Reported — ${log.fleet?.carNumber || 'Cart'}`,
                    message: `${issueLabel}${shortDesc}`,
                    entityType: 'MaintenanceLog',
                    entityId: log.id,
                },
                ['SuperAdmin', 'Admin'],
                stadiumId || undefined,
            );
        } catch (err) {
            console.error('Notification failed (non-fatal):', err);
        }

        return log;
    }

    // Admin escalates an issue to Contracts for fix request
    async escalateToContracts(id: string, escalatedById: string) {
        const existing = await prisma.maintenanceLog.findUnique({ where: { id }, include: FULL_INCLUDE });
        if (!existing) throw new Error('Issue not found');
        if (existing.contractsEscalatedAt) throw new Error('Already escalated to Contracts');

        const log = await prisma.maintenanceLog.update({
            where: { id },
            data: {
                contractsEscalatedAt: new Date(),
                contractsEscalatedById: escalatedById,
            },
            include: FULL_INCLUDE,
        });

        try {
            await notificationService.createForRoles(
                {
                    type: 'IssueReported',
                    title: `Fix Request — ${log.fleet?.carNumber || 'Cart'}`,
                    message: `Admin has escalated a maintenance issue to Contracts: ${existing.issueDescription.substring(0, 80)}`,
                    entityType: 'MaintenanceLog',
                    entityId: log.id,
                },
                ['Contracts'],
                log.fleet?.stadiumId || undefined,
            );
        } catch (err) {
            console.error('Notification failed:', err);
        }

        return log;
    }

    // Contracts requests quotation from Maintenance Team
    async requestQuotation(id: string) {
        const log = await prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'PendingQuotation',
                quotationStatus: 'Requested',
                quotationRequestedAt: new Date(),
            },
            include: FULL_INCLUDE,
        });

        try {
            await notificationService.createForRoles(
                {
                    type: 'IssueReported',
                    title: `Quotation Requested — ${log.fleet?.carNumber || 'Cart'}`,
                    message: `Contracts has requested a quotation for: ${log.issueDescription.substring(0, 80)}`,
                    entityType: 'MaintenanceLog',
                    entityId: log.id,
                },
                ['MaintenanceTeam'],
                log.fleet?.stadiumId || undefined,
            );
        } catch (err) {
            console.error('Notification failed:', err);
        }

        return log;
    }

    // Maintenance Team submits full quotation details
    async submitCost(id: string, data: {
        fixCost: number;
        quotationDescription: string;
        quotationTimeline?: string;
    }) {
        const log = await prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'PendingApproval',
                quotationStatus: 'Submitted',
                fixCost: data.fixCost,
                quotationDescription: data.quotationDescription,
                quotationTimeline: data.quotationTimeline,
                costSubmittedAt: new Date(),
            },
            include: FULL_INCLUDE,
        });

        // Notify Contracts and Admin
        try {
            const stadiumId = log.fleet?.stadiumId;
            await Promise.all([
                notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Quotation Submitted — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `Maintenance has submitted a quotation of QAR ${data.fixCost.toFixed(2)} for approval.`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['Contracts'],
                    stadiumId || undefined,
                ),
                notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Quotation Received — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `A quotation of QAR ${data.fixCost.toFixed(2)} has been submitted and is awaiting Contracts approval.`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['Admin', 'SuperAdmin'],
                    stadiumId || undefined,
                ),
            ]);
        } catch (err) {
            console.error('Notification failed:', err);
        }

        return log;
    }

    // Contracts approves the quotation — Maintenance can proceed
    async approveCost(id: string, approvedById: string) {
        const log = await prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'InProgress',
                quotationStatus: 'Approved',
                costApprovedAt: new Date(),
                approvedById,
            },
            include: FULL_INCLUDE,
        });

        try {
            const stadiumId = log.fleet?.stadiumId;
            await Promise.all([
                notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Quotation Approved — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `Your quotation of QAR ${log.fixCost?.toFixed(2)} has been approved. Please proceed with the fix.`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['MaintenanceTeam'],
                    stadiumId || undefined,
                ),
                notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Fix Approved — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `The quotation of QAR ${log.fixCost?.toFixed(2)} has been approved by Contracts. Fix is now in progress.`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['Admin', 'SuperAdmin'],
                    stadiumId || undefined,
                ),
            ]);
        } catch (err) {
            console.error('Notification failed:', err);
        }

        return log;
    }

    // Contracts rejects the quotation — status goes back to Open for admin re-evaluation
    async rejectQuotation(id: string, rejectionReason: string, rejectedById: string) {
        const log = await prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'Open',
                quotationStatus: 'Rejected',
                rejectionReason,
                rejectedAt: new Date(),
            },
            include: FULL_INCLUDE,
        });

        try {
            const stadiumId = log.fleet?.stadiumId;
            await Promise.all([
                notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Quotation Rejected — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `Contracts has rejected the quotation. Reason: ${rejectionReason}. Please re-evaluate.`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['Admin', 'SuperAdmin'],
                    stadiumId || undefined,
                ),
                notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Quotation Rejected — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `Contracts rejected your quotation. Reason: ${rejectionReason}.`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['MaintenanceTeam'],
                    stadiumId || undefined,
                ),
            ]);
        } catch (err) {
            console.error('Notification failed:', err);
        }

        return log;
    }

    async updateStatus(id: string, data: { status: string; resolutionNotes?: string }) {
        const updateData: any = { status: data.status };
        if (data.resolutionNotes) updateData.resolutionNotes = data.resolutionNotes;
        if (data.status === 'Resolved') {
            updateData.resolvedAt = new Date();
        }

        const log = await prisma.$transaction(async (tx) => {
            const updated = await tx.maintenanceLog.update({
                where: { id },
                data: updateData,
                include: FULL_INCLUDE,
            });

            if (data.status === 'Resolved') {
                await tx.fleet.update({
                    where: { id: updated.fleetId },
                    data: { status: 'Available' },
                });
            }

            return updated;
        });

        // Notify admin when resolved
        if (data.status === 'Resolved') {
            try {
                await notificationService.createForRoles(
                    {
                        type: 'IssueReported',
                        title: `Issue Resolved — ${log.fleet?.carNumber || 'Cart'}`,
                        message: `Maintenance issue resolved. ${data.resolutionNotes ? 'Notes: ' + data.resolutionNotes : ''}`,
                        entityType: 'MaintenanceLog',
                        entityId: log.id,
                    },
                    ['Admin', 'SuperAdmin'],
                    log.fleet?.stadiumId || undefined,
                );
            } catch (err) {
                console.error('Notification failed:', err);
            }
        }

        return log;
    }

    async uploadPhotos(filenames: string[], buffers: Buffer[]): Promise<string[]> {
        const urls: string[] = [];
        for (let i = 0; i < filenames.length; i++) {
            try {
                const url = await uploadFile('maintenance-photos', filenames[i], buffers[i], 'image/jpeg');
                urls.push(url);
            } catch (err) {
                console.error(`Failed to upload ${filenames[i]}:`, err);
            }
        }
        return urls;
    }

    async exportToCsv(filters: { stadiumId?: string; status?: string }): Promise<string> {
        const data = await this.getAll(filters, { limit: 10000 });
        const rows = data.data.map((r: any) => [
            r.id,
            r.fleet?.carNumber || '',
            r.fleet?.stadium?.name || '',
            r.reportedBy?.name || '',
            r.reportedBy?.phone || '',
            r.issueDescription,
            r.status,
            r.fixCost ? `QAR ${r.fixCost.toFixed(2)}` : '',
            r.quotationDescription || '',
            r.quotationTimeline || '',
            r.reportedAt ? new Date(r.reportedAt).toISOString() : '',
            r.resolutionNotes || '',
            r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '',
        ]);

        const header = ['ID', 'Cart Number', 'Venue', 'Reporter', 'Phone', 'Issue', 'Status', 'Fix Cost (QAR)', 'Quotation Description', 'Timeline', 'Reported At', 'Resolution Notes', 'Resolved At'];
        const csvLines = [header, ...rows].map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','));
        return csvLines.join('\n');
    }

    // Generate full HTML report for PDF download (Contracts)
    async generatePdfReport(id: string, apiBaseUrl: string): Promise<string> {
        const log = await prisma.maintenanceLog.findUnique({
            where: { id },
            include: FULL_INCLUDE,
        });
        if (!log) throw new Error('Issue not found');

        const photos: string[] = log.photosUrls ? JSON.parse(log.photosUrls as string) : [];
        const photoSection = photos.length > 0
            ? `<div style="margin-top:1.5rem;">
                <div class="section-title">ATTACHED PHOTOS</div>
                <div style="display:flex;flex-wrap:wrap;gap:12px;padding:0.5rem 1rem;">
                    ${photos.map(url => `<img src="${url.startsWith('http') ? url : apiBaseUrl + url}" style="max-width:200px;max-height:160px;object-fit:cover;border:1px solid #cbd5e1;border-radius:4px;" />`).join('')}
                </div>
               </div>`
            : '';

        // Fetch branding
        const settings = await prisma.systemSettings.findFirst();
        const logoUrl = settings?.logoUrl
            ? (settings.logoUrl.startsWith('http') ? settings.logoUrl : `${apiBaseUrl}${settings.logoUrl}`)
            : '';
        const tournamentName = settings?.tournamentName || 'Golf Cart Management System';
        const footerText = settings?.footerText || tournamentName;

        const statusColor: Record<string, string> = {
            'Open': '#ef4444',
            'PendingQuotation': '#f97316',
            'PendingApproval': '#3b82f6',
            'InProgress': '#eab308',
            'Resolved': '#22c55e',
        };

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Maintenance Report — ${log.fleet?.carNumber || ''}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', sans-serif; background: #f1f5f9; color: #1e293b; }
  .page { max-width: 900px; margin: 2rem auto; background: white; padding: 2.5rem; border-radius: 8px; box-shadow: 0 4px 16px rgba(0,0,0,0.1); }
  .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #1e293b; padding-bottom: 1.5rem; margin-bottom: 1.5rem; }
  .logo img { height: 56px; width: auto; object-fit: contain; }
  .title-block { text-align: center; }
  .title-block h1 { font-size: 1.1rem; font-weight: 800; text-transform: uppercase; }
  .title-block p { font-size: 0.7rem; color: #64748b; margin-top: 4px; }
  .ref-block { text-align: right; font-size: 0.72rem; color: #64748b; }
  .section-title { background: #1e293b; color: white; padding: 0.4rem 1rem; font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 0.75rem; }
  .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem 2rem; padding: 0.5rem 1rem; margin-bottom: 1.25rem; }
  .info-grid.three { grid-template-columns: 1fr 1fr 1fr; }
  .field label { font-size: 0.6rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; display: block; }
  .field span { font-size: 0.82rem; font-weight: 500; display: block; border-bottom: 1px solid #e2e8f0; padding-bottom: 2px; margin-top: 2px; }
  .description-box { margin: 0 1rem 1.25rem; padding: 0.75rem; border: 1px solid #e2e8f0; border-radius: 4px; font-size: 0.82rem; line-height: 1.6; background: #f8fafc; min-height: 60px; }
  .status-badge { display: inline-block; padding: 0.25rem 0.75rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; color: white; }
  .cost-highlight { background: #f0fdf4; border: 2px solid #22c55e; border-radius: 8px; padding: 1rem 1.5rem; margin: 0 1rem 1.25rem; display: flex; align-items: center; justify-content: space-between; }
  .cost-highlight .amount { font-size: 1.5rem; font-weight: 800; color: #16a34a; }
  .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; text-align: center; font-size: 0.65rem; color: #94a3b8; }
  @media print { body { background: white; } .page { margin: 0; box-shadow: none; padding: 1rem; } }
</style>
</head>
<body>
<div class="page">
  <div class="header">
    <div class="logo">
      ${logoUrl ? `<img src="${logoUrl}" alt="Logo">` : `<div style="font-weight:800;font-size:1rem;">${tournamentName}</div>`}
    </div>
    <div class="title-block">
      <h1>Maintenance Fix Report</h1>
      <p>${tournamentName}</p>
    </div>
    <div class="ref-block">
      <div>Report ID</div>
      <div style="font-weight:700;font-size:0.8rem;">${log.id.slice(-8).toUpperCase()}</div>
      <div style="margin-top:4px;">Generated</div>
      <div style="font-weight:600;">${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</div>
    </div>
  </div>

  <!-- Status -->
  <div style="display:flex;align-items:center;gap:1rem;padding:0 1rem;margin-bottom:1.25rem;">
    <span class="status-badge" style="background:${statusColor[log.status] || '#64748b'}">${log.status}</span>
    ${log.quotationStatus ? `<span style="font-size:0.78rem;color:#64748b;">Quotation: <strong>${log.quotationStatus}</strong></span>` : ''}
  </div>

  <!-- Cart Details -->
  <div class="section-title">1. Cart &amp; Venue Information</div>
  <div class="info-grid three">
    <div class="field"><label>Cart Number</label><span>${log.fleet?.carNumber || '—'}</span></div>
    <div class="field"><label>Cart Type</label><span>${log.fleet?.carType || '—'}</span></div>
    <div class="field"><label>Venue / Stadium</label><span>${log.fleet?.stadium?.name || '—'} (${log.fleet?.stadium?.code || ''})</span></div>
  </div>

  <!-- Issue Details -->
  <div class="section-title">2. Issue Details</div>
  <div class="info-grid">
    <div class="field"><label>Issue Type</label><span>${log.issueType || '—'}</span></div>
    <div class="field"><label>Reported By</label><span>${log.reportedBy?.name || '—'} (${log.reportedBy?.role || ''})</span></div>
    <div class="field"><label>Reporter Contact</label><span>${log.reportedBy?.phone || '—'}</span></div>
    <div class="field"><label>Reported On</label><span>${log.reportedAt ? new Date(log.reportedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}</span></div>
  </div>
  <div class="description-box">${log.issueDescription}</div>

  <!-- Escalation -->
  ${log.contractsEscalatedAt ? `
  <div class="section-title">3. Escalation to Contracts</div>
  <div class="info-grid">
    <div class="field"><label>Escalated By</label><span>${log.contractsEscalatedBy?.name || '—'}</span></div>
    <div class="field"><label>Escalated On</label><span>${new Date(log.contractsEscalatedAt).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}</span></div>
  </div>` : ''}

  <!-- Quotation -->
  ${log.fixCost !== null && log.fixCost !== undefined ? `
  <div class="section-title">4. Maintenance Quotation</div>
  <div class="cost-highlight">
    <div>
      <div style="font-size:0.7rem;color:#64748b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em;">Fix Cost</div>
      <div class="amount">QAR ${log.fixCost.toFixed(2)}</div>
    </div>
    ${log.quotationTimeline ? `<div style="text-align:right;"><div style="font-size:0.7rem;color:#64748b;font-weight:700;text-transform:uppercase;">Estimated Timeline</div><div style="font-size:1rem;font-weight:700;">${log.quotationTimeline}</div></div>` : ''}
  </div>
  ${log.quotationDescription ? `<div class="description-box"><strong>Work Description:</strong><br>${log.quotationDescription}</div>` : ''}
  <div class="info-grid">
    ${log.costSubmittedAt ? `<div class="field"><label>Quotation Submitted</label><span>${new Date(log.costSubmittedAt).toLocaleDateString('en-GB')}</span></div>` : ''}
    ${log.costApprovedAt ? `<div class="field"><label>Approved On</label><span>${new Date(log.costApprovedAt).toLocaleDateString('en-GB')}</span></div>` : ''}
    ${log.approvedBy ? `<div class="field"><label>Approved By</label><span>${log.approvedBy.name}</span></div>` : ''}
  </div>` : ''}

  <!-- Rejection -->
  ${log.rejectionReason ? `
  <div class="section-title" style="background:#ef4444;">Quotation Rejected</div>
  <div class="description-box" style="border-color:#fca5a5;background:#fef2f2;color:#991b1b;">${log.rejectionReason}</div>` : ''}

  <!-- Resolution -->
  ${log.resolutionNotes ? `
  <div class="section-title" style="background:#16a34a;">Resolution Notes</div>
  <div class="description-box" style="border-color:#86efac;background:#f0fdf4;">${log.resolutionNotes}</div>` : ''}

  <!-- Photos -->
  ${photoSection}

  <div class="footer">${footerText} &nbsp;|&nbsp; Maintenance Report &nbsp;|&nbsp; Printed ${new Date().toLocaleDateString('en-GB')}</div>
</div>
<script>window.onload = function() { window.print(); }</script>
</body>
</html>`;

        return html;
    }
}

export const maintenanceService = new MaintenanceService();
