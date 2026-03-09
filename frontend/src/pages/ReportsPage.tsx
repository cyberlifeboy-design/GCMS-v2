import { useState, useEffect } from 'react';
import { reportsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Download, Loader2, BarChart2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface UtilizationData {
    totalFleet?: number;
    total?: number;
    available?: number;
    dispatched?: number;
    underMaintenance?: number;
    utilizationRate?: number;
}

interface AuditLog {
    id: string;
    action: string;
    entity: string;
    userId?: string;
    user?: { name: string };
    createdAt: string;
}

export function ReportsPage() {
    const { user } = useAuthStore();
    const role = user?.role;
    const canViewReports = role === 'SuperAdmin' || role === 'Admin' || role === 'Observer';

    const [utilization, setUtilization] = useState<UtilizationData | null>(null);
    const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
    const [loadingUtil, setLoadingUtil] = useState(true);
    const [loadingAudit, setLoadingAudit] = useState(true);
    const [exporting, setExporting] = useState<'handover' | 'maintenance' | null>(null);

    useEffect(() => {
        if (!canViewReports) return;
        const loadUtil = async () => {
            try {
                const res = await reportsApi.getUtilization();
                setUtilization(res.data);
            } catch { } finally { setLoadingUtil(false); }
        };
        const loadAudit = async () => {
            try {
                const res = await reportsApi.getAuditLog();
                setAuditLogs(res.data.data || []);
            } catch { } finally { setLoadingAudit(false); }
        };
        loadUtil();
        loadAudit();
    }, [canViewReports]);

    const downloadBlob = (data: Blob, filename: string) => {
        const url = window.URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleExportHandover = async () => {
        setExporting('handover');
        try {
            const res = await reportsApi.exportHandover();
            downloadBlob(res.data, `handover_log_${new Date().toISOString().split('T')[0]}.csv`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    const handleExportMaintenance = async () => {
        setExporting('maintenance');
        try {
            const res = await reportsApi.exportMaintenance();
            downloadBlob(res.data, `maintenance_log_${new Date().toISOString().split('T')[0]}.csv`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    if (!canViewReports) {
        return (
            <div className="flex items-center justify-center h-64 text-muted-foreground">
                Access restricted. Reports are available for Admin, Observer, and SuperAdmin roles.
            </div>
        );
    }

    const total = utilization?.totalFleet ?? utilization?.total ?? 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Reports & Analytics</h1>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleExportHandover} disabled={!!exporting}>
                        {exporting === 'handover' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Handover Log
                    </Button>
                    <Button variant="outline" onClick={handleExportMaintenance} disabled={!!exporting}>
                        {exporting === 'maintenance' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                        Maintenance Log
                    </Button>
                </div>
            </div>

            {/* Fleet Utilization */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <BarChart2 className="w-5 h-5" />
                        <h2 className="font-semibold">Fleet Utilization</h2>
                    </div>
                </CardHeader>
                <CardContent>
                    {loadingUtil ? (
                        <div className="flex items-center justify-center h-24">
                            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                        </div>
                    ) : utilization ? (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            {[
                                { label: 'Total Carts', value: total, color: 'text-blue-600' },
                                { label: 'Available', value: utilization.available ?? 0, color: 'text-green-600' },
                                { label: 'Dispatched', value: utilization.dispatched ?? 0, color: 'text-indigo-600' },
                                { label: 'Maintenance', value: utilization.underMaintenance ?? 0, color: 'text-yellow-600' },
                            ].map(({ label, value, color }) => (
                                <div key={label} className="text-center p-4 bg-muted rounded-lg">
                                    <p className={`text-4xl font-bold ${color}`}>{value}</p>
                                    <p className="text-sm text-muted-foreground mt-1">{label}</p>
                                    {total > 0 && label !== 'Total Carts' && (
                                        <p className="text-xs text-muted-foreground">
                                            {((value / total) * 100).toFixed(1)}%
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <p className="text-muted-foreground">No utilization data available</p>
                    )}
                </CardContent>
            </Card>

            {/* Audit Log */}
            {(role === 'SuperAdmin' || role === 'Admin') && (
                <Card>
                    <CardHeader>
                        <h2 className="font-semibold">Audit Log (recent)</h2>
                    </CardHeader>
                    <CardContent>
                        {loadingAudit ? (
                            <div className="flex items-center justify-center h-24">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Entity</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Date/Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {auditLogs.length === 0 ? (
                                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No audit logs</TableCell></TableRow>
                                    ) : auditLogs.slice(0, 50).map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                <Badge variant="outline">{log.action}</Badge>
                                            </TableCell>
                                            <TableCell className="text-sm">{log.entity}</TableCell>
                                            <TableCell className="text-sm">{log.user?.name ?? '—'}</TableCell>
                                            <TableCell className="text-sm">{new Date(log.createdAt).toLocaleString()}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </CardContent>
                </Card>
            )}
        </div>
    );
}
