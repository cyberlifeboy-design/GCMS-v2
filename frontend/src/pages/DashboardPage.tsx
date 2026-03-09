import { useState, useEffect } from 'react';
import { reportsApi, fleetApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Car, CheckCircle, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/stores/authStore';

interface FleetStats {
    total: number;
    available: number;
    assigned: number;
    dispatched: number;
    underMaintenance: number;
}

export function DashboardPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState<FleetStats>({ total: 0, available: 0, assigned: 0, dispatched: 0, underMaintenance: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            try {
                // Use fleet list to compute stats
                const res = await fleetApi.getAll();
                const fleet: Array<{ status: string }> = res.data.data || [];
                setStats({
                    total: fleet.length,
                    available: fleet.filter(v => v.status === 'Available').length,
                    assigned: fleet.filter(v => v.status === 'Assigned').length,
                    dispatched: fleet.filter(v => v.status === 'Dispatched').length,
                    underMaintenance: fleet.filter(v => v.status === 'Under Maintenance').length,
                });
            } catch {
                // fallback: try reports/utilization
                try {
                    const res = await reportsApi.getUtilization();
                    const d = res.data;
                    setStats({
                        total: d.total ?? 0,
                        available: d.available ?? 0,
                        assigned: d.assigned ?? 0,
                        dispatched: d.dispatched ?? 0,
                        underMaintenance: d.underMaintenance ?? 0,
                    });
                } catch (e) {
                    console.error(e);
                }
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const statCards = [
        { label: 'Total Carts', value: stats.total, icon: Car, color: 'text-blue-500', bg: 'bg-blue-50 dark:bg-blue-950' },
        { label: 'Available', value: stats.available, icon: CheckCircle, color: 'text-green-500', bg: 'bg-green-50 dark:bg-green-950' },
        { label: 'Assigned', value: stats.assigned, icon: Car, color: 'text-purple-500', bg: 'bg-purple-50 dark:bg-purple-950' },
        { label: 'Dispatched', value: stats.dispatched, icon: Car, color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950' },
        { label: 'Under Maintenance', value: stats.underMaintenance, icon: Wrench, color: 'text-yellow-500', bg: 'bg-yellow-50 dark:bg-yellow-950' },
    ];

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-3xl font-bold">Dashboard</h1>
                <p className="text-muted-foreground mt-1">Welcome back, <span className="font-semibold">{user?.name}</span> — <span className="text-xs">{user?.role}</span></p>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
                {statCards.map(({ label, value, icon: Icon, color, bg }) => (
                    <Card key={label} className={bg}>
                        <CardContent className="pt-5 pb-4">
                            <div className="flex items-start gap-3">
                                <Icon className={`w-7 h-7 ${color} flex-shrink-0 mt-0.5`} />
                                <div>
                                    {loading ? (
                                        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
                                    ) : (
                                        <p className="text-3xl font-bold leading-none">{value}</p>
                                    )}
                                    <p className="text-xs text-muted-foreground mt-1">{label}</p>
                                </div>
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Quick Navigation */}
            <div>
                <h2 className="text-lg font-semibold mb-3">Quick Navigation</h2>
                <div className="flex flex-wrap gap-3">
                    <Button asChild variant="outline"><Link to="/fleet">Fleet Management</Link></Button>
                    <Button asChild variant="outline"><Link to="/handover">Handover</Link></Button>
                    <Button asChild variant="outline"><Link to="/maintenance">Maintenance</Link></Button>
                    {(user?.role === 'Admin' || user?.role === 'SuperAdmin') && (
                        <Button asChild variant="outline"><Link to="/users">Users</Link></Button>
                    )}
                    {(user?.role === 'Admin' || user?.role === 'SuperAdmin' || user?.role === 'Observer') && (
                        <Button asChild variant="outline"><Link to="/reports">Reports</Link></Button>
                    )}
                    {user?.role === 'SuperAdmin' && (
                        <Button asChild variant="outline"><Link to="/settings">Settings</Link></Button>
                    )}
                </div>
            </div>
        </div>
    );
}
