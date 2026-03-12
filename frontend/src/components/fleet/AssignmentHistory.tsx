import { useState, useEffect } from 'react';
import { fleetApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Search, Calendar, User, ArrowRight, Car } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface AssignmentHistoryRecord {
    id: string;
    timestamp: string;
    action: string;
    fleetId: string;
    carNumber: string | null;
    carType: string | null;
    stadium: { id: string; name: string; code: string } | null;
    assignedBy: {
        id: string;
        name: string;
        email: string;
        role: string;
        phone?: string;
        department?: { id: string; name: string; code?: string } | null;
        stadium?: { id: string; name: string } | null;
    } | null;
    previousAssignment: {
        id: string;
        name: string;
        email: string;
        role: string;
        phone?: string;
        department?: { id: string; name: string; code?: string } | null;
    } | null;
    newAssignment: {
        id: string;
        name: string;
        email: string;
        role: string;
        phone?: string;
        department?: { id: string; name: string; code?: string } | null;
    } | null;
    oldValue: any;
    newValue: any;
    ipAddress?: string;
}

interface AssignmentHistoryProps {
    stadiumId?: string;
    carNumber?: string;
}

const carTypeColors: Record<string, string> = {
    'Cargo': 'bg-blue-100 text-blue-800 border-blue-200',
    'Accessibility': 'bg-purple-100 text-purple-800 border-purple-200',
    '6-Seater': 'bg-green-100 text-green-800 border-green-200',
    '4-Seater': 'bg-orange-100 text-orange-800 border-orange-200',
};

export function AssignmentHistory({ stadiumId, carNumber: initialCarNumber }: AssignmentHistoryProps) {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

    const [history, setHistory] = useState<AssignmentHistoryRecord[]>([]);
    const [loading, setLoading] = useState(false);
    const [carNumberFilter, setCarNumberFilter] = useState(initialCarNumber || '');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const [expandedRow, setExpandedRow] = useState<string | null>(null);

    useEffect(() => {
        loadHistory();
    }, [stadiumId]);

    const loadHistory = async () => {
        try {
            setLoading(true);
            const params: Record<string, unknown> = { limit: 100 };
            if (stadiumId) params.stadiumId = stadiumId;
            if (carNumberFilter) params.carNumber = carNumberFilter;
            if (startDate) params.startDate = startDate;
            if (endDate) params.endDate = endDate;

            const res = await fleetApi.getAssignmentHistory(params);
            setHistory(res.data.data || []);
        } catch (e) {
            console.error('Failed to load assignment history', e);
        } finally {
            setLoading(false);
        }
    };

    const handleFilter = () => {
        loadHistory();
    };

    const clearFilters = () => {
        setCarNumberFilter('');
        setStartDate('');
        setEndDate('');
        setTimeout(() => loadHistory(), 100);
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        return {
            date: date.toLocaleDateString(),
            time: date.toLocaleTimeString(),
            full: date.toLocaleString(),
        };
    };

    return (
        <div className="space-y-4">
            {/* Filters */}
            <Card>
                <CardHeader className="pb-3">
                    <CardTitle className="text-lg flex items-center gap-2">
                        <Search className="w-5 h-5" />
                        Filter History
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Car Number</label>
                            <Input
                                placeholder="e.g., C001"
                                value={carNumberFilter}
                                onChange={e => setCarNumberFilter(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">Start Date</label>
                            <Input
                                type="date"
                                value={startDate}
                                onChange={e => setStartDate(e.target.value)}
                            />
                        </div>
                        <div className="space-y-1">
                            <label className="text-sm font-medium">End Date</label>
                            <Input
                                type="date"
                                value={endDate}
                                onChange={e => setEndDate(e.target.value)}
                            />
                        </div>
                        <div className="flex items-end gap-2">
                            <Button onClick={handleFilter} disabled={loading}>
                                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Apply Filter'}
                            </Button>
                            <Button variant="outline" onClick={clearFilters}>
                                Clear
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* History Table */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-lg">Assignment Transactions ({history.length})</CardTitle>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin" />
                        </div>
                    ) : history.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Calendar className="w-12 h-12 mx-auto mb-3 opacity-50" />
                            <p>No assignment history found</p>
                            <p className="text-sm mt-1">Assignments will appear here when carts are assigned to focal points</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-32">Timestamp</TableHead>
                                    <TableHead>Cart</TableHead>
                                    {isSuperAdmin && <TableHead>Venue</TableHead>}
                                    <TableHead>Assigned By</TableHead>
                                    <TableHead>Assignment Change</TableHead>
                                    <TableHead>Details</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.map(record => {
                                    const dateInfo = formatDate(record.timestamp);
                                    const isExpanded = expandedRow === record.id;

                                    return (
                                        <TableRow 
                                            key={record.id} 
                                            className="cursor-pointer hover:bg-muted/50"
                                            onClick={() => setExpandedRow(isExpanded ? null : record.id)}
                                        >
                                            <TableCell>
                                                <div className="text-sm">
                                                    <div className="font-medium">{dateInfo.date}</div>
                                                    <div className="text-muted-foreground text-xs">{dateInfo.time}</div>
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {record.carNumber ? (
                                                    <div className="flex items-center gap-2">
                                                        <Car className="w-4 h-4 text-muted-foreground" />
                                                        <div>
                                                            <div className="font-bold">{record.carNumber}</div>
                                                            {record.carType && (
                                                                <Badge 
                                                                    variant="outline" 
                                                                    className={`text-xs ${carTypeColors[record.carType] || ''}`}
                                                                >
                                                                    {record.carType}
                                                                </Badge>
                                                            )}
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground text-sm">ID: {record.fleetId.slice(0, 8)}...</span>
                                                )}
                                            </TableCell>
                                            {isSuperAdmin && (
                                                <TableCell>
                                                    {record.stadium ? (
                                                        <Badge variant="outline">{record.stadium.code || record.stadium.name}</Badge>
                                                    ) : (
                                                        <span className="text-muted-foreground">—</span>
                                                    )}
                                                </TableCell>
                                            )}
                                            <TableCell>
                                                {record.assignedBy ? (
                                                    <div className="space-y-1">
                                                        <div className="font-medium flex items-center gap-1">
                                                            <User className="w-3 h-3" />
                                                            {record.assignedBy.name}
                                                        </div>
                                                        <div className="text-xs text-muted-foreground">
                                                            {record.assignedBy.role}
                                                        </div>
                                                        {record.assignedBy.department && (
                                                            <Badge variant="secondary" className="text-xs">
                                                                {record.assignedBy.department.code || record.assignedBy.department.name}
                                                            </Badge>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-muted-foreground">System</span>
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <div className="flex items-center gap-2">
                                                    {record.previousAssignment ? (
                                                        <div className="text-sm">
                                                            <div className="font-medium">{record.previousAssignment.name}</div>
                                                            {record.previousAssignment.department && (
                                                                <div className="text-xs text-muted-foreground">
                                                                    {record.previousAssignment.department.code || record.previousAssignment.department.name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm italic">Unassigned</span>
                                                    )}
                                                    <ArrowRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                                    {record.newAssignment ? (
                                                        <div className="text-sm">
                                                            <div className="font-medium text-green-600">{record.newAssignment.name}</div>
                                                            {record.newAssignment.department && (
                                                                <div className="text-xs text-muted-foreground">
                                                                    {record.newAssignment.department.code || record.newAssignment.department.name}
                                                                </div>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-muted-foreground text-sm italic">Unassigned</span>
                                                    )}
                                                </div>
                                            </TableCell>
                                            <TableCell>
                                                {isExpanded ? (
                                                    <div className="space-y-2 text-sm" onClick={e => e.stopPropagation()}>
                                                        <div className="grid grid-cols-2 gap-2">
                                                            <div>
                                                                <div className="font-medium text-muted-foreground">Previous User ID</div>
                                                                <div className="font-mono text-xs">{record.previousAssignment?.id || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-muted-foreground">New User ID</div>
                                                                <div className="font-mono text-xs">{record.newAssignment?.id || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-muted-foreground">Previous Email</div>
                                                                <div className="text-xs">{record.previousAssignment?.email || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-muted-foreground">New Email</div>
                                                                <div className="text-xs">{record.newAssignment?.email || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-muted-foreground">Previous Phone</div>
                                                                <div className="text-xs">{record.previousAssignment?.phone || '—'}</div>
                                                            </div>
                                                            <div>
                                                                <div className="font-medium text-muted-foreground">New Phone</div>
                                                                <div className="text-xs">{record.newAssignment?.phone || '—'}</div>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <div className="font-medium text-muted-foreground">IP Address</div>
                                                                <div className="font-mono text-xs">{record.ipAddress || '—'}</div>
                                                            </div>
                                                            <div className="col-span-2">
                                                                <div className="font-medium text-muted-foreground">Action</div>
                                                                <div className="text-xs">{record.action}</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <span className="text-xs text-blue-600">Click to expand</span>
                                                )}
                                            </TableCell>
                                        </TableRow>
                                    );
                                })}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default AssignmentHistory;