import { prisma } from '../../config/database';
import { uploadFile } from '../../config/storage';
import { notificationService } from '../notifications/notification.service';

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
                include: {
                    fleet: { include: { stadium: true } },
                    reportedBy: {
                        select: { id: true, name: true, phone: true, email: true, role: true },
                    },
                    approvedBy: {
                        select: { id: true, name: true, role: true },
                    },
                },
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
            include: {
                reportedBy: { select: { id: true, name: true, phone: true, email: true, role: true } },
                approvedBy: { select: { id: true, name: true, role: true } },
                fleet: { include: { stadium: true } },
            },
        });
    }

    async requestQuotation(id: string) {
        return prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'PendingQuotation',
                quotationStatus: 'Requested',
                quotationRequestedAt: new Date(),
            },
            include: {
                reportedBy: { select: { id: true, name: true, role: true } },
                fleet: { include: { stadium: true } },
            },
        });
    }

    async submitCost(id: string, fixCost: number) {
        return prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'PendingApproval',
                quotationStatus: 'Submitted',
                fixCost,
                costSubmittedAt: new Date(),
            },
            include: {
                reportedBy: { select: { id: true, name: true, role: true } },
                fleet: { include: { stadium: true } },
            },
        });
    }

    async approveCost(id: string, approvedById: string) {
        return prisma.maintenanceLog.update({
            where: { id },
            data: {
                status: 'InProgress',
                quotationStatus: 'Approved',
                costApprovedAt: new Date(),
                approvedById,
            },
            include: {
                reportedBy: { select: { id: true, name: true, role: true } },
                approvedBy: { select: { id: true, name: true, role: true } },
                fleet: { include: { stadium: true } },
            },
        });
    }

    async getByFleet(fleetId: string) {
        return prisma.maintenanceLog.findMany({
            where: { fleetId },
            include: {
                reportedBy: { select: { id: true, name: true, phone: true, role: true } },
                fleet: { include: { stadium: { select: { id: true, name: true, code: true } } } },
            },
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
        // Keep the transaction short — only atomic DB writes
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
                include: {
                    reportedBy: { select: { id: true, name: true, phone: true, role: true, stadiumId: true } },
                    fleet: { include: { stadium: true } },
                },
            });

            if (data.updateFleetStatus !== false) {
                await tx.fleet.update({
                    where: { id: data.fleetId },
                    data: { status: 'Under Maintenance' },
                });
            }

            return created;
        });

        // Send notifications outside the transaction so they can't time it out
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
        } catch (notifErr) {
            console.error('Notification failed (non-fatal):', notifErr);
        }

        return log;
    }

    async updateStatus(id: string, data: {
        status: string;
        resolutionNotes?: string;
    }) {
        const updateData: any = { status: data.status };
        if (data.resolutionNotes) updateData.resolutionNotes = data.resolutionNotes;
        if (data.status === 'Resolved') {
            updateData.resolvedAt = new Date();
        }

        return prisma.$transaction(async (tx) => {
            const log = await tx.maintenanceLog.update({
                where: { id },
                data: updateData,
                include: { fleet: true },
            });

            // When resolved, mark cart back to Available
            if (data.status === 'Resolved') {
                await tx.fleet.update({
                    where: { id: log.fleetId },
                    data: { status: 'Available' },
                });
            }

            return log;
        });
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
            r.reportedAt ? new Date(r.reportedAt).toISOString() : '',
            r.resolutionNotes || '',
            r.resolvedAt ? new Date(r.resolvedAt).toISOString() : '',
        ]);

        const header = ['ID', 'Cart Number', 'Venue', 'Reporter', 'Phone', 'Issue', 'Status', 'Reported At', 'Resolution Notes', 'Resolved At'];
        const csvLines = [header, ...rows].map(row => row.map((c: any) => `"${String(c).replace(/"/g, '""')}"`).join(','));
        return csvLines.join('\n');
    }
}

export const maintenanceService = new MaintenanceService();
