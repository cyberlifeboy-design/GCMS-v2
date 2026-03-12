import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportsApi, notificationsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Car, Wrench, Shield, Download, BarChart3, TrendingUp, Clock, MapPin, UserCheck, Bell, AlertCircle, ArrowRightLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { Badge } from '@/components/ui/badge';
import { ActiveCarsSection } from '@/components/shared/ActiveCarsSection';
import { formatDate } from '@/lib/dateUtils';

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

    const loadStats = async () => {
        try {
            setLoading(true);
            const [statsRes, notifRes] = await Promise.all([
                reportsApi.getUtilization(),
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
        loadStats();
    }, []);

    const totalCarts = stats?.fleetByStatus.reduce((acc, curr) => acc + curr.count, 0) || 0;

    const summaryCards = [
        { label: 'Active Stadiums', value: stats?.activeStadiumsCount || 0, icon: MapPin, color: 'text-cyan-500', bg: 'bg-cyan-50', path: '/stadiums' },
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
            case 'Dispatched': return 'bg-yellow-100 text-yellow-800';
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

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-start">
                <div>
                    <h1 className="text-3xl font-bold">Dashboard</h1>
                    <p className="text-muted-foreground mt-1">
                        Site: <span className="font-semibold">{user?.stadiumId ? 'Venue Scoped' : 'All Venues'}</span> —
                        Role: <span className="text-xs uppercase px-1.5 py-0.5 bg-muted rounded">{user?.role}</span>
                    </p>
                </div>
                <Button variant="outline" onClick={() => handleExport('Full System')}>
                    <Download className="w-4 h-4 mr-2" /> Export Full Report
                </Button>
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

            {/* Stadium Information & FA Fleet Overview */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Active Stadiums List */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between pb-2">
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <MapPin className="w-5 h-5 text-cyan-500" /> Active Stadiums
                        </CardTitle>
                        <Badge variant="secondary">{stats?.activeStadiumsCount || 0} venues</Badge>
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

            {/* Notification Summary */}
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
        </div>
    );
}
