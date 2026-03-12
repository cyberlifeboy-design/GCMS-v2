import { PrismaClient } from '@prisma/client';
import { prisma } from '../../config/database';
import { AuditLogFilters, HandoverFilters, MaintenanceFilters } from '../../types';

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
    stadium: { id: string; name: string } | null;
    department: { id: string; name: string } | null;
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
    checkOutTime: Date;
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
                fleet: true,
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

        // 2. Cart Status Summary
        const fleetByStatus = await this.prisma.fleet.groupBy({
            by: ['status'],
            where,
            _count: { _all: true },
        });

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
            where: { isActive: true },
            select: {
                id: true,
                name: true,
                code: true,
                location: true,
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
                    totalAssigned: fa._count.assignedCarts,
                    carts: assignedCarts,
                };
            })
        );

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
                stadium: { select: { id: true, name: true } },
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

        // Get the most recent check-out log for each cart to find checkOutTime
        const cartIds = dispatchedCarts.map(c => c.id);
        const recentCheckOuts = await this.prisma.handoverLog.findMany({
            where: {
                fleetId: { in: cartIds },
                action: 'CheckedOut',
            },
            orderBy: [{ fleetId: 'asc' }, { timestamp: 'desc' }],
            select: {
                fleetId: true,
                timestamp: true,
            },
        });

        // Map to get latest check-out time per cart
        const latestCheckOutMap = new Map<string, Date>();
        for (const log of recentCheckOuts) {
            if (!latestCheckOutMap.has(log.fleetId)) {
                latestCheckOutMap.set(log.fleetId, log.timestamp);
            }
        }

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
                checkOutTime: latestCheckOutMap.get(cart.id) || cart.updatedAt,
            }));

        return activeCars;
    }

    /**
     * Get all fleet data for label generation
     */
    async getLabelsData(filters: { stadiumId?: string } = {}) {
        const where = filters.stadiumId ? { stadiumId: filters.stadiumId } : {};

        const fleet = await this.prisma.fleet.findMany({
            where,
            include: {
                stadium: { select: { id: true, name: true } },
                assignedUser: { select: { id: true, name: true, accreditationNumber: true } },
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
        }));
    }
}

export const reportsService = new ReportsService();
