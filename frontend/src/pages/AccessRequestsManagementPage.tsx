import { useEffect, useState } from 'react';
import { accessRequestsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
    Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
    Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/dateUtils';
import { toast } from 'sonner';

interface AccessRequest {
    id: string;
    requestNumber: number;
    name: string;
    email: string;
    phone?: string;
    stadium: { id: string; name: string };
    department: { id: string; name: string; code?: string };
    source: 'sso' | 'invite';
    status: string;
    reviewNotes?: string;
    reviewedBy?: { id: string; name: string };
    reviewedAt?: string;
    createdAt: string;
}

function statusBadgeVariant(status: string): 'default' | 'secondary' | 'destructive' {
    if (status === 'Approved') return 'default';
    if (status === 'Rejected') return 'destructive';
    return 'secondary';
}

export function AccessRequestsManagementPage() {
    const { user } = useAuthStore();
    const canManage = user?.role === 'SuperAdmin' || user?.role === 'Admin';

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<AccessRequest[]>([]);
    const [statusFilter, setStatusFilter] = useState('Pending');
    const [selected, setSelected] = useState<AccessRequest | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [confirmAction, setConfirmAction] = useState<'approve' | 'reject' | null>(null);
    const [approveDepartments, setApproveDepartments] = useState<{ id: string; name: string }[]>([]);
    const [approveDepartmentId, setApproveDepartmentId] = useState('');

    const load = async () => {
        setLoading(true);
        try {
            const res = await accessRequestsApi.getAll({ status: statusFilter || undefined });
            setRequests(res.data?.data || []);
        } catch {
            toast.error('Failed to load access requests');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [statusFilter]);

    useEffect(() => {
        if (confirmAction !== 'approve' || !selected) { setApproveDepartments([]); return; }
        setApproveDepartmentId(selected.department.id);
        accessRequestsApi.getPublicDepartments(selected.stadium.id)
            .then(res => setApproveDepartments(res.data?.data || []))
            .catch(() => setApproveDepartments([]));
    }, [confirmAction, selected]);

    const handleReview = async () => {
        if (!selected || !confirmAction) return;
        setActionLoading(true);
        try {
            if (confirmAction === 'approve') {
                await accessRequestsApi.approve(selected.id, reviewNotes || undefined, approveDepartmentId || undefined);
                toast.success('Request approved — the user can now sign in with their SC/LOC account.');
            } else {
                await accessRequestsApi.reject(selected.id, reviewNotes || undefined);
                toast.success('Request rejected');
            }
            setSelected(null);
            setConfirmAction(null);
            setReviewNotes('');
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Action failed');
        } finally {
            setActionLoading(false);
        }
    };

    return (
        <div className="p-6 space-y-4">
            <div className="flex items-center justify-between">
                <h1 className="text-2xl font-bold">Account Access Requests</h1>
                <div className="flex items-center gap-2">
                    {['Pending', 'Approved', 'Rejected', ''].map(s => (
                        <Button
                            key={s || 'all'}
                            variant={statusFilter === s ? 'default' : 'outline'}
                            size="sm"
                            onClick={() => setStatusFilter(s)}
                        >
                            {s || 'All'}
                        </Button>
                    ))}
                    <Button variant="outline" size="icon" onClick={load}><RefreshCw className="w-4 h-4" /></Button>
                </div>
            </div>

            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="flex justify-center p-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableCell>#</TableCell>
                                    <TableHead>Name</TableHead>
                                    <TableHead>Email</TableHead>
                                    <TableHead>Venue</TableHead>
                                    <TableHead>Department</TableHead>
                                    <TableHead>Source</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    {canManage && <TableHead>Actions</TableHead>}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map(r => (
                                    <TableRow key={r.id}>
                                        <TableCell>{r.requestNumber}</TableCell>
                                        <TableCell>{r.name}</TableCell>
                                        <TableCell>{r.email}</TableCell>
                                        <TableCell>{r.stadium?.name}</TableCell>
                                        <TableCell>{r.department?.name}</TableCell>
                                        <TableCell className="capitalize">{r.source}</TableCell>
                                        <TableCell><Badge variant={statusBadgeVariant(r.status)}>{r.status}</Badge></TableCell>
                                        <TableCell>{formatDate(r.createdAt)}</TableCell>
                                        {canManage && (
                                            <TableCell className="space-x-2">
                                                {r.status === 'Pending' && (
                                                    <>
                                                        <Button size="sm" variant="outline" onClick={() => { setSelected(r); setConfirmAction('approve'); }}>
                                                            <CheckCircle className="w-4 h-4" />
                                                        </Button>
                                                        <Button size="sm" variant="outline" onClick={() => { setSelected(r); setConfirmAction('reject'); }}>
                                                            <XCircle className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))}
                                {requests.length === 0 && (
                                    <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No requests found</TableCell></TableRow>
                                )}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>

            <Dialog open={Boolean(selected && confirmAction)} onOpenChange={(open) => { if (!open) { setSelected(null); setConfirmAction(null); } }}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{confirmAction === 'approve' ? 'Approve' : 'Reject'} request</DialogTitle>
                        <DialogDescription>
                            {selected?.name} — {selected?.department?.name} at {selected?.stadium?.name}
                        </DialogDescription>
                    </DialogHeader>
                    {confirmAction === 'approve' && (
                        <div className="space-y-1.5">
                            <Label>Department</Label>
                            <Select value={approveDepartmentId} onValueChange={setApproveDepartmentId}>
                                <SelectTrigger><SelectValue placeholder="Select a department" /></SelectTrigger>
                                <SelectContent>
                                    {approveDepartments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <Textarea
                        placeholder="Notes (optional)"
                        value={reviewNotes}
                        onChange={e => setReviewNotes(e.target.value)}
                    />
                    <DialogFooter>
                        <Button variant="outline" onClick={() => { setSelected(null); setConfirmAction(null); }}>Cancel</Button>
                        <Button onClick={handleReview} disabled={actionLoading}>
                            {actionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : confirmAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
