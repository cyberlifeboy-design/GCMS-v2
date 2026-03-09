import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// Export audit logs (SuperAdmin only)
router.get('/audit', requireRole('SuperAdmin'), auditLog(), ReportsController.exportAuditLogs);

// Get utilization stats (SuperAdmin/Admin/Observer)
router.get('/utilization', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.getUtilization);

// Export handover logs
router.get('/handover/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportHandoverLogs);

// Export maintenance logs
router.get('/maintenance/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportMaintenanceLogs);

export default router;
