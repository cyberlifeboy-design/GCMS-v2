import { Response } from 'express';
import { reportsService } from './reports.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as ExcelJS from 'exceljs';

export class ReportsController {
    static async exportAuditLogs(req: AuthRequest, res: Response) {
        try {
            const logs = await reportsService.getAuditLogs({});

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Audit Logs');

            sheet.columns = [
                { header: 'Timestamp', key: 'timestamp', width: 25 },
                { header: 'User ID', key: 'userId', width: 30 },
                { header: 'Action', key: 'action', width: 20 },
                { header: 'Entity Type', key: 'entityType', width: 15 },
                { header: 'Entity ID', key: 'entityId', width: 30 },
                { header: 'IP Address', key: 'ipAddress', width: 15 },
            ];

            logs.forEach((log: any) => sheet.addRow(log));

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=audit_logs.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export audit logs' });
        }
    }

    static async getUtilization(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.query as any;
            let filterStadiumId = stadiumId;

            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const stats = await reportsService.getDashboardStats({ stadiumId: filterStadiumId });
            res.status(200).json(stats);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get utilization stats' });
        }
    }

    static async exportHandoverLogs(req: AuthRequest, res: Response) {
        try {
            const logs = await reportsService.getHandoverReports({});

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Handover Logs');

            sheet.columns = [
                { header: 'Timestamp', key: 'timestamp', width: 25 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'User', key: 'userName', width: 20 },
                { header: 'Action', key: 'action', width: 15 },
                { header: 'Condition', key: 'conditionNotes', width: 30 },
            ];

            logs.forEach((log: any) => {
                sheet.addRow({
                    timestamp: log.timestamp,
                    carNumber: log.fleet?.carNumber || '',
                    userName: log.user?.name || '',
                    action: log.action,
                    conditionNotes: log.conditionNotes || '',
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=handover_logs.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export handover logs' });
        }
    }

    static async exportMaintenanceLogs(req: AuthRequest, res: Response) {
        try {
            const logs = await reportsService.getMaintenanceReports({});

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Maintenance Logs');

            sheet.columns = [
                { header: 'Reported At', key: 'reportedAt', width: 25 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'Issue', key: 'issueDescription', width: 30 },
                { header: 'Status', key: 'status', width: 15 },
                { header: 'Resolved At', key: 'resolvedAt', width: 25 },
                { header: 'Resolution Notes', key: 'resolutionNotes', width: 30 },
            ];

            logs.forEach((log: any) => {
                sheet.addRow({
                    reportedAt: log.reportedAt,
                    carNumber: log.fleet?.carNumber || '',
                    issueDescription: log.issueDescription,
                    status: log.status,
                    resolvedAt: log.resolvedAt || '',
                    resolutionNotes: log.resolutionNotes || '',
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=maintenance_logs.xlsx');

            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export maintenance logs' });
        }
    }
}
