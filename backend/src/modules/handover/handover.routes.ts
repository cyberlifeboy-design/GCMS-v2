import { Router } from 'express';
import { HandoverController } from './handover.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// POST /checkout — FA and Admin can check out
router.post('/checkout', requireRole('FA', 'Admin', 'SuperAdmin'), HandoverController.uploadMiddleware, auditLog(), HandoverController.checkOut);

// POST /checkin — FA and Admin can check in
router.post('/checkin', requireRole('FA', 'Admin', 'SuperAdmin'), auditLog(), HandoverController.checkIn);

// POST /bulk-checkout — bulk operations
router.post('/bulk-checkout', requireRole('FA', 'Admin', 'SuperAdmin'), auditLog(), HandoverController.bulkCheckOut);

// POST /bulk-checkin
router.post('/bulk-checkin', requireRole('FA', 'Admin', 'SuperAdmin'), auditLog(), HandoverController.bulkCheckIn);

// GET /history — full log (RBAC scoped inside controller)
router.get('/history', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), HandoverController.getHistory);

// Pool management
router.get('/pool-status', requireRole('SuperAdmin', 'Admin', 'Observer'), HandoverController.getPoolStatus);
router.get('/pool-dashboard', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), HandoverController.getPoolDashboard);
router.get('/available/:stadiumId', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), HandoverController.getAvailableInPool);
router.get('/in-use/:stadiumId', requireRole('SuperAdmin', 'Admin', 'Observer', 'FA'), HandoverController.getInUse);

export default router;
