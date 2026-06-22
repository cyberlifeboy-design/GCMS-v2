import { Router } from 'express';
import { ReportsController } from './reports.controller';
import { authenticate } from '../../middleware/auth.middleware';
import { requireRole } from '../../middleware/rbac.middleware';
import { auditLog } from '../../middleware/audit.middleware';

const router = Router();

router.use(authenticate);

// Export audit logs (SuperAdmin + Observer)
router.get('/audit', requireRole('SuperAdmin', 'Observer'), auditLog(), ReportsController.exportAuditLogs);

// FA user audit trail (SuperAdmin + Admin + Observer)
router.get('/fa-trail', requireRole('SuperAdmin', 'Admin', 'Observer'), ReportsController.getFaAuditTrail);

// Get utilization stats (SuperAdmin/Admin/Observer)
router.get('/utilization', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.getUtilization);

// Get active cars currently in use (SuperAdmin/Admin/Observer)
router.get('/active-usage', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.getActiveCarsUsage);

// Export handover logs
router.get('/handover/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportHandoverLogs);

// Export maintenance logs
router.get('/maintenance/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportMaintenanceLogs);

// Export fleet overview
router.get('/fleet/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportFleetOverview);

// Export activity timeline
router.get('/activity/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportActivityTimeline);

// Export full system report
router.get('/full', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportFullReport);

// ==================== STADIUM REPORTS ====================

// Get stadium-wise reports (JSON)
router.get('/stadiums', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.getStadiumReports);

// Export stadium report (Excel)
router.get('/stadiums/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportStadiumReport);

// Export stadium report (PDF)
router.get('/stadiums/export/pdf', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportStadiumReportPdf);

// ==================== DEPARTMENT REPORTS ====================

// Get department-wise reports (JSON)
router.get('/departments', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.getDepartmentReports);

// Export department report (Excel)
router.get('/departments/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportDepartmentReport);

// ==================== USER REPORTS ====================

// Get user activity reports (JSON)
router.get('/users', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.getUserReports);

// Export user report (Excel)
router.get('/users/export', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportUserReport);

// Export user report (PDF)
router.get('/users/export/pdf', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportUserReportPdf);

// ==================== PRINT LABELS ====================

// Export print labels (Word)
router.get('/labels/docx', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportLabelsDocx);

// Export print labels (PowerPoint)
router.get('/labels/pptx', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportLabelsPptx);

// Export print labels (PDF - one per page, landscape, large font)
router.get('/labels/pdf', requireRole('SuperAdmin', 'Admin', 'Observer'), auditLog(), ReportsController.exportLabelsPdf);

export default router;
