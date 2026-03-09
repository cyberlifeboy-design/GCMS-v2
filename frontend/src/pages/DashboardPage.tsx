import { useState, useEffect } from 'react';
import { reportsApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Car, Wrench, Users, Shield, Download, BarChart3, TrendingUp, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

interface DashboardStats {
    fleetByType: Array<{ type: string, count: number }>;
    fleetByStatus: Array<{ status: string, count: number }>;
    activeUsersCount: number;
    openIssuesCount: number;
    vapCartsCount: number;
    activityTimeline: Array<{ date: string, checkIn: number, checkOut: number }>;
}

const COLORS = ['#1E88E5', '#43A047', '#FDD835', '#E53935', '#8E24AA'];

export function DashboardPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<DashboardStats | null>(null);
    const [loading, setLoading] = useState(true);

    const loadStats = async () => {
        try {
            setLoading(true);
            const res = await reportsApi.getUtilization();
            setStats(res.data);
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
        { label: 'Total Carts', value: totalCarts, icon: Car, color: 'text-blue-500', bg: 'bg-blue-50' },
        { label: 'Active Users', value: stats?.activeUsersCount || 0, icon: Users, color: 'text-green-500', bg: 'bg-green-50' },
        { label: 'Open Issues', value: stats?.openIssuesCount || 0, icon: Wrench, color: 'text-red-500', bg: 'bg-red-50' },
        { label: 'VAP Required', value: stats?.vapCartsCount || 0, icon: Shield, color: 'text-purple-500', bg: 'bg-purple-50' },
    ];

    const statusData = stats?.fleetByStatus.map(s => ({ name: s.status, value: s.count })) || [];

    const handleExport = (type: string) => {
        alert(`Exporting ${type} report... (Feature implementation in progress)`);
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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {summaryCards.map(({ label, value, icon: Icon, color, bg }) => (
                    <Card key={label} className={`${bg} border-none shadow-sm`}>
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
                            <XAxis dataKey="date" tickFormatter={(str) => new Date(str).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' })} />
                            <YAxis />
                            <Tooltip labelFormatter={(label) => new Date(label).toLocaleDateString()} />
                            <Legend />
                            <Line type="monotone" dataKey="checkIn" name="Check-Ins" stroke="#10b981" strokeWidth={2} activeDot={{ r: 8 }} />
                            <Line type="monotone" dataKey="checkOut" name="Check-Outs" stroke="#3b82f6" strokeWidth={2} />
                        </LineChart>
                    </ResponsiveContainer>
                </CardContent>
            </Card>
        </div>
    );
}
