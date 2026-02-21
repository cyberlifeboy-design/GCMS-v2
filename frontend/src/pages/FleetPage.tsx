import { useState, useEffect } from 'react';
import { fleetApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';

export function FleetPage() {
    const [fleet, setFleet] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    useEffect(() => {
        loadFleet();
    }, [statusFilter]);

    const loadFleet = async () => {
        try {
            setLoading(true);
            const params = statusFilter && statusFilter !== 'all' ? { status: statusFilter } : {};
            const response = await fleetApi.getAll(params);
            setFleet(response.data.data || []);
        } catch (error) {
            console.error('Failed to load fleet:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredFleet = fleet.filter(v =>
        v.unitNumber?.toLowerCase().includes(search.toLowerCase()) ||
        v.carType?.toLowerCase().includes(search.toLowerCase())
    );

    const statusColors: Record<string, string> = {
        'Ready': 'bg-green-500',
        'In-Use': 'bg-blue-500',
        'Maintenance': 'bg-yellow-500',
        'Damaged': 'bg-red-500',
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fleet Management</h1>
                <Button><Plus className="w-4 h-4 mr-2" />Add Vehicle</Button>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search vehicles..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="Ready">Ready</SelectItem>
                                <SelectItem value="In-Use">In-Use</SelectItem>
                                <SelectItem value="Maintenance">Maintenance</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Unit Number</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Key ID</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Assigned FA</TableHead>
                                <TableHead>Stadium</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-8">Loading...</TableCell></TableRow>
                            ) : filteredFleet.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-8">No vehicles found</TableCell></TableRow>
                            ) : (
                                filteredFleet.map((v) => (
                                    <TableRow key={v.id}>
                                        <TableCell className="font-medium">{v.unitNumber}</TableCell>
                                        <TableCell>{v.carType}</TableCell>
                                        <TableCell>{v.keyId}</TableCell>
                                        <TableCell>
                                            <Badge className={statusColors[v.status]}>{v.status}</Badge>
                                        </TableCell>
                                        <TableCell>{v.assignedToFA || '-'}</TableCell>
                                        <TableCell>{v.stadium?.name || '-'}</TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
