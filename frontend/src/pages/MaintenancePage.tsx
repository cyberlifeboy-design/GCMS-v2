import { useState, useEffect } from 'react';
import { maintenanceApi, fleetApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Download, Loader2, Wrench, CheckCircle, AlertTriangle, Clock, Car } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';
import { Pagination } from '@/components/shared/Pagination';
import { formatDate, formatDateTime } from '@/lib/dateUtils';

interface MaintenanceLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string; stadium?: { id: string; name: string; code: string } };
    issueDescription: string;
    status: 'Open' | 'InProgress' | 'Resolved';
    photosUrls?: string[];
    reportedBy?: { name: string; phone?: string; role: string; email: string };
    resolutionNotes?: string;
    resolvedAt?: string;
    createdAt: string;
    reportedAt?: string;
}

const issueStatusColors: Record<string, string> = {
    'Open': 'bg-red-500 text-white',
    'InProgress': 'bg-yellow-500 text-white',
    'Resolved': 'bg-green-500 text-white',
};

const STATUSES = ['Open', 'InProgress', 'Resolved'] as const;

export function MaintenancePage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const canReport = role === 'FA' || role === 'Admin' || role === 'SuperAdmin';
    const canUpdateStatus = role === 'Admin' || role === 'SuperAdmin';
    const canExport = role === 'Admin' || role === 'SuperAdmin' || role === 'Observer';

    const [issues, setIssues] = useState<MaintenanceLog[]>([]);
    const [fleet, setFleet] = useState<Array<{ id: string; carNumber: string; carType: string; status: string }>>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [stadiumFilter, setStadiumFilter] = useState('all');
    const [cartFilter, setCartFilter] = useState('all');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');

    // Pagination state
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    // Modals
    const [reportOpen, setReportOpen] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [historyFleet, setHistoryFleet] = useState<{ id: string; carNumber: string } | null>(null);
    const [cartHistory, setCartHistory] = useState<MaintenanceLog[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<MaintenanceLog | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Forms
    const [reportForm, setReportForm] = useState({ fleetId: '', issueDescription: '' });
    const [statusForm, setStatusForm] = useState({ status: '', resolutionNotes: '' });
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);

    const loadData = async () => {
        try {
            setLoading(true);
            const params = {
                ...(statusFilter !== 'all' && { status: statusFilter }),
                page,
                limit: pagination.limit
            };
            const [issuesRes, fleetRes, stadiumsRes] = await Promise.all([
                maintenanceApi.getAll(params),
                fleetApi.getAll(),
                stadiumsApi.getAll(),
            ]);
            setIssues(issuesRes.data.data || []);
            if (issuesRes.data.pagination) {
                setPagination(prev => ({ ...prev, ...issuesRes.data.pagination }));
            }
            setFleet(fleetRes.data.data || []);
            setStadiums(stadiumsRes.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [statusFilter, page]);

    // Calculate dashboard stats
    const stats = {
        operational: fleet.filter(f => f.status === 'Available' || f.status === 'Assigned' || f.status === 'Dispatched').length,
        inMaintenance: fleet.filter(f => f.status === 'Under Maintenance').length,
        openIssues: issues.filter(i => i.status === 'Open').length,
        inProgressIssues: issues.filter(i => i.status === 'InProgress').length,
        resolvedIssues: issues.filter(i => i.status === 'Resolved').length,
        totalFleet: fleet.length,
    };

    // Apply additional filters
    const filtered = issues.filter(i => {
        const matchesSearch = i.fleet?.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
            i.issueDescription?.toLowerCase().includes(search.toLowerCase()) ||
            i.reportedBy?.name?.toLowerCase().includes(search.toLowerCase());
        const matchesCart = cartFilter === 'all' || i.fleetId === cartFilter;
        const matchesStadium = stadiumFilter === 'all' || i.fleet?.stadium?.id === stadiumFilter;
        const matchesDateFrom = !dateFrom || new Date(i.reportedAt || i.createdAt) >= new Date(dateFrom);
        const matchesDateTo = !dateTo || new Date(i.reportedAt || i.createdAt) <= new Date(dateTo + 'T23:59:59');
        return matchesSearch && matchesCart && matchesStadium && matchesDateFrom && matchesDateTo;
    });

    const loadCartHistory = async (fleetId: string, carNumber: string) => {
        setHistoryFleet({ id: fleetId, carNumber });
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const res = await maintenanceApi.getByFleet(fleetId);
            setCartHistory(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setHistoryLoading(false);
        }
    };

    // Stats cards data for dashboard
    const statusCards = [
        { label: 'Operational', value: stats.operational, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', desc: 'Available / Assigned / Dispatched' },
        { label: 'In Maintenance', value: stats.inMaintenance, icon: Wrench, color: 'text-red-600', bg: 'bg-red-50', desc: 'Carts under maintenance' },
        { label: 'Open Issues', value: stats.openIssues, icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-50', desc: 'Awaiting attention' },
        { label: 'In Progress', value: stats.inProgressIssues, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', desc: 'Being worked on' },
    ];

    const handleReport = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('fleetId', reportForm.fleetId);
            fd.append('issueDescription', reportForm.issueDescription);
            photoFiles.forEach(f => fd.append('photos', f));
            await maintenanceApi.report(fd);
            setReportOpen(false);
            setReportForm({ fleetId: '', issueDescription: '' });
            setPhotoFiles([]);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to report issue');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUpdateStatus = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIssue) return;
        setSubmitting(true);
        try {
            await maintenanceApi.updateStatus(selectedIssue.id, {
                status: statusForm.status,
                resolutionNotes: statusForm.resolutionNotes || undefined,
            });
            setStatusOpen(false);
            setSelectedIssue(null);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update status');
        } finally {
            setSubmitting(false);
        }
    };

    const handleExport = async () => {
        setExporting(true);
        try {
            const res = await maintenanceApi.exportCsv();
            const url = window.URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = `maintenance_export_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
            window.URL.revokeObjectURL(url);
        } catch (err: any) {
            alert('Export failed');
        } finally {
            setExporting(false);
        }
    };

    const openStatusModal = (issue: MaintenanceLog) => {
        setSelectedIssue(issue);
        setStatusForm({ status: issue.status, resolutionNotes: issue.resolutionNotes || '' });
        setStatusOpen(true);
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Maintenance</h1>
                <div className="flex gap-2">
                    {canExport && (
                        <Button variant="outline" onClick={handleExport} disabled={exporting}>
                            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Export CSV
                        </Button>
                    )}
                    {canReport && (
                        <Button onClick={() => { setReportForm({ fleetId: '', issueDescription: '' }); setPhotoFiles([]); setReportOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />Report Issue
                        </Button>
                    )}
                </div>
            </div>

            {/* Status Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statusCards.map((card) => (
                    <Card key={card.label} className={`${card.bg} border`}>
                        <CardContent className="p-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-medium text-muted-foreground">{card.label}</p>
                                    <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
                                    <p className="text-xs text-muted-foreground mt-1">{card.desc}</p>
                                </div>
                                <card.icon className={`w-8 h-8 ${card.color} opacity-50`} />
                            </div>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Active Issues Summary */}
            {(stats.openIssues > 0 || stats.inProgressIssues > 0) && (
                <Card className="border-yellow-200 bg-yellow-50">
                    <CardHeader className="pb-2">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-yellow-600" />
                            Active Issues Queue
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pb-3">
                        <div className="flex flex-wrap gap-4 text-sm">
                            <div className="flex items-center gap-2">
                                <Badge className="bg-red-500 text-white">Open</Badge>
                                <span className="font-semibold">{stats.openIssues}</span>
                                <span className="text-muted-foreground">requiring attention</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge className="bg-yellow-500 text-white">In Progress</Badge>
                                <span className="font-semibold">{stats.inProgressIssues}</span>
                                <span className="text-muted-foreground">being worked on</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Fleet Status Overview */}
            <Card>
                <CardHeader className="pb-2">
                    <CardTitle className="text-base flex items-center gap-2">
                        <Car className="w-5 h-5" />
                        Fleet Status Overview
                    </CardTitle>
                </CardHeader>
                <CardContent className="pb-3">
                    <div className="flex flex-wrap gap-4 text-sm">
                        <div className="flex items-center gap-2">
                            <Badge className="bg-green-500 text-white">Available</Badge>
                            <span className="font-semibold">{fleet.filter(f => f.status === 'Available').length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className="bg-purple-500 text-white">Assigned</Badge>
                            <span className="font-semibold">{fleet.filter(f => f.status === 'Assigned').length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className="bg-blue-500 text-white">Dispatched</Badge>
                            <span className="font-semibold">{fleet.filter(f => f.status === 'Dispatched').length}</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <Badge className="bg-red-500 text-white">Under Maintenance</Badge>
                            <span className="font-semibold">{fleet.filter(f => f.status === 'Under Maintenance').length}</span>
                        </div>
                        <div className="ml-auto text-muted-foreground">
                            Total: <span className="font-semibold text-foreground">{stats.totalFleet}</span> carts
                        </div>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <div className="flex gap-4 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by cart, issue, or reporter…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Select value={stadiumFilter} onValueChange={v => { setStadiumFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All Stadiums" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stadiums</SelectItem>
                                {stadiums.map(s => (
                                    <SelectItem key={s.id} value={s.id}>{s.code || s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <Select value={cartFilter} onValueChange={v => { setCartFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All Carts" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Carts</SelectItem>
                                {fleet.map(f => (
                                    <SelectItem key={f.id} value={f.id}>{f.carNumber}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                        <div className="flex gap-2 items-center">
                            <Input
                                type="date"
                                value={dateFrom}
                                onChange={e => setDateFrom(e.target.value)}
                                className="w-36"
                                placeholder="From"
                            />
                            <span className="text-muted-foreground">to</span>
                            <Input
                                type="date"
                                value={dateTo}
                                onChange={e => setDateTo(e.target.value)}
                                className="w-36"
                                placeholder="To"
                            />
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cart #</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Issue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reported By</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead>Time</TableHead>
                                <TableHead>Venue</TableHead>
                                <TableHead>Photos</TableHead>
                                <TableHead>Resolution</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={11} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                </TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={11} className="text-center py-8 text-muted-foreground">No issues found</TableCell></TableRow>
                            ) : filtered.map(issue => {
                                const reportedDate = issue.reportedAt || issue.createdAt;
                                return (
                                    <TableRow key={issue.id}>
                                        <TableCell className="font-mono font-semibold">{issue.fleet?.carNumber}</TableCell>
                                        <TableCell>
                                            <Badge className={carTypeColors[issue.fleet?.carType] || 'bg-gray-500 text-white'} variant="secondary">
                                                {issue.fleet?.carType || '—'}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate">{issue.issueDescription}</TableCell>
                                        <TableCell><Badge className={issueStatusColors[issue.status]}>{issue.status}</Badge></TableCell>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{issue.reportedBy?.name || '—'}</span>
                                                {issue.reportedBy?.phone && <span className="text-[10px] text-muted-foreground">{issue.reportedBy.phone} ({issue.reportedBy.role})</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-sm">{formatDate(reportedDate)}</TableCell>
                                        <TableCell className="text-sm">{formatDateTime(reportedDate).split(' ')[1] || '—'}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className="text-xs">{issue.fleet?.stadium?.code || '—'}</Badge>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-1">
                                                {issue.photosUrls?.map((url, idx) => (
                                                    <a key={idx} href={url} target="_blank" rel="noreferrer" className="w-8 h-8 border rounded overflow-hidden flex-shrink-0 bg-muted hover:opacity-80 transition-opacity">
                                                        <img src={url} alt="issue" className="w-full h-full object-cover" />
                                                    </a>
                                                )) || '—'}
                                            </div>
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                                            {issue.resolutionNotes || '—'}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button variant="outline" size="sm" onClick={() => loadCartHistory(issue.fleetId, issue.fleet.carNumber)}>History</Button>
                                                {canUpdateStatus && issue.status !== 'Resolved' && (
                                                    <Button variant="ghost" size="sm" onClick={() => openStatusModal(issue)}>Update</Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                    <Pagination
                        page={page}
                        totalPages={pagination.totalPages}
                        onPageChange={setPage}
                        total={pagination.total}
                        limit={pagination.limit}
                    />
                </CardContent>
            </Card>

            {/* Report Issue Modal */}
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Report Maintenance Issue</DialogTitle>
                        <DialogDescription>Report a problem with a golf cart.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleReport} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={reportForm.fleetId} onValueChange={v => setReportForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>
                                    {fleet.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Issue Description *</Label>
                            <textarea className="w-full min-h-[100px] p-3 border rounded-md text-sm" value={reportForm.issueDescription} onChange={e => setReportForm(f => ({ ...f, issueDescription: e.target.value }))} placeholder="Describe the issue in detail…" required />
                        </div>
                        <div className="space-y-2">
                            <Label>Photos (optional, max 5)</Label>
                            <Input type="file" accept="image/*" multiple onChange={e => setPhotoFiles(Array.from(e.target.files || []).slice(0, 5))} />
                            {photoFiles.length > 0 && <p className="text-xs text-muted-foreground">{photoFiles.length} file(s) selected</p>}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Report Issue</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Update Status Modal */}
            <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Update Issue Status</DialogTitle>
                        <DialogDescription>Cart: {selectedIssue?.fleet?.carNumber} — {selectedIssue?.issueDescription}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleUpdateStatus} className="space-y-4">
                        <div className="space-y-2">
                            <Label>New Status *</Label>
                            <Select value={statusForm.status} onValueChange={v => setStatusForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>{STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        {statusForm.status === 'Resolved' && (
                            <div className="space-y-2">
                                <Label>Resolution Notes</Label>
                                <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={statusForm.resolutionNotes} onChange={e => setStatusForm(f => ({ ...f, resolutionNotes: e.target.value }))} placeholder="Describe what was done to resolve the issue…" />
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Save Status</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Issue History Modal */}
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Issue History: {historyFleet?.carNumber}</DialogTitle>
                        <DialogDescription>Full chronological history of maintenance for this cart.</DialogDescription>
                    </DialogHeader>
                    <div className="py-4">
                        {historyLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div>
                        ) : cartHistory.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">No history found for this cart.</p>
                        ) : (
                            <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                                {cartHistory.map((h, _i) => {
                                    const reportedDate = h.reportedAt || h.createdAt;
                                    return (
                                        <div key={h.id} className="relative pl-10">
                                            <div className={`absolute left-0 top-1 w-9 h-9 rounded-full border-4 border-background flex items-center justify-center ${issueStatusColors[h.status]}`}>
                                                <div className="w-2 h-2 rounded-full bg-white" />
                                            </div>
                                            <div className="flex flex-col gap-1">
                                                <div className="flex items-center justify-between">
                                                    <span className="text-sm font-semibold">{h.issueDescription}</span>
                                                    <div className="flex items-center gap-2">
                                                        <Badge variant="outline" className="text-[10px]">{h.fleet?.stadium?.code || '—'}</Badge>
                                                        <Badge variant="outline" className="text-[10px]">{formatDateTime(reportedDate)}</Badge>
                                                    </div>
                                                </div>
                                                <p className="text-xs text-muted-foreground">
                                                    Reported by {h.reportedBy?.name} ({h.reportedBy?.role}) • {formatDateTime(reportedDate)}
                                                </p>
                                                {h.photosUrls && h.photosUrls.length > 0 && (
                                                    <div className="flex gap-2 mt-2">
                                                        {h.photosUrls.map((url, idx) => (
                                                            <a key={idx} href={url} target="_blank" rel="noreferrer" className="w-12 h-12 rounded border overflow-hidden">
                                                                <img src={url} alt="issue" className="w-full h-full object-cover" />
                                                            </a>
                                                        ))}
                                                    </div>
                                                )}
                                                {h.status === 'Resolved' && (
                                                    <div className="mt-2 p-2 bg-green-50 border border-green-100 rounded text-xs text-green-800">
                                                        <strong>Resolved:</strong> {h.resolutionNotes}
                                                        <div className="mt-1 text-[10px] text-green-600">Date: {formatDateTime(h.resolvedAt)}</div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
