import { useState, useEffect, useCallback } from 'react';
import { incidentsApi, usersApi, warningsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Download, ShieldAlert, Plus, FileWarning, Send, Ticket } from 'lucide-react';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/dateUtils';
import { ReportIncidentModal } from '@/components/incidents/ReportIncidentModal';
import { IncidentReportFormModal } from '@/components/incidents/IncidentReportFormModal';
import { TICKET_CATALOG, TICKET_LEVEL_LABELS, type TicketViolation } from '@/lib/ticketCatalog';

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
    const [reportFormOpen, setReportFormOpen] = useState(false);
    const [reportFormIncidentId, setReportFormIncidentId] = useState<string | null>(null);

    // issue-ticket state
    const [issueOn, setIssueOn] = useState(false);
    const [wLevel, setWLevel] = useState<1 | 2 | 3>(1);
    const [wViolation, setWViolation] = useState<TicketViolation | null>(null);
    const [wReason, setWReason] = useState('');
    const [issuing, setIssuing] = useState(false);

    // escalate state
    const [escalContracts, setEscalContracts] = useState(false);
    const [escalMaintenance, setEscalMaintenance] = useState(false);
    const [escalating, setEscalating] = useState(false);

    // standalone "Issue a Ticket" dialog (top-level — not tied to an existing incident)
    const [ticketDialogOpen, setTicketDialogOpen] = useState(false);
    const [ticketUsers, setTicketUsers] = useState<Array<{ id: string; name: string; email: string; role: string }>>([]);
    const [ticketUserId, setTicketUserId] = useState('');
    const [ticketLevel, setTicketLevel] = useState<1 | 2 | 3>(1);
    const [ticketViolation, setTicketViolation] = useState<TicketViolation | null>(null);
    const [ticketReason, setTicketReason] = useState('');
    const [ticketIssuing, setTicketIssuing] = useState(false);

    const openTicketDialog = async () => {
        setTicketDialogOpen(true);
        setTicketUserId(''); setTicketLevel(1); setTicketViolation(null); setTicketReason('');
        try {
            const res = await usersApi.getAll({ isActive: true });
            setTicketUsers(res.data.data || []);
        } catch {
            toast.error('Failed to load users');
        }
    };

    const submitStandaloneTicket = async () => {
        if (!ticketUserId) { toast.error('Select a user'); return; }
        const reason = [ticketViolation?.text, ticketReason.trim()].filter(Boolean).join(' — ');
        if (!reason) { toast.error('Pick a violation or enter a reason'); return; }
        setTicketIssuing(true);
        try {
            const res = await warningsApi.issue({ userId: ticketUserId, level: ticketLevel, reason });
            toast.success(res.data.message || 'Ticket issued');
            setTicketDialogOpen(false);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to issue ticket');
        } finally {
            setTicketIssuing(false);
        }
    };

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
            const d = res.data.data;
            setDetail(d);
            setIssueOn(false);
            setWReason('');
            setWViolation(null);
            setWLevel(recommendLevel(d.warnings ?? []) as 1 | 2 | 3);
            setEscalContracts(!!d.escalatedToContracts);
            setEscalMaintenance(!!d.escalatedToMaintenance);
        } catch {
            toast.error('Failed to open incident');
        }
    };

    const escalate = async () => {
        if (!detail) return;
        if (!escalContracts && !escalMaintenance) { toast.error('Pick at least one team to escalate to'); return; }
        setEscalating(true);
        try {
            await incidentsApi.escalate(detail.id, { contracts: escalContracts, maintenance: escalMaintenance });
            toast.success('Escalated for follow-up');
            await openDetail(detail.id);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to escalate');
        } finally {
            setEscalating(false);
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

    const issueTicket = async () => {
        if (!detail) return;
        const reason = [wViolation?.text, wReason.trim()].filter(Boolean).join(' — ');
        if (!reason) { toast.error('Pick a violation or enter a reason'); return; }
        setIssuing(true);
        try {
            const res = await incidentsApi.issueWarning(detail.id, { level: wLevel, reason });
            toast.success(res.data.message || 'Ticket issued');
            setIssueOn(false);
            setWReason('');
            setWViolation(null);
            await openDetail(detail.id);
            load();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to issue ticket');
        } finally {
            setIssuing(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between flex-wrap gap-3">
                <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldAlert className="w-7 h-7" /> Incidents</h1>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setReportOpen(true)}><Plus className="w-4 h-4 mr-2" />Report incident</Button>
                    <Button className="bg-red-900 hover:bg-red-800 text-white" onClick={() => { setReportFormIncidentId(null); setReportFormOpen(true); }}>
                        <FileWarning className="w-4 h-4 mr-2" />Create Incident Report
                    </Button>
                    <Button variant="outline" className="border-amber-300 text-amber-800 hover:bg-amber-50" onClick={openTicketDialog}>
                        <Ticket className="w-4 h-4 mr-2" />Issue a Ticket
                    </Button>
                </div>
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

                                {/* Escalate to Contracts / Maintenance */}
                                <div className="rounded border p-3 space-y-2">
                                    <span className="text-sm font-medium">Escalate for follow-up</span>
                                    <div className="flex flex-wrap items-center gap-4">
                                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                            <input type="checkbox" checked={escalContracts} onChange={e => setEscalContracts(e.target.checked)} />
                                            Contracts team
                                        </label>
                                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                                            <input type="checkbox" checked={escalMaintenance} onChange={e => setEscalMaintenance(e.target.checked)} />
                                            Maintenance team
                                        </label>
                                        <Button size="sm" variant="outline" onClick={escalate} disabled={escalating}>
                                            <Send className="w-3 h-3 mr-1" />{escalating ? 'Escalating…' : 'Escalate'}
                                        </Button>
                                    </div>
                                    {(detail.escalatedToContracts || detail.escalatedToMaintenance) && (
                                        <p className="text-[11px] text-muted-foreground">
                                            Already escalated to: {[detail.escalatedToContracts && 'Contracts', detail.escalatedToMaintenance && 'Maintenance'].filter(Boolean).join(', ')}
                                        </p>
                                    )}
                                </div>

                                {/* Issue a Ticket — warning catalog from the 3-level violation table */}
                                <div className="rounded border p-3 space-y-2">
                                    <label className="flex items-center gap-2 text-sm font-medium">
                                        <input type="checkbox" checked={issueOn} onChange={e => setIssueOn(e.target.checked)} />
                                        Issue a Ticket
                                    </label>
                                    {issueOn && (
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Label className="text-xs">Level</Label>
                                                <Select value={String(wLevel)} onValueChange={v => { setWLevel(parseInt(v) as 1 | 2 | 3); setWViolation(null); }}>
                                                    <SelectTrigger className="w-64 h-8"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        {([1, 2, 3] as const).map(l => (
                                                            <SelectItem key={l} value={String(l)}>{TICKET_LEVEL_LABELS[l]}</SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                                <span className="text-xs text-muted-foreground">
                                                    Recommended: Level {recommendLevel(detail.warnings ?? [])}
                                                </span>
                                            </div>
                                            {wLevel === 3 && (
                                                <div className="text-xs text-red-600 font-medium">Level 3 will block this user from the system.</div>
                                            )}
                                            <Select value={wViolation?.code ?? ''} onValueChange={code => setWViolation(TICKET_CATALOG[wLevel].find(v => v.code === code) ?? null)}>
                                                <SelectTrigger className="h-8"><SelectValue placeholder="Select the violation…" /></SelectTrigger>
                                                <SelectContent>
                                                    {TICKET_CATALOG[wLevel].map(v => (
                                                        <SelectItem key={v.code} value={v.code}>{v.text}</SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                            <Textarea rows={2} placeholder="Additional notes (optional)" value={wReason} onChange={e => setWReason(e.target.value)} />
                                            <Button size="sm" onClick={issueTicket} disabled={issuing}>{issuing ? 'Issuing…' : 'Issue Ticket'}</Button>
                                        </div>
                                    )}
                                </div>
                            </div>
                            <DialogFooter>
                                <Button variant="outline" onClick={() => { setReportFormIncidentId(detail.id); setReportFormOpen(true); }}>
                                    <FileWarning className="w-4 h-4 mr-2" />Open Report Form
                                </Button>
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

            <IncidentReportFormModal
                open={reportFormOpen}
                onClose={() => setReportFormOpen(false)}
                incidentId={reportFormIncidentId}
                onSaved={() => { load(); if (detail) openDetail(detail.id); }}
            />

            {/* Standalone Issue-a-Ticket dialog — issue a 3-level ticket against any user
                without first having to open a specific incident. */}
            <Dialog open={ticketDialogOpen} onOpenChange={setTicketDialogOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Ticket className="w-5 h-5" /> Issue a Ticket</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label>User</Label>
                            <Select value={ticketUserId} onValueChange={setTicketUserId}>
                                <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                                <SelectContent>
                                    {ticketUsers.map(u => (
                                        <SelectItem key={u.id} value={u.id}>{u.name} ({u.role}) — {u.email}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Level</Label>
                            <Select value={String(ticketLevel)} onValueChange={v => { setTicketLevel(Number(v) as 1 | 2 | 3); setTicketViolation(null); }}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {[1, 2, 3].map(l => (
                                        <SelectItem key={l} value={String(l)}>{TICKET_LEVEL_LABELS[l as 1 | 2 | 3]}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Violation</Label>
                            <Select value={ticketViolation?.code ?? ''} onValueChange={code => setTicketViolation(TICKET_CATALOG[ticketLevel].find(v => v.code === code) ?? null)}>
                                <SelectTrigger><SelectValue placeholder="Select a violation (optional)" /></SelectTrigger>
                                <SelectContent>
                                    {TICKET_CATALOG[ticketLevel].map(v => (
                                        <SelectItem key={v.code} value={v.code}>{v.text}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1">
                            <Label>Reason / Notes</Label>
                            <Textarea rows={3} placeholder="Additional notes (required if no violation selected)" value={ticketReason} onChange={e => setTicketReason(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setTicketDialogOpen(false)}>Cancel</Button>
                        <Button onClick={submitStandaloneTicket} disabled={ticketIssuing}>
                            {ticketIssuing && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Issue Ticket
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
