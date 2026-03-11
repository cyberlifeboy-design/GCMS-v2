import { useState, useEffect } from 'react';
import { reportsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, BarChart2, Building2, Users, FileSpreadsheet, FileText } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface UtilizationData {
    totalFleet?: number;
    total?: number;
    available?: number;
    dispatched?: number;
    underMaintenance?: number;
    utilizationRate?: number;
}

interface StadiumReport {
    id: string;
    name: string;
    code: string;
    location: string;
    totalCarts: number;
    cartsByStatus: Record<string, number>;
    cartsByType: Record<string, number>;
    vapCarts: number;
    activeFAs: number;
    openIssues: number;
    recentActivity: {
        checkIns: number;
        checkOuts: number;
    };
}

interface DepartmentReport {
    id: string;
    name: string;
    code: string | null;
    stadium: { id: string; name: string };
    totalCarts: number;
    cartsByStatus: Record<string, number>;
    assignedFAs: number;
    activeFAs: number;
    handoverActivity: {
        checkIns: number;
        checkOuts: number;
    };
}

interface UserReport {
    id: string;
    name: string;
    email: string;
    role: string;
    stadium: { id: string; name: string } | null;
    department: { id: string; name: string } | null;
    isActive: boolean;
    assignedCarts: number;
    cartDetails: Array<{
        id: string;
        carNumber: string;
        carType: string;
        status: string;
    }>;
    activitySummary: {
        totalCheckIns: number;
        totalCheckOuts: number;
        issuesReported: number;
        lastActivity: string | null;
    };
}

export function ReportsPage() {
    const { user } = useAuthStore();
    const role = user?.role;
    const canViewReports = role === 'SuperAdmin' || role === 'Admin' || role === 'Observer';

    const [utilization, setUtilization] = useState<UtilizationData | null>(null);
    const [stadiumReports, setStadiumReports] = useState<StadiumReport[]>([]);
    const [departmentReports, setDepartmentReports] = useState<DepartmentReport[]>([]);
    const [userReports, setUserReports] = useState<UserReport[]>([]);

    const [loadingUtil, setLoadingUtil] = useState(true);
    const [loadingStadium, setLoadingStadium] = useState(false);
    const [loadingDept, setLoadingDept] = useState(false);
    const [loadingUser, setLoadingUser] = useState(false);
    const [exporting, setExporting] = useState<string | null>(null);

    const [selectedStadiumFilter, setSelectedStadiumFilter] = useState<string>('');
    const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('');

    useEffect(() => {
        if (!canViewReports) return;
        const loadUtil = async () => {
            try {
                const res = await reportsApi.getUtilization();
                setUtilization(res.data);
            } catch { } finally { setLoadingUtil(false); }
        };
        loadUtil();
    }, [canViewReports]);

    const loadStadiumReports = async () => {
        setLoadingStadium(true);
        try {
            const res = await reportsApi.getStadiumReports();
            setStadiumReports(res.data);
        } catch { } finally { setLoadingStadium(false); }
    };

    const loadDepartmentReports = async () => {
        setLoadingDept(true);
        try {
            const params: Record<string, string> = {};
            if (selectedStadiumFilter) params.stadiumId = selectedStadiumFilter;
            const res = await reportsApi.getDepartmentReports(params);
            setDepartmentReports(res.data);
        } catch { } finally { setLoadingDept(false); }
    };

    const loadUserReports = async () => {
        setLoadingUser(true);
        try {
            const params: Record<string, string> = {};
            if (selectedStadiumFilter) params.stadiumId = selectedStadiumFilter;
            if (selectedRoleFilter) params.role = selectedRoleFilter;
            const res = await reportsApi.getUserReports(params);
            setUserReports(res.data);
        } catch { } finally { setLoadingUser(false); }
    };

    const downloadBlob = (data: Blob, filename: string) => {
        const url = window.URL.createObjectURL(data);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        window.URL.revokeObjectURL(url);
    };

    const handleExportStadium = async (format: 'xlsx' | 'pdf') => {
        setExporting('stadium');
        try {
            const res = await reportsApi.exportStadiumReport(format);
            const ext = format === 'pdf' ? 'pdf' : 'xlsx';
            downloadBlob(res.data, `stadium_report_${new Date().toISOString().split('T')[0]}.${ext}`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    const handleExportDepartment = async () => {
        setExporting('department');
        try {
            const res = await reportsApi.exportDepartmentReport();
            downloadBlob(res.data, `department_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    const handleExportUser = async (format: 'xlsx' | 'pdf') => {
        setExporting('user');
        try {
            const res = await reportsApi.exportUserReport(format);
            const ext = format === 'pdf' ? 'pdf' : 'xlsx';
            downloadBlob(res.data, `user_report_${new Date().toISOString().split('T')[0]}.${ext}`);
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
            </div>

            {/* Fleet Utilization Overview */}
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <BarChart2 className="w-5 h-5" />
                        <CardTitle>Fleet Utilization</CardTitle>
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

            {/* Report Tabs */}
            <Tabs defaultValue="stadiums" className="space-y-4">
                <TabsList className="grid w-full grid-cols-3">
                    <TabsTrigger value="stadiums" className="flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Stadium Reports
                    </TabsTrigger>
                    <TabsTrigger value="departments" className="flex items-center gap-2">
                        <FileSpreadsheet className="w-4 h-4" />
                        Department Reports
                    </TabsTrigger>
                    <TabsTrigger value="users" className="flex items-center gap-2">
                        <Users className="w-4 h-4" />
                        User Reports
                    </TabsTrigger>
                </TabsList>

                {/* Stadium Reports Tab */}
                <TabsContent value="stadiums">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Stadium-wise Report</CardTitle>
                                <div className="flex gap-2">
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExportStadium('xlsx')}
                                        disabled={exporting === 'stadium'}
                                    >
                                        {exporting === 'stadium' ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                                        )}
                                        Excel
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExportStadium('pdf')}
                                        disabled={exporting === 'stadium'}
                                    >
                                        <FileText className="w-4 h-4 mr-2" />
                                        PDF
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {loadingStadium ? (
                                <div className="flex items-center justify-center h-24">
                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                </div>
                            ) : stadiumReports.length === 0 ? (
                                <div className="text-center py-8">
                                    <p className="text-muted-foreground mb-4">No stadium data loaded</p>
                                    <Button onClick={loadStadiumReports}>Load Stadium Reports</Button>
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Stadium</TableHead>
                                                <TableHead className="text-center">Total Carts</TableHead>
                                                <TableHead className="text-center">Available</TableHead>
                                                <TableHead className="text-center">Assigned</TableHead>
                                                <TableHead className="text-center">Dispatched</TableHead>
                                                <TableHead className="text-center">Maintenance</TableHead>
                                                <TableHead className="text-center">VAP</TableHead>
                                                <TableHead className="text-center">Active FAs</TableHead>
                                                <TableHead className="text-center">Open Issues</TableHead>
                                                <TableHead className="text-center">Check-ins (7d)</TableHead>
                                                <TableHead className="text-center">Check-outs (7d)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {stadiumReports.map((stadium) => (
                                                <TableRow key={stadium.id}>
                                                    <TableCell className="font-medium">{stadium.name}</TableCell>
                                                    <TableCell className="text-center">{stadium.totalCarts}</TableCell>
                                                    <TableCell className="text-center text-green-600">
                                                        {stadium.cartsByStatus['Available'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center text-blue-600">
                                                        {stadium.cartsByStatus['Assigned'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center text-purple-600">
                                                        {stadium.cartsByStatus['Dispatched'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center text-yellow-600">
                                                        {stadium.cartsByStatus['Under Maintenance'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center">{stadium.vapCarts}</TableCell>
                                                    <TableCell className="text-center">{stadium.activeFAs}</TableCell>
                                                    <TableCell className="text-center">{stadium.openIssues}</TableCell>
                                                    <TableCell className="text-center">{stadium.recentActivity.checkIns}</TableCell>
                                                    <TableCell className="text-center">{stadium.recentActivity.checkOuts}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Department Reports Tab */}
                <TabsContent value="departments">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>Department-wise Report</CardTitle>
                                <div className="flex gap-2 items-center">
                                    {role === 'SuperAdmin' && (
                                        <Select value={selectedStadiumFilter} onValueChange={setSelectedStadiumFilter}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="All Stadiums" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="">All Stadiums</SelectItem>
                                            </SelectContent>
                                        </Select>
                                    )}
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={loadDepartmentReports}
                                        disabled={loadingDept}
                                    >
                                        {loadingDept ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : null}
                                        Load
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={handleExportDepartment}
                                        disabled={exporting === 'department' || departmentReports.length === 0}
                                    >
                                        {exporting === 'department' ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <Download className="w-4 h-4 mr-2" />
                                        )}
                                        Export
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {departmentReports.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Click "Load" to view department reports
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Department</TableHead>
                                                <TableHead>Stadium</TableHead>
                                                <TableHead className="text-center">Total Carts</TableHead>
                                                <TableHead className="text-center">Available</TableHead>
                                                <TableHead className="text-center">Assigned</TableHead>
                                                <TableHead className="text-center">Dispatched</TableHead>
                                                <TableHead className="text-center">Maintenance</TableHead>
                                                <TableHead className="text-center">Assigned FAs</TableHead>
                                                <TableHead className="text-center">Active FAs</TableHead>
                                                <TableHead className="text-center">Check-ins (7d)</TableHead>
                                                <TableHead className="text-center">Check-outs (7d)</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {departmentReports.map((dept) => (
                                                <TableRow key={dept.id}>
                                                    <TableCell className="font-medium">{dept.name}</TableCell>
                                                    <TableCell>{dept.stadium.name}</TableCell>
                                                    <TableCell className="text-center">{dept.totalCarts}</TableCell>
                                                    <TableCell className="text-center text-green-600">
                                                        {dept.cartsByStatus['Available'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center text-blue-600">
                                                        {dept.cartsByStatus['Assigned'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center text-purple-600">
                                                        {dept.cartsByStatus['Dispatched'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center text-yellow-600">
                                                        {dept.cartsByStatus['Under Maintenance'] || 0}
                                                    </TableCell>
                                                    <TableCell className="text-center">{dept.assignedFAs}</TableCell>
                                                    <TableCell className="text-center">{dept.activeFAs}</TableCell>
                                                    <TableCell className="text-center">{dept.handoverActivity.checkIns}</TableCell>
                                                    <TableCell className="text-center">{dept.handoverActivity.checkOuts}</TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* User Reports Tab */}
                <TabsContent value="users">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between">
                                <CardTitle>User Activity Report</CardTitle>
                                <div className="flex gap-2 items-center">
                                    <Select value={selectedRoleFilter} onValueChange={setSelectedRoleFilter}>
                                        <SelectTrigger className="w-32">
                                            <SelectValue placeholder="All Roles" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">All Roles</SelectItem>
                                            <SelectItem value="FA">FA</SelectItem>
                                            <SelectItem value="Admin">Admin</SelectItem>
                                            <SelectItem value="Observer">Observer</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={loadUserReports}
                                        disabled={loadingUser}
                                    >
                                        {loadingUser ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : null}
                                        Load
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExportUser('xlsx')}
                                        disabled={exporting === 'user' || userReports.length === 0}
                                    >
                                        {exporting === 'user' ? (
                                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        ) : (
                                            <FileSpreadsheet className="w-4 h-4 mr-2" />
                                        )}
                                        Excel
                                    </Button>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={() => handleExportUser('pdf')}
                                        disabled={exporting === 'user' || userReports.length === 0}
                                    >
                                        <FileText className="w-4 h-4 mr-2" />
                                        PDF
                                    </Button>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {userReports.length === 0 ? (
                                <div className="text-center py-8 text-muted-foreground">
                                    Click "Load" to view user reports
                                </div>
                            ) : (
                                <div className="overflow-x-auto">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Role</TableHead>
                                                <TableHead>Stadium</TableHead>
                                                <TableHead>Department</TableHead>
                                                <TableHead className="text-center">Assigned Carts</TableHead>
                                                <TableHead className="text-center">Check-ins</TableHead>
                                                <TableHead className="text-center">Check-outs</TableHead>
                                                <TableHead className="text-center">Issues</TableHead>
                                                <TableHead>Last Activity</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {userReports.map((u) => (
                                                <TableRow key={u.id}>
                                                    <TableCell className="font-medium">{u.name}</TableCell>
                                                    <TableCell className="text-sm">{u.email}</TableCell>
                                                    <TableCell>
                                                        <Badge variant="outline">{u.role}</Badge>
                                                    </TableCell>
                                                    <TableCell>{u.stadium?.name || '—'}</TableCell>
                                                    <TableCell>{u.department?.name || '—'}</TableCell>
                                                    <TableCell className="text-center">{u.assignedCarts}</TableCell>
                                                    <TableCell className="text-center">{u.activitySummary.totalCheckIns}</TableCell>
                                                    <TableCell className="text-center">{u.activitySummary.totalCheckOuts}</TableCell>
                                                    <TableCell className="text-center">{u.activitySummary.issuesReported}</TableCell>
                                                    <TableCell className="text-sm">
                                                        {u.activitySummary.lastActivity
                                                            ? new Date(u.activitySummary.lastActivity).toLocaleDateString()
                                                            : 'Never'}
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}