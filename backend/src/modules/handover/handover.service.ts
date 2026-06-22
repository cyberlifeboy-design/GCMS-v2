import { prisma } from '../../config/database';
import { notificationService } from '../notifications/notification.service';

export interface PoolStatusByStadium {
    stadiumId: string;
    stadiumName: string;
    stadiumCode: string;
    total: number;
    available: number;
    assigned: number;
    active: number;
    dispatched: number;
    returned: number;
    handbackPending: number;
    underMaintenance: number;
    carTypeBreakdown: Record<string, number>;
}

export interface PoolDashboardData {
    stadiums: PoolStatusByStadium[];
    userAssignedCarts?: Array<{
        id: string;
        carNumber: string;
        carType: string;
        status: string;
        stadiumId: string;
        stadiumName: string;
        departmentId?: string;
        departmentName?: string;
        handoverSigned: boolean;
        handoverSignedAt: Date | null;
    }>;
    recentActivity: Array<{
        id: string;
        action: string;
        carNumber: string;
        userName: string;
        timestamp: Date;
        stadiumName: string;
    }>;
}

export class HandoverService {
    /**
     * FA user signs the digital handover form
     * Changes status from 'Assigned' to 'Active'
     */
    async signHandover(data: { fleetId: string; userId: string }) {
        const vehicle = await prisma.fleet.findUnique({
            where: { id: data.fleetId },
        });

        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.assignedUserId !== data.userId) throw new Error('Vehicle is not assigned to you');
        if (vehicle.status !== 'Assigned') throw new Error(`Vehicle is not in Assigned status (Current: ${vehicle.status})`);

        return prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'HandoverSigned',
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: {
                    status: 'Active',
                    handoverSigned: true,
                    handoverSignedAt: new Date(),
                },
            });

            return log;
        });
    }

    /**
     * Start using the car
     * Changes status from 'Active' to 'Dispatched'
     */
    async checkIn(data: {
        fleetId: string;
        userId: string;
        conditionNotes?: string;
    }) {
        const vehicle = await prisma.fleet.findUnique({
            where: { id: data.fleetId },
            include: { stadium: true }
        });
        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.assignedUserId !== data.userId) throw new Error('Vehicle is not assigned to you');
        
        if (!vehicle.handoverSigned || vehicle.status !== 'Active') {
            throw new Error('Handover form must be signed before check-in');
        }

        const result = await prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckedIn',
                    conditionNotes: data.conditionNotes,
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: {
                    status: 'Dispatched',
                    checkedInAt: new Date(),
                },
            });

            return log;
        });

        // Create notification
        await notificationService.createForRoles(
            {
                type: 'CheckIn',
                title: 'Cart Usage Started',
                message: `${vehicle.carNumber} checked in by assigned user.`,
                entityType: 'HandoverLog',
                entityId: result.id,
            },
            ['SuperAdmin', 'Admin'],
            vehicle.stadiumId,
        );

        return result;
    }

    /**
     * Stop using the car
     * Changes status from 'Dispatched' to 'Returned'
     */
    async checkOut(data: {
        fleetId: string;
        userId: string;
        conditionNotes?: string;
        hasIssue?: boolean;
        issueDescription?: string;
        photosUrls?: string[];
    }) {
        const vehicle = await prisma.fleet.findUnique({
            where: { id: data.fleetId },
            include: { stadium: true }
        });
        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.status !== 'Dispatched') {
            throw new Error(`Vehicle is not Dispatched (Current status: ${vehicle.status})`);
        }

        return prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'CheckedOut',
                    conditionNotes: data.conditionNotes,
                    photosUrls: JSON.stringify(data.photosUrls || []),
                },
            });

            const nextStatus = data.hasIssue ? 'Under Maintenance' : 'Returned';
            await tx.fleet.update({
                where: { id: data.fleetId },
                data: {
                    status: nextStatus,
                    checkedInAt: null,
                },
            });

            if (data.hasIssue && data.issueDescription) {
                await tx.maintenanceLog.create({
                    data: {
                        fleetId: data.fleetId,
                        reportedById: data.userId,
                        issueDescription: data.issueDescription,
                        photosUrls: JSON.stringify(data.photosUrls || []),
                        status: 'Open',
                    },
                });
            }

            return log;
        }).then(async (log) => {
            await notificationService.createForRoles(
                {
                    type: 'CheckOut',
                    title: 'Cart Usage Ended',
                    message: `${vehicle.carNumber} checked out by user. Status: ${data.hasIssue ? 'Maintenance' : 'Returned'}.`,
                    entityType: 'HandoverLog',
                    entityId: log.id,
                },
                ['SuperAdmin', 'Admin'],
                vehicle.stadiumId,
            );
            return log;
        });
    }

    /**
     * FA User hands back the car to the Admin
     * Changes status from 'Returned' to 'HandbackPending'
     */
    async requestHandback(data: { fleetId: string; userId: string }) {
        const vehicle = await prisma.fleet.findUnique({
            where: { id: data.fleetId },
        });

        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.assignedUserId !== data.userId) throw new Error('Vehicle is not assigned to you');
        if (vehicle.status !== 'Returned') throw new Error('Vehicle must be Checked Out (Returned) before handback');

        return prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.userId,
                    action: 'HandbackRequested',
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: 'HandbackPending' },
            });

            return log;
        });
    }

    /**
     * Admin accepts the handback
     * Changes status from 'HandbackPending' (or 'Returned') to 'Available' and clears assignment
     */
    async acceptHandback(data: { fleetId: string; adminId: string }) {
        const vehicle = await prisma.fleet.findUnique({
            where: { id: data.fleetId },
        });

        if (!vehicle) throw new Error('Vehicle not found');
        if (!['Returned', 'HandbackPending'].includes(vehicle.status)) {
            throw new Error(`Vehicle cannot be released (Current status: ${vehicle.status})`);
        }

        return prisma.$transaction(async (tx) => {
            const log = await tx.handoverLog.create({
                data: {
                    fleetId: data.fleetId,
                    userId: data.adminId,
                    action: 'HandbackAccepted',
                },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: {
                    status: 'Available',
                    assignedUserId: null,
                    handoverSigned: false,
                    handoverSignedAt: null,
                },
            });

            return log;
        });
    }

    async bulkCheckIn(fleetIds: string[], userId: string) {
        const results = { success: [] as string[], failed: [] as { id: string; reason: string }[] };
        for (const fleetId of fleetIds) {
            try {
                await this.checkIn({ fleetId, userId });
                results.success.push(fleetId);
            } catch (err: any) {
                results.failed.push({ id: fleetId, reason: err.message });
            }
        }
        return results;
    }

    async bulkCheckOut(fleetIds: string[], userId: string, conditionNotes?: string) {
        const results = { success: [] as string[], failed: [] as { id: string; reason: string }[] };
        for (const fleetId of fleetIds) {
            try {
                await this.checkOut({ fleetId, userId, conditionNotes });
                results.success.push(fleetId);
            } catch (err: any) {
                results.failed.push({ id: fleetId, reason: err.message });
            }
        }
        return results;
    }

    async getHistory(filters: {
        stadiumId?: string;
        userId?: string;
        departmentId?: string;
        fleetId?: string;
        action?: string;
    }, pagination?: { page?: number; limit?: number }) {
        const page = pagination?.page || 1;
        const limit = pagination?.limit || 100;
        const skip = (page - 1) * limit;

        const where: any = {
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.action && { action: filters.action }),
        };

        if (filters.stadiumId) {
            where.fleet = { ...where.fleet, stadiumId: filters.stadiumId };
        }

        if (filters.departmentId) {
            where.fleet = { ...where.fleet, departmentId: filters.departmentId };
        }

        const [data, total] = await Promise.all([
            prisma.handoverLog.findMany({
                where,
                include: {
                    fleet: {
                        include: { stadium: { select: { id: true, name: true } } },
                    },
                    user: { select: { id: true, name: true, email: true, role: true } },
                },
                orderBy: { timestamp: 'desc' },
                skip,
                take: limit,
            }),
            prisma.handoverLog.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    async getPoolStatusByStadium(): Promise<PoolStatusByStadium[]> {
        const stadiums = await prisma.stadium.findMany({
            where: { isActive: true },
            select: { id: true, name: true, code: true },
            orderBy: { name: 'asc' },
        });

        const fleet = await prisma.fleet.findMany({
            select: {
                stadiumId: true,
                status: true,
                carType: true,
            },
        });

        const statusByStadium: Record<string, PoolStatusByStadium> = {};

        for (const stadium of stadiums) {
            statusByStadium[stadium.id] = {
                stadiumId: stadium.id,
                stadiumName: stadium.name,
                stadiumCode: stadium.code,
                total: 0,
                available: 0,
                assigned: 0,
                active: 0,
                dispatched: 0,
                returned: 0,
                handbackPending: 0,
                underMaintenance: 0,
                carTypeBreakdown: {},
            };
        }

        for (const cart of fleet) {
            const s = statusByStadium[cart.stadiumId];
            if (!s) continue;
            s.total++;
            s.carTypeBreakdown[cart.carType] = (s.carTypeBreakdown[cart.carType] || 0) + 1;
            
            if (cart.status === 'Available') s.available++;
            else if (cart.status === 'Assigned') s.assigned++;
            else if (cart.status === 'Active') s.active++;
            else if (cart.status === 'Dispatched') s.dispatched++;
            else if (cart.status === 'Returned') s.returned++;
            else if (cart.status === 'HandbackPending') s.handbackPending++;
            else if (cart.status === 'Under Maintenance') s.underMaintenance++;
        }

        return Object.values(statusByStadium);
    }

    async getPoolDashboard(user: { userId: string; role: string; stadiumId?: string; departmentId?: string }): Promise<PoolDashboardData> {
        const stadiums = await this.getPoolStatusByStadium();

        let filteredStadiums = stadiums;
        if (user.role === 'Admin' && user.stadiumId) {
            filteredStadiums = stadiums.filter(s => s.stadiumId === user.stadiumId);
        }

        let userAssignedCarts: PoolDashboardData['userAssignedCarts'] = undefined;
        if (user.role === 'FA') {
            const assigned = await prisma.fleet.findMany({
                where: { assignedUserId: user.userId },
                select: {
                    id: true,
                    carNumber: true,
                    carType: true,
                    status: true,
                    stadiumId: true,
                    stadium: { select: { name: true } },
                    departmentId: true,
                    department: { select: { name: true } },
                    handoverSigned: true,
                    handoverSignedAt: true,
                    checkedInAt: true,
                    handoverForm: { select: { id: true, status: true, adminSignatureData: true } },
                },
                orderBy: { carNumber: 'asc' },
            });

            userAssignedCarts = assigned.map(cart => ({
                id: cart.id,
                carNumber: cart.carNumber,
                carType: cart.carType,
                status: cart.status,
                stadiumId: cart.stadiumId,
                stadiumName: cart.stadium.name,
                departmentId: cart.departmentId || undefined,
                departmentName: cart.department?.name || undefined,
                handoverSigned: cart.handoverSigned,
                handoverSignedAt: cart.handoverSignedAt,
                checkedInAt: cart.checkedInAt,
                handoverFormStatus: cart.handoverForm?.status ?? null,
                handoverFormId: cart.handoverForm?.id ?? null,
            }));
        }

        const activityWhere: any = {};
        if (user.role === 'Admin' && user.stadiumId) {
            activityWhere.fleet = { stadiumId: user.stadiumId };
        } else if (user.role === 'FA') {
            activityWhere.userId = user.userId;
        }

        const recentLogs = await prisma.handoverLog.findMany({
            where: activityWhere,
            include: {
                fleet: { include: { stadium: { select: { name: true } } } },
                user: { select: { name: true } },
            },
            orderBy: { timestamp: 'desc' },
            take: 50,
        });

        return {
            stadiums: filteredStadiums,
            userAssignedCarts,
            recentActivity: recentLogs.map(log => ({
                id: log.id,
                action: log.action,
                carNumber: log.fleet?.carNumber || 'Unknown',
                userName: log.user?.name || 'Unknown',
                timestamp: log.timestamp,
                stadiumName: log.fleet?.stadium?.name || 'Unknown',
            })),
        };
    }

    async getAvailableInPool(stadiumId: string, user: { userId: string; role: string; departmentId?: string }) {
        const where: any = {
            stadiumId,
            status: { in: ['Available', 'Assigned', 'Active', 'Returned', 'HandbackPending'] },
        };

        if (user.role === 'FA') {
            where.assignedUserId = user.userId;
        }

        return prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
                assignedUser: { select: { id: true, name: true, phone: true, email: true, role: true } },
            },
            orderBy: { carNumber: 'asc' },
        });
    }

    // ── Handover Form Methods ─────────────────────────────────────────────────

    async createHandoverForm(data: {
        fleetId: string;
        adminId: string;
        serialNumber?: string;
        faCode?: string;
        handoverDate?: string;
        approvedReturnDate?: string;
        handoverLocation?: string;
        receiverLicenseNo?: string;
        handoverBy?: string;
        handedOverTo?: string;
        handoverByContact?: string;
        receiverContact?: string;
        cartTypeData?: string;
        conditionData?: string;
        additionalDrivers?: string;
        issuesNotes?: string;
        tc1?: boolean;
        tc2?: boolean;
        tc3?: boolean;
        tcData?: string;
        finalName?: string;
        finalDate?: string;
        adminSignatureData?: string;
        finalSignatureData?: string;
    }) {
        const vehicle = await prisma.fleet.findUnique({
            where: { id: data.fleetId },
            include: { assignedUser: { select: { name: true } }, stadium: { select: { name: true } }, department: { select: { name: true, code: true } } },
        });
        if (!vehicle) throw new Error('Vehicle not found');
        if (!vehicle.assignedUserId) throw new Error('Cart must be assigned to a user before creating a handover form');

        const existing = await prisma.handoverForm.findUnique({ where: { fleetId: data.fleetId } });
        if (existing && existing.status === 'COMPLETE') throw new Error('Handover already completed for this cart');

        const status = data.adminSignatureData ? 'ADMIN_SIGNED' : 'PENDING';

        if (existing) {
            return prisma.handoverForm.update({
                where: { id: existing.id },
                data: {
                    serialNumber: data.serialNumber ?? vehicle.carNumber,
                    faCode: data.faCode ?? vehicle.department?.code,
                    handoverDate: data.handoverDate,
                    approvedReturnDate: data.approvedReturnDate,
                    handoverLocation: data.handoverLocation ?? vehicle.stadium.name,
                    receiverLicenseNo: data.receiverLicenseNo,
                    handoverBy: data.handoverBy,
                    handedOverTo: data.handedOverTo ?? vehicle.assignedUser?.name,
                    handoverByContact: data.handoverByContact,
                    receiverContact: data.receiverContact,
                    cartTypeData: data.cartTypeData,
                    conditionData: data.conditionData,
                    additionalDrivers: data.additionalDrivers,
                    issuesNotes: data.issuesNotes,
                    tc1: data.tc1 ?? false,
                    tc2: data.tc2 ?? false,
                    tc3: data.tc3 ?? false,
                    tcData: data.tcData,
                    finalName: data.finalName,
                    finalDate: data.finalDate,
                    adminSignatureData: data.adminSignatureData,
                    adminSignedAt: data.adminSignatureData ? new Date() : undefined,
                    adminSignedById: data.adminSignatureData ? data.adminId : undefined,
                    finalSignatureData: data.finalSignatureData,
                    status,
                },
                include: { fleet: { select: { carNumber: true, carType: true } } },
            });
        }

        return prisma.handoverForm.create({
            data: {
                fleetId: data.fleetId,
                serialNumber: data.serialNumber ?? vehicle.carNumber,
                faCode: data.faCode ?? vehicle.department?.code,
                handoverDate: data.handoverDate,
                approvedReturnDate: data.approvedReturnDate,
                handoverLocation: data.handoverLocation ?? vehicle.stadium.name,
                receiverLicenseNo: data.receiverLicenseNo,
                handoverBy: data.handoverBy,
                handedOverTo: data.handedOverTo ?? vehicle.assignedUser?.name,
                handoverByContact: data.handoverByContact,
                receiverContact: data.receiverContact,
                cartTypeData: data.cartTypeData,
                conditionData: data.conditionData,
                additionalDrivers: data.additionalDrivers,
                issuesNotes: data.issuesNotes,
                tc1: data.tc1 ?? false,
                tc2: data.tc2 ?? false,
                tc3: data.tc3 ?? false,
                finalName: data.finalName,
                finalDate: data.finalDate,
                adminSignatureData: data.adminSignatureData,
                adminSignedAt: data.adminSignatureData ? new Date() : undefined,
                adminSignedById: data.adminSignatureData ? data.adminId : undefined,
                finalSignatureData: data.finalSignatureData,
                status,
            },
            include: { fleet: { select: { carNumber: true, carType: true } } },
        });
    }

    async getHandoverForm(fleetId: string) {
        return prisma.handoverForm.findUnique({
            where: { fleetId },
            include: {
                fleet: {
                    select: {
                        carNumber: true, carType: true,
                        stadium: { select: { name: true, code: true } },
                        department: { select: { name: true, code: true } },
                        assignedUser: { select: { name: true, email: true, phone: true, accreditationNumber: true } },
                    },
                },
                adminSignedByUser: { select: { name: true, email: true, phone: true } },
                userSignedByUser: { select: { name: true, email: true } },
            },
        });
    }

    async listForms(user: { userId: string; role: string; stadiumId?: string }, params: { page?: number; limit?: number; status?: string }) {
        const page = params.page || 1;
        const limit = Math.min(params.limit || 20, 100);
        const skip = (page - 1) * limit;

        const where: any = {};
        if (user.role === 'FA') {
            // Use userSignedById so forms remain visible even after fleet.assignedUserId is cleared on return
            where.userSignedById = user.userId;
        } else if (user.role === 'Admin' && user.stadiumId) {
            where.fleet = { stadiumId: user.stadiumId };
        }
        if (params.status) {
            where.status = params.status;
        } else {
            where.status = { in: ['COMPLETE', 'HANDBACK_PENDING', 'RETURNED'] };
        }

        const [forms, total] = await Promise.all([
            prisma.handoverForm.findMany({
                where,
                orderBy: { updatedAt: 'desc' },
                skip,
                take: limit,
                include: {
                    fleet: {
                        select: {
                            carNumber: true, carType: true,
                            stadium: { select: { name: true, code: true } },
                            assignedUser: { select: { name: true, email: true } },
                        },
                    },
                    adminSignedByUser: { select: { name: true } },
                    userSignedByUser: { select: { name: true } },
                },
            }),
            prisma.handoverForm.count({ where }),
        ]);

        return {
            data: forms,
            pagination: { total, page, limit, totalPages: Math.ceil(total / limit) },
        };
    }

    async getPendingHandovers(adminUser: { role: string; stadiumId?: string }) {
        const where: any = {
            fleet: { status: 'Assigned', assignedUserId: { not: null } },
            OR: [{ status: 'PENDING' }, { status: 'ADMIN_SIGNED' }],
        };
        if (adminUser.role === 'Admin' && adminUser.stadiumId) {
            where.fleet = { ...where.fleet, stadiumId: adminUser.stadiumId };
        }

        // Also find assigned carts without any form yet
        // NOTE: Prisma requires `{ is: null }` to check for absent relations — bare `null` is invalid filter syntax
        const fleetWhere: any = { status: 'Assigned', assignedUserId: { not: null }, handoverForm: { is: null } };
        if (adminUser.role === 'Admin' && adminUser.stadiumId) {
            fleetWhere.stadiumId = adminUser.stadiumId;
        }

        const [formsInProgress, cartsWithoutForm] = await Promise.all([
            prisma.handoverForm.findMany({
                where,
                include: {
                    fleet: {
                        select: {
                            carNumber: true, carType: true, status: true,
                            stadium: { select: { name: true, code: true } },
                            department: { select: { name: true, code: true } },
                            assignedUser: { select: { name: true, email: true, phone: true, accreditationNumber: true } },
                        },
                    },
                    adminSignedByUser: { select: { name: true } },
                    userSignedByUser: { select: { name: true } },
                },
                orderBy: { updatedAt: 'desc' },
            }),
            prisma.fleet.findMany({
                where: fleetWhere,
                select: {
                    id: true, carNumber: true, carType: true, status: true,
                    stadium: { select: { name: true, code: true } },
                    department: { select: { name: true, code: true } },
                    assignedUser: { select: { name: true, email: true, phone: true, accreditationNumber: true } },
                },
            }),
        ]);

        return { formsInProgress, cartsWithoutForm };
    }

    async userSignHandoverForm(data: { fleetId: string; userId: string; userSignatureData: string; tc1?: boolean; tc2?: boolean; tc3?: boolean; tcData?: string; finalName?: string; finalDate?: string; finalSignatureData?: string }) {
        const form = await prisma.handoverForm.findUnique({ where: { fleetId: data.fleetId } });
        if (!form) throw new Error('No handover form found for this cart. Ask your Admin to create it first.');
        if (form.status === 'COMPLETE') throw new Error('Handover form already fully signed');
        if (form.status === 'PENDING') throw new Error('Admin must sign the form before you can sign it');

        const vehicle = await prisma.fleet.findUnique({ where: { id: data.fleetId } });
        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.assignedUserId !== data.userId) throw new Error('Vehicle is not assigned to you');

        return prisma.$transaction(async (tx) => {
            const updatedForm = await tx.handoverForm.update({
                where: { id: form.id },
                data: {
                    userSignatureData: data.userSignatureData,
                    userSignedAt: new Date(),
                    userSignedById: data.userId,
                    tc1: data.tc1 ?? form.tc1,
                    tc2: data.tc2 ?? form.tc2,
                    tc3: data.tc3 ?? form.tc3,
                    tcData: data.tcData ?? form.tcData,
                    finalName: data.finalName ?? form.finalName,
                    finalDate: data.finalDate ?? form.finalDate,
                    finalSignatureData: data.finalSignatureData ?? form.finalSignatureData,
                    status: 'COMPLETE',
                },
            });

            await tx.handoverLog.create({
                data: { fleetId: data.fleetId, userId: data.userId, action: 'HandoverSigned' },
            });

            await tx.fleet.update({
                where: { id: data.fleetId },
                data: { status: 'Active', handoverSigned: true, handoverSignedAt: new Date() },
            });

            return updatedForm;
        });
    }

    async saveAfterUse(fleetId: string, userId: string, data: {
        conditionData?: string;
        additionalDrivers?: string;
        afteruseSignatureData?: string;
    }) {
        const form = await prisma.handoverForm.findUnique({ where: { fleetId } });
        if (!form) throw new Error('Handover form not found');
        if (form.status !== 'COMPLETE') throw new Error('Handover form must be fully signed before after-use submission');

        await prisma.handoverForm.update({
            where: { fleetId },
            data: {
                conditionData: data.conditionData ?? form.conditionData,
                additionalDrivers: data.additionalDrivers ?? form.additionalDrivers,
                afteruseSignatureData: data.afteruseSignatureData,
                afteruseSignedAt: new Date(),
                afteruseSignedById: userId,
                status: 'HANDBACK_PENDING',
            },
        });

        await prisma.fleet.update({
            where: { id: fleetId },
            data: { status: 'HandbackPending' },
        });

        return { success: true };
    }

    /**
     * Admin signs the return form and releases the car back to the pool.
     * Saves after-use condition + admin return signature, then clears assignment.
     */
    async adminSignReturn(fleetId: string, adminId: string, data: {
        conditionData?: string;
        returnSignatureData?: string;
        returnNotes?: string;
    }) {
        const vehicle = await prisma.fleet.findUnique({ where: { id: fleetId } });
        if (!vehicle) throw new Error('Vehicle not found');
        if (!['Returned', 'HandbackPending'].includes(vehicle.status)) {
            throw new Error(`Vehicle cannot be returned (Current status: ${vehicle.status})`);
        }

        // Update handover form with return condition and admin return signature
        await prisma.handoverForm.updateMany({
            where: { fleetId },
            data: {
                conditionData: data.conditionData ?? undefined,
                returnAdminSigData: data.returnSignatureData ?? undefined,
                returnDate: new Date().toISOString().split('T')[0],
                status: 'RETURNED',
            },
        });

        const log = await prisma.handoverLog.create({
            data: {
                fleetId,
                userId: adminId,
                action: 'HandbackAccepted',
                conditionNotes: data.returnNotes ?? undefined,
            },
        });

        await prisma.fleet.update({
            where: { id: fleetId },
            data: {
                status: 'Available',
                assignedUserId: null,
                handoverSigned: false,
                handoverSignedAt: null,
                checkedInAt: null,
            },
        });

        return log;
    }

    async getInUse(stadiumId: string, user: { userId: string; role: string }) {
        const where: any = {
            stadiumId,
            status: 'Dispatched',
        };

        if (user.role === 'FA') {
            where.assignedUserId = user.userId;
        }

        return prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true, code: true } },
                department: { select: { id: true, name: true, code: true } },
                assignedUser: { select: { id: true, name: true, phone: true, email: true, role: true } },
            },
            orderBy: { carNumber: 'asc' },
        });
    }
}

export const handoverService = new HandoverService();
