import { Response } from 'express';
import { reportsService } from './reports.service';
import { AuthRequest } from '../../middleware/auth.middleware';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, Header, Footer, PageOrientation, AlignmentType } from 'docx';
import PptxGenJS from 'pptxgenjs';
import { prisma } from '../../config/database';

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

    static async getActiveCarsUsage(req: AuthRequest, res: Response) {
        try {
            const { stadiumId, departmentId, carType, search } = req.query as any;
            let filterStadiumId = stadiumId;

            // Admin can only see their own stadium's active cars
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const activeCars = await reportsService.getActiveCarsUsage({
                stadiumId: filterStadiumId,
                departmentId,
                carType,
                search,
            });
            res.status(200).json(activeCars);
        } catch (error) {
            console.error('Failed to get active cars usage:', error);
            res.status(500).json({ error: 'Failed to get active cars usage' });
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
            const { stadiumId, departmentId, status, carType } = req.query as any;

            // RBAC scoping
            let filterStadiumId = stadiumId;
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            // Support comma-separated carType for multi-select filter
            let carTypeFilter: string | string[] | undefined;
            if (carType) {
                const types = (carType as string).split(',').map(t => t.trim()).filter(Boolean);
                carTypeFilter = types.length === 1 ? types[0] : types;
            }

            const filters: { stadiumId?: string; departmentId?: string; status?: string; carType?: string | string[] } = {};
            if (filterStadiumId) filters.stadiumId = filterStadiumId;
            if (departmentId) filters.departmentId = departmentId;
            if (status) filters.status = status;
            if (carTypeFilter) filters.carType = carTypeFilter;

            const fleet = await reportsService.getFleetList(filters);

            const workbook = new ExcelJS.Workbook();
            const fleetSheet = workbook.addWorksheet('Fleet');

            // Fleet sheet
            fleetSheet.columns = [
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'Type', key: 'carType', width: 15 },
                { header: 'Status', key: 'status', width: 18 },
                { header: 'VAP Required', key: 'requiresVAP', width: 12 },
                { header: 'Stadium', key: 'stadium', width: 20 },
                { header: 'Department', key: 'department', width: 20 },
                { header: 'Assigned User', key: 'assignedUser', width: 20 },
            ];
            fleet.forEach((cart) => {
                fleetSheet.addRow({
                    carNumber: cart.carNumber,
                    carType: cart.carType,
                    status: cart.status,
                    requiresVAP: cart.requiresVAP ? 'Yes' : 'No',
                    stadium: cart.stadium?.name || '',
                    department: cart.department?.name || '',
                    assignedUser: cart.assignedUser?.name || '',
                });
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=fleet_report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export fleet overview' });
        }
    }

    static async exportActivityTimeline(req: AuthRequest, res: Response) {
        try {
            const logs = await reportsService.getHandoverReports({});

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
            const [stats, fleet, handoverLogs, maintenanceLogs] = await Promise.all([
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

    // ==================== STADIUM REPORTS ====================

    static async getStadiumReports(req: AuthRequest, res: Response) {
        try {
            const reports = await reportsService.getStadiumReports();
            res.status(200).json(reports);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get stadium reports' });
        }
    }

    static async exportStadiumReport(req: AuthRequest, res: Response) {
        try {
            const reports = await reportsService.getStadiumReports();

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Stadium Report');

            sheet.columns = [
                { header: 'Stadium Name', key: 'name', width: 25 },
                { header: 'Code', key: 'code', width: 10 },
                { header: 'Location', key: 'location', width: 20 },
                { header: 'Total Carts', key: 'totalCarts', width: 12 },
                { header: 'Available', key: 'available', width: 12 },
                { header: 'Assigned', key: 'assigned', width: 12 },
                { header: 'Dispatched', key: 'dispatched', width: 12 },
                { header: 'Under Maintenance', key: 'maintenance', width: 18 },
                { header: 'VAP Carts', key: 'vapCarts', width: 12 },
                { header: 'Active FAs', key: 'activeFAs', width: 12 },
                { header: 'Open Issues', key: 'openIssues', width: 12 },
                { header: 'Check-ins (7d)', key: 'checkIns', width: 14 },
                { header: 'Check-outs (7d)', key: 'checkOuts', width: 14 },
            ];

            reports.forEach((stadium) => {
                sheet.addRow({
                    name: stadium.name,
                    code: stadium.code,
                    location: stadium.location,
                    totalCarts: stadium.totalCarts,
                    available: stadium.cartsByStatus['Available'] || 0,
                    assigned: stadium.cartsByStatus['Assigned'] || 0,
                    dispatched: stadium.cartsByStatus['Dispatched'] || 0,
                    maintenance: stadium.cartsByStatus['Under Maintenance'] || 0,
                    vapCarts: stadium.vapCarts,
                    activeFAs: stadium.activeFAs,
                    openIssues: stadium.openIssues,
                    checkIns: stadium.recentActivity.checkIns,
                    checkOuts: stadium.recentActivity.checkOuts,
                });
            });

            // Add summary row
            sheet.addRow({});
            const summaryRow = sheet.addRow({
                name: 'TOTAL',
                totalCarts: reports.reduce((acc, s) => acc + s.totalCarts, 0),
                available: reports.reduce((acc, s) => acc + (s.cartsByStatus['Available'] || 0), 0),
                assigned: reports.reduce((acc, s) => acc + (s.cartsByStatus['Assigned'] || 0), 0),
                dispatched: reports.reduce((acc, s) => acc + (s.cartsByStatus['Dispatched'] || 0), 0),
                maintenance: reports.reduce((acc, s) => acc + (s.cartsByStatus['Under Maintenance'] || 0), 0),
                vapCarts: reports.reduce((acc, s) => acc + s.vapCarts, 0),
                activeFAs: reports.reduce((acc, s) => acc + s.activeFAs, 0),
                openIssues: reports.reduce((acc, s) => acc + s.openIssues, 0),
                checkIns: reports.reduce((acc, s) => acc + s.recentActivity.checkIns, 0),
                checkOuts: reports.reduce((acc, s) => acc + s.recentActivity.checkOuts, 0),
            });
            summaryRow.font = { bold: true };

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=stadium_report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export stadium report' });
        }
    }

    static async exportStadiumReportPdf(req: AuthRequest, res: Response) {
        try {
            const reports = await reportsService.getStadiumReports();

            const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=stadium_report.pdf');

            doc.pipe(res);

            // Title
            doc.fontSize(18).font('Helvetica-Bold').text('Stadium Report', { align: 'center' });
            doc.moveDown();

            // Date
            doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
            doc.moveDown();

            // Table headers
            const headers = ['Stadium', 'Total', 'Avail', 'Assign', 'Disp', 'Maint', 'VAP', 'FAs', 'Issues'];
            const colWidths = [120, 50, 45, 45, 45, 45, 40, 40, 45];
            let y = doc.y;

            doc.font('Helvetica-Bold').fontSize(9);
            let x = 30;
            headers.forEach((header, i) => {
                doc.text(header, x, y, { width: colWidths[i], align: 'center' });
                x += colWidths[i];
            });
            y += 20;

            // Table rows
            doc.font('Helvetica').fontSize(8);
            reports.forEach((stadium) => {
                x = 30;
                const rowData = [
                    stadium.name,
                    stadium.totalCarts.toString(),
                    (stadium.cartsByStatus['Available'] || 0).toString(),
                    (stadium.cartsByStatus['Assigned'] || 0).toString(),
                    (stadium.cartsByStatus['Dispatched'] || 0).toString(),
                    (stadium.cartsByStatus['Under Maintenance'] || 0).toString(),
                    stadium.vapCarts.toString(),
                    stadium.activeFAs.toString(),
                    stadium.openIssues.toString(),
                ];
                rowData.forEach((data, i) => {
                    doc.text(data, x, y, { width: colWidths[i], align: i === 0 ? 'left' : 'center' });
                    x += colWidths[i];
                });
                y += 15;

                // Check if we need a new page
                if (y > doc.page.height - 50) {
                    doc.addPage();
                    y = 30;
                }
            });

            // Summary
            y += 10;
            doc.font('Helvetica-Bold').fontSize(9);
            const totalCarts = reports.reduce((acc, s) => acc + s.totalCarts, 0);
            doc.text(`Total Stadiums: ${reports.length} | Total Carts: ${totalCarts}`, 30, y);

            doc.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export stadium report PDF' });
        }
    }

    // ==================== DEPARTMENT REPORTS ====================

    static async getDepartmentReports(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.query as any;
            let filterStadiumId = stadiumId;

            // Admin can only see their own stadium's departments
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const reports = await reportsService.getDepartmentReports({ stadiumId: filterStadiumId });
            res.status(200).json(reports);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get department reports' });
        }
    }

    static async exportDepartmentReport(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.query as any;
            let filterStadiumId = stadiumId;

            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const reports = await reportsService.getDepartmentReports({ stadiumId: filterStadiumId });

            const workbook = new ExcelJS.Workbook();
            const sheet = workbook.addWorksheet('Department Report');

            sheet.columns = [
                { header: 'Department', key: 'name', width: 25 },
                { header: 'Code', key: 'code', width: 12 },
                { header: 'Stadium', key: 'stadium', width: 20 },
                { header: 'Total Carts', key: 'totalCarts', width: 12 },
                { header: 'Available', key: 'available', width: 12 },
                { header: 'Assigned', key: 'assigned', width: 12 },
                { header: 'Dispatched', key: 'dispatched', width: 12 },
                { header: 'Under Maintenance', key: 'maintenance', width: 18 },
                { header: 'Assigned FAs', key: 'assignedFAs', width: 12 },
                { header: 'Active FAs', key: 'activeFAs', width: 12 },
                { header: 'Check-ins (7d)', key: 'checkIns', width: 14 },
                { header: 'Check-outs (7d)', key: 'checkOuts', width: 14 },
            ];

            reports.forEach((dept) => {
                sheet.addRow({
                    name: dept.name,
                    code: dept.code || '',
                    stadium: dept.stadium.name,
                    totalCarts: dept.totalCarts,
                    available: dept.cartsByStatus['Available'] || 0,
                    assigned: dept.cartsByStatus['Assigned'] || 0,
                    dispatched: dept.cartsByStatus['Dispatched'] || 0,
                    maintenance: dept.cartsByStatus['Under Maintenance'] || 0,
                    assignedFAs: dept.assignedFAs,
                    activeFAs: dept.activeFAs,
                    checkIns: dept.handoverActivity.checkIns,
                    checkOuts: dept.handoverActivity.checkOuts,
                });
            });

            // Summary row
            sheet.addRow({});
            const summaryRow = sheet.addRow({
                name: 'TOTAL',
                totalCarts: reports.reduce((acc, d) => acc + d.totalCarts, 0),
                available: reports.reduce((acc, d) => acc + (d.cartsByStatus['Available'] || 0), 0),
                assigned: reports.reduce((acc, d) => acc + (d.cartsByStatus['Assigned'] || 0), 0),
                dispatched: reports.reduce((acc, d) => acc + (d.cartsByStatus['Dispatched'] || 0), 0),
                maintenance: reports.reduce((acc, d) => acc + (d.cartsByStatus['Under Maintenance'] || 0), 0),
                assignedFAs: reports.reduce((acc, d) => acc + d.assignedFAs, 0),
                activeFAs: reports.reduce((acc, d) => acc + d.activeFAs, 0),
                checkIns: reports.reduce((acc, d) => acc + d.handoverActivity.checkIns, 0),
                checkOuts: reports.reduce((acc, d) => acc + d.handoverActivity.checkOuts, 0),
            });
            summaryRow.font = { bold: true };

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=department_report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export department report' });
        }
    }

    // ==================== USER REPORTS ====================

    static async getUserReports(req: AuthRequest, res: Response) {
        try {
            const { stadiumId, role } = req.query as any;
            let filterStadiumId = stadiumId;

            // Admin can only see users in their stadium
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const reports = await reportsService.getUserReports({ stadiumId: filterStadiumId, role });
            res.status(200).json(reports);
        } catch (error) {
            res.status(500).json({ error: 'Failed to get user reports' });
        }
    }

    static async exportUserReport(req: AuthRequest, res: Response) {
        try {
            const { stadiumId, role } = req.query as any;
            let filterStadiumId = stadiumId;

            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const reports = await reportsService.getUserReports({ stadiumId: filterStadiumId, role });

            const workbook = new ExcelJS.Workbook();
            const summarySheet = workbook.addWorksheet('User Summary');
            const detailsSheet = workbook.addWorksheet('Cart Assignments');

            // Summary sheet
            summarySheet.columns = [
                { header: 'Name', key: 'name', width: 25 },
                { header: 'Email', key: 'email', width: 30 },
                { header: 'Role', key: 'role', width: 12 },
                { header: 'Stadium', key: 'stadium', width: 20 },
                { header: 'Department', key: 'department', width: 20 },
                { header: 'Dept Code', key: 'deptCode', width: 12 },
                { header: 'Status', key: 'status', width: 10 },
                { header: 'Assigned Carts', key: 'assignedCarts', width: 15 },
                { header: 'Check-ins', key: 'checkIns', width: 12 },
                { header: 'Check-outs', key: 'checkOuts', width: 12 },
                { header: 'Issues Reported', key: 'issues', width: 15 },
                { header: 'Last Activity', key: 'lastActivity', width: 20 },
            ];

            reports.forEach((user) => {
                summarySheet.addRow({
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    stadium: user.stadium?.name || '',
                    department: user.department?.name || '',
                    status: user.isActive ? 'Active' : 'Inactive',
                    assignedCarts: user.assignedCarts,
                    checkIns: user.activitySummary.totalCheckIns,
                    checkOuts: user.activitySummary.totalCheckOuts,
                    issues: user.activitySummary.issuesReported,
                    lastActivity: user.activitySummary.lastActivity
                        ? new Date(user.activitySummary.lastActivity).toLocaleString()
                        : 'Never',
                });
            });

            // Cart assignments sheet
            detailsSheet.columns = [
                { header: 'User Name', key: 'userName', width: 25 },
                { header: 'User Email', key: 'userEmail', width: 30 },
                { header: 'Car Number', key: 'carNumber', width: 15 },
                { header: 'Car Type', key: 'carType', width: 15 },
                { header: 'Status', key: 'status', width: 18 },
            ];

            reports.forEach((user) => {
                if (user.cartDetails.length === 0) {
                    detailsSheet.addRow({
                        userName: user.name,
                        userEmail: user.email,
                        carNumber: '—',
                        carType: '—',
                        status: '—',
                    });
                } else {
                    user.cartDetails.forEach((cart) => {
                        detailsSheet.addRow({
                            userName: user.name,
                            userEmail: user.email,
                            carNumber: cart.carNumber,
                            carType: cart.carType,
                            status: cart.status,
                        });
                    });
                }
            });

            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
            res.setHeader('Content-Disposition', 'attachment; filename=user_report.xlsx');
            await workbook.xlsx.write(res);
            res.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export user report' });
        }
    }

    static async exportUserReportPdf(req: AuthRequest, res: Response) {
        try {
            const { stadiumId, role } = req.query as any;
            let filterStadiumId = stadiumId;

            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            const reports = await reportsService.getUserReports({ stadiumId: filterStadiumId, role });

            const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', 'attachment; filename=user_report.pdf');

            doc.pipe(res);

            // Title
            doc.fontSize(18).font('Helvetica-Bold').text('User Activity Report', { align: 'center' });
            doc.moveDown();

            // Date
            doc.fontSize(10).font('Helvetica').text(`Generated: ${new Date().toLocaleString()}`, { align: 'right' });
            doc.moveDown();

            // Table headers
            const headers = ['Name', 'Role', 'Stadium', 'Dept', 'Dept Code', 'Carts', 'Check-ins', 'Check-outs', 'Issues'];
            const colWidths = [100, 50, 90, 90, 60, 40, 55, 55, 45];
            let y = doc.y;

            doc.font('Helvetica-Bold').fontSize(9);
            let x = 30;
            headers.forEach((header, i) => {
                doc.text(header, x, y, { width: colWidths[i], align: 'center' });
                x += colWidths[i];
            });
            y += 20;

            // Table rows
            doc.font('Helvetica').fontSize(8);
            reports.forEach((user) => {
                x = 30;
                const rowData = [
                    user.name,
                    user.role,
                    user.stadium?.name || '—',
                    user.department?.name || '—',
                    user.department?.code || '—',
                    user.assignedCarts.toString(),
                    user.activitySummary.totalCheckIns.toString(),
                    user.activitySummary.totalCheckOuts.toString(),
                    user.activitySummary.issuesReported.toString(),
                ];
                rowData.forEach((data, i) => {
                    doc.text(data, x, y, { width: colWidths[i], align: i < 2 ? 'left' : 'center' });
                    x += colWidths[i];
                });
                y += 15;

                // Check if we need a new page
                if (y > doc.page.height - 50) {
                    doc.addPage();
                    y = 30;
                }
            });

            // Summary
            y += 10;
            doc.font('Helvetica-Bold').fontSize(9);
            doc.text(`Total Users: ${reports.length}`, 30, y);

            doc.end();
        } catch (error) {
            res.status(500).json({ error: 'Failed to export user report PDF' });
        }
    }

    // ==================== PRINT LABELS ====================

    static async exportLabelsDocx(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.query as any;
            let filterStadiumId = stadiumId;

            // RBAC scoping
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            // Get fleet data and system settings
            const [labelsData, settings] = await Promise.all([
                reportsService.getLabelsData({ stadiumId: filterStadiumId }),
                prisma.systemSettings.findFirst(),
            ]);

            // Create Word document with landscape orientation
            const doc = new Document({
                sections: [{
                    properties: {
                        page: {
                            size: {
                                orientation: PageOrientation.LANDSCAPE,
                            },
                            margin: {
                                top: 720, // 0.5 inch
                                right: 720,
                                bottom: 720,
                                left: 720,
                            },
                        },
                    },
                    headers: settings?.headerUrl ? {
                        default: new Header({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({
                                            text: settings.tournamentName || 'Golf Cart Management System',
                                            bold: true,
                                            size: 28,
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    } : undefined,
                    footers: settings?.footerText ? {
                        default: new Footer({
                            children: [
                                new Paragraph({
                                    alignment: AlignmentType.CENTER,
                                    children: [
                                        new TextRun({
                                            text: settings.footerText,
                                            size: 20,
                                        }),
                                    ],
                                }),
                            ],
                        }),
                    } : undefined,
                    children: labelsData.flatMap((label, index) => {
                        // Each label is a centered paragraph with car number and FA code
                        // We add a page break after every 6 labels (2 columns x 3 rows)
                        const labelParagraphs = [
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 200 },
                                children: [
                                    new TextRun({
                                        text: label.carNumber,
                                        bold: true,
                                        size: 56, // Large font
                                    }),
                                ],
                            }),
                            new Paragraph({
                                alignment: AlignmentType.CENTER,
                                spacing: { after: 400 },
                                children: [
                                    new TextRun({
                                        text: label.faAccreditationNumber ? `FA: ${label.faAccreditationNumber}` : 'FA: —',
                                        bold: true,
                                        size: 36,
                                    }),
                                ],
                            }),
                        ];

                        // Add page break after every 6 labels
                        if ((index + 1) % 6 === 0 && index < labelsData.length - 1) {
                            labelParagraphs.push(
                                new Paragraph({
                                    children: [new TextRun({ break: 1 })],
                                })
                            );
                        }

                        return labelParagraphs;
                    }),
                }],
            });

            const buffer = await Packer.toBuffer(doc);
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
            res.setHeader('Content-Disposition', 'attachment; filename=labels.docx');
            res.send(buffer);
        } catch (error) {
            console.error('Failed to export labels DOCX:', error);
            res.status(500).json({ error: 'Failed to export labels' });
        }
    }

    static async exportLabelsPptx(req: AuthRequest, res: Response) {
        try {
            const { stadiumId } = req.query as any;
            let filterStadiumId = stadiumId;

            // RBAC scoping
            if (req.user?.role === 'Admin') {
                filterStadiumId = req.user.stadiumId;
            }

            // Get fleet data and system settings
            const [labelsData, settings] = await Promise.all([
                reportsService.getLabelsData({ stadiumId: filterStadiumId }),
                prisma.systemSettings.findFirst(),
            ]);

            // Create PowerPoint presentation
            const pptx = new PptxGenJS();
            pptx.layout = 'LAYOUT_4x3'; // Landscape
            pptx.defineLayout({ name: 'LABEL', width: 10, height: 7.5 });

            // Add slide master with header/footer
            pptx.defineSlideMaster({
                title: 'LABEL_MASTER',
                background: { color: 'FFFFFF' },
                objects: settings?.headerUrl ? [
                    {
                        text: {
                            text: settings.tournamentName || 'Golf Cart Management System',
                            options: {
                                x: 0.5,
                                y: 0.3,
                                w: 9,
                                h: 0.5,
                                fontSize: 24,
                                bold: true,
                                align: 'center',
                            },
                        },
                    },
                ] : [],
            });

            // Each slide contains 6 labels (2 columns x 3 rows)
            const labelsPerSlide = 6;
            for (let i = 0; i < labelsData.length; i += labelsPerSlide) {
                const slideLabels = labelsData.slice(i, i + labelsPerSlide);
                const slide = pptx.addSlide({ masterName: 'LABEL_MASTER' });

                // Add footer if configured
                if (settings?.footerText) {
                    slide.addText(settings.footerText, {
                        x: 0.5,
                        y: 6.8,
                        w: 9,
                        h: 0.3,
                        fontSize: 12,
                        align: 'center',
                    });
                }

                // Add labels in a 2x3 grid
                slideLabels.forEach((label, idx) => {
                    const col = idx % 2;
                    const row = Math.floor(idx / 2);
                    const x = col * 4.5 + 0.5;
                    const y = row * 2 + 1.5;

                    // Car number - large and bold
                    slide.addText(label.carNumber, {
                        x: x,
                        y: y,
                        w: 4,
                        h: 0.8,
                        fontSize: 48,
                        bold: true,
                        align: 'center',
                        valign: 'middle',
                    });

                    // FA accreditation number
                    slide.addText(
                        label.faAccreditationNumber ? `FA: ${label.faAccreditationNumber}` : 'FA: —',
                        {
                            x: x,
                            y: y + 0.8,
                            w: 4,
                            h: 0.5,
                            fontSize: 24,
                            bold: true,
                            align: 'center',
                            valign: 'middle',
                        }
                    );
                });
            }

            const buffer = await pptx.write({ outputType: 'arraybuffer' }) as Buffer;
            res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
            res.setHeader('Content-Disposition', 'attachment; filename=labels.pptx');
            res.send(buffer);
        } catch (error) {
            console.error('Failed to export labels PPTX:', error);
            res.status(500).json({ error: 'Failed to export labels' });
        }
    }
}
