import { Router } from 'express';
import { HandoverController } from './handover.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';

const router = Router();

// Dashboard & Pool Status
router.get('/pool-status', authenticate, HandoverController.getPoolStatus);
router.get('/pool-dashboard', authenticate, HandoverController.getPoolDashboard);
router.get('/available/:stadiumId', authenticate, HandoverController.getAvailableInPool);
router.get('/in-use/:stadiumId', authenticate, HandoverController.getInUse);

// Standard Actions
router.post('/checkin', authenticate, HandoverController.checkIn);
router.post('/checkout', authenticate, HandoverController.uploadMiddleware, HandoverController.checkOut);

// Refined Workflow Actions
router.post('/sign-handover', authenticate, HandoverController.signHandover);
router.post('/request-handback', authenticate, HandoverController.requestHandback);
router.post('/accept-handback', authenticate, requireRole(['Admin', 'SuperAdmin']), HandoverController.acceptHandback);

// Bulk Actions
router.post('/bulk-checkin', authenticate, HandoverController.bulkCheckIn);
router.post('/bulk-checkout', authenticate, HandoverController.bulkCheckOut);

// History
router.get('/history', authenticate, HandoverController.getHistory);

export default router;
