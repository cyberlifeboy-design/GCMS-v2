import { prisma } from '../../config/database';
import { notificationService } from '../notifications/notification.service';

export interface CreateAnnouncementData {
    title: string;
    message: string;
    type?: 'info' | 'warning' | 'success' | 'error';
    targetType?: 'all' | 'fas' | 'users' | 'selected';
    targetUserIds?: string[];
    targetRole?: string;
    stadiumId?: string;
    createdBy?: string;
    scheduledAt?: Date;
    expiresAt?: Date;
}

export class AnnouncementService {
    /**
     * Create a new announcement
     */
    async create(data: CreateAnnouncementData, sendNow: boolean = false) {
        const announcement = await prisma.announcement.create({
            data: {
                title: data.title,
                message: data.message,
                type: data.type || 'info',
                targetType: data.targetType || 'all',
                targetUserIds: data.targetUserIds || [],
                targetRole: data.targetRole,
                stadiumId: data.stadiumId,
                createdBy: data.createdBy,
                scheduledAt: data.scheduledAt,
                expiresAt: data.expiresAt,
                isActive: true,
                sentAt: sendNow ? new Date() : null,
            },
        });

        // If sendNow is true, send notifications immediately
        if (sendNow) {
            await this.sendAnnouncementNotifications(announcement);
        }

        return announcement;
    }

    /**
     * Get all announcements with filters
     */
    async getAll(params?: {
        page?: number;
        limit?: number;
        type?: string;
        targetType?: string;
        isActive?: boolean;
    }) {
        const page = params?.page || 1;
        const limit = params?.limit || 20;
        const skip = (page - 1) * limit;

        const where: any = {};
        if (params?.type) where.type = params.type;
        if (params?.targetType) where.targetType = params.targetType;
        if (params?.isActive !== undefined) where.isActive = params.isActive;

        const [data, total] = await Promise.all([
            prisma.announcement.findMany({
                where,
                orderBy: { createdAt: 'desc' },
                skip,
                take: limit,
            }),
            prisma.announcement.count({ where }),
        ]);

        return {
            data,
            pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
        };
    }

    /**
     * Get announcement by ID
     */
    async getById(id: string) {
        return prisma.announcement.findUnique({
            where: { id },
        });
    }

    /**
     * Update an announcement
     */
    async update(id: string, data: Partial<CreateAnnouncementData>) {
        return prisma.announcement.update({
            where: { id },
            data: {
                ...(data.title && { title: data.title }),
                ...(data.message && { message: data.message }),
                ...(data.type && { type: data.type }),
                ...(data.targetType && { targetType: data.targetType }),
                ...(data.targetUserIds && { targetUserIds: data.targetUserIds }),
                ...(data.targetRole !== undefined && { targetRole: data.targetRole }),
                ...(data.stadiumId !== undefined && { stadiumId: data.stadiumId }),
                ...(data.scheduledAt && { scheduledAt: data.scheduledAt }),
                ...(data.expiresAt !== undefined && { expiresAt: data.expiresAt }),
            },
        });
    }

    /**
     * Delete an announcement
     */
    async delete(id: string) {
        return prisma.announcement.delete({
            where: { id },
        });
    }

    /**
     * Send announcement now (if scheduled)
     */
    async sendNow(id: string) {
        const announcement = await prisma.announcement.findUnique({
            where: { id },
        });

        if (!announcement) {
            throw new Error('Announcement not found');
        }

        if (announcement.sentAt) {
            throw new Error('Announcement already sent');
        }

        // Send notifications
        await this.sendAnnouncementNotifications(announcement);

        // Mark as sent
        return prisma.announcement.update({
            where: { id },
            data: { sentAt: new Date() },
        });
    }

    /**
     * Deactivate an announcement
     */
    async deactivate(id: string) {
        return prisma.announcement.update({
            where: { id },
            data: { isActive: false },
        });
    }

    /**
     * Get active announcements for a user
     */
    async getActiveForUser(userId: string, role: string, stadiumId?: string) {
        const now = new Date();

        const where: any = {
            isActive: true,
            sentAt: { not: null },
            OR: [
                { expiresAt: null },
                { expiresAt: { gt: now } },
            ],
        };

        const announcements = await prisma.announcement.findMany({
            where,
            orderBy: { createdAt: 'desc' },
        });

        // Filter by targeting
        return announcements.filter(ann => {
            // Check if announcement is targeted to specific users
            if (ann.targetType === 'selected' && ann.targetUserIds.length > 0) {
                return ann.targetUserIds.includes(userId);
            }

            // Check if targeted to specific role
            if (ann.targetType === 'fas' && role !== 'FA') {
                return false;
            }

            // Check stadium filter
            if (ann.stadiumId && ann.stadiumId !== stadiumId) {
                return false;
            }

            return true;
        });
    }

    /**
     * Send notifications for an announcement
     */
    private async sendAnnouncementNotifications(announcement: any) {
        try {
            // Get target users based on targeting type
            let userIds: string[] = [];

            if (announcement.targetType === 'all') {
                // Send to all active users
                const users = await prisma.user.findMany({
                    where: { isActive: true, isBlocked: false },
                    select: { id: true },
                });
                userIds = users.map(u => u.id);
            } else if (announcement.targetType === 'fas') {
                // Send to all FAs
                const users = await prisma.user.findMany({
                    where: { isActive: true, isBlocked: false, role: 'FA' },
                    select: { id: true },
                });
                userIds = users.map(u => u.id);
            } else if (announcement.targetType === 'selected' && announcement.targetUserIds.length > 0) {
                // Send to specific users
                userIds = announcement.targetUserIds;
            } else if (announcement.targetRole) {
                // Send to specific role
                const users = await prisma.user.findMany({
                    where: { 
                        isActive: true, 
                        isBlocked: false, 
                        role: announcement.targetRole 
                    },
                    select: { id: true },
                });
                userIds = users.map(u => u.id);
            }

            // Apply stadium filter if set
            if (announcement.stadiumId) {
                const stadiumUsers = await prisma.user.findMany({
                    where: { 
                        id: { in: userIds },
                        stadiumId: announcement.stadiumId 
                    },
                    select: { id: true },
                });
                userIds = stadiumUsers.map(u => u.id);
            }

            // Create notifications for each user
            if (userIds.length > 0) {
                await notificationService.createForUsers(
                    {
                        type: 'SystemAnnouncement',
                        title: announcement.title,
                        message: announcement.message,
                        entityType: 'Announcement',
                        entityId: announcement.id,
                    },
                    userIds
                );
            }
        } catch (error) {
            console.error('Failed to send announcement notifications:', error);
            // Don't throw - announcement is still created
        }
    }

    /**
     * Process scheduled announcements (called by cron job)
     */
    async processScheduledAnnouncements() {
        const now = new Date();
        const scheduled = await prisma.announcement.findMany({
            where: {
                isActive: true,
                scheduledAt: { lte: now },
                sentAt: null,
            },
        });

        for (const announcement of scheduled) {
            await this.sendAnnouncementNotifications(announcement);
            await prisma.announcement.update({
                where: { id: announcement.id },
                data: { sentAt: now },
            });
        }

        return { processed: scheduled.length };
    }
}

export const announcementService = new AnnouncementService();