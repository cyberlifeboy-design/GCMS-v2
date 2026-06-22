import { useState, useEffect } from 'react';
import { maintenanceApi, handoverApi } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Wrench, AlertTriangle, CheckCircle2, Clock, FileSignature, Download } from 'lucide-react';
import { formatDateTime } from '@/lib/dateUtils';
import { HandoverFormModal } from '@/components/handover/HandoverFormModal';

const statusColors: Record<string, string> = {
    Open:              'bg-red-100 text-red-800 border-red-200',
    InProgress:        'bg-yellow-100 text-yellow-800 border-yellow-200',
    Resolved:          'bg-green-100 text-green-800 border-green-200',
    PendingQuotation:  'bg-orange-100 text-orange-800 border-orange-200',
    PendingApproval:   'bg-blue-100 text-blue-800 border-blue-200',
};

const StatusIcon = ({ status }: { status: string }) => {
    if (status === 'Resolved') return <CheckCircle2 className="w-3 h-3" />;
    if (status === 'Open') return <AlertTriangle className="w-3 h-3" />;
    return <Clock className="w-3 h-3" />;
};

export function MyReportsPage() {
    const [reports, setReports] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [statusFilter, setStatusFilter] = useState('all');
    const [selected, setSelected] = useState<any | null>(null);

    // Handover forms
    const [forms, setForms] = useState<any[]>([]);
    const [formsLoading, setFormsLoading] = useState(true);
    const [formModal, setFormModal] = useState<{ open: boolean; fleetId: string } | null>(null);

    useEffect(() => {
        const load = async () => {
            try {
                setLoading(true);
                const params: any = { limit: 200 };
                if (statusFilter !== 'all') params.status = statusFilter;
                const res = await maintenanceApi.getAll(params);
                setReports(res.data.data || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [statusFilter]);

    useEffect(() => {
        handoverApi.listForms({ limit: 50 })
            .then(res => setForms(res.data.data || []))
            .catch(() => {})
            .finally(() => setFormsLoading(false));
    }, []);

    const stats = {
        total: reports.length,
        open: reports.filter(r => r.status === 'Open').length,
        inProgress: reports.filter(r => ['InProgress', 'PendingQuotation', 'PendingApproval'].includes(r.status)).length,
        resolved: reports.filter(r => r.status === 'Resolved').length,
    };

    return (
        <div className="container mx-auto py-6 max-w-6xl space-y-6 animate-in fade-in duration-500">
            <div>
                <h1 className="text-3xl font-extrabold tracking-tight flex items-center gap-3">
                    <Wrench className="w-8 h-8 text-primary" /> My Reports
                </h1>
                <p className="text-muted-foreground mt-1">Maintenance and incident issues you've reported on assigned carts.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                    { label: 'Total Reports', value: stats.total, color: 'text-slate-700', bg: 'bg-slate-50' },
                    { label: 'Open', value: stats.open, color: 'text-red-700', bg: 'bg-red-50' },
                    { label: 'In Progress', value: stats.inProgress, color: 'text-amber-700', bg: 'bg-amber-50' },
                    { label: 'Resolved', value: stats.resolved, color: 'text-green-700', bg: 'bg-green-50' },
                ].map(s => (
                    <Card key={s.label} className={`border-none shadow-sm ${s.bg}`}>
                        <CardContent className="pt-5 pb-4 px-5">
                            <p className={`text-3xl font-black ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-muted-foreground font-medium mt-1">{s.label}</p>
                        </CardContent>
                    </Card>
                ))}
            </div>

            {/* Handover Forms */}
            <Card className="border-none shadow-md overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-indigo-50/60 to-transparent border-b py-4 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-indigo-800 text-base flex items-center gap-2">
                            <FileSignature className="w-4 h-4" /> Signed Handover Forms
                        </CardTitle>
                        <CardDescription>Your completed handover forms — view and download as PDF.</CardDescription>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {formsLoading ? (
                        <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : forms.length === 0 ? (
                        <div className="text-center py-10 text-muted-foreground">
                            <FileSignature className="w-8 h-8 mx-auto mb-2 opacity-20" />
                            <p className="text-sm">No completed handover forms yet.</p>
                        </div>
                    ) : (
                        <Table>
                            <TableHeader className="bg-muted/20">
                                <TableRow>
                                    <TableHead>Cart</TableHead>
                                    <TableHead>Type</TableHead>
                                    <TableHead>Venue</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Signed</TableHead>
                                    <TableHead className="text-right">PDF</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {forms.map(f => (
                                    <TableRow key={f.id}>
                                        <TableCell className="font-black font-mono text-primary">{f.fleet?.carNumber}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{f.fleet?.carType}</TableCell>
                                        <TableCell><Badge variant="outline" className="font-mono text-[10px]">{f.fleet?.stadium?.code}</Badge></TableCell>
                                        <TableCell>
                                            {f.status === 'ADMIN_SIGNED' && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px]">Admin Signed</Badge>}
                                            {f.status === 'COMPLETE' && <Badge className="bg-green-100 text-green-800 border-green-200 text-[9px]">Complete</Badge>}
                                            {f.status === 'HANDBACK_PENDING' && <Badge className="bg-orange-100 text-orange-800 border-orange-200 text-[9px]">Handback Pending</Badge>}
                                            {f.status === 'RETURNED' && <Badge className="bg-indigo-100 text-indigo-800 border-indigo-200 text-[9px]">Returned</Badge>}
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(f.userSignedAt || f.updatedAt)}</TableCell>
                                        <TableCell className="text-right">
                                            <Button size="sm" variant="outline" className="border-indigo-200 text-indigo-700 hover:bg-indigo-50"
                                                onClick={() => setFormModal({ open: true, fleetId: f.fleetId })}>
                                                <Download className="w-3 h-3 mr-1" /> View &amp; PDF
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Maintenance Table */}
            <Card className="border-none shadow-md overflow-hidden">
                <CardHeader className="bg-gradient-to-r from-red-50/60 to-transparent border-b py-4 flex flex-row items-center justify-between">
                    <div>
                        <CardTitle className="text-red-800 text-base">Reported Issues</CardTitle>
                        <CardDescription>Click a row to view full details</CardDescription>
                    </div>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                        <SelectTrigger className="w-40 h-8 text-xs bg-white">
                            <SelectValue placeholder="All statuses" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Statuses</SelectItem>
                            <SelectItem value="Open">Open</SelectItem>
                            <SelectItem value="InProgress">In Progress</SelectItem>
                            <SelectItem value="PendingQuotation">Pending Quotation</SelectItem>
                            <SelectItem value="PendingApproval">Pending Approval</SelectItem>
                            <SelectItem value="Resolved">Resolved</SelectItem>
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
                                    <TableHead>Issue Type</TableHead>
                                    <TableHead>Description</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Reported</TableHead>
                                    <TableHead>Resolution</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {reports.length === 0 ? (
                                    <TableRow>
                                        <TableCell colSpan={6} className="text-center py-16 text-muted-foreground">
                                            <Wrench className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                            No issues reported yet
                                        </TableCell>
                                    </TableRow>
                                ) : reports.map(r => (
                                    <TableRow
                                        key={r.id}
                                        className="cursor-pointer hover:bg-muted/30"
                                        onClick={() => setSelected(selected?.id === r.id ? null : r)}
                                    >
                                        <TableCell className="font-bold font-mono text-primary">{r.fleet?.carNumber}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{r.issueType || '—'}</TableCell>
                                        <TableCell className="text-sm max-w-[280px] truncate">{r.issueDescription}</TableCell>
                                        <TableCell>
                                            <Badge variant="outline" className={`text-[10px] font-semibold flex items-center gap-1 w-fit ${statusColors[r.status] ?? ''}`}>
                                                <StatusIcon status={r.status} />{r.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.reportedAt || r.createdAt)}</TableCell>
                                        <TableCell className="text-xs text-muted-foreground max-w-[180px] truncate">
                                            {r.resolutionNotes || (r.status === 'Resolved' ? 'Resolved' : '—')}
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            {/* Expanded detail panel */}
            {selected && (
                <Card className="border-2 border-primary/20 shadow-md">
                    <CardHeader className="bg-primary/5 border-b py-4">
                        <CardTitle className="text-base flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 text-red-600" />
                            Issue Detail — Cart {selected.fleet?.carNumber}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4 grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                        <div className="space-y-2">
                            <p><span className="font-semibold text-muted-foreground text-xs uppercase">Type</span><br />{selected.issueType || 'Not specified'}</p>
                            <p><span className="font-semibold text-muted-foreground text-xs uppercase">Description</span><br />{selected.issueDescription}</p>
                            <p><span className="font-semibold text-muted-foreground text-xs uppercase">Venue</span><br />{selected.fleet?.stadium?.name || '—'}</p>
                        </div>
                        <div className="space-y-2">
                            <p><span className="font-semibold text-muted-foreground text-xs uppercase">Status</span><br />
                                <Badge variant="outline" className={`text-[10px] mt-1 ${statusColors[selected.status] ?? ''}`}>{selected.status}</Badge>
                            </p>
                            <p><span className="font-semibold text-muted-foreground text-xs uppercase">Reported</span><br />{formatDateTime(selected.reportedAt || selected.createdAt)}</p>
                            {selected.resolutionNotes && (
                                <p><span className="font-semibold text-muted-foreground text-xs uppercase">Resolution Notes</span><br />{selected.resolutionNotes}</p>
                            )}
                            {selected.fixCost != null && (
                                <p><span className="font-semibold text-muted-foreground text-xs uppercase">Fix Cost</span><br /><span className="text-green-700 font-bold">${Number(selected.fixCost).toFixed(2)}</span></p>
                            )}
                        </div>
                    </CardContent>
                </Card>
            )}

            {/* Handover Form View Modal */}
            {formModal && (
                <HandoverFormModal
                    open={formModal.open}
                    onClose={() => setFormModal(null)}
                    mode="view"
                    fleetId={formModal.fleetId}
                />
            )}
        </div>
    );
}
