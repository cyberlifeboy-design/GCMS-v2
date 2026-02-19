import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// Export audit logs (Admin only)
router.get('/audit', requireRole('Admin'), auditLog(), ReportsController.exportAuditLogs);

// Get utilization stats (Admin/LCC)
router.get('/utilization', requireRole('Admin', 'LCC'), auditLog(), ReportsController.getUtilization);

// Export handover logs (Admin/LCC)
router.get('/handover/export', requireRole('Admin', 'LCC'), auditLog(), ReportsController.exportHandoverLogs);

// Export maintenance logs (Admin/LCC)
router.get('/maintenance/export', requireRole('Admin', 'LCC'), auditLog(), ReportsController.exportMaintenanceLogs);

export default router;
