import { useState, useEffect } from 'react';
import { requestsApi, stadiumsApi, departmentsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Loader2, CheckCircle, XCircle, Eye, RefreshCw, Edit2, UserPlus, Link2, Copy } from 'lucide-react';
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
    stadium: { id: string; name: string; code?: string };
    departmentId: string;
    department: { id: string; name: string; code?: string };
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
    code: string;
}

interface Department {
    id: string;
    name: string;
    code?: string;
    stadiumId: string;
}

export function RequestsManagementPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [loading, setLoading] = useState(true);
    const [requests, setRequests] = useState<CarRequest[]>([]);
    const [total, setTotal] = useState(0);
    const [page, setPage] = useState(1);
    const [limit] = useState(10);

    const [statusFilter, setStatusFilter] = useState<string>('');
    const [stadiumFilter, setStadiumFilter] = useState<string>('');
    const [departmentFilter, setDepartmentFilter] = useState<string>('');
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);

    const [selectedRequest, setSelectedRequest] = useState<CarRequest | null>(null);
    const [reviewNotes, setReviewNotes] = useState('');
    const [actionLoading, setActionLoading] = useState(false);
    const [detailsOpen, setDetailsOpen] = useState(false);
    const [reviewDialogOpen, setReviewDialogOpen] = useState(false);
    const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');

    // Edit quantities dialog state
    const [editQuantitiesOpen, setEditQuantitiesOpen] = useState(false);
    const [editQuantities, setEditQuantities] = useState({
        cargoCount: 0,
        fourSeaterCount: 0,
        sixSeaterCount: 0,
        accessibilityCount: 0,
    });

    // Create user from request dialog state
    const [createUserOpen, setCreateUserOpen] = useState(false);
    const [createUserLoading, setCreateUserLoading] = useState(false);
    const [createUserPassword, setCreateUserPassword] = useState('');
    const [createUserRole, setCreateUserRole] = useState<'FA' | 'Admin' | 'Observer'>('FA');

    // Link generator state
    const [linkGeneratorOpen, setLinkGeneratorOpen] = useState(false);
    const [linkStadiumId, setLinkStadiumId] = useState<string>('');
    const [linkDepartmentId, setLinkDepartmentId] = useState<string>('');
    const [generatedLink, setGeneratedLink] = useState<string>('');
    const [emailRecipient, setEmailRecipient] = useState('');

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
    }, [page, statusFilter, stadiumFilter, departmentFilter]);

    useEffect(() => {
        const loadDepartments = async () => {
            if (!stadiumFilter && !isSuperAdmin) {
                // For Admin, load departments for their stadium
                if (user?.stadiumId) {
                    try {
                        const res = await departmentsApi.getAll({ stadiumId: user.stadiumId });
                        setDepartments(res.data || []);
                    } catch (err) {
                        console.error('Failed to load departments:', err);
                    }
                }
            } else if (stadiumFilter) {
                try {
                    const res = await departmentsApi.getAll({ stadiumId: stadiumFilter });
                    setDepartments(res.data || []);
                } catch (err) {
                    console.error('Failed to load departments:', err);
                }
            } else {
                setDepartments([]);
            }
        };
        loadDepartments();
    }, [stadiumFilter, user?.stadiumId, isSuperAdmin]);

    const loadRequests = async () => {
        setLoading(true);
        try {
            const params: any = { page, limit };
            if (statusFilter) params.status = statusFilter;
            if (stadiumFilter) params.stadiumId = stadiumFilter;
            if (departmentFilter) params.departmentId = departmentFilter;

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

    const handleEditQuantities = async () => {
        if (!selectedRequest) return;

        setActionLoading(true);
        try {
            await requestsApi.updateQuantities(selectedRequest.id, editQuantities);
            setEditQuantitiesOpen(false);
            loadRequests();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update quantities');
        } finally {
            setActionLoading(false);
        }
    };

    const handleCreateUser = async () => {
        if (!selectedRequest) return;

        setCreateUserLoading(true);
        try {
            await usersApi.create({
                name: selectedRequest.requesterName,
                email: selectedRequest.requesterEmail,
                phone: selectedRequest.requesterPhone || undefined,
                password: createUserPassword || 'changeme123',
                role: createUserRole,
                stadiumId: selectedRequest.stadiumId,
                departmentId: selectedRequest.departmentId,
            });
            setCreateUserOpen(false);
            setCreateUserPassword('');
            setCreateUserRole('FA');
            alert('User created successfully!');
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to create user');
        } finally {
            setCreateUserLoading(false);
        }
    };

    const handleGenerateLink = () => {
        if (!linkStadiumId) {
            alert('Please select a stadium');
            return;
        }

        const baseUrl = window.location.origin;
        let link = `${baseUrl}/request?stadium=${linkStadiumId}`;
        if (linkDepartmentId) {
            link += `&department=${linkDepartmentId}`;
        }
        setGeneratedLink(link);
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(generatedLink);
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

    const openEditQuantitiesDialog = (request: CarRequest) => {
        setSelectedRequest(request);
        setEditQuantities({
            cargoCount: request.cargoCount,
            fourSeaterCount: request.fourSeaterCount,
            sixSeaterCount: request.sixSeaterCount,
            accessibilityCount: request.accessibilityCount,
        });
        setEditQuantitiesOpen(true);
    };

    const openCreateUserDialog = (request: CarRequest) => {
        setSelectedRequest(request);
        setCreateUserPassword('');
        setCreateUserRole('FA');
        setCreateUserOpen(true);
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
                <div className="flex gap-2">
                    {isSuperAdmin && (
                        <Button variant="outline" size="sm" onClick={() => setLinkGeneratorOpen(true)}>
                            <Link2 className="w-4 h-4 mr-2" />
                            Generate Link
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={loadRequests}>
                        <RefreshCw className="w-4 h-4 mr-2" />
                        Refresh
                    </Button>
                </div>
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
                                <Select value={stadiumFilter || '__all__'} onValueChange={v => { setStadiumFilter(v === '__all__' ? '' : v); setDepartmentFilter(''); }}>
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
                        {(isSuperAdmin || isAdmin) && departments.length > 0 && (
                            <div className="space-y-2">
                                <Label>Department</Label>
                                <Select value={departmentFilter || '__all__'} onValueChange={v => setDepartmentFilter(v === '__all__' ? '' : v)}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="All departments" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All</SelectItem>
                                        {departments.map((d) => (
                                            <SelectItem key={d.id} value={d.id}>
                                                {d.name}
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
                                                <p className="text-sm text-muted-foreground">
                                                    {req.department?.name}
                                                    {req.department?.code && <span className="ml-1 text-xs">({req.department.code})</span>}
                                                </p>
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
                                                    title="View details"
                                                >
                                                    <Eye className="w-4 h-4" />
                                                </Button>
                                                {req.status === 'Pending' && canManage && (
                                                    <>
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={() => openEditQuantitiesDialog(req)}
                                                            title="Edit quantities"
                                                        >
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
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
                                    <p className="text-sm">
                                        {selectedRequest.department?.name}
                                        {selectedRequest.department?.code && (
                                            <span className="ml-1 text-xs text-muted-foreground">({selectedRequest.department.code})</span>
                                        )}
                                    </p>
                                    {selectedRequest.stadium?.code && (
                                        <p className="text-xs text-muted-foreground">Stadium Code: {selectedRequest.stadium.code}</p>
                                    )}
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

                            {/* Create User Button */}
                            {canManage && selectedRequest.status === 'Approved' && (
                                <Button
                                    variant="outline"
                                    className="w-full"
                                    onClick={() => openCreateUserDialog(selectedRequest)}
                                >
                                    <UserPlus className="w-4 h-4 mr-2" />
                                    Create User from Request
                                </Button>
                            )}
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

            {/* Edit Quantities Dialog */}
            <Dialog open={editQuantitiesOpen} onOpenChange={setEditQuantitiesOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Request Quantities</DialogTitle>
                        <DialogDescription>
                            Adjust quantities before approving. Total must be at least 1.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label htmlFor="edit-cargo">Cargo</Label>
                                <Input
                                    id="edit-cargo"
                                    type="number"
                                    min="0"
                                    value={editQuantities.cargoCount}
                                    onChange={(e) => setEditQuantities({ ...editQuantities, cargoCount: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-4seater">4-Seater</Label>
                                <Input
                                    id="edit-4seater"
                                    type="number"
                                    min="0"
                                    value={editQuantities.fourSeaterCount}
                                    onChange={(e) => setEditQuantities({ ...editQuantities, fourSeaterCount: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-6seater">6-Seater</Label>
                                <Input
                                    id="edit-6seater"
                                    type="number"
                                    min="0"
                                    value={editQuantities.sixSeaterCount}
                                    onChange={(e) => setEditQuantities({ ...editQuantities, sixSeaterCount: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="edit-accessibility">Accessibility</Label>
                                <Input
                                    id="edit-accessibility"
                                    type="number"
                                    min="0"
                                    value={editQuantities.accessibilityCount}
                                    onChange={(e) => setEditQuantities({ ...editQuantities, accessibilityCount: parseInt(e.target.value) || 0 })}
                                />
                            </div>
                        </div>
                        <div className="text-sm text-muted-foreground">
                            Total: {editQuantities.cargoCount + editQuantities.fourSeaterCount + editQuantities.sixSeaterCount + editQuantities.accessibilityCount} carts
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditQuantitiesOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleEditQuantities} disabled={actionLoading}>
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Create User Dialog */}
            <Dialog open={createUserOpen} onOpenChange={setCreateUserOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Create User from Request</DialogTitle>
                        <DialogDescription>
                            Create a system user using the requester's details.
                        </DialogDescription>
                    </DialogHeader>
                    {selectedRequest && (
                        <div className="space-y-4">
                            <div className="bg-muted p-3 rounded-md space-y-1">
                                <p className="text-sm"><strong>Name:</strong> {selectedRequest.requesterName}</p>
                                <p className="text-sm"><strong>Email:</strong> {selectedRequest.requesterEmail}</p>
                                {selectedRequest.requesterPhone && (
                                    <p className="text-sm"><strong>Phone:</strong> {selectedRequest.requesterPhone}</p>
                                )}
                                <p className="text-sm"><strong>Stadium:</strong> {selectedRequest.stadium?.name} ({selectedRequest.stadium?.code})</p>
                                <p className="text-sm">
                                    <strong>Department:</strong> {selectedRequest.department?.name}
                                    {selectedRequest.department?.code && ` (${selectedRequest.department.code})`}
                                </p>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="user-role">Role</Label>
                                <Select value={createUserRole} onValueChange={(v) => setCreateUserRole(v as typeof createUserRole)}>
                                    <SelectTrigger>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="FA">FA (Fleet Attendant)</SelectItem>
                                        <SelectItem value="Admin">Admin</SelectItem>
                                        <SelectItem value="Observer">Observer</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="user-password">Password (leave blank for default: changeme123)</Label>
                                <Input
                                    id="user-password"
                                    type="password"
                                    value={createUserPassword}
                                    onChange={(e) => setCreateUserPassword(e.target.value)}
                                    placeholder="changeme123"
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCreateUserOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleCreateUser} disabled={createUserLoading}>
                            {createUserLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Create User
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Link Generator Dialog */}
            <Dialog open={linkGeneratorOpen} onOpenChange={setLinkGeneratorOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Generate Request Link</DialogTitle>
                        <DialogDescription>
                            Create a direct link to the car request form for a specific stadium and optionally a department.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="link-stadium">Stadium *</Label>
                            <Select value={linkStadiumId} onValueChange={(v) => { setLinkStadiumId(v); setLinkDepartmentId(''); setGeneratedLink(''); }}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Select stadium" />
                                </SelectTrigger>
                                <SelectContent>
                                    {stadiums.map((s) => (
                                        <SelectItem key={s.id} value={s.id}>
                                            {s.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        {linkStadiumId && (
                            <div className="space-y-2">
                                <Label htmlFor="link-department">Department (Optional)</Label>
                                <Select value={linkDepartmentId || '__none__'} onValueChange={(v) => { setLinkDepartmentId(v === '__none__' ? '' : v); setGeneratedLink(''); }}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select department (optional)" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">Any Department</SelectItem>
                                        {departments.filter(d => d.stadiumId === linkStadiumId).map((d) => (
                                            <SelectItem key={d.id} value={d.id}>
                                                {d.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <Button onClick={handleGenerateLink} disabled={!linkStadiumId}>
                            Generate Link
                        </Button>
                        {generatedLink && (
                            <div className="space-y-2">
                                <Label>Generated Link</Label>
                                <div className="flex gap-2">
                                    <Input value={generatedLink} readOnly className="flex-1" />
                                    <Button variant="outline" size="icon" onClick={handleCopyLink}>
                                        <Copy className="w-4 h-4" />
                                    </Button>
                                </div>
                                <div className="space-y-2 mt-4">
                                    <Label htmlFor="email-recipient">Send via Email (Optional)</Label>
                                    <div className="flex gap-2">
                                        <Input
                                            id="email-recipient"
                                            type="email"
                                            value={emailRecipient}
                                            onChange={(e) => setEmailRecipient(e.target.value)}
                                            placeholder="recipient@example.com"
                                        />
                                        <Button variant="outline" disabled={!emailRecipient}>
                                            <Copy className="w-4 h-4 mr-2" />
                                            Copy to Email
                                        </Button>
                                    </div>
                                    <p className="text-xs text-muted-foreground">Copy the link and send it via your preferred email client</p>
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setLinkGeneratorOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}