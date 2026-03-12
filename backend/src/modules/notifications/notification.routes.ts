import { Router } from 'express';
import { notificationController } from './notification.controller';
import { authenticate } from '../../middleware/auth.middleware';

const router = Router();

// All notification routes require authentication
router.use(authenticate);

// GET /api/v1/notifications - list notifications (paginated)
router.get('/', notificationController.getNotifications);

// GET /api/v1/notifications/stats - get notification summary stats
router.get('/stats', notificationController.getSummaryStats);

// PATCH /api/v1/notifications/:id/read - mark as read
router.patch('/:id/read', notificationController.markAsRead);

// PATCH /api/v1/notifications/read-all - mark all as read
router.patch('/read-all', notificationController.markAllAsRead);

export default router;