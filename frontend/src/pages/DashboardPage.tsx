import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsApi, notificationsApi, stadiumsApi, handoverApi, fleetApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Car, Wrench, Shield, Download, BarChart3, TrendingUp, Clock, MapPin, UserCheck, Bell, AlertCircle, ArrowRightLeft, Users, FileText, ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuthStore } from '@/stores/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ActiveCarsSection } from '@/components/shared/ActiveCarsSection';
import { formatDate } from '@/lib/dateUtils';

const cartStatusColors: Record<string, string> = {
    Available: 'bg-green-100 text-green-800',
    Dispatched: 'bg-blue-100 text-blue-800',
    'Under Maintenance': 'bg-red-100 text-red-800',
    Active: 'bg-purple-100 text-purple-800',
    Returned: 'bg-indigo-100 text-indigo-800',
};

function CartCard({ cart }: { cart: any }) {
    const [expanded, setExpanded] = useState(false);
    const [drivers, setDrivers] = useState<any[]>([]);
    const [dLoading, setDLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const toggle = async () => {
        if (!loaded) {
            setDLoading(true);
            try {
                const res = await fleetApi.getDrivers(cart.id);
                setDrivers(res.data.additionalDrivers || []);
            } catch { setDrivers([]); }
            finally { setDLoading(false); setLoaded(true); }
        }
        setExpanded(p => !p);
    };

    return (
        <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
            <div className="flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center">
                        <Car className="w-5 h-5 text-primary" />
                    </div>
                    <div>
                        <p className="font-bold text-base font-mono">{cart.carNumber}</p>
                        <p className="text-xs text-muted-foreground">{cart.carType}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <Badge className={`text-[10px] font-semibold ${cartStatusColors[cart.status] ?? 'bg-muted text-muted-foreground'}`}>
                        {cart.status}
                    </Badge>
                    <button
                        onClick={toggle}
                        className="text-xs text-muted-foreground hover:text-primary flex items-center gap-1 transition-colors"
                    >
                        <Users className="w-3.5 h-3.5" />
                        Drivers
                        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                    </button>
                </div>
            </div>
            {expanded && (
                <div className="border-t bg-muted/20 px-4 py-3">
                    {dLoading ? (
                        <div className="flex justify-center py-3"><Loader2 className="w-4 h-4 animate-spin" /></div>
                    ) : drivers.length === 0 ? (
                        <p className="text-xs text-muted-foreground py-1">No additional drivers assigned</p>
                    ) : (
                        <div className="space-y-2">
                            <p className="text-[10px] font-semibold uppercase text-muted-foreground">Additional Drivers ({drivers.length})</p>
                            {drivers.map((d: any, i: number) => (
                                <div key={i} className="flex items-center justify-between text-xs">
                                    <span className="font-medium">{d.name}</span>
                                    <span className="text-muted-foreground">{d.phone || d.accreditationNumber || '—'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// FA User focused dashboard
function FADashboard({ user }: { user: { name?: string; email?: string; stadium?: { id: string; name: string }; stadiumId?: string } }) {
    const navigate = useNavigate();
    const [poolDashboard, setPoolDashboard] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [unreadNotifs, setUnreadNotifs] = useState(0);

    useEffect(() => {
        Promise.all([
            handoverApi.getPoolDashboard(),
            notificationsApi.getAll({ limit: 50 }),
        ]).then(([poolRes, notifRes]) => {
            setPoolDashboard(poolRes.data);
            const notifs = notifRes.data.data || [];
            setUnreadNotifs(notifs.filter((n: any) => !n.isRead).length);
        }).catch(console.error).finally(() => setLoading(false));
    }, []);

    const userCarts: any[] = poolDashboard?.userAssignedCarts || [];
    const typeBreakdown = userCarts.reduce((acc: Record<string, number>, cart: any) => {
        acc[cart.carType] = (acc[cart.carType] || 0) + 1;
        return acc;
    }, {});

    const statCards = [
        { label: 'Assigned Carts', value: userCarts.length, icon: Car, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'Available', value: userCarts.filter(c => c.status === 'Available').length, icon: Shield, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'In Use / Active', value: userCarts.filter(c => ['Dispatched', 'Active'].includes(c.status)).length, icon: ArrowRightLeft, color: 'text-amber-600', bg: 'bg-amber-50' },
        { label: 'Unread Notifications', value: unreadNotifs, icon: Bell, color: 'text-purple-600', bg: 'bg-purple-50', onClick: () => navigate('/notifications') },
    ];

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight">Dashboard</h1>
                <p className="text-muted-foreground mt-1 flex items-center gap-2">
                    <MapPin className="w-4 h-4" />
                    Venue: <span className="font-semibold">{user.stadium?.name || 'Unassigned'}</span>
                </p>
            </div>

            {/* Analytics cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {statCards.map(s => (
                    <Card
                        key={s.label}
                        className={`border-none shadow-sm cursor-pointer transition-shadow hover:shadow-md ${s.bg}`}
                        onClick={s.onClick}
                    >
                        <CardContent className="pt-5 pb-4 px-5 flex flex-col gap-2">
                            <s.icon className={`w-5 h-5 ${s.color}`} />
                            {loading ? (
                                <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                            ) : (
                                <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                            )}
                            <p className="text-xs text-muted-foreground font-medium">{s.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Cart type breakdown */}
            {!loading && Object.keys(typeBreakdown).length > 1 && (
                <Card className="border-none shadow-sm">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Fleet by Type</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        {Object.entries(typeBreakdown).map(([type, count]) => (
                            <div key={type} className="bg-muted/40 rounded-lg p-3 text-center">
                                <p className="text-2xl font-black text-primary">{count as number}</p>
                                <p className="text-xs text-muted-foreground mt-1">{type}</p>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Cart list with additional drivers */}
            <Card className="border-none shadow-md overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-primary/5 to-transparent border-b py-4">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Car className="w-4 h-4 text-primary" /> My Assigned Carts
                    </CardTitle>
                    <CardDescription>Click "Drivers" on any cart to view assigned additional drivers</CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : userCarts.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <Car className="w-10 h-10 mx-auto mb-3 opacity-20" />
                            <p>No carts assigned to you yet</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {userCarts.map((cart: any) => <CartCard key={cart.id} cart={cart} />)}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Quick Actions */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Button className="h-14 text-sm flex-col gap-1" onClick={() => navigate('/handover')}>
                    <ArrowRightLeft className="w-5 h-5" /> Check-In / Out
                </Button>
                <Button variant="outline" className="h-14 text-sm flex-col gap-1" onClick={() => navigate('/usage-history')}>
                    <Clock className="w-5 h-5" /> Usage History
                </Button>
                <Button variant="outline" className="h-14 text-sm flex-col gap-1" onClick={() => navigate('/my-reports')}>
                    <FileText className="w-5 h-5" /> My Reports
                </Button>
                <Button variant="outline" className="h-14 text-sm flex-col gap-1 relative" onClick={() => navigate('/notifications')}>
                    <Bell className="w-5 h-5" />
                    Notifications
                    {unreadNotifs > 0 && (
                        <span className="absolute top-2 right-2 w-4 h-4 rounded-full bg-red-500 text-white text-[9px] flex items-center justify-center font-bold">
                            {unreadNotifs > 9 ? '9+' : unreadNotifs}
                        </span>
                    )}
                </Button>
            </div>
        </div>
    );
}

const downloadBlob = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
};

interface StadiumInfo {
    id: string;
    name: string;
    code: string;
    location: string;
    totalCarts: number;
    activeFAs: number;
    fleetBreakdown: Record<string, number>;
}

interface FAFleetInfo {
    id: string;
    name: string;
    email: string;
    stadium: { id: string; name: string } | null;
    totalAssigned: number;
    carts: Array<{ id: string; carNumber: string; carType: string; status: string }>;
}

interface NotificationStats {
    issuesReported: number;
    checkIns: number;
    checkOuts: number;
    carRequests: number;
    pendingRequests: number;
    openIssues: number;
}

interface DashboardStats {
    fleetByType: Array<{ type: string, count: number }>;
    fleetByStatus: Array<{ status: string, count: number }>;
    activeUsersCount: number;
    openIssuesCount: number;
    vapCartsCount: number;
    activityTimeline: Array<{ date: string, checkIn: number, checkOut: number }>;
    activeStadiumsCount: number;
    stadiums: StadiumInfo[];
    faFleetOverview: FAFleetInfo[];
}

const COLORS = ['#1E88E5', '#43A047', '#FDD835', '#E53935', '#8E24AA'];

export function DashboardPage() {
    const { user } = useAuthStore();
    const navigate = useNavigate();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [notifStats, setNotifStats] = useState<NotificationStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const isAdmin = user?.role === 'Admin';
    // Admin is always scoped to their venue — no filter control
    const [stadiumFilter, setStadiumFilter] = useState<string>(
        isAdmin && user?.stadiumId ? user.stadiumId : ''
    );

    const loadStats = async (stadiumId?: string) => {
        try {
            setLoading(true);
            const params: Record<string, string> = {};
            if (stadiumId) params.stadiumId = stadiumId;
            const [statsRes, notifRes] = await Promise.all([
                reportsApi.getUtilization(params),
                notificationsApi.getStats()
            ]);
            setStats(statsRes.data);
            setNotifStats(notifRes.data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        const loadStadiums = async () => {
            try {
                const res = await stadiumsApi.getAll();
                setStadiums(res.data?.data || res.data || []);
            } catch (e) { /* ignore */ }
        };
        // Admin is venue-locked; others need the full list for the filter dropdown
        if (!isAdmin) loadStadiums();
        loadStats(stadiumFilter || undefined);
    }, []);

    useEffect(() => {
        loadStats(stadiumFilter || undefined);
    }, [stadiumFilter]);

    const totalCarts = stats?.fleetByStatus.reduce((acc, curr) => acc + curr.count, 0) || 0;

    const summaryCards = [
        ...(!isAdmin ? [{ label: 'Active Stadiums', value: stats?.activeStadiumsCount || 0, icon: MapPin, color: 'text-cyan-500', bg: 'bg-cyan-50', path: '/stadiums' }] : []),
        { label: 'Total Carts', value: totalCarts, icon: Car, color: 'text-blue-500', bg: 'bg-blue-50', path: '/fleet' },
        { label: 'Active FAs', value: stats?.activeUsersCount || 0, icon: UserCheck, color: 'text-green-500', bg: 'bg-green-50', path: '/users' },
        { label: 'Open Issues', value: stats?.openIssuesCount || 0, icon: Wrench, color: 'text-red-500', bg: 'bg-red-50', path: '/maintenance' },
        { label: 'VAP Required', value: stats?.vapCartsCount || 0, icon: Shield, color: 'text-purple-500', bg: 'bg-purple-50', path: '/fleet?vap=true' },
    ];

    // Status color mapping
    const getStatusColor = (status: string) => {
        switch (status) {
            case 'Available': return 'bg-green-100 text-green-800';
            case 'Assigned': return 'bg-blue-100 text-blue-800';
            case 'Active': return 'bg-purple-100 text-purple-800';
            case 'Dispatched': return 'bg-amber-100 text-amber-800';
            case 'Returned': return 'bg-indigo-100 text-indigo-800';
            case 'HandbackPending': return 'bg-slate-100 text-slate-800';
            case 'Under Maintenance': return 'bg-red-100 text-red-800';
            default: return 'bg-gray-100 text-gray-800';
        }
    };

    const statusData = stats?.fleetByStatus.map(s => ({ name: s.status, value: s.count })) || [];

    const handleExport = async (type: string) => {
        try {
            let blob: Blob;
            let filename: string;

            let response;
            switch (type) {
                case 'Fleet Overview':
                    response = await reportsApi.exportFleet();
                    blob = response.data;
                    filename = 'fleet_overview.xlsx';
                    break;
                case 'Activity Timeline':
                    response = await reportsApi.exportActivity();
                    blob = response.data;
                    filename = 'activity_timeline.xlsx';
                    break;
                case 'Full System':
                    response = await reportsApi.exportFull();
                    blob = response.data;
                    filename = 'gcms_full_report.xlsx';
                    break;
                default:
                    response = await reportsApi.exportFull();
                    blob = response.data;
                    filename = 'gcms_report.xlsx';
            }

            downloadBlob(blob, filename);
        } catch (err) {
            console.error('Export failed:', err);
            alert('Failed to export report. Please try again.');
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-[60vh]">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    // FA users get a focused dashboard showing only their assigned venue & cars
    if (user?.role === 'FA') {
        return <FADashboard user={user} />;
    }

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Viewing: <span className="font-semibold">
                            {isAdmin
                                ? (user?.stadium?.name ?? 'My Venue')
                                : stadiumFilter
                                    ? (stadiums.find(s => s.id === stadiumFilter)?.name ?? 'Filtered Venue')
                                    : 'All Venues'}
                        </span> —
                        Role: <span className="text-xs uppercase px-1.5 py-0.5 bg-muted rounded">{user?.role}</span>
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {!isAdmin && stadiums.length > 0 && (
                        <Select value={stadiumFilter || '__all__'} onValueChange={v => setStadiumFilter(v === '__all__' ? '' : v)}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="All Stadiums" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All Stadiums</SelectItem>
                                {stadiums.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.code} – {s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                    <Button variant="outline" onClick={() => handleExport('Full System')}>
                        <Download className="w-4 h-4 mr-2" /> Export Full Report
                    </Button>
                </div>
            </div>

            {/* Summary Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                {summaryCards.map(({ label, value, icon: Icon, color, bg, path }) => (
                    <Card
                        key={label}
                        className={`${bg} border-none shadow-sm cursor-pointer hover:shadow-md hover:scale-[1.02] transition-all duration-200`}
                        onClick={() => navigate(path)}
                    >
                        <CardContent className="pt-6">
                            <div className="flex items-center gap-4">
                                <div className={`p-3 rounded-full bg-white shadow-sm`}>
                                    <Icon className={`w-6 h-6 ${color}`} />
                                </div>
                                <div>
                                    <p className="text-2xl font-bold">{value}</p>
                                    <p className="text-sm text-muted-foreground">{label}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* System Activity Summary — directly below stats banner */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <Bell className="w-5 h-5 text-primary" /> System Activity Summary
                    </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
                        <div
                            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate('/maintenance')}
                        >
                            <div className="p-3 rounded-full bg-red-100 mb-2">
                                <Wrench className="w-5 h-5 text-red-600" />
                            </div>
                            <p className="text-2xl font-bold">{notifStats?.openIssues || 0}</p>
                            <p className="text-xs text-muted-foreground text-center">Open Issues</p>
                        </div>
                        <div
                            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate('/handover')}
                        >
                            <div className="p-3 rounded-full bg-green-100 mb-2">
                                <ArrowRightLeft className="w-5 h-5 text-green-600" />
                            </div>
                            <p className="text-2xl font-bold">{notifStats?.checkIns || 0}</p>
                            <p className="text-xs text-muted-foreground text-center">Check-Ins</p>
                        </div>
                        <div
                            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate('/handover')}
                        >
                            <div className="p-3 rounded-full bg-blue-100 mb-2">
                                <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                            </div>
                            <p className="text-2xl font-bold">{notifStats?.checkOuts || 0}</p>
                            <p className="text-xs text-muted-foreground text-center">Check-Outs</p>
                        </div>
                        <div
                            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate('/requests')}
                        >
                            <div className="p-3 rounded-full bg-purple-100 mb-2">
                                <Car className="w-5 h-5 text-purple-600" />
                            </div>
                            <p className="text-2xl font-bold">{notifStats?.carRequests || 0}</p>
                            <p className="text-xs text-muted-foreground text-center">Car Requests</p>
                        </div>
                        <div
                            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate('/requests?status=Pending')}
                        >
                            <div className="p-3 rounded-full bg-yellow-100 mb-2">
                                <AlertCircle className="w-5 h-5 text-yellow-600" />
                            </div>
                            <p className="text-2xl font-bold">{notifStats?.pendingRequests || 0}</p>
                            <p className="text-xs text-muted-foreground text-center">Pending Requests</p>
                        </div>
                        <div
                            className="flex flex-col items-center p-4 rounded-lg bg-muted/50 hover:bg-muted cursor-pointer transition-colors"
                            onClick={() => navigate('/maintenance?status=Open')}
                        >
                            <div className="p-3 rounded-full bg-orange-100 mb-2">
                                <AlertCircle className="w-5 h-5 text-orange-600" />
                            </div>
                            <p className="text-2xl font-bold">{notifStats?.issuesReported || 0}</p>
                            <p className="text-xs text-muted-foreground text-center">Issues Reported</p>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Stadium Information & FA Fleet Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Stadiums List — Admin sees only their venue */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-cyan-500" />
                            {isAdmin ? 'My Venue' : 'Active Stadiums'}
                        </CardTitle>
                        {!isAdmin && <Badge variant="secondary">{stats?.activeStadiumsCount || 0} venues</Badge>}
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {stats?.stadiums.map((stadium) => (
                                <div key={stadium.id} className="p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                                    {/* Header: Stadium Code & Name */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <Badge variant="default" className="text-base font-bold px-3 py-1 bg-cyan-600">
                                                {stadium.code}
                                            </Badge>
                                            <div>
                                                <p className="font-semibold">{stadium.name}</p>
                                                <p className="text-sm text-muted-foreground">{stadium.location}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-2xl font-bold">{stadium.totalCarts}</p>
                                            <p className="text-xs text-muted-foreground">total carts</p>
                                        </div>
                                    </div>

                                    {/* Fleet Breakdown by Type */}
                                    <div className="grid grid-cols-4 gap-2 mb-3">
                                        <div className="bg-blue-100 dark:bg-blue-900/30 rounded p-2 text-center">
                                            <p className="text-lg font-bold text-blue-700 dark:text-blue-300">
                                                {stadium.fleetBreakdown?.['4-Seater'] || 0}
                                            </p>
                                            <p className="text-xs text-blue-600 dark:text-blue-400">4-Seater</p>
                                        </div>
                                        <div className="bg-green-100 dark:bg-green-900/30 rounded p-2 text-center">
                                            <p className="text-lg font-bold text-green-700 dark:text-green-300">
                                                {stadium.fleetBreakdown?.['6-Seater'] || 0}
                                            </p>
                                            <p className="text-xs text-green-600 dark:text-green-400">6-Seater</p>
                                        </div>
                                        <div className="bg-orange-100 dark:bg-orange-900/30 rounded p-2 text-center">
                                            <p className="text-lg font-bold text-orange-700 dark:text-orange-300">
                                                {stadium.fleetBreakdown?.['Cargo'] || 0}
                                            </p>
                                            <p className="text-xs text-orange-600 dark:text-orange-400">Cargo</p>
                                        </div>
                                        <div className="bg-purple-100 dark:bg-purple-900/30 rounded p-2 text-center">
                                            <p className="text-lg font-bold text-purple-700 dark:text-purple-300">
                                                {stadium.fleetBreakdown?.['Accessibility'] || 0}
                                            </p>
                                            <p className="text-xs text-purple-600 dark:text-purple-400">Accessible</p>
                                        </div>
                                    </div>

                                    {/* FA Count */}
                                    <div className="flex items-center justify-between pt-2 border-t border-border">
                                        <div className="flex items-center gap-2">
                                            <UserCheck className="w-4 h-4 text-green-500" />
                                            <span className="text-sm text-muted-foreground">FAs Assigned</span>
                                        </div>
                                        <Badge variant="outline" className="font-semibold">
                                            {stadium.activeFAs} active
                                        </Badge>
                                    </div>
                                </div>
                            ))}
                            {(!stats?.stadiums || stats.stadiums.length === 0) && (
                                <p className="text-center text-muted-foreground py-8">No active stadiums</p>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* FA Fleet Overview */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <UserCheck className="w-5 h-5 text-green-500" /> FA Fleet Assignments
                        </CardTitle>
                        <Badge variant="secondary">{stats?.faFleetOverview?.length || 0} FAs</Badge>
                    </CardHeader>
                    <CardContent className="pt-4">
                        <div className="space-y-3 max-h-[300px] overflow-y-auto">
                            {stats?.faFleetOverview.map((fa) => (
                                <div key={fa.id} className="p-3 rounded-lg bg-muted/50 hover:bg-muted transition-colors">
                                    <div className="flex items-center justify-between mb-2">
                                        <div>
                                            <p className="font-medium">{fa.name}</p>
                                            <p className="text-sm text-muted-foreground">{fa.stadium?.name || 'Unassigned'}</p>
                                        </div>
                                        <Badge variant="outline">{fa.totalAssigned} carts</Badge>
                                    </div>
                                    {fa.carts.length > 0 && (
                                        <div className="flex flex-wrap gap-1 mt-2">
                                            {fa.carts.map((cart) => (
                                                <span
                                                    key={cart.id}
                                                    className={`text-xs px-2 py-1 rounded ${getStatusColor(cart.status)}`}
                                                    title={`${cart.carNumber} - ${cart.carType}`}
                                                >
                                                    {cart.carNumber}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                            {(!stats?.faFleetOverview || stats.faFleetOverview.length === 0) && (
                                <p className="text-center text-muted-foreground py-8">No active FA assignments</p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Fleet Overview by Type */}
                <Card className="lg:col-span-2">
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <BarChart3 className="w-5 h-5 text-blue-500" /> Fleet Overview by Type
                        </CardTitle>
                        <Button variant="ghost" size="icon" onClick={() => handleExport('Fleet Overview')}><Download className="w-4 h-4" /></Button>
                    </CardHeader>
                    <CardContent className="pt-4 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={stats?.fleetByType}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                                <XAxis dataKey="type" />
                                <YAxis />
                                <Tooltip />
                                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>

                {/* Cart Status Summary */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Clock className="w-5 h-5 text-green-500" /> Status Summary
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={statusData}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    dataKey="value"
                                >
                                    {statusData.map((_entry, index) => (
                                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                    ))}
                                </Pie>
                                <Tooltip />
                                <Legend />
                            </PieChart>
                        </ResponsiveContainer>
                    </CardContent>
                </Card>
            </div>

            {/* Active Cars in Use */}
            <ActiveCarsSection refreshKey={0} />

            {/* Activity Timeline */}
            <Card>
                <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg font-semibold flex items-center gap-2">
                        <TrendingUp className="w-5 h-5 text-orange-500" /> Activity Timeline (Last 7 Days)
                    </CardTitle>
                    <Button variant="ghost" size="icon" onClick={() => handleExport('Activity Timeline')}><Download className="w-4 h-4" /></Button>
                </CardHeader>
                <CardContent className="pt-4 h-[350px]">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={stats?.activityTimeline}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} />
                            <XAxis
                                dataKey="date"
                                tickFormatter={(val) => formatDate(val)}
                                tick={{ fontSize: 12 }}
                            />
                            <YAxis tick={{ fontSize: 12 }} />
                            <Tooltip labelFormatter={(label) => formatDate(label)} />
                            <Legend />
                            <Line type="monotone" dataKey="checkIn" name="Check-Ins" stroke="#10b981" strokeWidth={2} activeDot={{ r: 8 }} />
                            <Line type="monotone" dataKey="checkOut" name="Check-Outs" stroke="#3b82f6" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>

            {/* Notification Summary - removed, moved above */}
        </div>
    );
}
