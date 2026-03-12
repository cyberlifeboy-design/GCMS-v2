import { useState, useEffect } from 'react';
import { requestsApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Eye, RefreshCw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

interface CarRequest {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    stadiumId: string;
    stadium: { id: string; name: string };
    departmentId: string;
    department: { id: string; name: string };
    cargoCount: number;
    fourSeaterCount: number;
    sixSeaterCount: number;
    accessibilityCount: number;
    notes?: string;
    status: string;
    reviewNotes?: string;
    reviewedBy?: { id: string; name: string };
    reviewedAt?: string;
    createdAt: string;
    requestToken: string;
}

interface Stadium {
    id: string;
    name: string;
}

export function RequestsManagementPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<CarRequest[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(10);

    const [statusFilter, setStatusFilter] = useState<string>('');
    const [stadiumFilter, setStadiumFilter] = useState<string>('');
    const [stadiums, setStadiums] = useState<Stadium[]>([]);

    const [selectedRequest, setSelectedRequest] = useState<CarRequest | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');

    useEffect(() => {
        const loadStadiums = async () => {
            try {
                const res = await stadiumsApi.getAll();
                setStadiums(res.data.data || []);
            } catch (err) {
                console.error('Failed to load stadiums:', err);
            }
        };
        loadStadiums();
    }, []);

    useEffect(() => {
        loadRequests();
    }, [page, statusFilter, stadiumFilter]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const params: any = { page, limit };
            if (statusFilter) params.status = statusFilter;
            if (stadiumFilter) params.stadiumId = stadiumFilter;

            const res = await requestsApi.getAll(params);
            setRequests(res.data.data || []);
            setTotal(res.data.total || 0);
        } catch (err) {
            console.error('Failed to load requests:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleReview = async () => {
        if (!selectedRequest) return;

        setActionLoading(true);
        try {
            if (reviewAction === 'approve') {
                await requestsApi.approve(selectedRequest.id, reviewNotes || undefined);
            } else {
                await requestsApi.reject(selectedRequest.id, reviewNotes || undefined);
            }

            setReviewDialogOpen(false);
            setReviewNotes('');
            loadRequests();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to process request');
        } finally {
            setActionLoading(false);
        }
    };

    const openReviewDialog = (request: CarRequest, action: 'approve' | 'reject') => {
        setSelectedRequest(request);
        setReviewAction(action);
        setReviewNotes('');
        setReviewDialogOpen(true);
    };

    const openDetailsDialog = (request: CarRequest) => {
        setSelectedRequest(request);
        setDetailsOpen(true);
    };

    const formatDate = (dateStr: string) => {
        return new Date(dateStr).toLocaleString();
    };

    const getStatusBadge = (status: string) => {
        const variants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
            Pending: 'secondary',
            Approved: 'default',
            Rejected: 'destructive',
        };
        return <Badge variant={variants[status] || 'outline'}>{status}</Badge>;
    };

    const totalPages = Math.ceil(total / limit);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Car Requests</h1>
                    <p className="text-muted-foreground mt-1">
                        Review and manage car requests from department leads
                    </p>
                </div>
                <Button variant="outline" size="sm" onClick={loadRequests}>
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Refresh
                </Button>
            </div>

            {/* Filters */}
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={statusFilter || '__all__'} onValueChange={v => setStatusFilter(v === '__all__' ? '' : v)}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Stadium</Label>
                                <Select value={stadiumFilter || '__all__'} onValueChange={v => setStadiumFilter(v === '__all__' ? '' : v)}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="All stadiums" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All</SelectItem>
                                        {stadiums.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Requests Table */}
            <Card>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : requests.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">
                            No car requests found
                        </div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Requester</TableHead>
                                    <TableHead>Stadium / Department</TableHead>
                                    <TableHead>Carts</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead>Submitted</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {requests.map((req) => (
                                    <TableRow key={req.id}>
                                        <TableCell>
                                            <div>
                                                <p className="font-medium">{req.requesterName}</p>
                                                <p className="text-sm text-muted-foreground">{req.requesterEmail}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div>
                                                <p>{req.stadium?.name}</p>
                                                <p className="text-sm text-muted-foreground">{req.department?.name}</p>
                                            </div>
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex gap-2 flex-wrap">
                                                {req.cargoCount > 0 && <span className="text-sm">Cargo: {req.cargoCount}</span>}
                                                {req.fourSeaterCount > 0 && <span className="text-sm">4S: {req.fourSeaterCount}</span>}
                                                {req.sixSeaterCount > 0 && <span className="text-sm">6S: {req.sixSeaterCount}</span>}
                                                {req.accessibilityCount > 0 && <span className="text-sm">Acc: {req.accessibilityCount}</span>}
                                            </div>
                                        </TableCell>
                                        <TableCell>{getStatusBadge(req.status)}</TableCell>
                                        <TableCell>
                                            <div className="text-sm">
                                                {formatDate(req.createdAt)}
                                            </div>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openDetailsDialog(req)}
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                {req.status === 'Pending' && (
                                                    <>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-green-600 hover:text-green-700"
                                                            onClick={() => openReviewDialog(req, 'approve')}
                                                        >
                                                            <CheckCircle className="w-4 h-4 mr-1" />
                                                            Approve
                                                        </Button>
                                                        <Button
                                                            variant="outline"
                                                            size="sm"
                                                            className="text-red-600 hover:text-red-700"
                                                            onClick={() => openReviewDialog(req, 'reject')}
                                                        >
                                                            <XCircle className="w-4 h-4 mr-1" />
                                                            Reject
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex justify-center gap-2 mt-4">
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === 1}
                                onClick={() => setPage(page - 1)}
                            >
                                Previous
                            </Button>
                            <span className="py-2 px-4 text-sm">
                                Page {page} of {totalPages}
                            </span>
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={page === totalPages}
                                onClick={() => setPage(page + 1)}
                            >
                                Next
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Details Dialog */}
            <Dialog open={detailsOpen} onOpenChange={setDetailsOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Request Details</DialogTitle>
                    </DialogHeader>
                    {selectedRequest && (
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <p className="text-sm text-muted-foreground">Requester</p>
                                    <p className="font-medium">{selectedRequest.requesterName}</p>
                                    <p className="text-sm">{selectedRequest.requesterEmail}</p>
                                    {selectedRequest.requesterPhone && (
                                        <p className="text-sm text-muted-foreground">{selectedRequest.requesterPhone}</p>
                                    )}
                                </div>
                                <div>
                                    <p className="text-sm text-muted-foreground">Location</p>
                                    <p className="font-medium">{selectedRequest.stadium?.name}</p>
                                    <p className="text-sm">{selectedRequest.department?.name}</p>
                                </div>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground mb-2">Carts Requested</p>
                                <div className="flex gap-4">
                                    {selectedRequest.cargoCount > 0 && <span>Cargo: {selectedRequest.cargoCount}</span>}
                                    {selectedRequest.fourSeaterCount > 0 && <span>4-Seater: {selectedRequest.fourSeaterCount}</span>}
                                    {selectedRequest.sixSeaterCount > 0 && <span>6-Seater: {selectedRequest.sixSeaterCount}</span>}
                                    {selectedRequest.accessibilityCount > 0 && <span>Accessibility: {selectedRequest.accessibilityCount}</span>}
                                </div>
                            </div>
                            {selectedRequest.notes && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Notes</p>
                                    <p>{selectedRequest.notes}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm text-muted-foreground">Status</p>
                                {getStatusBadge(selectedRequest.status)}
                            </div>
                            {selectedRequest.reviewedBy && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Reviewed By</p>
                                    <p>{selectedRequest.reviewedBy.name}</p>
                                    {selectedRequest.reviewedAt && (
                                        <p className="text-sm text-muted-foreground">{formatDate(selectedRequest.reviewedAt)}</p>
                                    )}
                                </div>
                            )}
                            {selectedRequest.reviewNotes && (
                                <div>
                                    <p className="text-sm text-muted-foreground">Review Notes</p>
                                    <p>{selectedRequest.reviewNotes}</p>
                                </div>
                            )}
                            <div>
                                <p className="text-sm text-muted-foreground">Submitted</p>
                                <p>{formatDate(selectedRequest.createdAt)}</p>
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDetailsOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Review Dialog */}
            <Dialog open={reviewDialogOpen} onOpenChange={setReviewDialogOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>
                            {reviewAction === 'approve' ? 'Approve Request' : 'Reject Request'}
                        </DialogTitle>
                        <DialogDescription>
                            {selectedRequest && (
                                <span>
                                    Request from <strong>{selectedRequest.requesterName}</strong> for{' '}
                                    <strong>{selectedRequest.department?.name}</strong> at{' '}
                                    <strong>{selectedRequest.stadium?.name}</strong>
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Review Notes (Optional)</Label>
                            <Textarea
                                value={reviewNotes}
                                onChange={(e) => setReviewNotes(e.target.value)}
                                placeholder={reviewAction === 'approve' ? 'Any additional notes for the requester...' : 'Reason for rejection...'}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleReview}
                            disabled={actionLoading}
                            className={reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                            {actionLoading ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            ) : reviewAction === 'approve' ? (
                                <CheckCircle className="w-4 h-4 mr-2" />
                            ) : (
                                <XCircle className="w-4 h-4 mr-2" />
                            )}
                            {reviewAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}