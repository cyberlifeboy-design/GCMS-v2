import { prisma } from '../../config/database';

export interface CreateNotificationData {
    type: string;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    userId?: string; // null for broadcast notifications
}

const TYPE_TO_PREFERENCE_MAP: Record<string, string> = {
    IssueReported: 'maintenance',
    CheckIn: 'handover',
    CheckOut: 'handover',
    CarRequest: 'requests',
    RequestApproved: 'requests',
    RequestRejected: 'requests',
    AssignmentChange: 'assignments',
};

export class NotificationService {
    /**
     * Create a notification
     */
    async create(data: CreateNotificationData) {
        return prisma.notification.create({
            data: {
                type: data.type,
                title: data.title,
                message: data.message,
                entityType: data.entityType ?? null,
                entityId: data.entityId ?? null,
                userId: data.userId ?? null,
                isRead: false,
            },
        });
    }

    /**
     * Create a broadcast notification (for all active users)
     * Fans out individual notifications to each active user for proper per-user read tracking
     */
    async createBroadcast(data: Omit<CreateNotificationData, 'userId'>) {
        const users = await prisma.user.findMany({
            where: { isActive: true },
            select: { id: true },
        });
        if (users.length === 0) return { count: 0 };
        return this.createForUsers(data, users.map(u => u.id));
    }

    /**
     * Create notifications for specific users (e.g., all admins)
     */
    async createForUsers(data: Omit<CreateNotificationData, 'userId'>, userIds: string[]) {
        // Filter users based on their notification preferences
        const filteredUserIds = await this.filterUsersByPreference(data.type, userIds);

        if (filteredUserIds.length === 0) return { count: 0 };

        const notifications = await prisma.notification.createMany({
            data: filteredUserIds.map(userId => ({
                type: data.type,
                title: data.title,
                message: data.message,
                entityType: data.entityType ?? null,
                entityId: data.entityId ?? null,
                userId,
                isRead: false,
            })),
        });
        return notifications;
    }

    /**
     * Filter users based on their notification preferences
     */
    private async filterUsersByPreference(type: string, userIds: string[]): Promise<string[]> {
        const category = TYPE_TO_PREFERENCE_MAP[type];
        if (!category) return userIds; // Default to send if no category mapping

        const users = await prisma.user.findMany({
            where: {
                id: { in: userIds },
                isActive: true,
            },
            select: {
                id: true,
                exportPreferences: true,
            },
        });

        return users.filter(user => {
            const preferences = user.exportPreferences as any;
            if (!preferences || !preferences.emailNotifications) return true; // Default to true if not set

            const categoryPreference = preferences.emailNotifications[category];
            return categoryPreference !== false; // Only filter out if explicitly set to false
        }).map(user => user.id);
    }

    /**
     * Create notifications for all users with specific roles
     */
    async createForRoles(data: Omit<CreateNotificationData, 'userId'>, roles: string[], stadiumId?: string) {
        const where: any = { isActive: true, role: { in: roles } };
        if (stadiumId) {
            where.stadiumId = stadiumId;
        }

        const users = await prisma.user.findMany({
            where,
            select: { id: true },
        });

        if (users.length === 0) return { count: 0 };

        return this.createForUsers(data, users.map(u => u.id));
    }

    /**
     * Get notifications for a user
     */
    async getForUser(userId: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const where = { userId };

        const [data, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.notification.count({ where }),
            prisma.notification.count({
                where: { ...where, isRead: false },
            }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
            unreadCount,
        };
    }

    /**
     * Mark a notification as read
     */
    async markAsRead(notificationId: string, userId: string) {
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) {
            throw new Error('Notification not found');
        }

        if (notification.userId !== userId) {
            throw new Error('Not authorized to mark this notification as read');
        }

        return prisma.notification.update({
            where: { id: notificationId },
            data: { isRead: true },
        });
    }

    /**
     * Mark all notifications as read for a user
     */
    async markAllAsRead(userId: string) {
        return prisma.notification.updateMany({
            where: {
                userId,
                isRead: false,
            },
            data: { isRead: true },
        });
    }

    /**
     * Get notification summary stats
     */
    async getSummaryStats(stadiumId?: string) {
        const where: any = {};

        // For stadium-scoped queries, we'd need to join with related entities
        // For simplicity, we'll return counts without stadium filter for now

        const [issuesReported, checkIns, checkOuts, carRequests, pendingRequests, openIssues] = await Promise.all([
            prisma.maintenanceLog.count({
                where: stadiumId ? { fleet: { stadiumId } } : {},
            }),
            prisma.handoverLog.count({
                where: { action: 'CheckedIn', ...(stadiumId ? { fleet: { stadiumId } } : {}) },
            }),
            prisma.handoverLog.count({
                where: { action: 'CheckedOut', ...(stadiumId ? { fleet: { stadiumId } } : {}) },
            }),
            prisma.carRequest.count({
                where: stadiumId ? { stadiumId } : {},
            }),
            prisma.carRequest.count({
                where: { status: 'Pending', ...(stadiumId ? { stadiumId } : {}) },
            }),
            prisma.maintenanceLog.count({
                where: { status: 'Open', ...(stadiumId ? { fleet: { stadiumId } } : {}) },
            }),
        ]);

        return {
            issuesReported,
            checkIns,
            checkOuts,
            carRequests,
            pendingRequests,
            openIssues,
        };
    }

    /**
     * Delete old notifications (cleanup job)
     */
    async deleteOlderThan(days: number) {
        const cutoff = new Date();
        cutoff.setDate(cutoff.getDate() - days);

        return prisma.notification.deleteMany({
            where: {
                createdAt: { lt: cutoff },
            },
        });
    }
}

export const notificationService = new NotificationService();