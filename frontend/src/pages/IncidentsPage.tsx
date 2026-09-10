import { useState, useEffect, useCallback } from 'react';
import { incidentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Download, ShieldAlert, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/dateUtils';
import { ReportIncidentModal } from '@/components/incidents/ReportIncidentModal';

const STATUS_COLORS: Record<string, string> = {
    Open: 'bg-red-100 text-red-800',
    UnderReview: 'bg-blue-100 text-blue-800',
    Closed: 'bg-green-100 text-green-800',
};

function recommendLevel(warnings: Array<{ level: number; revoked: boolean }>): number {
    const last = warnings.filter(w => !w.revoked).reduce((m, w) => Math.max(m, w.level), 0);
    return Math.min(last + 1, 3) || 1;
}

export function IncidentsPage() {
    const [incidents, setIncidents] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [statusFilter, setStatusFilter] = useState('');
    const [detail, setDetail] = useState<any | null>(null);
    const [reportOpen, setReportOpen] = useState(false);

    // issue-warning state
    const [issueOn, setIssueOn] = useState(false);
    const [wLevel, setWLevel] = useState(1);
    const [wReason, setWReason] = useState('');
    const [issuing, setIssuing] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string | undefined> = {};
            if (statusFilter) params.status = statusFilter;
            const res = await incidentsApi.list(params);
            setIncidents(res.data.data ?? []);
        } catch {
            toast.error('Failed to load incidents');
        } finally {
            setLoading(false);
        }
    }, [statusFilter]);

    useEffect(() => { load(); }, [load]);

    const openDetail = async (id: string) => {
        try {
            const res = await incidentsApi.get(id);
            setDetail(res.data.data);
            setIssueOn(false);
            setWReason('');
            setWLevel(recommendLevel(res.data.data.warnings ?? []));
        } catch {
            toast.error('Failed to open incident');
        }
    };

    const changeStatus = async (status: string) => {
        if (!detail) return;
        try {
            const res = await incidentsApi.setStatus(detail.id, status);
            setDetail(res.data.data);
            load();
        } catch {
            toast.error('Failed to update status');
        }
    };

    const downloadPdf = async (id: string) => {
        try {
            const res = await incidentsApi.downloadPdf(id);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url;
            a.download = `incident_${id.slice(-8)}.pdf`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Failed to download PDF');
        }
    };

    const issueWarning = async () => {
        if (!detail || !wReason.trim()) { toast.error('Reason is required'); return; }
        setIssuing(true);
        try {
            const res = await incidentsApi.issueWarning(detail.id, { level: wLevel, reason: wReason.trim() });
            toast.success(res.data.message || 'Warning issued');
            setIssueOn(false);
            setWReason('');
            await openDetail(detail.id);
            load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to issue warning');
        } finally {
            setIssuing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldAlert className="w-7 h-7" /> Incidents</h1>
                <Button onClick={() => setReportOpen(true)}><Plus className="w-4 h-4 mr-2" />Report incident</Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Filed incidents</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex gap-3 items-end flex-wrap">
                        <div className="space-y-1 min-w-[180px]">
                            <p className="text-xs font-medium text-muted-foreground">Status</p>
                            <Select value={statusFilter || '__all__'} onValueChange={v => setStatusFilter(v === '__all__' ? '' : v)}>
                                <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All</SelectItem>
                                    <SelectItem value="Open">Open</SelectItem>
                                    <SelectItem value="UnderReview">Under review</SelectItem>
                                    <SelectItem value="Closed">Closed</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>

                    {loading ? (
                        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : incidents.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">No incidents.</div>
                    ) : (
                        <div className="overflow-x-auto rounded-md border">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Reference</TableHead>
                                        <TableHead>Subject</TableHead>
                                        <TableHead>Reported by</TableHead>
                                        <TableHead>Venue</TableHead>
                                        <TableHead>Occurred</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Warnings</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {incidents.map(inc => (
                                        <TableRow key={inc.id} className="cursor-pointer" onClick={() => openDetail(inc.id)}>
                                            <TableCell className="font-mono text-xs">{inc.reference}</TableCell>
                                            <TableCell>
                                                <div className="text-sm font-medium">{inc.subjectUser?.name}</div>
                                                <div className="text-xs text-muted-foreground">{inc.subjectUser?.accreditationNumber || ''}</div>
                                            </TableCell>
                                            <TableCell className="text-sm">{inc.reportedBy?.name}</TableCell>
                                            <TableCell className="text-sm">{inc.stadium?.name || '—'}</TableCell>
                                            <TableCell className="text-xs whitespace-nowrap">{formatDateTime(inc.occurredAt)}</TableCell>
                                            <TableCell><Badge className={STATUS_COLORS[inc.status] || ''}>{inc.status}</Badge></TableCell>
                                            <TableCell>{inc.warnings?.length ?? 0}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Detail dialog */}
            <Dialog open={!!detail} onOpenChange={o => !o && setDetail(null)}>
                <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
                    {detail && (
                        <>
                            <DialogHeader>
                                <DialogTitle className="flex items-center gap-2">
                                    <span className="font-mono text-sm">{detail.reference}</span>
                                    <Badge className={STATUS_COLORS[detail.status] || ''}>{detail.status}</Badge>
                                </DialogTitle>
                            </DialogHeader>
                            <div className="space-y-3 text-sm">
                                <div><span className="text-xs text-muted-foreground block">Title</span>{detail.title}</div>
                                <div><span className="text-xs text-muted-foreground block">Description</span>{detail.description}</div>
                                <div className="grid grid-cols-2 gap-3">
                                    <div><span className="text-xs text-muted-foreground block">Subject</span>{detail.subjectUser?.name} {detail.subjectUser?.accreditationNumber ? `(FA ${detail.subjectUser.accreditationNumber})` : ''}</div>
                                    <div><span className="text-xs text-muted-foreground block">Reported by</span>{detail.reportedBy?.name}</div>
                                    <div><span className="text-xs text-muted-foreground block">Occurred</span>{formatDateTime(detail.occurredAt)}</div>
                                    <div><span className="text-xs text-muted-foreground block">Venue / cart</span>{detail.stadium?.name || '—'}{detail.fleet?.carNumber ? ` · ${detail.fleet.carNumber}` : ''}</div>
                                </div>
                                {detail.subjectUser?.isBlocked && (
                                    <div className="rounded bg-red-50 border border-red-200 text-red-800 text-xs p-2">This user is currently blocked.</div>
                                )}

                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-muted-foreground">Status</span>
                                    <Select value={detail.status} onValueChange={changeStatus}>
                                        <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Open">Open</SelectItem>
                                            <SelectItem value="UnderReview">Under review</SelectItem>
                                            <SelectItem value="Closed">Closed</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {/* Warnings on this incident */}
                                <div>
                                    <span className="text-xs font-semibold">Warnings ({detail.warnings?.length ?? 0})</span>
                                    <div className="mt-1 space-y-1">
                                        {(detail.warnings ?? []).map((w: any) => (
                                            <div key={w.id} className={`text-xs rounded border p-2 ${w.revoked ? 'opacity-50' : ''}`}>
                                                <b>{w.reference}</b> · Level {w.level}{w.revoked ? ' (revoked)' : ''} · {formatDateTime(w.issuedAt)}
                                                {w.issuedBy?.name ? ` · ${w.issuedBy.name}` : ''}
                                                <div className="text-muted-foreground">{w.reason}</div>
                                            </div>
                                        ))}
                                        {(detail.warnings ?? []).length === 0 && <div className="text-xs text-muted-foreground">None yet.</div>}
                                    </div>
                                </div>

                                {/* Issue a warning */}
                                <div className="rounded border p-3 space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium">
                                        <input type="checkbox" checked={issueOn} onChange={e => setIssueOn(e.target.checked)} />
                                        Issue a warning
                                    </label>
                                    {issueOn && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2">
                                                <Label className="text-xs">Level</Label>
                                                <Select value={String(wLevel)} onValueChange={v => setWLevel(parseInt(v))}>
                                                    <SelectTrigger className="w-40 h-8"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="1">Level 1 — soft</SelectItem>
                                                        <SelectItem value="2">Level 2</SelectItem>
                                                        <SelectItem value="3">Level 3 — ban</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-xs text-muted-foreground">
                                                    Recommended: Level {recommendLevel(detail.warnings ?? [])}
                                                </span>
                                            </div>
                                            {wLevel === 3 && (
                                                <div className="text-xs text-red-600 font-medium">Level 3 will block this user from the system.</div>
                                            )}
                                            <Textarea rows={2} placeholder="Reason" value={wReason} onChange={e => setWReason(e.target.value)} />
                                            <Button size="sm" onClick={issueWarning} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue warning'}</Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => downloadPdf(detail.id)}>
                                    <Download className="w-4 h-4 mr-2" />Download PDF
                                </Button>
                                <Button variant="outline" onClick={() => setDetail(null)}>Close</Button>
                            </DialogFooter>
                        </>
                    )}
                </DialogContent>
            </Dialog>

            <ReportIncidentModal open={reportOpen} onOpenChange={setReportOpen} onFiled={load} />
        </div>
    );
}
