import { Response } from 'express';
import { reportsService } from './reports.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as ExcelJS from 'exceljs';
import { HandoverLog, MaintenanceLog, Fleet, DashboardStats } from '../../types';

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

            logs.forEach((log) => sheet.addRow(log));

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
            const logs: HandoverLog[] = await reportsService.getHandoverReports({});

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Handover Logs');

            sheet.columns = [
                { header: 'Timestamp', key: 'timestamp', width: 25 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'User', key: 'userName', width: 20 },
                { header: 'Action', key: 'action', width: 15 },
                { header: 'Condition', key: 'conditionNotes', width: 30 },
            ];

            logs.forEach((log) => {
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
            const logs: MaintenanceLog[] = await reportsService.getMaintenanceReports({});

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

            logs.forEach((log) => {
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

    static async exportFleetOverview(req: AuthRequest, res: Response) {
        try {
            const stats: DashboardStats = await reportsService.getDashboardStats({});
            const fleet: Fleet[] = await reportsService.getFleetList({});

            const workbook = new ExcelJS.Workbook();
            const summarySheet = workbook.addWorksheet('Summary');
            const fleetSheet = workbook.addWorksheet('Fleet');

            // Summary sheet
            summarySheet.columns = [
                { header: 'Metric', key: 'metric', width: 25 },
                { header: 'Value', key: 'value', width: 15 },
            ];
            summarySheet.addRow({ metric: 'Total Carts', value: stats.fleetByStatus.reduce((acc, s) => acc + s.count, 0) });
            summarySheet.addRow({ metric: 'Available', value: stats.fleetByStatus.find(s => s.status === 'Available')?.count || 0 });
            summarySheet.addRow({ metric: 'Assigned', value: stats.fleetByStatus.find(s => s.status === 'Assigned')?.count || 0 });
            summarySheet.addRow({ metric: 'Dispatched', value: stats.fleetByStatus.find(s => s.status === 'Dispatched')?.count || 0 });
            summarySheet.addRow({ metric: 'Under Maintenance', value: stats.fleetByStatus.find(s => s.status === 'Under Maintenance')?.count || 0 });
            summarySheet.addRow({ metric: 'VAP Required', value: stats.vapCartsCount });
            summarySheet.addRow({ metric: 'Active Users', value: stats.activeUsersCount });
            summarySheet.addRow({ metric: 'Open Issues', value: stats.openIssuesCount });

            // Fleet sheet
            fleetSheet.columns = [
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'Type', key: 'carType', width: 15 },
                { header: 'Status', key: 'status', width: 18 },
                { header: 'VAP Required', key: 'requiresVAP', width: 12 },
                { header: 'Stadium', key: 'stadium', width: 20 },
                { header: 'Assigned User', key: 'assignedUser', width: 20 },
            ];
            fleet.forEach((cart) => {
                fleetSheet.addRow({
                    carNumber: cart.carNumber,
                    carType: cart.carType,
                    status: cart.status,
                    requiresVAP: cart.requiresVAP ? 'Yes' : 'No',
                    stadium: cart.stadium?.name || '',
                    assignedUser: cart.assignedUser?.name || '',
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=fleet_overview.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export fleet overview' });
        }
    }

    static async exportActivityTimeline(req: AuthRequest, res: Response) {
        try {
            const logs: HandoverLog[] = await reportsService.getHandoverReports({});

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Activity Timeline');

            sheet.columns = [
                { header: 'Date', key: 'date', width: 15 },
                { header: 'Time', key: 'time', width: 12 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'User', key: 'userName', width: 20 },
                { header: 'Action', key: 'action', width: 15 },
                { header: 'Condition Notes', key: 'conditionNotes', width: 40 },
            ];

            logs.forEach((log) => {
                const timestamp = new Date(log.timestamp);
                sheet.addRow({
                    date: timestamp.toLocaleDateString(),
                    time: timestamp.toLocaleTimeString(),
                    carNumber: log.fleet?.carNumber || '',
                    userName: log.user?.name || '',
                    action: log.action,
                    conditionNotes: log.conditionNotes || '',
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=activity_timeline.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export activity timeline' });
        }
    }

    static async exportFullReport(req: AuthRequest, res: Response) {
        try {
            const [stats, fleet, handoverLogs, maintenanceLogs]: [DashboardStats, Fleet[], HandoverLog[], MaintenanceLog[]] = await Promise.all([
                reportsService.getDashboardStats({}),
                reportsService.getFleetList({}),
                reportsService.getHandoverReports({}),
                reportsService.getMaintenanceReports({}),
            ]);

            const workbook = new ExcelJS.Workbook();

            // Summary sheet
            const summarySheet = workbook.addWorksheet('Summary');
            summarySheet.columns = [
                { header: 'Metric', key: 'metric', width: 25 },
                { header: 'Value', key: 'value', width: 15 },
            ];
            summarySheet.addRow({ metric: 'Total Carts', value: stats.fleetByStatus.reduce((acc, s) => acc + s.count, 0) });
            summarySheet.addRow({ metric: 'Active Users', value: stats.activeUsersCount });
            summarySheet.addRow({ metric: 'Open Issues', value: stats.openIssuesCount });
            summarySheet.addRow({ metric: 'VAP Required', value: stats.vapCartsCount });

            // Fleet sheet
            const fleetSheet = workbook.addWorksheet('Fleet');
            fleetSheet.columns = [
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'Type', key: 'carType', width: 15 },
                { header: 'Status', key: 'status', width: 18 },
                { header: 'Stadium', key: 'stadium', width: 20 },
            ];
            fleet.forEach((cart) => {
                fleetSheet.addRow({
                    carNumber: cart.carNumber,
                    carType: cart.carType,
                    status: cart.status,
                    stadium: cart.stadium?.name || '',
                });
            });

            // Handover sheet
            const handoverSheet = workbook.addWorksheet('Handover Logs');
            handoverSheet.columns = [
                { header: 'Timestamp', key: 'timestamp', width: 20 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'User', key: 'userName', width: 20 },
                { header: 'Action', key: 'action', width: 15 },
            ];
            handoverLogs.forEach((log) => {
                handoverSheet.addRow({
                    timestamp: log.timestamp,
                    carNumber: log.fleet?.carNumber || '',
                    userName: log.user?.name || '',
                    action: log.action,
                });
            });

            // Maintenance sheet
            const maintenanceSheet = workbook.addWorksheet('Maintenance');
            maintenanceSheet.columns = [
                { header: 'Reported', key: 'reportedAt', width: 20 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'Issue', key: 'issueDescription', width: 40 },
                { header: 'Status', key: 'status', width: 15 },
            ];
            maintenanceLogs.forEach((log) => {
                maintenanceSheet.addRow({
                    reportedAt: log.reportedAt,
                    carNumber: log.fleet?.carNumber || '',
                    issueDescription: log.issueDescription,
                    status: log.status,
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=gcms_full_report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export full report' });
        }
    }
}
