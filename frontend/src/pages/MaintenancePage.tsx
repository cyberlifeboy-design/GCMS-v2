import { useState, useEffect } from 'react';
import { maintenanceApi, fleetApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Download, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface MaintenanceLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string };
    issueDescription: string;
    status: 'Open' | 'InProgress' | 'Resolved';
    photosUrls?: string[];
    reportedBy?: { name: string };
    resolutionNotes?: string;
    resolvedAt?: string;
    createdAt: string;
}

const statusColors: Record<string, string> = {
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
    const [fleet, setFleet] = useState<Array<{ id: string; carNumber: string; carType: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Modals
    const [reportOpen, setReportOpen] = useState(false);
    const [statusOpen, setStatusOpen] = useState(false);
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
            const params = statusFilter !== 'all' ? { status: statusFilter } : {};
            const [issuesRes, fleetRes] = await Promise.all([
                maintenanceApi.getAll(params),
                fleetApi.getAll(),
            ]);
            setIssues(issuesRes.data.data || []);
            setFleet(fleetRes.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [statusFilter]);

    const filtered = issues.filter(i =>
        i.fleet?.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
        i.issueDescription?.toLowerCase().includes(search.toLowerCase()) ||
        i.reportedBy?.name?.toLowerCase().includes(search.toLowerCase())
    );

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

            <Card>
                <CardHeader>
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by cart, issue, or reporter…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cart #</TableHead>
                                <TableHead>Issue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reported By</TableHead>
                                <TableHead>Reported At</TableHead>
                                <TableHead>Photos</TableHead>
                                <TableHead>Resolution</TableHead>
                                {canUpdateStatus && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={canUpdateStatus ? 8 : 7} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                </TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={canUpdateStatus ? 8 : 7} className="text-center py-8 text-muted-foreground">No issues found</TableCell></TableRow>
                            ) : filtered.map(issue => (
                                <TableRow key={issue.id}>
                                    <TableCell className="font-mono font-semibold">{issue.fleet?.carNumber}</TableCell>
                                    <TableCell className="max-w-xs truncate">{issue.issueDescription}</TableCell>
                                    <TableCell><Badge className={statusColors[issue.status]}>{issue.status}</Badge></TableCell>
                                    <TableCell>{issue.reportedBy?.name || '—'}</TableCell>
                                    <TableCell className="text-sm">{new Date(issue.createdAt).toLocaleDateString()}</TableCell>
                                    <TableCell>
                                        <div className="flex gap-1">
                                            {issue.photosUrls?.map((url, idx) => (
                                                <a key={idx} href={url} target="_blank" rel="noreferrer" className="w-8 h-8 border rounded overflow-hidden flex-shrink-0 bg-muted">
                                                    <img src={url} alt="issue" className="w-full h-full object-cover" />
                                                </a>
                                            )) || '—'}
                                        </div>
                                    </TableCell>
                                    <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                                        {issue.resolutionNotes || '—'}
                                    </TableCell>
                                    {canUpdateStatus && (
                                        <TableCell className="text-right">
                                            {issue.status !== 'Resolved' && (
                                                <Button variant="ghost" size="sm" onClick={() => openStatusModal(issue)}>
                                                    Update Status
                                                </Button>
                                            )}
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
                            <textarea
                                className="w-full min-h-[100px] p-3 border rounded-md text-sm"
                                value={reportForm.issueDescription}
                                onChange={e => setReportForm(f => ({ ...f, issueDescription: e.target.value }))}
                                placeholder="Describe the issue in detail…"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Photos (optional, max 5)</Label>
                            <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={e => setPhotoFiles(Array.from(e.target.files || []).slice(0, 5))}
                                className="w-full text-sm"
                            />
                            {photoFiles.length > 0 && (
                                <p className="text-xs text-muted-foreground">{photoFiles.length} file(s) selected</p>
                            )}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Report Issue
                            </Button>
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
                                <SelectContent>
                                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        {statusForm.status === 'Resolved' && (
                            <div className="space-y-2">
                                <Label>Resolution Notes</Label>
                                <textarea
                                    className="w-full min-h-[80px] p-3 border rounded-md text-sm"
                                    value={statusForm.resolutionNotes}
                                    onChange={e => setStatusForm(f => ({ ...f, resolutionNotes: e.target.value }))}
                                    placeholder="Describe what was done to resolve the issue…"
                                />
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Status
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
