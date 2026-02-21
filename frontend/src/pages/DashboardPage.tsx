import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useEffect, useState } from 'react';
import { fleetApi } from '@/lib/api';

export function DashboardPage() {
    const { user } = useAuthStore();
    const [stats, setStats] = useState({ total: 0, ready: 0, inUse: 0, maintenance: 0 });

    useEffect(() => {
        fleetApi.getAll().then(res => {
            const data = res.data.data || [];
            setStats({
                total: data.length,
                ready: data.filter((v: any) => v.status === 'Ready').length,
                inUse: data.filter((v: any) => v.status === 'In-Use').length,
                maintenance: data.filter((v: any) => v.status === 'Maintenance').length,
            });
        });
    }, []);

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p>Welcome back, {user?.name}!</p>

            <div className="grid gap-4 md:grid-cols-4">
                <Card>
                    <CardHeader><CardTitle className="text-sm">Total Fleet</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold">{stats.total}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-sm text-green-600">Ready</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold text-green-600">{stats.ready}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-sm text-blue-600">In-Use</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold text-blue-600">{stats.inUse}</p></CardContent>
                </Card>
                <Card>
                    <CardHeader><CardTitle className="text-sm text-yellow-600">Maintenance</CardTitle></CardHeader>
                    <CardContent><p className="text-2xl font-bold text-yellow-600">{stats.maintenance}</p></CardContent>
                </Card>
            </div>

            <div className="flex gap-4">
                <Button onClick={() => window.location.href = '/fleet'}>View Fleet</Button>
                <Button onClick={() => window.location.href = '/handover'} variant="outline">Handover</Button>
            </div>
        </div>
    );
}
