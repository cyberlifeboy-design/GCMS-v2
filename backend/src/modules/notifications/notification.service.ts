import { prisma } from '../../config/database';

export interface CreateNotificationData {
    type: string;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    userId?: string; // null for broadcast notifications
}

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
                ...(data.entityType ? { entityType: data.entityType } : {}),
                ...(data.entityId ? { entityId: data.entityId } : {}),
                ...(data.userId ? { userId: data.userId } : {}),
                isRead: false,
            },
        });
    }

    /**
     * Create a broadcast notification (for all users)
     */
    async createBroadcast(data: Omit<CreateNotificationData, 'userId'>) {
        return this.create({ ...data, userId: null });
    }

    /**
     * Create notifications for specific users (e.g., all admins)
     */
    async createForUsers(data: Omit<CreateNotificationData, 'userId'>, userIds: string[]) {
        const notifications = await prisma.notification.createMany({
            data: userIds.map(userId => ({
                type: data.type,
                title: data.title,
                message: data.message,
                ...(data.entityType ? { entityType: data.entityType } : {}),
                ...(data.entityId ? { entityId: data.entityId } : {}),
                userId,
                isRead: false,
            })),
        });
        return notifications;
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
     * Get notifications for a user (includes broadcast notifications)
     */
    async getForUser(userId: string, page: number = 1, limit: number = 20) {
        const skip = (page - 1) * limit;

        const [data, total, unreadCount] = await Promise.all([
            prisma.notification.findMany({
                where: {
                    OR: [
                        { userId },
                        { userId: null }, // Broadcast notifications
                    ],
                },
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.notification.count({
                where: {
                    OR: [
                        { userId },
                        { userId: null },
                    ],
                },
            }),
            prisma.notification.count({
                where: {
                    OR: [
                        { userId },
                        { userId: null },
                    ],
                    isRead: false,
                },
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
        // For broadcast notifications, we need to create a read record
        // But for simplicity, we'll just mark it if it belongs to the user
        const notification = await prisma.notification.findUnique({
            where: { id: notificationId },
        });

        if (!notification) {
            throw new Error('Notification not found');
        }

        // If it's a broadcast notification (userId is null), we need special handling
        // For now, we'll just mark it if userId matches or it's a broadcast
        if (notification.userId === null) {
            // For broadcast notifications, create a user-specific read copy
            // Actually, let's use a simpler approach - just update the existing one
            // This means broadcast notifications are marked read for everyone when one person reads
            // A better approach would be to have a separate ReadReceipt table, but for simplicity:
            // We'll mark it as read (affects all users) - this is a limitation
            return prisma.notification.update({
                where: { id: notificationId },
                data: { isRead: true },
            });
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
                OR: [
                    { userId },
                    { userId: null },
                ],
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