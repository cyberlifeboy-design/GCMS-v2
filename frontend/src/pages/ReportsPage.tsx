import { useState, useEffect } from 'react';
import { reportsApi, stadiumsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Download, Loader2, BarChart2, Building2, Users, FileSpreadsheet, FileText, Tag, Activity, Search } from 'lucide-react';
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
    department: { id: string; name: string; code: string | null } | null;
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
    const defaultExportFormat = user?.exportFormat || 'xlsx';
    // Locked to a specific venue when Admin, or Observer with 'assigned' venue access
    const isStadiumLocked = !!(user?.stadiumId && (
        role === 'Admin' ||
        (role === 'Observer' && user.venueReportAccess === 'assigned')
    ));

    const [utilization, setUtilization] = useState<UtilizationData | null>(null);
    const [stadiumReports, setStadiumReports] = useState<StadiumReport[]>([]);
    const [departmentReports, setDepartmentReports] = useState<DepartmentReport[]>([]);
    const [userReports, setUserReports] = useState<UserReport[]>([]);

    const [loadingUtil, setLoadingUtil] = useState(true);
    const [loadingStadium, setLoadingStadium] = useState(false);
    const [loadingDept, setLoadingDept] = useState(false);
    const [loadingUser, setLoadingUser] = useState(false);
    const [exporting, setExporting] = useState<string | null>(null);

    const [selectedStadiumFilter, setSelectedStadiumFilter] = useState<string>(() => {
        if (user?.stadiumId && (
            user.role === 'Admin' ||
            (user.role === 'Observer' && user.venueReportAccess === 'assigned')
        )) return user.stadiumId;
        return '';
    });
    const [selectedRoleFilter, setSelectedRoleFilter] = useState<string>('');
    const [selectedLabelStadium, setSelectedLabelStadium] = useState<string>('');
    const [allStadiums, setAllStadiums] = useState<Array<{id: string; name: string; code: string}>>([]);

    // FA Audit Trail state
    const [faTrailLogs, setFaTrailLogs] = useState<any[]>([]);
    const [faTrailTotal, setFaTrailTotal] = useState(0);
    const [faTrailPage, setFaTrailPage] = useState(1);
    const [faTrailLoading, setFaTrailLoading] = useState(false);
    const [faTrailStadiumFilter, setFaTrailStadiumFilter] = useState<string>(() =>
        role === 'Admin' && user?.stadiumId ? user.stadiumId : ''
    );
    const [faTrailUserFilter, setFaTrailUserFilter] = useState<string>('');
    const [faUsers, setFaUsers] = useState<Array<{id: string; name: string; email: string}>>([]);

    const loadFaTrail = async (page = 1) => {
        setFaTrailLoading(true);
        try {
            const params: Record<string, unknown> = { page, limit: 25 };
            if (faTrailStadiumFilter) params.stadiumId = faTrailStadiumFilter;
            if (faTrailUserFilter) params.userId = faTrailUserFilter;
            const res = await reportsApi.getFaTrail(params);
            setFaTrailLogs(res.data.logs || []);
            setFaTrailTotal(res.data.total || 0);
            setFaTrailPage(page);
        } catch { } finally { setFaTrailLoading(false); }
    };

    useEffect(() => {
        if (!canViewReports) return;
        const loadUtil = async () => {
            try {
                const res = await reportsApi.getUtilization();
                setUtilization(res.data);
            } catch { } finally { setLoadingUtil(false); }
        };
        const loadStadiumsList = async () => {
            try {
                const res = await stadiumsApi.getAll({ isActive: true });
                setAllStadiums(res.data.data || res.data || []);
            } catch { }
        };
        const loadFaUsersList = async () => {
            try {
                const res = await usersApi.getAll({ role: 'FA' });
                const users = res.data.data || res.data || [];
                // Admin scoping: filter to own stadium
                const filtered = role === 'Admin' && user?.stadiumId
                    ? users.filter((u: any) => u.stadiumId === user.stadiumId)
                    : users;
                setFaUsers(filtered);
            } catch { }
        };
        loadUtil();
        loadStadiumsList();
        if (role === 'SuperAdmin' || role === 'Admin') loadFaUsersList();
    }, [canViewReports]);

    const loadStadiumReports = async () => {
        setLoadingStadium(true);
        try {
            const params: Record<string, string> = {};
            if (selectedStadiumFilter) params.stadiumId = selectedStadiumFilter;
            const res = await reportsApi.getStadiumReports(params);
            setStadiumReports(res.data.data || res.data || []);
        } catch { } finally { setLoadingStadium(false); }
    };

    const loadDepartmentReports = async () => {
        setLoadingDept(true);
        try {
            const params: Record<string, string> = {};
            if (selectedStadiumFilter) params.stadiumId = selectedStadiumFilter;
            const res = await reportsApi.getDepartmentReports(params);
            setDepartmentReports(res.data.data || res.data || []);
        } catch { } finally { setLoadingDept(false); }
    };

    const loadUserReports = async () => {
        setLoadingUser(true);
        try {
            const params: Record<string, string> = {};
            if (selectedStadiumFilter) params.stadiumId = selectedStadiumFilter;
            if (selectedRoleFilter) params.role = selectedRoleFilter;
            const res = await reportsApi.getUserReports(params);
            setUserReports(res.data.data || res.data || []);
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

    const handleExportStadium = async (format?: 'xlsx' | 'pdf') => {
        const actualFormat = format || defaultExportFormat;
        if (actualFormat === 'docx') {
            // Word format not supported yet, fall back to xlsx
            handleExportStadium('xlsx');
            return;
        }
        setExporting('stadium');
        try {
            const res = await reportsApi.exportStadiumReport(actualFormat as 'xlsx' | 'pdf');
            const ext = actualFormat === 'pdf' ? 'pdf' : 'xlsx';
            downloadBlob(res.data, `stadium_report_${new Date().toISOString().split('T')[0]}.${ext}`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    const handleExportDepartment = async () => {
        // Department only has Excel export currently
        setExporting('department');
        try {
            const res = await reportsApi.exportDepartmentReport();
            downloadBlob(res.data, `department_report_${new Date().toISOString().split('T')[0]}.xlsx`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    const handleExportUser = async (format?: 'xlsx' | 'pdf') => {
        const actualFormat = format || defaultExportFormat;
        if (actualFormat === 'docx') {
            // Word format not supported yet, fall back to xlsx
            handleExportUser('xlsx');
            return;
        }
        setExporting('user');
        try {
            const res = await reportsApi.exportUserReport(actualFormat as 'xlsx' | 'pdf');
            const ext = actualFormat === 'pdf' ? 'pdf' : 'xlsx';
            downloadBlob(res.data, `user_report_${new Date().toISOString().split('T')[0]}.${ext}`);
        } catch { alert('Export failed'); }
        finally { setExporting(null); }
    };

    const handleExportLabels = async (format: 'docx' | 'pptx' | 'pdf') => {
        setExporting('labels');
        try {
            const params: Record<string, unknown> = {};
            if (selectedLabelStadium) params.stadiumId = selectedLabelStadium;
            const res = await reportsApi.exportLabels(format, params);
            const ext = format;
            downloadBlob(res.data, `labels_${new Date().toISOString().split('T')[0]}.${ext}`);
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
                <TabsList className="grid w-full grid-cols-5">
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
                    <TabsTrigger value="fa-audit" className="flex items-center gap-2">
                        <Activity className="w-4 h-4" />
                        FA Audit Trail
                    </TabsTrigger>
                    <TabsTrigger value="labels" className="flex items-center gap-2">
                        <Tag className="w-4 h-4" />
                        Print Labels
                    </TabsTrigger>
                </TabsList>

                {/* Stadium Reports Tab */}
                <TabsContent value="stadiums">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <CardTitle>Stadium-wise Report</CardTitle>
                                <div className="flex gap-2 flex-wrap items-center">
                                    {!isStadiumLocked && (
                                        <Select value={selectedStadiumFilter || '__all__'} onValueChange={v => setSelectedStadiumFilter(v === '__all__' ? '' : v)}>
                                            <SelectTrigger className="w-44"><SelectValue placeholder="All Stadiums" /></SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">All Stadiums</SelectItem>
                                                {allStadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    )}
                                    <Button variant="outline" size="sm" onClick={loadStadiumReports} disabled={loadingStadium}>
                                        {loadingStadium ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}Load
                                    </Button>
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
                                                    <TableCell className="font-medium">
                                                        <span className="font-mono text-sm bg-muted px-1 rounded">{stadium.code}</span>
                                                        <span className="ml-2 text-muted-foreground text-sm">{stadium.name}</span>
                                                    </TableCell>
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
                                    {!isStadiumLocked && (
                                        <Select value={selectedStadiumFilter || '__all__'} onValueChange={v => setSelectedStadiumFilter(v === '__all__' ? '' : v)}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="All Stadiums" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">All Stadiums</SelectItem>
                                                {allStadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>)}
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
                            ) : (() => {
                                // Merge department rows by name, aggregating stadiums and stats
                                type MergedDept = {
                                    key: string;
                                    name: string;
                                    code: string | null;
                                    stadiumCodes: string[];
                                    totalCarts: number;
                                    cartsByStatus: Record<string, number>;
                                    assignedFAs: number;
                                    activeFAs: number;
                                    checkIns: number;
                                    checkOuts: number;
                                };
                                const mergedMap = new Map<string, MergedDept>();
                                for (const dept of departmentReports) {
                                    const key = dept.name;
                                    if (!mergedMap.has(key)) {
                                        mergedMap.set(key, {
                                            key,
                                            name: dept.name,
                                            code: dept.code,
                                            stadiumCodes: [],
                                            totalCarts: 0,
                                            cartsByStatus: {},
                                            assignedFAs: 0,
                                            activeFAs: 0,
                                            checkIns: 0,
                                            checkOuts: 0,
                                        });
                                    }
                                    const m = mergedMap.get(key)!;
                                    const sc = (dept.stadium as any)?.code || dept.stadium?.name;
                                    if (sc && !m.stadiumCodes.includes(sc)) m.stadiumCodes.push(sc);
                                    m.totalCarts += dept.totalCarts;
                                    for (const [status, count] of Object.entries(dept.cartsByStatus)) {
                                        m.cartsByStatus[status] = (m.cartsByStatus[status] || 0) + count;
                                    }
                                    m.assignedFAs += dept.assignedFAs;
                                    m.activeFAs += dept.activeFAs;
                                    m.checkIns += dept.handoverActivity.checkIns;
                                    m.checkOuts += dept.handoverActivity.checkOuts;
                                }
                                const merged = Array.from(mergedMap.values());
                                return (
                                    <div className="overflow-x-auto">
                                        <Table>
                                            <TableHeader>
                                                <TableRow>
                                                    <TableHead>Department</TableHead>
                                                    <TableHead>Code</TableHead>
                                                    <TableHead>Venues</TableHead>
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
                                                {merged.map((dept) => (
                                                    <TableRow key={dept.key}>
                                                        <TableCell className="font-medium">{dept.name}</TableCell>
                                                        <TableCell>{dept.code || '—'}</TableCell>
                                                        <TableCell>
                                                            <div className="flex flex-wrap gap-1">
                                                                {dept.stadiumCodes.map(sc => (
                                                                    <Badge key={sc} variant="outline" className="font-mono text-xs">{sc}</Badge>
                                                                ))}
                                                            </div>
                                                        </TableCell>
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
                                                        <TableCell className="text-center">{dept.checkIns}</TableCell>
                                                        <TableCell className="text-center">{dept.checkOuts}</TableCell>
                                                    </TableRow>
                                                ))}
                                            </TableBody>
                                        </Table>
                                    </div>
                                );
                            })()}
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
                                    <Select value={selectedRoleFilter || '__all__'} onValueChange={v => setSelectedRoleFilter(v === '__all__' ? '' : v)}>
                                        <SelectTrigger className="w-32">
                                            <SelectValue placeholder="All Roles" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__all__">All Roles</SelectItem>
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
                            ) : (() => {
                                const systemRoles = ['SuperAdmin', 'Admin', 'Observer'];
                                const systemUsers = userReports.filter(u => systemRoles.includes(u.role));
                                const faUsers = userReports.filter(u => u.role === 'FA');
                                const userTableHeaders = (showDept: boolean) => (
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Role</TableHead>
                                            {showDept && <TableHead>Stadium</TableHead>}
                                            {showDept && <TableHead>Department</TableHead>}
                                            {showDept && <TableHead>Dept Code</TableHead>}
                                            <TableHead className="text-center">Assigned Carts</TableHead>
                                            <TableHead className="text-center">Check-ins</TableHead>
                                            <TableHead className="text-center">Check-outs</TableHead>
                                            <TableHead className="text-center">Issues</TableHead>
                                            <TableHead>Last Activity</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                );
                                const userTableRow = (u: UserReport, showDept: boolean) => (
                                    <TableRow key={u.id}>
                                        <TableCell className="font-medium">{u.name}</TableCell>
                                        <TableCell className="text-sm">{u.email}</TableCell>
                                        <TableCell><Badge variant="outline">{u.role}</Badge></TableCell>
                                        {showDept && <TableCell>{u.stadium ? <span className="font-mono text-xs bg-muted px-1 rounded">{(u.stadium as any).code || u.stadium.name}</span> : '—'}</TableCell>}
                                        {showDept && <TableCell>{u.department?.name || '—'}</TableCell>}
                                        {showDept && <TableCell>{u.department?.code || '—'}</TableCell>}
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
                                );
                                return (
                                    <div className="space-y-6">
                                        {systemUsers.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-3 px-1">
                                                    <span className="text-sm font-semibold text-blue-700 dark:text-blue-400">🔧 System Users</span>
                                                    <Badge variant="secondary">{systemUsers.length}</Badge>
                                                </div>
                                                <div className="overflow-x-auto rounded-md border">
                                                    <Table>
                                                        {userTableHeaders(false)}
                                                        <TableBody>
                                                            {systemUsers.map(u => userTableRow(u, false))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        )}
                                        {faUsers.length > 0 && (
                                            <div>
                                                <div className="flex items-center gap-2 mb-3 px-1">
                                                    <span className="text-sm font-semibold text-green-700 dark:text-green-400">🏟️ FA Department Users</span>
                                                    <Badge variant="secondary">{faUsers.length}</Badge>
                                                </div>
                                                <div className="overflow-x-auto rounded-md border">
                                                    <Table>
                                                        {userTableHeaders(true)}
                                                        <TableBody>
                                                            {faUsers.map(u => userTableRow(u, true))}
                                                        </TableBody>
                                                    </Table>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })()}
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* FA Audit Trail Tab */}
                <TabsContent value="fa-audit">
                    <Card>
                        <CardHeader>
                            <div className="flex items-center justify-between flex-wrap gap-2">
                                <div>
                                    <CardTitle>FA User Audit Trail</CardTitle>
                                    <p className="text-sm text-muted-foreground mt-1">
                                        All check-in, check-out, and issue report actions by FA users
                                        {role === 'Admin' ? ' in your stadium' : ' across all stadiums'}.
                                    </p>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-4">
                                {/* Filters */}
                                <div className="flex gap-3 flex-wrap items-end">
                                    {!isStadiumLocked && (
                                        <div className="space-y-1 min-w-[180px]">
                                            <p className="text-xs font-medium text-muted-foreground">Stadium</p>
                                            <Select value={faTrailStadiumFilter || '__all__'} onValueChange={v => setFaTrailStadiumFilter(v === '__all__' ? '' : v)}>
                                                <SelectTrigger className="w-48">
                                                    <SelectValue placeholder="All Stadiums" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="__all__">All Stadiums</SelectItem>
                                                    {allStadiums.map(s => (
                                                        <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    )}
                                    <div className="space-y-1 min-w-[180px]">
                                        <p className="text-xs font-medium text-muted-foreground">FA User</p>
                                        <Select value={faTrailUserFilter || '__all__'} onValueChange={v => setFaTrailUserFilter(v === '__all__' ? '' : v)}>
                                            <SelectTrigger className="w-48">
                                                <SelectValue placeholder="All FA Users" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">All FA Users</SelectItem>
                                                {faUsers.map(u => (
                                                    <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <Button onClick={() => loadFaTrail(1)} disabled={faTrailLoading} size="sm">
                                        {faTrailLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Search className="w-4 h-4 mr-2" />}
                                        Load Trail
                                    </Button>
                                </div>

                                {/* Table */}
                                {faTrailLogs.length > 0 ? (
                                    <div className="space-y-2">
                                        <div className="overflow-x-auto rounded-md border">
                                            <Table>
                                                <TableHeader>
                                                    <TableRow>
                                                        <TableHead>Timestamp</TableHead>
                                                        <TableHead>FA User</TableHead>
                                                        <TableHead>Dept Code</TableHead>
                                                        <TableHead>Action</TableHead>
                                                        <TableHead>Car #</TableHead>
                                                        <TableHead>Venue</TableHead>
                                                        <TableHead>Notes</TableHead>
                                                    </TableRow>
                                                </TableHeader>
                                                <TableBody>
                                                    {faTrailLogs.map((log: any) => (
                                                        <TableRow key={log.id}>
                                                            <TableCell className="text-xs whitespace-nowrap">
                                                                {new Date(log.timestamp).toLocaleString()}
                                                            </TableCell>
                                                            <TableCell>
                                                                <div className="text-sm font-medium">{log.fa?.name}</div>
                                                                <div className="text-xs text-muted-foreground">{log.fa?.accreditationNumber}</div>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge variant="outline" className="font-mono text-xs">
                                                                    {log.departmentCode || log.fa?.departmentCode || '—'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell>
                                                                <Badge className={
                                                                    log.action === 'CheckedIn' ? 'bg-green-100 text-green-800' :
                                                                    log.action === 'CheckedOut' ? 'bg-blue-100 text-blue-800' :
                                                                    'bg-orange-100 text-orange-800'
                                                                }>
                                                                    {log.action === 'CheckedIn' ? 'Check In' :
                                                                     log.action === 'CheckedOut' ? 'Check Out' : 'Issue Reported'}
                                                                </Badge>
                                                            </TableCell>
                                                            <TableCell className="font-mono font-semibold">{log.car?.carNumber}</TableCell>
                                                            <TableCell className="text-sm">{log.stadium?.code || log.stadium?.name}</TableCell>
                                                            <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">
                                                                {log.conditionNotes || '—'}
                                                            </TableCell>
                                                        </TableRow>
                                                    ))}
                                                </TableBody>
                                            </Table>
                                        </div>
                                        <div className="flex items-center justify-between text-sm text-muted-foreground">
                                            <span>Showing {faTrailLogs.length} of {faTrailTotal} entries</span>
                                            <div className="flex gap-2">
                                                <Button size="sm" variant="outline" onClick={() => loadFaTrail(faTrailPage - 1)} disabled={faTrailPage <= 1 || faTrailLoading}>Previous</Button>
                                                <span className="self-center">Page {faTrailPage}</span>
                                                <Button size="sm" variant="outline" onClick={() => loadFaTrail(faTrailPage + 1)} disabled={faTrailLogs.length < 25 || faTrailLoading}>Next</Button>
                                            </div>
                                        </div>
                                    </div>
                                ) : faTrailLoading ? (
                                    <div className="flex items-center justify-center py-12">
                                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                    </div>
                                ) : (
                                    <div className="text-center py-12 text-muted-foreground">
                                        <Activity className="w-10 h-10 mx-auto mb-3 opacity-30" />
                                        <p>Click "Load Trail" to view FA user activity</p>
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Print Labels Tab */}
                <TabsContent value="labels">
                    <Card>
                        <CardHeader>
                            <CardTitle>Print Labels</CardTitle>
                            <p className="text-sm text-muted-foreground">
                                Generate printable labels for golf cars. Landscape orientation with car number, department code, and system branding.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="flex flex-col gap-4">
                                <div className="flex items-center gap-4 flex-wrap">
                                    <div className="space-y-1 min-w-[200px]">
                                        <p className="text-sm font-medium">Stadium Filter</p>
                                        <Select value={selectedLabelStadium || '__all__'} onValueChange={v => setSelectedLabelStadium(v === '__all__' ? '' : v)}>
                                            <SelectTrigger className="w-56">
                                                <SelectValue placeholder="All Stadiums" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="__all__">All Stadiums</SelectItem>
                                                {allStadiums.map(s => (
                                                    <SelectItem key={s.id} value={s.id}>{s.code} — {s.name}</SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium">Export Format</p>
                                        <div className="flex gap-2 flex-wrap">
                                            <Button
                                                size="sm"
                                                onClick={() => handleExportLabels('pdf')}
                                                disabled={exporting === 'labels'}
                                            >
                                                {exporting === 'labels' ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <FileText className="w-4 h-4 mr-2" />
                                                )}
                                                PDF (Recommended)
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleExportLabels('docx')}
                                                disabled={exporting === 'labels'}
                                            >
                                                {exporting === 'labels' ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <FileText className="w-4 h-4 mr-2" />
                                                )}
                                                Word Document
                                            </Button>
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => handleExportLabels('pptx')}
                                                disabled={exporting === 'labels'}
                                            >
                                                {exporting === 'labels' ? (
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                                ) : (
                                                    <FileSpreadsheet className="w-4 h-4 mr-2" />
                                                )}
                                                PowerPoint
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                                <div className="bg-muted p-4 rounded-lg">
                                    <h4 className="font-medium mb-2">Label Format</h4>
                                    <ul className="text-sm text-muted-foreground space-y-1">
                                        <li>• Page orientation: Landscape</li>
                                        <li>• Content centered on each page</li>
                                        <li>• Car number — large bold font (size 220, auto-adjusts for longer numbers)</li>
                                        <li>• Department code — below car number</li>
                                        <li>• Header logo — top left corner (from system branding)</li>
                                        <li>• Footer logo — bottom of page (from system branding)</li>
                                        <li>• Sequence continues for all assigned cars in selected stadium</li>
                                    </ul>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}