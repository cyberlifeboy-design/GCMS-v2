import { useState, useEffect } from 'react';
import { handoverApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Loader2, Clock, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTime } from '@/lib/dateUtils';

const actionColors: Record<string, string> = {
    CheckedIn:    'bg-green-100 text-green-800',
    CheckedOut:   'bg-blue-100 text-blue-800',
    HandedBack:   'bg-purple-100 text-purple-800',
    Dispatched:   'bg-amber-100 text-amber-800',
    Returned:     'bg-indigo-100 text-indigo-800',
};

const actionLabels: Record<string, string> = {
    CheckedIn:  'Check-In',
    CheckedOut: 'Check-Out',
    HandedBack: 'Handed Back',
    Dispatched: 'Dispatched',
    Returned:   'Returned',
};

export function UsageHistoryPage() {
    const [history, setHistory] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [actionFilter, setActionFilter] = useState('all');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 20 });

    const load = async () => {
        try {
            setLoading(true);
            const params: any = { page, limit: pagination.limit };
            if (actionFilter !== 'all') params.action = actionFilter;
            const res = await handoverApi.getHistory(params);
            setHistory(res.data.data || []);
            setPagination(prev => ({ ...prev, ...res.data.pagination }));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [page, actionFilter]);

    return (
        <div className="container mx-auto py-6 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                    <Clock className="w-8 h-8 text-primary" /> Usage History
                </h1>
                <p className="text-muted-foreground mt-1">All check-in / check-out activity for carts assigned to you.</p>
            </div>

            <Card className="border-none shadow-md overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-blue-50/60 to-transparent border-b py-4 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-blue-800 text-base">Activity Log</CardTitle>
                        <CardDescription>{pagination.total} total events</CardDescription>
                    </div>
                    <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(1); }}>
                        <SelectTrigger className="w-40 h-8 text-xs bg-white">
                            <SelectValue placeholder="All actions" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Actions</SelectItem>
                            <SelectItem value="CheckedIn">Check-In</SelectItem>
                            <SelectItem value="CheckedOut">Check-Out</SelectItem>
                            <SelectItem value="HandedBack">Handed Back</SelectItem>
                            <SelectItem value="Dispatched">Dispatched</SelectItem>
                            <SelectItem value="Returned">Returned</SelectItem>
                        </SelectContent>
                    </Select>
                </CardHeader>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/30">
                                <TableRow>
                                    <TableHead>Cart</TableHead>
                                    <TableHead>Action</TableHead>
                                    <TableHead>Venue</TableHead>
                                    <TableHead>Date &amp; Time</TableHead>
                                    <TableHead>Notes</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {history.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={5} className="text-center py-16 text-muted-foreground">
                                            <Clock className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                            No usage history yet
                                        </TableCell>
                                    </TableRow>
                                ) : history.map(log => (
                                    <TableRow key={log.id}>
                                        <TableCell className="font-bold font-mono text-primary">{log.fleet?.carNumber}</TableCell>
                                        <TableCell>
                                            <Badge className={`${actionColors[log.action] ?? 'bg-muted text-muted-foreground'} text-[10px] font-semibold`}>
                                                {actionLabels[log.action] ?? log.action}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{log.fleet?.stadium?.name ?? '—'}</TableCell>
                                        <TableCell className="text-xs">{formatDateTime(log.createdAt || log.timestamp)}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[220px] truncate">
                                            {log.conditionNotes || log.issueDescription || '—'}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
                {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-between px-6 py-3 border-t bg-muted/10">
                        <p className="text-xs text-muted-foreground">Page {page} of {pagination.totalPages}</p>
                        <div className="flex gap-2">
                            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                                <ChevronLeft className="w-4 h-4" />
                            </Button>
                            <Button size="sm" variant="outline" disabled={page >= pagination.totalPages} onClick={() => setPage(p => p + 1)}>
                                <ChevronRight className="w-4 h-4" />
                            </Button>
                        </div>
                    </div>
                )}
            </Card>
        </div>
    );
}
