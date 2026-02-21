import { useState, useEffect } from 'react';
import { reportsApi, maintenanceApi, handoverApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, BarChart3, Wrench, Loader2, ArrowLeftRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface UtilizationStats {
    totalFleet: number;
    availableCount: number;
    inUseCount: number;
    maintenanceCount: number;
    utilizationRate: number;
    averageCheckOutDuration: number;
    maintenanceTasksPending: number;
}

export function ReportsPage() {
    const [stats, setStats] = useState<UtilizationStats | null>(null);
    const [maintenanceLogs, setMaintenanceLogs] = useState<any[]>([]);
    const [handoverLogs, setHandoverLogs] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [exporting, setExporting] = useState<string | null>(null);
    const { user: currentUser } = useAuthStore();

    const userRole = currentUser?.role;
    const isAdmin = userRole === 'Admin';
    const isLCC = userRole === 'LCC';
    const canViewReports = isAdmin || isLCC;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [statsRes, maintenanceRes, handoverRes] = await Promise.all([
                reportsApi.getUtilization().catch(() => ({ data: null })),
                maintenanceApi.getAll().catch(() => ({ data: { data: [] } })),
                handoverApi.getHistory().catch(() => ({ data: { data: [] } })),
            ]);
            setStats(statsRes.data);
            setMaintenanceLogs(maintenanceRes.data.data || []);
            setHandoverLogs((handoverRes.data.data || []).slice(0, 50)); // Limit to last 50
        } catch (error) {
            console.error('Failed to load report data:', error);
        } finally {
            setLoading(false);
        }
    };

    const downloadBlob = (blob: Blob, filename: string) => {
        const url = window.URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.setAttribute('download', filename);
        document.body.appendChild(link);
        link.click();
        link.remove();
        window.URL.revokeObjectURL(url);
    };

    const handleExportAudit = async () => {
        setExporting('audit');
        try {
            const response = await reportsApi.exportAudit();
            downloadBlob(response.data, `audit_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Failed to export audit logs:', error);
            alert('Failed to export audit logs. Please try again.');
        } finally {
            setExporting(null);
        }
    };

    const handleExportHandover = async () => {
        setExporting('handover');
        try {
            const response = await reportsApi.exportHandover();
            downloadBlob(response.data, `handover_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Failed to export handover logs:', error);
            alert('Failed to export handover logs. Please try again.');
        } finally {
            setExporting(null);
        }
    };

    const handleExportMaintenance = async () => {
        setExporting('maintenance');
        try {
            const response = await reportsApi.exportMaintenance();
            downloadBlob(response.data, `maintenance_logs_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch (error) {
            console.error('Failed to export maintenance logs:', error);
            alert('Failed to export maintenance logs. Please try again.');
        } finally {
            setExporting(null);
        }
    };

    const statusColors: Record<string, string> = {
        'Pending': 'bg-yellow-500',
        'InProgress': 'bg-blue-500',
        'Fixed': 'bg-green-500',
    };

    if (!canViewReports) {
        return (
            <div className="space-y-6">
                <h1 className="text-3xl font-bold">Reports</h1>
                <Card>
                    <CardContent className="py-12 text-center">
                        <p className="text-muted-foreground">
                            You don't have permission to view reports. Contact an administrator.
                        </p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Reports & Analytics</h1>
            </div>

            <Tabs defaultValue="overview">
                <TabsList>
                    <TabsTrigger value="overview">
                        <BarChart3 className="w-4 h-4 mr-2" />Overview
                    </TabsTrigger>
                    <TabsTrigger value="handover">
                        <ArrowLeftRight className="w-4 h-4 mr-2" />Handover
                    </TabsTrigger>
                    <TabsTrigger value="maintenance">
                        <Wrench className="w-4 h-4 mr-2" />Maintenance
                    </TabsTrigger>
                    {isAdmin && (
                        <TabsTrigger value="exports">
                            <Download className="w-4 h-4 mr-2" />Exports
                        </TabsTrigger>
                    )}
                </TabsList>

                <TabsContent value="overview">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Total Fleet
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stats?.totalFleet || 0}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Available
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-green-600">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stats?.availableCount || 0}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    In Use
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-blue-600">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stats?.inUseCount || 0}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    In Maintenance
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-yellow-600">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stats?.maintenanceCount || 0}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Utilization Rate
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : `${stats?.utilizationRate?.toFixed(1) || 0}%`}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Avg. Check-out Duration
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : `${Math.round(stats?.averageCheckOutDuration || 0)} min`}
                                </div>
                            </CardContent>
                        </Card>

                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-sm font-medium text-muted-foreground">
                                    Pending Maintenance
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="text-3xl font-bold text-red-600">
                                    {loading ? <Loader2 className="w-6 h-6 animate-spin" /> : stats?.maintenanceTasksPending || 0}
                                </div>
                            </CardContent>
                        </Card>
                    </div>
                </TabsContent>

                <TabsContent value="handover">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Recent Handover Activity</CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportHandover}
                                disabled={exporting === 'handover'}
                            >
                                {exporting === 'handover' ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4 mr-2" />
                                )}
                                Export Excel
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vehicle</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>Location</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ) : handoverLogs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No handover records found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        handoverLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell>{log.fleet?.unitNumber}</TableCell>
                                                <TableCell>{log.user?.name}</TableCell>
                                                <TableCell>
                                                    <Badge
                                                        className={log.action === 'CheckOut' ? 'bg-blue-500' : 'bg-green-500'}
                                                    >
                                                        {log.action === 'CheckOut' ? 'Check Out' : 'Check In'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    {log.latitude && log.longitude
                                                        ? `${log.latitude.toFixed(4)}, ${log.longitude.toFixed(4)}`
                                                        : '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="maintenance">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>Maintenance Report</CardTitle>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleExportMaintenance}
                                disabled={exporting === 'maintenance'}
                            >
                                {exporting === 'maintenance' ? (
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                ) : (
                                    <Download className="w-4 h-4 mr-2" />
                                )}
                                Export Excel
                            </Button>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vehicle</TableHead>
                                        <TableHead>Issue</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Reported At</TableHead>
                                        <TableHead>Fixed At</TableHead>
                                        <TableHead>Contractor</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ) : maintenanceLogs.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                                                No maintenance records found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        maintenanceLogs.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell>{log.fleet?.unitNumber}</TableCell>
                                                <TableCell className="max-w-xs truncate">
                                                    {log.issueDescription}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={statusColors[log.status]}>
                                                        {log.status}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>
                                                    {new Date(log.reportedAt).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    {log.fixedAt
                                                        ? new Date(log.fixedAt).toLocaleString()
                                                        : '-'}
                                                </TableCell>
                                                <TableCell>{log.contractor?.name || '-'}</TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {isAdmin && (
                    <TabsContent value="exports">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Card>
                                <CardHeader>
                                    <CardTitle>Audit Logs</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        Export complete audit trail of all system activities.
                                    </p>
                                    <Button
                                        onClick={handleExportAudit}
                                        disabled={exporting === 'audit'}
                                        className="w-full"
                                    >
                                        {exporting === 'audit' ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4 mr-2" />
                                        )}
                                        Export Audit Logs
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Handover Logs</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        Export all vehicle handover transactions.
                                    </p>
                                    <Button
                                        onClick={handleExportHandover}
                                        disabled={exporting === 'handover'}
                                        className="w-full"
                                    >
                                        {exporting === 'handover' ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4 mr-2" />
                                        )}
                                        Export Handover Logs
                                    </Button>
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader>
                                    <CardTitle>Maintenance Logs</CardTitle>
                                </CardHeader>
                                <CardContent className="space-y-4">
                                    <p className="text-sm text-muted-foreground">
                                        Export all maintenance and repair records.
                                    </p>
                                    <Button
                                        onClick={handleExportMaintenance}
                                        disabled={exporting === 'maintenance'}
                                        className="w-full"
                                    >
                                        {exporting === 'maintenance' ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4 mr-2" />
                                        )}
                                        Export Maintenance Logs
                                    </Button>
                                </CardContent>
                            </Card>
                        </div>
                    </TabsContent>
                )}
            </Tabs>
        </div>
    );
}
