import { Request, Response } from 'express';
import { notificationService } from './notification.service';

export class NotificationController {
    async getNotifications(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const pageParam = req.query.page;
            const limitParam = req.query.limit;
            const page = parseInt(typeof pageParam === 'string' ? pageParam : '1') || 1;
            const limit = parseInt(typeof limitParam === 'string' ? limitParam : '20') || 20;

            const result = await notificationService.getForUser(userId, page, limit);
            res.json(result);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async markAsRead(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const { id } = req.params;
            const notification = await notificationService.markAsRead(id, userId);
            res.json(notification);
        } catch (error: any) {
            res.status(400).json({ error: error.message });
        }
    }

    async markAllAsRead(req: Request, res: Response) {
        try {
            const userId = (req as any).user?.userId;
            if (!userId) {
                return res.status(401).json({ error: 'Unauthorized' });
            }

            const result = await notificationService.markAllAsRead(userId);
            res.json({ success: true, count: result.count });
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }

    async getSummaryStats(req: Request, res: Response) {
        try {
            const user = (req as any).user;
            let stadiumId: string | undefined;
            
            if (user?.stadiumId) {
                stadiumId = user.stadiumId;
            } else {
                const queryStadiumId = req.query.stadiumId;
                if (typeof queryStadiumId === 'string') {
                    stadiumId = queryStadiumId;
                }
            }
            
            const stats = await notificationService.getSummaryStats(stadiumId);
            res.json(stats);
        } catch (error: any) {
            res.status(500).json({ error: error.message });
        }
    }
}

export const notificationController = new NotificationController();