import { useState, useEffect } from 'react';
import { maintenanceApi, fleetApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Download, Loader2, CheckCircle, Clock, DollarSign, FileText, Send, FilterX } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Pagination } from '@/components/shared/Pagination';
import { formatDate, formatDateTime } from '@/lib/dateUtils';

interface MaintenanceLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string; stadium?: { id: string; name: string; code: string } };
    issueType?: string;
    issueDescription: string;
    status: 'Open' | 'InProgress' | 'Resolved' | 'PendingQuotation' | 'PendingApproval';
    quotationStatus?: 'Requested' | 'Submitted' | 'Approved' | 'Rejected';
    fixCost?: number;
    photosUrls?: string[];
    reportedBy?: { name: string; phone?: string; role: string; email: string };
    approvedBy?: { name: string; role: string };
    resolutionNotes?: string;
    resolvedAt?: string;
    createdAt: string;
    reportedAt?: string;
}

const issueStatusColors: Record<string, string> = {
    'Open': 'bg-red-500 text-white',
    'PendingQuotation': 'bg-orange-500 text-white',
    'PendingApproval': 'bg-blue-500 text-white',
    'InProgress': 'bg-yellow-500 text-white',
    'Resolved': 'bg-green-500 text-white',
};

const quotationStatusColors: Record<string, string> = {
    'Requested': 'bg-orange-100 text-orange-700 border-orange-200',
    'Submitted': 'bg-blue-100 text-blue-700 border-blue-200',
    'Approved': 'bg-green-100 text-green-700 border-green-200',
    'Rejected': 'bg-red-100 text-red-700 border-red-200',
};

const STATUSES = ['Open', 'PendingQuotation', 'PendingApproval', 'InProgress', 'Resolved'] as const;

export function MaintenancePage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isSuperAdmin = role === 'SuperAdmin';
    const isAdmin = role === 'Admin';
    const isContracts = role === 'Contracts';
    const isMaintenance = role === 'MaintenanceTeam';
    const isObserver = role === 'Observer';

    const canReport = role === 'FA' || isAdmin || isSuperAdmin;
    const canUpdateStatus = isAdmin || isSuperAdmin || isMaintenance;
    const canExport = isAdmin || isSuperAdmin || isObserver || isContracts;
    const canRequestQuote = isContracts || isSuperAdmin;
    const canSubmitCost = isMaintenance || isSuperAdmin;
    const canApproveCost = isContracts || isSuperAdmin;

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
    const [quoteOpen, setQuoteOpen] = useState(false);
    const [costOpen, setCostOpen] = useState(false);
    const [approveOpen, setApproveOpen] = useState(false);
    
    const [historyFleet, setHistoryFleet] = useState<{ id: string; carNumber: string } | null>(null);
    const [cartHistory, setCartHistory] = useState<MaintenanceLog[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<MaintenanceLog | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [exporting, setExporting] = useState(false);

    // Forms
    const [reportForm, setReportForm] = useState({ fleetId: '', issueType: '', issueDescription: '' });
    const [statusForm, setStatusForm] = useState({ status: '', resolutionNotes: '' });
    const [costForm, setCostForm] = useState({ fixCost: '' });
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
        pendingQuotes: issues.filter(i => i.status === 'PendingQuotation').length,
        pendingApprovals: issues.filter(i => i.status === 'PendingApproval').length,
        inProgressIssues: issues.filter(i => i.status === 'InProgress').length,
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
        // FA users only see their own reports
        const matchesFA = role !== 'FA' || i.reportedBy?.email === currentUser?.email;
        return matchesSearch && matchesCart && matchesStadium && matchesDateFrom && matchesDateTo && matchesFA;
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

    const statusCards = [
        { label: 'Operational', value: stats.operational, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50', desc: 'Active Carts' },
        { label: 'Awaiting Quote', value: stats.pendingQuotes, icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50', desc: 'Requested from Maint' },
        { label: 'Awaiting Approval', value: stats.pendingApprovals, icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50', desc: 'Costs to approve' },
        { label: 'In Progress', value: stats.inProgressIssues, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50', desc: 'Fixes ongoing' },
    ];

    const handleReport = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('fleetId', reportForm.fleetId);
            if (reportForm.issueType) fd.append('issueType', reportForm.issueType);
            fd.append('issueDescription', reportForm.issueDescription);
            photoFiles.forEach(f => fd.append('photos', f));
            await maintenanceApi.report(fd);
            setReportOpen(false);
            setReportForm({ fleetId: '', issueType: '', issueDescription: '' });
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

    const handleRequestQuote = async () => {
        if (!selectedIssue) return;
        setSubmitting(true);
        try {
            await maintenanceApi.requestQuotation(selectedIssue.id);
            setQuoteOpen(false);
            loadData();
        } catch (err: any) {
            alert('Failed to request quotation');
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitCost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIssue) return;
        setSubmitting(true);
        try {
            await maintenanceApi.submitCost(selectedIssue.id, parseFloat(costForm.fixCost));
            setCostOpen(false);
            loadData();
        } catch (err: any) {
            alert('Failed to submit cost');
        } finally {
            setSubmitting(false);
        }
    };

    const handleApproveCost = async () => {
        if (!selectedIssue) return;
        setSubmitting(true);
        try {
            await maintenanceApi.approveCost(selectedIssue.id);
            setApproveOpen(false);
            loadData();
        } catch (err: any) {
            alert('Failed to approve cost');
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Maintenance Management</h1>
                <div className="flex gap-2">
                    {canExport && (
                        <Button variant="outline" onClick={handleExport} disabled={exporting}>
                            {exporting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Export CSV
                        </Button>
                    )}
                    {canReport && (
                        <Button onClick={() => { setReportForm({ fleetId: '', issueType: '', issueDescription: '' }); setPhotoFiles([]); setReportOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />Report Issue
                        </Button>
                    )}
                </div>
            </div>

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

            <Card>
                <CardHeader>
                    <div className="flex gap-4 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search by cart, issue, or reporter…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                        </div>
                        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All Statuses" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Statuses</SelectItem>
                                {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        {isSuperAdmin && (
                            <Select value={stadiumFilter} onValueChange={setStadiumFilter}>
                                <SelectTrigger className="w-40"><SelectValue placeholder="All Venues" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Venues</SelectItem>
                                    {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                        <Select value={cartFilter} onValueChange={setCartFilter}>
                            <SelectTrigger className="w-40"><SelectValue placeholder="All Carts" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Carts</SelectItem>
                                {fleet.map(f => <SelectItem key={f.id} value={f.id}>{f.carNumber}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                            <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-9 text-xs" />
                            <span className="text-muted-foreground">—</span>
                            <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-9 text-xs" />
                        </div>
                        {(search || statusFilter !== 'all' || stadiumFilter !== 'all' || cartFilter !== 'all' || dateFrom || dateTo) && (
                            <Button variant="ghost" size="sm" onClick={() => {
                                setSearch(''); setStatusFilter('all'); setStadiumFilter('all'); setCartFilter('all'); setDateFrom(''); setDateTo('');
                            }}>
                                <FilterX className="w-4 h-4 mr-2" />Clear
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Cart #</TableHead>
                                <TableHead>Issue Type</TableHead>
                                <TableHead>Issue</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Quotation</TableHead>
                                <TableHead>Cost</TableHead>
                                <TableHead>Venue</TableHead>
                                <TableHead>Reported By</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={9} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={9} className="text-center py-8 text-muted-foreground">No issues found</TableCell></TableRow>
                            ) : filtered.map(issue => (
                                <TableRow key={issue.id}>
                                    <TableCell className="font-mono font-semibold">{issue.fleet?.carNumber}</TableCell>
                                    <TableCell className="text-xs text-muted-foreground whitespace-nowrap">{issue.issueType || '—'}</TableCell>
                                    <TableCell className="max-w-xs truncate" title={issue.issueDescription}>{issue.issueDescription}</TableCell>
                                    <TableCell><Badge className={issueStatusColors[issue.status]}>{issue.status}</Badge></TableCell>
                                    <TableCell>
                                        {issue.quotationStatus ? (
                                            <Badge variant="outline" className={quotationStatusColors[issue.quotationStatus]}>
                                                {issue.quotationStatus}
                                            </Badge>
                                        ) : '—'}
                                    </TableCell>
                                    <TableCell className="font-mono">{issue.fixCost ? `$${issue.fixCost.toFixed(2)}` : '—'}</TableCell>
                                    <TableCell><Badge variant="outline">{issue.fleet?.stadium?.code || '—'}</Badge></TableCell>
                                    <TableCell>
                                        <div className="flex flex-col text-xs">
                                            <span className="font-medium">{issue.reportedBy?.name}</span>
                                            <span className="text-muted-foreground">{formatDate(issue.reportedAt || issue.createdAt)}</span>
                                        </div>
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="sm" onClick={() => loadCartHistory(issue.fleetId, issue.fleet.carNumber)}>History</Button>
                                            
                                            {canRequestQuote && issue.status === 'Open' && (
                                                <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setQuoteOpen(true); }} className="text-orange-600 border-orange-200 hover:bg-orange-50">
                                                    <Send className="w-3 h-3 mr-1" />Quote
                                                </Button>
                                            )}

                                            {canSubmitCost && issue.status === 'PendingQuotation' && (
                                                <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setCostForm({ fixCost: '' }); setCostOpen(true); }} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                                                    <DollarSign className="w-3 h-3 mr-1" />Cost
                                                </Button>
                                            )}

                                            {canApproveCost && issue.status === 'PendingApproval' && (
                                                <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setApproveOpen(true); }} className="text-green-600 border-green-200 hover:bg-green-50">
                                                    <CheckCircle className="w-3 h-3 mr-1" />Approve
                                                </Button>
                                            )}

                                            {canUpdateStatus && (issue.status === 'InProgress' || (issue.status === 'Open' && !isMaintenance)) && (
                                                <Button variant="ghost" size="sm" onClick={() => { setSelectedIssue(issue); setStatusForm({ status: issue.status, resolutionNotes: issue.resolutionNotes || '' }); setStatusOpen(true); }}>Update</Button>
                                            )}
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                    <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} total={pagination.total} limit={pagination.limit} />
                </CardContent>
            </Card>

            {/* Workflow Modals */}
            <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Request Quotation</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground">This will notify the Maintenance Team to inspect the cart and provide a fix cost.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuoteOpen(false)}>Cancel</Button>
                        <Button onClick={handleRequestQuote} disabled={submitting}>Request Quote</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Dialog open={costOpen} onOpenChange={setCostOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Submit Fix Cost</DialogTitle></DialogHeader>
                    <form onSubmit={handleSubmitCost} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Estimated Cost ($)</Label>
                            <Input type="number" step="0.01" value={costForm.fixCost} onChange={e => setCostForm({ fixCost: e.target.value })} placeholder="0.00" required />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>Submit Cost</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                <DialogContent>
                    <DialogHeader><DialogTitle>Approve Maintenance Cost</DialogTitle></DialogHeader>
                    <div className="py-4 space-y-2">
                        {selectedIssue?.issueType && <p><strong>Type:</strong> {selectedIssue.issueType}</p>}
                        <p><strong>Issue:</strong> {selectedIssue?.issueDescription}</p>
                        <p><strong>Cost:</strong> <span className="text-lg font-bold text-green-600">${selectedIssue?.fixCost?.toFixed(2)}</span></p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
                        <Button onClick={handleApproveCost} className="bg-green-600 hover:bg-green-700" disabled={submitting}>Approve & Start Work</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Standard Modals (Report, Update, History) remain similar but updated with role checks */}
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Report Maintenance Issue</DialogTitle></DialogHeader>
                    <form onSubmit={handleReport} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={reportForm.fleetId} onValueChange={v => setReportForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>{fleet.map(v => <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Issue Type (optional)</Label>
                            <select
                                className="w-full border rounded-md px-3 py-2 text-sm bg-white"
                                value={reportForm.issueType}
                                onChange={e => setReportForm(f => ({ ...f, issueType: e.target.value }))}
                            >
                                <option value="">— Select issue type —</option>
                                <option value="Battery and electrical issue">Battery and electrical issue</option>
                                <option value="Body damage">Body damage</option>
                                <option value="Tyre issue">Tyre issue</option>
                                <option value="Brake issue">Brake issue</option>
                                <option value="Other">Other</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <Label>Issue Description *</Label>
                            <textarea className="w-full min-h-[100px] p-3 border rounded-md text-sm" value={reportForm.issueDescription} onChange={e => setReportForm(f => ({ ...f, issueDescription: e.target.value }))} placeholder="Describe the issue…" required />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Report Issue</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Update Issue Status</DialogTitle></DialogHeader>
                    <form onSubmit={handleUpdateStatus} className="space-y-4">
                        <div className="space-y-2">
                            <Label>New Status *</Label>
                            <Select value={statusForm.status} onValueChange={v => setStatusForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Resolved">Resolved (Fix Complete)</SelectItem>
                                    {isSuperAdmin || isAdmin ? (
                                        <>
                                            <SelectItem value="Open">Open</SelectItem>
                                            <SelectItem value="InProgress">In Progress</SelectItem>
                                        </>
                                    ) : null}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Resolution Notes</Label>
                            <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={statusForm.resolutionNotes} onChange={e => setStatusForm(f => ({ ...f, resolutionNotes: e.target.value }))} placeholder="Resolution details…" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>Save Status</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Issue History: {historyFleet?.carNumber}</DialogTitle></DialogHeader>
                    <div className="py-4">
                        {historyLoading ? <div className="flex justify-center py-8"><Loader2 className="animate-spin" /></div> : cartHistory.length === 0 ? <p className="text-center py-8 text-muted-foreground">No history found.</p> : (
                            <div className="space-y-6 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                                {cartHistory.map(h => (
                                    <div key={h.id} className="relative pl-10">
                                        <div className={`absolute left-0 top-1 w-9 h-9 rounded-full border-4 border-background flex items-center justify-center ${issueStatusColors[h.status]}`}><div className="w-2 h-2 rounded-full bg-white" /></div>
                                        <div className="flex flex-col gap-1">
                                            <div className="flex items-center justify-between"><span className="text-sm font-semibold">{h.issueDescription}</span><Badge variant="outline" className="text-[10px]">{formatDateTime(h.reportedAt || h.createdAt)}</Badge></div>
                                            <p className="text-xs text-muted-foreground">Reported by {h.reportedBy?.name} ({h.reportedBy?.role})</p>
                                            {h.fixCost && <p className="text-xs font-semibold text-green-700">Cost: ${h.fixCost.toFixed(2)}</p>}
                                            {h.status === 'Resolved' && <div className="mt-2 p-2 bg-green-50 border border-green-100 rounded text-xs text-green-800"><strong>Resolved:</strong> {h.resolutionNotes}</div>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                    <DialogFooter><Button variant="outline" onClick={() => setHistoryOpen(false)}>Close</Button></DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
