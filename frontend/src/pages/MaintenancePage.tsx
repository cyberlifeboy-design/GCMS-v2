import { useState, useEffect, useCallback } from 'react';
import { maintenanceApi, fleetApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
    Plus, Search, Download, Loader2, CheckCircle, Clock,
    DollarSign, FileText, Send, FilterX, ArrowUpRight,
    XCircle, Eye, Printer, Image, AlertTriangle,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Pagination } from '@/components/shared/Pagination';
import { formatDate, formatDateTime } from '@/lib/dateUtils';

interface MaintenanceLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string; stadiumId: string; stadium?: { id: string; name: string; code: string } };
    issueType?: string;
    issueDescription: string;
    status: 'Open' | 'InProgress' | 'Resolved' | 'PendingQuotation' | 'PendingApproval';
    quotationStatus?: 'Requested' | 'Submitted' | 'Approved' | 'Rejected';
    fixCost?: number;
    quotationDescription?: string;
    quotationTimeline?: string;
    photosUrls?: string | string[];
    reportedBy?: { id: string; name: string; phone?: string; role: string; email?: string };
    approvedBy?: { name: string; role: string };
    contractsEscalatedAt?: string;
    contractsEscalatedBy?: { name: string; role: string };
    rejectionReason?: string;
    rejectedAt?: string;
    resolutionNotes?: string;
    resolvedAt?: string;
    reportedAt?: string;
    createdAt: string;
    quotationRequestedAt?: string;
    costSubmittedAt?: string;
    costApprovedAt?: string;
}

const STATUS_COLORS: Record<string, string> = {
    'Open': 'bg-red-500 text-white',
    'PendingQuotation': 'bg-orange-500 text-white',
    'PendingApproval': 'bg-blue-500 text-white',
    'InProgress': 'bg-yellow-600 text-white',
    'Resolved': 'bg-green-600 text-white',
};

const QUOTE_COLORS: Record<string, string> = {
    'Requested': 'bg-orange-100 text-orange-700 border-orange-200',
    'Submitted': 'bg-blue-100 text-blue-700 border-blue-200',
    'Approved': 'bg-green-100 text-green-700 border-green-200',
    'Rejected': 'bg-red-100 text-red-700 border-red-200',
};

const STATUSES = ['Open', 'PendingQuotation', 'PendingApproval', 'InProgress', 'Resolved'] as const;

function parsePhotos(raw: string | string[] | undefined): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try { return JSON.parse(raw); } catch { return []; }
}

export function MaintenancePage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isSuperAdmin = role === 'SuperAdmin';
    const isAdmin = role === 'Admin';
    const isContracts = role === 'Contracts';
    const isMaintenance = role === 'MaintenanceTeam';
    const isObserver = role === 'Observer';
    const isFA = role === 'FA';

    const canReport = isFA || isAdmin || isSuperAdmin;
    const canEscalate = isAdmin || isSuperAdmin;
    const canUpdateStatus = isAdmin || isSuperAdmin || isMaintenance;
    const canExport = isAdmin || isSuperAdmin || isObserver || isContracts;
    const canRequestQuote = isContracts || isSuperAdmin;
    const canSubmitCost = isMaintenance || isSuperAdmin;
    const canApproveCost = isContracts || isSuperAdmin;
    const canRejectCost = isContracts || isSuperAdmin;
    const canViewPdf = isAdmin || isSuperAdmin || isContracts || isObserver;

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
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    // Dialogs
    const [reportOpen, setReportOpen] = useState(false);
    const [detailIssue, setDetailIssue] = useState<MaintenanceLog | null>(null);
    const [statusOpen, setStatusOpen] = useState(false);
    const [historyOpen, setHistoryOpen] = useState(false);
    const [quoteOpen, setQuoteOpen] = useState(false);
    const [costOpen, setCostOpen] = useState(false);
    const [approveOpen, setApproveOpen] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);
    const [escalateOpen, setEscalateOpen] = useState(false);
    const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);

    const [historyFleet, setHistoryFleet] = useState<{ id: string; carNumber: string } | null>(null);
    const [cartHistory, setCartHistory] = useState<MaintenanceLog[]>([]);
    const [historyLoading, setHistoryLoading] = useState(false);
    const [selectedIssue, setSelectedIssue] = useState<MaintenanceLog | null>(null);
    const [submitting, setSubmitting] = useState(false);
    const [exporting, setExporting] = useState(false);

    const [reportForm, setReportForm] = useState({ fleetId: '', issueType: '', issueDescription: '' });
    const [statusForm, setStatusForm] = useState({ status: '', resolutionNotes: '' });
    const [costForm, setCostForm] = useState({ fixCost: '', quotationDescription: '', quotationTimeline: '' });
    const [rejectReason, setRejectReason] = useState('');
    const [photoFiles, setPhotoFiles] = useState<File[]>([]);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const params: any = { page, limit: pagination.limit };
            if (statusFilter !== 'all') params.status = statusFilter;

            const [issuesRes, fleetRes, stadiumsRes] = await Promise.all([
                maintenanceApi.getAll(params),
                fleetApi.getAll(),
                stadiumsApi.getAll(),
            ]);
            setIssues(issuesRes.data.data || []);
            if (issuesRes.data.pagination) setPagination(p => ({ ...p, ...issuesRes.data.pagination }));
            setFleet(fleetRes.data.data || []);
            setStadiums(stadiumsRes.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, page, pagination.limit]);

    useEffect(() => { loadData(); }, [loadData]);

    const openDetail = async (issue: MaintenanceLog) => {
        // Refresh to get latest data
        try {
            const res = await maintenanceApi.getById(issue.id);
            setDetailIssue(res.data);
        } catch {
            setDetailIssue(issue);
        }
    };

    const stats = {
        operational: fleet.filter(f => ['Available', 'Assigned', 'Dispatched'].includes(f.status)).length,
        inMaintenance: fleet.filter(f => f.status === 'Under Maintenance').length,
        openIssues: issues.filter(i => i.status === 'Open').length,
        pendingQuotes: issues.filter(i => i.status === 'PendingQuotation').length,
        pendingApprovals: issues.filter(i => i.status === 'PendingApproval').length,
        inProgress: issues.filter(i => i.status === 'InProgress').length,
    };

    const filtered = issues.filter(i => {
        const matchSearch = !search ||
            i.fleet?.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
            i.issueDescription?.toLowerCase().includes(search.toLowerCase()) ||
            i.reportedBy?.name?.toLowerCase().includes(search.toLowerCase());
        const matchCart = cartFilter === 'all' || i.fleetId === cartFilter;
        const matchStadium = stadiumFilter === 'all' || i.fleet?.stadium?.id === stadiumFilter;
        const matchDateFrom = !dateFrom || new Date(i.reportedAt || i.createdAt) >= new Date(dateFrom);
        const matchDateTo = !dateTo || new Date(i.reportedAt || i.createdAt) <= new Date(dateTo + 'T23:59:59');
        const matchFA = !isFA || i.reportedBy?.id === currentUser?.id;
        return matchSearch && matchCart && matchStadium && matchDateFrom && matchDateTo && matchFA;
    });

    const loadCartHistory = async (fleetId: string, carNumber: string) => {
        setHistoryFleet({ id: fleetId, carNumber });
        setHistoryOpen(true);
        setHistoryLoading(true);
        try {
            const res = await maintenanceApi.getByFleet(fleetId);
            setCartHistory(res.data.data || []);
        } finally {
            setHistoryLoading(false);
        }
    };

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

    const handleEscalate = async () => {
        if (!selectedIssue) return;
        setSubmitting(true);
        try {
            await maintenanceApi.escalateToContracts(selectedIssue.id);
            setEscalateOpen(false);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to escalate');
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
        } finally {
            setSubmitting(false);
        }
    };

    const handleSubmitCost = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedIssue) return;
        setSubmitting(true);
        try {
            await maintenanceApi.submitCost(selectedIssue.id, {
                fixCost: parseFloat(costForm.fixCost),
                quotationDescription: costForm.quotationDescription,
                quotationTimeline: costForm.quotationTimeline || undefined,
            });
            setCostOpen(false);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to submit quotation');
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
        } finally {
            setSubmitting(false);
        }
    };

    const handleRejectQuotation = async () => {
        if (!selectedIssue || !rejectReason.trim()) return;
        setSubmitting(true);
        try {
            await maintenanceApi.rejectQuotation(selectedIssue.id, rejectReason.trim());
            setRejectOpen(false);
            setRejectReason('');
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to reject quotation');
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
            loadData();
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
        } finally {
            setExporting(false);
        }
    };

    const openPdfReport = (id: string) => {
        const url = maintenanceApi.getPdfReportUrl(id);
        const token = localStorage.getItem('accessToken');
        // Open in new tab with auth token in URL query (backend reads from query if no header)
        window.open(`${url}?token=${token}`, '_blank');
    };

    const statusCards = [
        { label: 'Operational', value: stats.operational, icon: CheckCircle, color: 'text-green-600', bg: 'bg-green-50' },
        { label: 'Awaiting Quote', value: stats.pendingQuotes, icon: FileText, color: 'text-orange-600', bg: 'bg-orange-50' },
        { label: 'Awaiting Approval', value: stats.pendingApprovals, icon: DollarSign, color: 'text-blue-600', bg: 'bg-blue-50' },
        { label: 'In Progress', value: stats.inProgress, icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
    ];

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

            {/* Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {statusCards.map(card => (
                    <Card key={card.label} className={`${card.bg} border`}>
                        <CardContent className="p-4 flex items-center justify-between">
                            <div>
                                <p className="text-xs font-medium text-muted-foreground">{card.label}</p>
                                <p className={`text-3xl font-bold ${card.color}`}>{card.value}</p>
                            </div>
                            <card.icon className={`w-8 h-8 ${card.color} opacity-40`} />
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Table */}
            <Card>
                <CardHeader>
                    <div className="flex gap-3 flex-wrap">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input placeholder="Search by cart, issue, reporter…" value={search} onChange={e => setSearch(e.target.value)} className="pl-10" />
                        </div>
                        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="All Statuses" /></SelectTrigger>
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
                            <SelectTrigger className="w-36"><SelectValue placeholder="All Carts" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Carts</SelectItem>
                                {fleet.map(f => <SelectItem key={f.id} value={f.id}>{f.carNumber}</SelectItem>)}
                            </SelectContent>
                        </Select>
                        <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="w-36 h-9 text-xs" />
                        <span className="self-center text-muted-foreground">—</span>
                        <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="w-36 h-9 text-xs" />
                        {(search || statusFilter !== 'all' || stadiumFilter !== 'all' || cartFilter !== 'all' || dateFrom || dateTo) && (
                            <Button variant="ghost" size="sm" onClick={() => { setSearch(''); setStatusFilter('all'); setStadiumFilter('all'); setCartFilter('all'); setDateFrom(''); setDateTo(''); }}>
                                <FilterX className="w-4 h-4 mr-1" />Clear
                            </Button>
                        )}
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    <div className="overflow-x-auto">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Cart #</TableHead>
                                    <TableHead>Issue</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Quotation</TableHead>
                                    <TableHead>Cost (QAR)</TableHead>
                                    <TableHead>Venue</TableHead>
                                    <TableHead>Reported</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {loading ? (
                                    <TableRow><TableCell colSpan={8} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                                ) : filtered.length === 0 ? (
                                    <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">No issues found</TableCell></TableRow>
                                ) : filtered.map(issue => (
                                    <TableRow key={issue.id} className="hover:bg-muted/30">
                                        <TableCell className="font-mono font-semibold whitespace-nowrap">
                                            {issue.fleet?.carNumber}
                                            {issue.contractsEscalatedAt && (
                                                <span title="Escalated to Contracts" className="ml-1 text-blue-500">●</span>
                                            )}
                                        </TableCell>
                                        <TableCell className="max-w-[200px]">
                                            {issue.issueType && <div className="text-xs text-muted-foreground">{issue.issueType}</div>}
                                            <div className="truncate text-sm" title={issue.issueDescription}>{issue.issueDescription}</div>
                                        </TableCell>
                                        <TableCell><Badge className={STATUS_COLORS[issue.status]}>{issue.status}</Badge></TableCell>
                                        <TableCell>
                                            {issue.quotationStatus
                                                ? <Badge variant="outline" className={QUOTE_COLORS[issue.quotationStatus]}>{issue.quotationStatus}</Badge>
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="font-mono whitespace-nowrap">
                                            {issue.fixCost != null ? `QAR ${issue.fixCost.toFixed(2)}` : '—'}
                                        </TableCell>
                                        <TableCell><Badge variant="outline">{issue.fleet?.stadium?.code || '—'}</Badge></TableCell>
                                        <TableCell className="text-xs">
                                            <div className="font-medium">{issue.reportedBy?.name}</div>
                                            <div className="text-muted-foreground">{formatDate(issue.reportedAt || issue.createdAt)}</div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-1 flex-wrap">
                                                <Button variant="ghost" size="sm" onClick={() => openDetail(issue)}>
                                                    <Eye className="w-3 h-3 mr-1" />View
                                                </Button>

                                                {/* Admin: Escalate to Contracts */}
                                                {canEscalate && !issue.contractsEscalatedAt && issue.status === 'Open' && (
                                                    <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setEscalateOpen(true); }} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                                                        <ArrowUpRight className="w-3 h-3 mr-1" />Escalate
                                                    </Button>
                                                )}

                                                {/* Contracts: Request Quote */}
                                                {canRequestQuote && issue.contractsEscalatedAt && issue.status === 'Open' && (
                                                    <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setQuoteOpen(true); }} className="text-orange-600 border-orange-200 hover:bg-orange-50">
                                                        <Send className="w-3 h-3 mr-1" />Request Quote
                                                    </Button>
                                                )}

                                                {/* Maintenance: Submit Quotation */}
                                                {canSubmitCost && issue.status === 'PendingQuotation' && (
                                                    <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setCostForm({ fixCost: '', quotationDescription: '', quotationTimeline: '' }); setCostOpen(true); }} className="text-blue-600 border-blue-200 hover:bg-blue-50">
                                                        <DollarSign className="w-3 h-3 mr-1" />Quote
                                                    </Button>
                                                )}

                                                {/* Contracts: Approve / Reject */}
                                                {canApproveCost && issue.status === 'PendingApproval' && (
                                                    <>
                                                        <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setApproveOpen(true); }} className="text-green-600 border-green-200 hover:bg-green-50">
                                                            <CheckCircle className="w-3 h-3 mr-1" />Approve
                                                        </Button>
                                                        {canRejectCost && (
                                                            <Button variant="outline" size="sm" onClick={() => { setSelectedIssue(issue); setRejectReason(''); setRejectOpen(true); }} className="text-red-600 border-red-200 hover:bg-red-50">
                                                                <XCircle className="w-3 h-3 mr-1" />Reject
                                                            </Button>
                                                        )}
                                                    </>
                                                )}

                                                {/* Status update */}
                                                {canUpdateStatus && (issue.status === 'InProgress' || (issue.status === 'Open' && !isMaintenance)) && (
                                                    <Button variant="ghost" size="sm" onClick={() => { setSelectedIssue(issue); setStatusForm({ status: issue.status, resolutionNotes: issue.resolutionNotes || '' }); setStatusOpen(true); }}>Update</Button>
                                                )}

                                                {/* PDF Report */}
                                                {canViewPdf && (
                                                    <Button variant="ghost" size="sm" onClick={() => openPdfReport(issue.id)}>
                                                        <Printer className="w-3 h-3 mr-1" />PDF
                                                    </Button>
                                                )}

                                                {/* Cart History */}
                                                {(isAdmin || isSuperAdmin || isObserver) && (
                                                    <Button variant="ghost" size="sm" onClick={() => loadCartHistory(issue.fleetId, issue.fleet?.carNumber)}>
                                                        <FileText className="w-3 h-3 mr-1" />History
                                                    </Button>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                    <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} total={pagination.total} limit={pagination.limit} />
                </CardContent>
            </Card>

            {/* ── Detail View Dialog ── */}
            <Dialog open={!!detailIssue} onOpenChange={open => !open && setDetailIssue(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <span>Issue — {detailIssue?.fleet?.carNumber}</span>
                            {detailIssue && <Badge className={STATUS_COLORS[detailIssue.status]}>{detailIssue.status}</Badge>}
                        </DialogTitle>
                    </DialogHeader>
                    {detailIssue && (
                        <div className="space-y-4 py-2">
                            {/* Cart & Venue */}
                            <div className="grid grid-cols-3 gap-3 text-sm bg-muted/30 rounded-md p-3">
                                <div><span className="text-xs text-muted-foreground block">Cart</span><strong>{detailIssue.fleet?.carNumber}</strong> ({detailIssue.fleet?.carType})</div>
                                <div><span className="text-xs text-muted-foreground block">Venue</span>{detailIssue.fleet?.stadium?.name || '—'}</div>
                                <div><span className="text-xs text-muted-foreground block">Reported</span>{formatDateTime(detailIssue.reportedAt || detailIssue.createdAt)}</div>
                            </div>

                            {/* Issue */}
                            <div>
                                {detailIssue.issueType && <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">{detailIssue.issueType}</div>}
                                <p className="text-sm leading-relaxed border rounded-md p-3 bg-muted/20">{detailIssue.issueDescription}</p>
                            </div>

                            {/* Reporter */}
                            <div className="grid grid-cols-2 gap-3 text-sm">
                                <div><span className="text-xs text-muted-foreground block">Reported By</span>{detailIssue.reportedBy?.name} ({detailIssue.reportedBy?.role})</div>
                                {detailIssue.reportedBy?.phone && <div><span className="text-xs text-muted-foreground block">Contact</span>{detailIssue.reportedBy.phone}</div>}
                            </div>

                            {/* Escalation */}
                            {detailIssue.contractsEscalatedAt && (
                                <div className="bg-blue-50 border border-blue-200 rounded-md p-3 text-sm">
                                    <span className="font-semibold text-blue-800">Escalated to Contracts</span>
                                    <div className="text-blue-600 text-xs mt-1">
                                        By {detailIssue.contractsEscalatedBy?.name} on {formatDate(detailIssue.contractsEscalatedAt)}
                                    </div>
                                </div>
                            )}

                            {/* Quotation */}
                            {detailIssue.fixCost != null && (
                                <div className="bg-green-50 border border-green-200 rounded-md p-3 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="font-semibold text-green-800 text-sm">Quotation Details</span>
                                        <span className="text-xl font-black text-green-700">QAR {detailIssue.fixCost.toFixed(2)}</span>
                                    </div>
                                    {detailIssue.quotationDescription && (
                                        <p className="text-sm text-green-900">{detailIssue.quotationDescription}</p>
                                    )}
                                    {detailIssue.quotationTimeline && (
                                        <div className="text-xs text-green-700"><strong>Timeline:</strong> {detailIssue.quotationTimeline}</div>
                                    )}
                                    {detailIssue.quotationStatus && (
                                        <Badge variant="outline" className={QUOTE_COLORS[detailIssue.quotationStatus]}>{detailIssue.quotationStatus}</Badge>
                                    )}
                                </div>
                            )}

                            {/* Rejection */}
                            {detailIssue.rejectionReason && (
                                <div className="bg-red-50 border border-red-200 rounded-md p-3">
                                    <div className="text-red-800 font-semibold text-sm flex items-center gap-1"><AlertTriangle className="w-4 h-4" />Quotation Rejected</div>
                                    <p className="text-sm text-red-700 mt-1">{detailIssue.rejectionReason}</p>
                                    {detailIssue.rejectedAt && <div className="text-xs text-red-500 mt-1">{formatDate(detailIssue.rejectedAt)}</div>}
                                </div>
                            )}

                            {/* Resolution */}
                            {detailIssue.resolutionNotes && (
                                <div className="bg-muted/30 rounded-md p-3">
                                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-1">Resolution Notes</div>
                                    <p className="text-sm">{detailIssue.resolutionNotes}</p>
                                    {detailIssue.resolvedAt && <div className="text-xs text-muted-foreground mt-1">Resolved {formatDateTime(detailIssue.resolvedAt)}</div>}
                                </div>
                            )}

                            {/* Photos */}
                            {parsePhotos(detailIssue.photosUrls).length > 0 && (
                                <div>
                                    <div className="text-xs font-semibold text-muted-foreground uppercase mb-2 flex items-center gap-1">
                                        <Image className="w-3 h-3" />Photos ({parsePhotos(detailIssue.photosUrls).length})
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                        {parsePhotos(detailIssue.photosUrls).map((url, i) => (
                                            <img
                                                key={i}
                                                src={url}
                                                alt={`Photo ${i + 1}`}
                                                className="w-24 h-20 object-cover rounded border cursor-pointer hover:opacity-80 transition-opacity"
                                                onClick={() => setLightboxSrc(url)}
                                            />
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Timeline */}
                            <div className="border-t pt-3 space-y-1 text-xs text-muted-foreground">
                                {detailIssue.reportedAt && <div>Reported: {formatDateTime(detailIssue.reportedAt)}</div>}
                                {detailIssue.contractsEscalatedAt && <div>Escalated: {formatDateTime(detailIssue.contractsEscalatedAt)}</div>}
                                {detailIssue.quotationRequestedAt && <div>Quote Requested: {formatDateTime(detailIssue.quotationRequestedAt)}</div>}
                                {detailIssue.costSubmittedAt && <div>Quote Submitted: {formatDateTime(detailIssue.costSubmittedAt)}</div>}
                                {detailIssue.costApprovedAt && <div>Approved: {formatDateTime(detailIssue.costApprovedAt)}</div>}
                                {detailIssue.resolvedAt && <div>Resolved: {formatDateTime(detailIssue.resolvedAt)}</div>}
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        {detailIssue && canViewPdf && (
                            <Button variant="outline" onClick={() => openPdfReport(detailIssue.id)}>
                                <Printer className="w-4 h-4 mr-2" />Print / PDF
                            </Button>
                        )}
                        <Button variant="outline" onClick={() => setDetailIssue(null)}>Close</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Photo Lightbox */}
            {lightboxSrc && (
                <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center" onClick={() => setLightboxSrc(null)}>
                    <img src={lightboxSrc} alt="Photo" className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl" />
                    <button className="absolute top-4 right-4 text-white text-3xl leading-none">&times;</button>
                </div>
            )}

            {/* ── Escalate to Contracts Dialog ── */}
            <Dialog open={escalateOpen} onOpenChange={setEscalateOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><ArrowUpRight className="w-5 h-5 text-blue-600" />Escalate to Contracts</DialogTitle></DialogHeader>
                    <div className="py-3 space-y-2 text-sm">
                        <p>This will notify the <strong>Contracts</strong> team about this issue and allow them to request a quotation from the Maintenance Team.</p>
                        {selectedIssue && (
                            <div className="bg-muted/40 rounded-md p-3 text-xs">
                                <div><strong>Cart:</strong> {selectedIssue.fleet?.carNumber}</div>
                                <div className="mt-1 truncate"><strong>Issue:</strong> {selectedIssue.issueDescription}</div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEscalateOpen(false)}>Cancel</Button>
                        <Button onClick={handleEscalate} disabled={submitting} className="bg-blue-600 hover:bg-blue-700">
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Escalate to Contracts
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Request Quotation Dialog ── */}
            <Dialog open={quoteOpen} onOpenChange={setQuoteOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Request Quotation from Maintenance</DialogTitle></DialogHeader>
                    <p className="text-sm text-muted-foreground py-2">This will notify the Maintenance Team to inspect the issue and submit a detailed quotation.</p>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setQuoteOpen(false)}>Cancel</Button>
                        <Button onClick={handleRequestQuote} disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Request Quote</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Submit Quotation Dialog (Maintenance) ── */}
            <Dialog open={costOpen} onOpenChange={setCostOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Submit Quotation</DialogTitle></DialogHeader>
                    <form onSubmit={handleSubmitCost} className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Fix Cost (QAR) <span className="text-red-500">*</span></Label>
                            <Input type="number" step="0.01" min="0" value={costForm.fixCost} onChange={e => setCostForm(f => ({ ...f, fixCost: e.target.value }))} placeholder="0.00" required />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Work Description <span className="text-red-500">*</span></Label>
                            <Textarea
                                value={costForm.quotationDescription}
                                onChange={e => setCostForm(f => ({ ...f, quotationDescription: e.target.value }))}
                                placeholder="Describe the work to be carried out, parts needed, scope of fix…"
                                rows={4}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Estimated Timeline</Label>
                            <Input value={costForm.quotationTimeline} onChange={e => setCostForm(f => ({ ...f, quotationTimeline: e.target.value }))} placeholder="e.g. 2–3 working days" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCostOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Submit Quotation</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Approve Dialog ── */}
            <Dialog open={approveOpen} onOpenChange={setApproveOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle>Approve Quotation</DialogTitle></DialogHeader>
                    {selectedIssue && (
                        <div className="py-3 space-y-3">
                            <div className="bg-green-50 border border-green-200 rounded-md p-4">
                                <div className="text-xs text-green-700 font-semibold uppercase">Fix Cost</div>
                                <div className="text-2xl font-black text-green-700 mt-1">QAR {selectedIssue.fixCost?.toFixed(2)}</div>
                            </div>
                            {selectedIssue.quotationDescription && (
                                <p className="text-sm">{selectedIssue.quotationDescription}</p>
                            )}
                            {selectedIssue.quotationTimeline && (
                                <div className="text-xs text-muted-foreground"><strong>Timeline:</strong> {selectedIssue.quotationTimeline}</div>
                            )}
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setApproveOpen(false)}>Cancel</Button>
                        <Button onClick={handleApproveCost} className="bg-green-600 hover:bg-green-700" disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Approve &amp; Start Work
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Reject Dialog ── */}
            <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader><DialogTitle className="flex items-center gap-2"><XCircle className="w-5 h-5 text-red-500" />Reject Quotation</DialogTitle></DialogHeader>
                    <div className="py-2 space-y-3">
                        <p className="text-sm text-muted-foreground">The issue will be sent back to <strong>Open</strong> for the Admin to re-evaluate. Both Admin and Maintenance Team will be notified.</p>
                        <div className="space-y-1.5">
                            <Label>Rejection Reason <span className="text-red-500">*</span></Label>
                            <Textarea value={rejectReason} onChange={e => setRejectReason(e.target.value)} placeholder="Explain why the quotation is rejected…" rows={3} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setRejectOpen(false)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleRejectQuotation} disabled={submitting || !rejectReason.trim()}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Reject Quotation
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* ── Report Issue Dialog ── */}
            <Dialog open={reportOpen} onOpenChange={setReportOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Report Maintenance Issue</DialogTitle></DialogHeader>
                    <form onSubmit={handleReport} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>Cart <span className="text-red-500">*</span></Label>
                            <Select value={reportForm.fleetId} onValueChange={v => setReportForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>{fleet.map(v => <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>)}</SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Issue Type</Label>
                            <Select value={reportForm.issueType} onValueChange={v => setReportForm(f => ({ ...f, issueType: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select type (optional)" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Battery and electrical issue">Battery &amp; Electrical</SelectItem>
                                    <SelectItem value="Body damage">Body Damage</SelectItem>
                                    <SelectItem value="Tyre issue">Tyre Issue</SelectItem>
                                    <SelectItem value="Brake issue">Brake Issue</SelectItem>
                                    <SelectItem value="Other">Other</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Description <span className="text-red-500">*</span></Label>
                            <Textarea value={reportForm.issueDescription} onChange={e => setReportForm(f => ({ ...f, issueDescription: e.target.value }))} placeholder="Describe the issue in detail…" rows={4} required />
                        </div>
                        <div className="space-y-1.5">
                            <Label className="flex items-center gap-2"><Image className="w-4 h-4" />Photos (up to 5)</Label>
                            <Input type="file" accept="image/*" multiple onChange={e => setPhotoFiles(Array.from(e.target.files || []).slice(0, 5))} />
                            {photoFiles.length > 0 && <p className="text-xs text-muted-foreground">{photoFiles.length} file(s) selected</p>}
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setReportOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting || !reportForm.fleetId || !reportForm.issueDescription.trim()}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Report Issue
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Update Status Dialog ── */}
            <Dialog open={statusOpen} onOpenChange={setStatusOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader><DialogTitle>Update Issue Status</DialogTitle></DialogHeader>
                    <form onSubmit={handleUpdateStatus} className="space-y-4">
                        <div className="space-y-1.5">
                            <Label>New Status <span className="text-red-500">*</span></Label>
                            <Select value={statusForm.status} onValueChange={v => setStatusForm(f => ({ ...f, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Resolved">Resolved (Fix Complete)</SelectItem>
                                    {(isSuperAdmin || isAdmin) && (
                                        <>
                                            <SelectItem value="Open">Open</SelectItem>
                                            <SelectItem value="InProgress">In Progress</SelectItem>
                                        </>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Resolution Notes</Label>
                            <Textarea value={statusForm.resolutionNotes} onChange={e => setStatusForm(f => ({ ...f, resolutionNotes: e.target.value }))} placeholder="Resolution details…" rows={3} />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setStatusOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting || !statusForm.status}>Save Status</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* ── Cart History Dialog ── */}
            <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader><DialogTitle>Issue History — {historyFleet?.carNumber}</DialogTitle></DialogHeader>
                    <div className="py-4">
                        {historyLoading ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                        ) : cartHistory.length === 0 ? (
                            <p className="text-center py-8 text-muted-foreground">No history found.</p>
                        ) : (
                            <div className="space-y-4 relative before:absolute before:left-[17px] before:top-2 before:bottom-2 before:w-0.5 before:bg-muted">
                                {cartHistory.map(h => (
                                    <div key={h.id} className="relative pl-10">
                                        <div className={`absolute left-0 top-1 w-9 h-9 rounded-full border-4 border-background flex items-center justify-center ${STATUS_COLORS[h.status]}`}>
                                            <div className="w-2 h-2 rounded-full bg-white" />
                                        </div>
                                        <div className="space-y-1">
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="text-sm font-semibold">{h.issueDescription.substring(0, 80)}</span>
                                                <Badge variant="outline" className="text-[10px] shrink-0">{formatDate(h.reportedAt || h.createdAt)}</Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">By {h.reportedBy?.name} ({h.reportedBy?.role})</p>
                                            {h.fixCost != null && <p className="text-xs font-semibold text-green-700">QAR {h.fixCost.toFixed(2)}</p>}
                                            {h.resolutionNotes && <div className="mt-1 p-2 bg-green-50 border border-green-100 rounded text-xs text-green-800"><strong>Resolved:</strong> {h.resolutionNotes}</div>}
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
