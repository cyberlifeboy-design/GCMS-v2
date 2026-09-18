import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuditLogFilters, HandoverFilters, MaintenanceFilters } from '../../types';
import { deriveBookingState } from '../pool-booking-requests/booking-state';
import { summarizePoolBookings, PoolBookingSummary } from './pool-report';
import { buildPublicBookerRows, PublicBookerRow } from './public-bookers';
import { possessionMinutes, formatDuration } from './fa-trail-detail';

interface ActivityLog {
    action: string;
    createdAt: Date;
}

interface StadiumReport {
    id: string;
    name: string;
    code: string;
    location: string;
    totalCarts: number;
    cartsByStatus: Record<string, number>;
    cartsByType: Record<string, number>;
    vapCarts: number;
    activeFAs: number;
    openIssues: number;
    recentActivity: {
        checkIns: number;
        checkOuts: number;
    };
}

interface DepartmentReport {
    id: string;
    name: string;
    code: string | null;
    stadium: { id: string; name: string };
    totalCarts: number;
    cartsByStatus: Record<string, number>;
    assignedFAs: number;
    activeFAs: number;
    handoverActivity: {
        checkIns: number;
        checkOuts: number;
    };
}

interface UserReport {
    id: string;
    name: string;
    email: string;
    role: string;
    stadium: { id: string; name: string; code: string } | null;
    department: { id: string; name: string; code: string | null } | null;
    isActive: boolean;
    assignedCarts: number;
    cartDetails: Array<{
        id: string;
        carNumber: string;
        carType: string;
        status: string;
    }>;
    activitySummary: {
        totalCheckIns: number;
        totalCheckOuts: number;
        issuesReported: number;
        lastActivity: Date | null;
    };
}

interface ActiveCarUsage {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    faName: string;
    faContact: string | null;
    faDepartment: string | null;
    stadium: { id: string; name: string };
    checkedInAt: Date;
}

export interface PoolReport {
    scope: { stadiumId: string | null };
    fleet: {
        total: number;
        byStatus: Record<string, number>;
        byType: Record<string, number>;
        byVenue: Array<{ stadiumName: string; total: number; inUse: number }>;
    };
    bookings: PoolBookingSummary;
    requests: { pending: number; approved: number; rejected: number; poolShared: number; dedicated: number };
    utilizationPct: number | null;
}

export class ReportsService {
    private prisma: PrismaClient;

    constructor() {
        this.prisma = prisma;
    }

    async getAuditLogs(filters: AuditLogFilters) {
        return this.prisma.auditLog.findMany({
            where: {
                ...(filters.userId && { userId: filters.userId }),
                ...(filters.action && { action: filters.action }),
                ...(filters.entityType && { entityType: filters.entityType }),
                ...(filters.startDate && filters.endDate && {
                    timestamp: {
                        gte: filters.startDate,
                        lte: filters.endDate,
                    },
                }),
            },
            orderBy: { timestamp: 'desc' },
        });
    }

    async getFaAuditTrail(filters: { stadiumId?: string; userId?: string; startDate?: Date; endDate?: Date; limit?: number; offset?: number }) {
        // Build where clause for handover logs (FA's primary activity)
        const handoverWhere: any = {
            user: { role: 'FA' },
        };
        if (filters.stadiumId) handoverWhere.fleet = { stadiumId: filters.stadiumId };
        if (filters.userId) handoverWhere.userId = filters.userId;
        if (filters.startDate || filters.endDate) {
            handoverWhere.timestamp = {
                ...(filters.startDate && { gte: filters.startDate }),
                ...(filters.endDate && { lte: filters.endDate }),
            };
        }

        const [handoverLogs, total] = await Promise.all([
            this.prisma.handoverLog.findMany({
                where: handoverWhere,
                include: {
                    fleet: {
                        select: {
                            carNumber: true,
                            carType: true,
                            checkedInAt: true,
                            stadium: { select: { id: true, name: true, code: true } },
                            department: { select: { code: true, name: true } },
                            handoverForm: { select: { adminSignedAt: true, userSignedAt: true, afteruseSignedAt: true } },
                        },
                    },
                    user: {
                        select: {
                            id: true,
                            name: true,
                            email: true,
                            role: true,
                            accreditationNumber: true,
                            department: { select: { code: true, name: true } },
                        },
                    },
                },
                orderBy: { timestamp: 'desc' },
                skip: filters.offset || 0,
                take: filters.limit || 50,
            }),
            this.prisma.handoverLog.count({ where: handoverWhere }),
        ]);

        // Latest check-out timestamp per fleet among this page (for possession calc)
        const fleetIds = [...new Set(handoverLogs.map(l => l.fleetId))];
        const checkOutLogs = fleetIds.length
            ? await this.prisma.handoverLog.findMany({
                where: { fleetId: { in: fleetIds }, action: 'CheckedOut' },
                orderBy: [{ fleetId: 'asc' }, { timestamp: 'desc' }],
                select: { fleetId: true, timestamp: true },
            })
            : [];
        const latestCheckOutMap = new Map<string, Date>();
        for (const l of checkOutLogs) {
            if (!latestCheckOutMap.has(l.fleetId)) latestCheckOutMap.set(l.fleetId, l.timestamp);
        }

        return {
            logs: handoverLogs.map(log => {
                const checkedInAt = log.fleet.checkedInAt ?? null;
                const checkOutAt = log.action === 'CheckedOut' ? log.timestamp : (latestCheckOutMap.get(log.fleetId) ?? null);
                const pm = possessionMinutes(checkedInAt, checkOutAt);
                return {
                    id: log.id,
                    action: log.action,
                    timestamp: log.timestamp,
                    fa: {
                        id: log.user.id,
                        name: log.user.name,
                        email: log.user.email,
                        accreditationNumber: log.user.accreditationNumber,
                        departmentCode: log.user.department?.code || null,
                        departmentName: log.user.department?.name || null,
                    },
                    car: {
                        carNumber: log.fleet.carNumber,
                        carType: log.fleet.carType,
                    },
                    stadium: {
                        id: log.fleet.stadium.id,
                        name: log.fleet.stadium.name,
                        code: log.fleet.stadium.code,
                    },
                    departmentCode: log.fleet.department?.code || log.user.department?.code || null,
                    conditionNotes: log.conditionNotes || null,
                    checkedInAt,
                    checkOutAt,
                    handoverSignedAt: log.fleet.handoverForm?.adminSignedAt ?? null,
                    userSignedAt: log.fleet.handoverForm?.userSignedAt ?? null,
                    afteruseSignedAt: log.fleet.handoverForm?.afteruseSignedAt ?? null,
                    possessionMinutes: pm,
                    possessionLabel: formatDuration(pm),
                };
            }),
            total,
        };
    }

    async getHandoverReports(filters: HandoverFilters) {
        const where: any = {
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.userId && { userId: filters.userId }),
            ...(filters.action && { action: filters.action }),
            ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
            ...(filters.startDate && filters.endDate && {
                timestamp: {
                    gte: filters.startDate,
                    lte: filters.endDate,
                },
            }),
        };

        return this.prisma.handoverLog.findMany({
            where,
            include: {
                fleet: { include: { handoverForm: { select: { adminSignedAt: true } } } },
                user: { select: { name: true, email: true } },
            },
            orderBy: { timestamp: 'desc' },
        });
    }

    async getMaintenanceReports(filters: MaintenanceFilters) {
        const where: any = {
            ...(filters.fleetId && { fleetId: filters.fleetId }),
            ...(filters.status && { status: filters.status }),
            ...(filters.reportedById && { reportedById: filters.reportedById }),
            ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
        };

        return this.prisma.maintenanceLog.findMany({
            where,
            include: {
                fleet: true,
            },
            orderBy: { reportedAt: 'desc' },
        });
    }

    async getDashboardStats(filters: { stadiumId?: string } = {}) {
        const where = filters.stadiumId ? { stadiumId: filters.stadiumId } : {};

        // 1. Fleet Overview by Type
        const fleetByType = await this.prisma.fleet.groupBy({
            by: ['carType'],
            where,
            _count: { _all: true },
        });

        // 2. Cart Status Summary — an idle pool car (isPool + status 'Available') is called
        // out as its own "Pool" slice instead of hiding inside "Available"; a pool car that's
        // actually assigned/checked out still shows under its real status like any other cart.
        const fleetByStatusRaw = await this.prisma.fleet.groupBy({
            by: ['status'],
            where: { ...where, OR: [{ isPool: false }, { status: { not: 'Available' } }] },
            _count: { _all: true },
        });
        const poolAvailableCount = await this.prisma.fleet.count({
            where: { ...where, isPool: true, status: 'Available' },
        });
        const fleetByStatus = poolAvailableCount > 0
            ? [...fleetByStatusRaw, { status: 'Pool', _count: { _all: poolAvailableCount } }]
            : fleetByStatusRaw;

        // 3. Active Users
        const activeUsersCount = await this.prisma.user.count({
            where: {
                role: 'FA',
                isActive: true,
                ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            },
        });

        // 4. Activity Timeline
        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const activityLogs = await this.prisma.handoverLog.findMany({
            where: {
                createdAt: { gte: sevenDaysAgo },
                ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
            },
            select: { action: true, createdAt: true },
        });

        // 5. Open Issues Log
        const openIssuesCount = await this.prisma.maintenanceLog.count({
            where: {
                status: { in: ['Open', 'InProgress'] },
                ...(filters.stadiumId && { fleet: { stadiumId: filters.stadiumId } }),
            },
        });

        // 6. VAP Carts Summary
        const vapCarts = await this.prisma.fleet.count({
            where: {
                ...where,
                requiresVAP: true,
            },
        });

        // 7. Stadium Information
        const activeStadiums = await this.prisma.stadium.findMany({
            where: { isActive: true, ...(filters.stadiumId && { id: filters.stadiumId }) },
            select: {
                id: true,
                name: true,
                code: true,
                location: true,
                latitude: true,
                longitude: true,
                _count: {
                    select: { fleet: true, users: { where: { role: 'FA', isActive: true } } },
                },
            },
            orderBy: { name: 'asc' },
        });

        // Get fleet type breakdown per stadium (grouped by carType)
        const stadiumFleetByType = await this.prisma.fleet.groupBy({
            by: ['stadiumId', 'carType'],
            where: { stadium: { isActive: true } },
            _count: { _all: true },
        });

        // Build stadium list with fleet breakdown by car type
        const stadiumTypeMap = new Map<string, Record<string, number>>();
        stadiumFleetByType.forEach(stat => {
            if (!stadiumTypeMap.has(stat.stadiumId)) {
                stadiumTypeMap.set(stat.stadiumId, {});
            }
            stadiumTypeMap.get(stat.stadiumId)![stat.carType] = stat._count._all;
        });

        const stadiumsList = activeStadiums.map(stadium => ({
            id: stadium.id,
            name: stadium.name,
            code: stadium.code,
            location: stadium.location,
            latitude: stadium.latitude,
            longitude: stadium.longitude,
            totalCarts: stadium._count.fleet,
            activeFAs: stadium._count.users,
            fleetBreakdown: stadiumTypeMap.get(stadium.id) || {},
        }));

        // 8. FA Fleet Overview
        const faUsers = await this.prisma.user.findMany({
            where: {
                role: 'FA',
                isActive: true,
                ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            },
            select: {
                id: true,
                name: true,
                email: true,
                stadiumId: true,
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                _count: { select: { assignedCarts: true } },
            },
            orderBy: { name: 'asc' },
        });

        // Get assigned carts details per FA
        const faFleetOverview = await Promise.all(
            faUsers.map(async (fa) => {
                const assignedCarts = await this.prisma.fleet.findMany({
                    where: { assignedUserId: fa.id },
                    select: {
                        id: true,
                        carNumber: true,
                        carType: true,
                        status: true,
                    },
                });
                return {
                    id: fa.id,
                    name: fa.name,
                    email: fa.email,
                    stadium: fa.stadium,
                    department: fa.department,
                    totalAssigned: fa._count.assignedCarts,
                    carts: assignedCarts,
                };
            })
        );

        // 9. Pool bookings today (available / in use / overdue)
        const poolCartCount = await this.prisma.fleet.count({
            where: { ...where, isPool: true },
        });
        const liveBookings = await this.prisma.poolBookingRequest.findMany({
            where: {
                status: 'Approved',
                returnedAt: null,
                ...(filters.stadiumId ? { stadiumId: filters.stadiumId } : {}),
            },
            select: { startDate: true, endDate: true, startTime: true, endTime: true, status: true, returnedAt: true },
        });
        const nowPool = new Date();
        const todayStr = nowPool.toISOString().slice(0, 10);
        let booked = 0;
        let overdue = 0;
        let bookingsToday = 0;
        for (const b of liveBookings) {
            const s = deriveBookingState(b, nowPool);
            if (s === 'Active') booked++;
            if (s === 'Overdue') overdue++;
            if (b.startDate <= todayStr && b.endDate >= todayStr) bookingsToday++;
        }
        const poolToday = {
            bookings: bookingsToday,
            available: Math.max(0, poolCartCount - booked),
            booked,
            overdue,
        };

        return {
            fleetByType: fleetByType.map(f => ({ type: f.carType, count: f._count._all })),
            fleetByStatus: fleetByStatus.map(f => ({ status: f.status, count: f._count._all })),
            activeUsersCount,
            openIssuesCount,
            vapCartsCount: vapCarts,
            activityTimeline: this.processActivityTimeline(activityLogs),
            // New fields for stadium and FA fleet
            activeStadiumsCount: activeStadiums.length,
            stadiums: stadiumsList,
            faFleetOverview,
            poolToday,
        };
    }

    private processActivityTimeline(logs: ActivityLog[]) {
        const timeline: Record<string, { checkIn: number, checkOut: number }> = {};

        // Initialize last 7 days
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().split('T')[0];
            timeline[dateStr] = { checkIn: 0, checkOut: 0 };
        }

        logs.forEach(log => {
            const dateStr = new Date(log.createdAt).toISOString().split('T')[0];
            if (timeline[dateStr]) {
                if (log.action === 'CheckedIn') timeline[dateStr].checkIn++;
                else if (log.action === 'CheckedOut') timeline[dateStr].checkOut++;
            }
        });

        return Object.entries(timeline).map(([date, counts]) => ({ date, ...counts }));
    }

    async getFleetList(filters: { stadiumId?: string; departmentId?: string; status?: string; carType?: string | string[] } = {}) {
        const where: any = {
            ...(filters.stadiumId && { stadiumId: filters.stadiumId }),
            ...(filters.departmentId && { departmentId: filters.departmentId }),
            ...(filters.status && { status: filters.status }),
            ...(filters.carType && {
                carType: Array.isArray(filters.carType)
                    ? { in: filters.carType }
                    : filters.carType
            }),
        };

        return this.prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true } },
                department: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true } },
            },
            orderBy: [{ stadium: { name: 'asc' } }, { carNumber: 'asc' }],
        });
    }

    /**
     * Stadium-wise report with cart counts, status breakdown, and maintenance
     */
    async getStadiumReports(): Promise<StadiumReport[]> {
        const stadiums = await this.prisma.stadium.findMany({
            where: { isActive: true },
            orderBy: { name: 'asc' },
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const reports = await Promise.all(
            stadiums.map(async (stadium) => {
                // Fleet counts by status
                const fleetByStatus = await this.prisma.fleet.groupBy({
                    by: ['status'],
                    where: { stadiumId: stadium.id },
                    _count: { _all: true },
                });

                // Fleet counts by type
                const fleetByType = await this.prisma.fleet.groupBy({
                    by: ['carType'],
                    where: { stadiumId: stadium.id },
                    _count: { _all: true },
                });

                // VAP carts count
                const vapCarts = await this.prisma.fleet.count({
                    where: { stadiumId: stadium.id, requiresVAP: true },
                });

                // Total carts
                const totalCarts = await this.prisma.fleet.count({
                    where: { stadiumId: stadium.id },
                });

                // Active FAs
                const activeFAs = await this.prisma.user.count({
                    where: { stadiumId: stadium.id, role: 'FA', isActive: true },
                });

                // Open issues
                const openIssues = await this.prisma.maintenanceLog.count({
                    where: {
                        fleet: { stadiumId: stadium.id },
                        status: { in: ['Open', 'InProgress'] },
                    },
                });

                // Recent activity (last 7 days)
                const recentActivity = await this.prisma.handoverLog.groupBy({
                    by: ['action'],
                    where: {
                        fleet: { stadiumId: stadium.id },
                        timestamp: { gte: sevenDaysAgo },
                    },
                    _count: { _all: true },
                });

                const statusMap: Record<string, number> = {};
                fleetByStatus.forEach(s => { statusMap[s.status] = s._count._all; });

                const typeMap: Record<string, number> = {};
                fleetByType.forEach(t => { typeMap[t.carType] = t._count._all; });

                const activityMap: { checkIns: number; checkOuts: number } = { checkIns: 0, checkOuts: 0 };
                recentActivity.forEach(a => {
                    if (a.action === 'CheckedIn') activityMap.checkIns = a._count._all;
                    else if (a.action === 'CheckedOut') activityMap.checkOuts = a._count._all;
                });

                return {
                    id: stadium.id,
                    name: stadium.name,
                    code: stadium.code,
                    location: stadium.location,
                    totalCarts,
                    cartsByStatus: statusMap,
                    cartsByType: typeMap,
                    vapCarts,
                    activeFAs,
                    openIssues,
                    recentActivity: activityMap,
                };
            })
        );

        return reports;
    }

    /**
     * Department-wise report with FA assignments and handover activity
     */
    async getDepartmentReports(filters: { stadiumId?: string } = {}): Promise<DepartmentReport[]> {
        const where = filters.stadiumId ? { stadiumId: filters.stadiumId } : {};

        const departments = await this.prisma.department.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true } },
            },
            orderBy: { name: 'asc' },
        });

        const sevenDaysAgo = new Date();
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

        const reports = await Promise.all(
            departments.map(async (dept) => {
                // Fleet counts by status
                const fleetByStatus = await this.prisma.fleet.groupBy({
                    by: ['status'],
                    where: { departmentId: dept.id },
                    _count: { _all: true },
                });

                // Total carts
                const totalCarts = await this.prisma.fleet.count({
                    where: { departmentId: dept.id },
                });

                // Assigned FAs (users with this department)
                const assignedFAs = await this.prisma.user.count({
                    where: { departmentId: dept.id, role: 'FA' },
                });

                // Active FAs in this department
                const activeFAs = await this.prisma.user.count({
                    where: { departmentId: dept.id, role: 'FA', isActive: true },
                });

                // Handover activity (last 7 days)
                const handoverActivity = await this.prisma.handoverLog.groupBy({
                    by: ['action'],
                    where: {
                        fleet: { departmentId: dept.id },
                        timestamp: { gte: sevenDaysAgo },
                    },
                    _count: { _all: true },
                });

                const statusMap: Record<string, number> = {};
                fleetByStatus.forEach(s => { statusMap[s.status] = s._count._all; });

                const activityMap: { checkIns: number; checkOuts: number } = { checkIns: 0, checkOuts: 0 };
                handoverActivity.forEach(a => {
                    if (a.action === 'CheckedIn') activityMap.checkIns = a._count._all;
                    else if (a.action === 'CheckedOut') activityMap.checkOuts = a._count._all;
                });

                return {
                    id: dept.id,
                    name: dept.name,
                    code: dept.code,
                    stadium: dept.stadium,
                    totalCarts,
                    cartsByStatus: statusMap,
                    assignedFAs,
                    activeFAs,
                    handoverActivity: activityMap,
                };
            })
        );

        return reports;
    }

    /**
     * User activity reports with assignments and activity summary
     */
    async getUserReports(filters: { stadiumId?: string; role?: string } = {}): Promise<UserReport[]> {
        const where: any = {
            isActive: true,
        };
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;
        if (filters.role) where.role = filters.role;

        const users = await this.prisma.user.findMany({
            where,
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                stadiumId: true,
                stadium: { select: { id: true, name: true, code: true } },
                departmentId: true,
                department: { select: { id: true, name: true, code: true } },
                isActive: true,
            },
            orderBy: { name: 'asc' },
        });

        const reports = await Promise.all(
            users.map(async (user) => {
                // Assigned carts
                const assignedCarts = await this.prisma.fleet.findMany({
                    where: { assignedUserId: user.id },
                    select: {
                        id: true,
                        carNumber: true,
                        carType: true,
                        status: true,
                    },
                });

                // Activity summary
                const checkIns = await this.prisma.handoverLog.count({
                    where: { userId: user.id, action: 'CheckedIn' },
                });

                const checkOuts = await this.prisma.handoverLog.count({
                    where: { userId: user.id, action: 'CheckedOut' },
                });

                const issuesReported = await this.prisma.maintenanceLog.count({
                    where: { reportedById: user.id },
                });

                // Last activity
                const lastLog = await this.prisma.handoverLog.findFirst({
                    where: { userId: user.id },
                    orderBy: { timestamp: 'desc' },
                    select: { timestamp: true },
                });

                return {
                    id: user.id,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    stadium: user.stadium,
                    department: user.department,
                    isActive: user.isActive,
                    assignedCarts: assignedCarts.length,
                    cartDetails: assignedCarts,
                    activitySummary: {
                        totalCheckIns: checkIns,
                        totalCheckOuts: checkOuts,
                        issuesReported,
                        lastActivity: lastLog?.timestamp || null,
                    },
                };
            })
        );

        return reports;
    }

    /**
     * External pool bookers — people who booked a pool car through the public
     * link and do NOT have a User account. One row per email, venue-scoped.
     */
    async getPublicBookers(filters: { stadiumId?: string } = {}): Promise<PublicBookerRow[]> {
        const where: any = {};
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;

        const [bookings, users] = await Promise.all([
            this.prisma.poolBookingRequest.findMany({
                where,
                select: {
                    requesterEmail: true, requesterName: true, requesterPhone: true, createdAt: true,
                    faUser: { select: { accreditationNumber: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.user.findMany({ select: { email: true } }),
        ]);

        return buildPublicBookerRows(
            bookings.map(b => ({
                requesterEmail: b.requesterEmail,
                requesterName: b.requesterName,
                requesterPhone: b.requesterPhone,
                faAccreditationNumber: b.faUser?.accreditationNumber ?? null,
                createdAt: b.createdAt,
            })),
            new Set(users.map(u => u.email)),
        );
    }

    /**
     * Pool car report — pool fleet inventory, pool booking activity, request mix,
     * and utilization. Venue-scoped by the caller (via resolveStadiumScope).
     */
    async getPoolReport(filters: { stadiumId?: string } = {}): Promise<PoolReport> {
        const fleetWhere: any = { isPool: true };
        if (filters.stadiumId) fleetWhere.stadiumId = filters.stadiumId;

        const bookingWhere: any = {};
        if (filters.stadiumId) bookingWhere.stadiumId = filters.stadiumId;

        const requestWhere: any = {};
        if (filters.stadiumId) requestWhere.stadiumId = filters.stadiumId;

        const [poolFleet, bookingRows, reqPending, reqApproved, reqRejected, reqPoolShared, reqDedicated] = await Promise.all([
            this.prisma.fleet.findMany({
                where: fleetWhere,
                select: { id: true, carNumber: true, carType: true, status: true, stadium: { select: { name: true } } },
            }),
            this.prisma.poolBookingRequest.findMany({
                where: bookingWhere,
                select: {
                    id: true, status: true, startDate: true, endDate: true, startTime: true, endTime: true,
                    returnedAt: true, createdAt: true, fleetId: true,
                    fleet: { select: { carNumber: true } },
                    stadium: { select: { name: true } },
                },
            }),
            this.prisma.carRequest.count({ where: { ...requestWhere, status: 'Pending' } }),
            this.prisma.carRequest.count({ where: { ...requestWhere, status: 'Approved' } }),
            this.prisma.carRequest.count({ where: { ...requestWhere, status: 'Rejected' } }),
            this.prisma.carRequest.count({ where: { ...requestWhere, requestType: 'pool-shared' } }),
            this.prisma.carRequest.count({ where: { ...requestWhere, requestType: 'dedicated' } }),
        ]);

        const byStatus: Record<string, number> = {};
        const byType: Record<string, number> = {};
        const venueMap = new Map<string, { total: number; inUse: number }>();
        for (const c of poolFleet) {
            byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
            byType[c.carType] = (byType[c.carType] ?? 0) + 1;
            const v = venueMap.get(c.stadium.name) ?? { total: 0, inUse: 0 };
            v.total++;
            if (c.status === 'Dispatched') v.inUse++;
            venueMap.set(c.stadium.name, v);
        }
        const byVenue = [...venueMap.entries()]
            .map(([stadiumName, v]) => ({ stadiumName, ...v }))
            .sort((a, b) => b.total - a.total || a.stadiumName.localeCompare(b.stadiumName));

        const totalInUse = byVenue.reduce((a, c) => a + c.inUse, 0);
        const utilizationPct = poolFleet.length
            ? Math.round((totalInUse / poolFleet.length) * 1000) / 10
            : null;

        const bookings = summarizePoolBookings(
            bookingRows.map(r => ({
                id: r.id, status: r.status,
                startDate: r.startDate, endDate: r.endDate, startTime: r.startTime, endTime: r.endTime,
                returnedAt: r.returnedAt, createdAt: r.createdAt, fleetId: r.fleetId,
                carNumber: r.fleet?.carNumber ?? '—', stadiumName: r.stadium?.name ?? '—',
            })),
            new Date(),
        );

        return {
            scope: { stadiumId: filters.stadiumId ?? null },
            fleet: { total: poolFleet.length, byStatus, byType, byVenue },
            bookings,
            requests: { pending: reqPending, approved: reqApproved, rejected: reqRejected, poolShared: reqPoolShared, dedicated: reqDedicated },
            utilizationPct,
        };
    }

    /**
     * Get active cars currently in use (Dispatched status)
     * Cars that have been checked out but not yet checked back in
     */
    async getActiveCarsUsage(filters: { stadiumId?: string; departmentId?: string; carType?: string; search?: string } = {}): Promise<ActiveCarUsage[]> {
        const where: any = {
            status: 'Dispatched', // Active cars are those currently dispatched/checked out
        };

        // Apply stadium filter
        if (filters.stadiumId) {
            where.stadiumId = filters.stadiumId;
        }

        // Apply department filter
        if (filters.departmentId) {
            where.departmentId = filters.departmentId;
        }

        // Apply car type filter
        if (filters.carType) {
            where.carType = filters.carType;
        }

        // Apply search filter (car number or FA name)
        if (filters.search) {
            // We'll need to do this after fetching due to Prisma limitations with relation filtering
        }

        const dispatchedCarts = await this.prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true } },
                assignedUser: {
                    select: {
                        id: true,
                        name: true,
                        phone: true,
                        department: { select: { id: true, name: true } },
                    },
                },
            },
            orderBy: { carNumber: 'asc' },
        });

        const activeCars: ActiveCarUsage[] = dispatchedCarts
            .filter(cart => {
                // Apply search filter after fetching
                if (filters.search) {
                    const searchLower = filters.search.toLowerCase();
                    const carMatch = cart.carNumber.toLowerCase().includes(searchLower);
                    const faMatch = cart.assignedUser?.name?.toLowerCase().includes(searchLower);
                    return carMatch || faMatch;
                }
                return true;
            })
            .map(cart => ({
                id: cart.id,
                carNumber: cart.carNumber,
                carType: cart.carType,
                status: cart.status,
                faName: cart.assignedUser?.name || 'Unknown',
                faContact: cart.assignedUser?.phone || null,
                faDepartment: cart.assignedUser?.department?.name || null,
                stadium: cart.stadium,
                checkedInAt: cart.checkedInAt || cart.updatedAt,
            }));

        return activeCars;
    }

    /**
     * Get all fleet data for label generation
     */
    async getLabelsData(filters: { stadiumId?: string } = {}) {
        const where: any = { status: 'Assigned' };
        if (filters.stadiumId) where.stadiumId = filters.stadiumId;

        const fleet = await this.prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true, accreditationNumber: true } },
                department: { select: { code: true, name: true } },
            },
            orderBy: [{ stadium: { name: 'asc' } }, { carNumber: 'asc' }],
        });

        return fleet.map(cart => ({
            carNumber: cart.carNumber,
            carType: cart.carType,
            status: cart.status,
            stadium: cart.stadium.name,
            faName: cart.assignedUser?.name || null,
            faAccreditationNumber: cart.assignedUser?.accreditationNumber || null,
            departmentCode: cart.department?.code || null,
            departmentName: cart.department?.name || null,
        }));
    }
}

export const reportsService = new ReportsService();
