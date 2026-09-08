import { useState, useEffect, useCallback } from 'react';
import { poolBookingRequestsApi, stadiumsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw, Edit2, Ban, AlertTriangle } from 'lucide-react';
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
import { toast } from 'sonner';

interface Booking {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    stadiumId: string;
    stadium: { id: string; name: string; code: string };
    fleetId: string;
    fleet: { id: string; carNumber: string; carType: string };
    faUser: { id: string; name: string };
    bookingType: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    purpose?: string;
    status: string;
    reviewComment?: string;
    reviewedBy?: { id: string; name: string };
    reviewedAt?: string;
    createdAt: string;
}

interface Stadium {
    id: string;
    name: string;
    code: string;
}

interface AvailableCart {
    id: string;
    carNumber: string;
    carType: string;
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    Pending: 'secondary',
    Approved: 'default',
    Rejected: 'destructive',
    Cancelled: 'outline',
};

export function BookingsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [stadiumFilter, setStadiumFilter] = useState('');

    const [selected, setSelected] = useState<Booking | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
    const [reviewComment, setReviewComment] = useState('');
    const [conflict, setConflict] = useState<Booking | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ startDate: '', endDate: '', startTime: '', endTime: '', fleetId: '' });
    const [editCarts, setEditCarts] = useState<AvailableCart[]>([]);
    const [editCartsLoading, setEditCartsLoading] = useState(false);

    const [hoursOpen, setHoursOpen] = useState(false);
    const [hoursStadiumId, setHoursStadiumId] = useState('');
    const [hoursForm, setHoursForm] = useState<{ poolBookingStartTime: string; poolBookingEndTime: string }>({
        poolBookingStartTime: '',
        poolBookingEndTime: '',
    });
    const [hoursLoading, setHoursLoading] = useState(false);

    const loadBookings = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (statusFilter) params.status = statusFilter;
            if (stadiumFilter) params.stadiumId = stadiumFilter;
            const res = await poolBookingRequestsApi.getAll(params);
            setBookings(res.data.data || []);
        } catch (err) {
            console.error('Failed to load bookings:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, stadiumFilter]);

    useEffect(() => {
        if (isSuperAdmin) {
            stadiumsApi
                .getAll()
                .then((res) => setStadiums(res.data.data || []))
                .catch((err) => console.error('Failed to load stadiums:', err));
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        loadBookings();
    }, [loadBookings]);

    const openReview = (booking: Booking, action: 'approve' | 'reject') => {
        setSelected(booking);
        setReviewAction(action);
        setReviewComment('');
        setConflict(null);
        setReviewOpen(true);
    };

    const handleReview = async () => {
        if (!selected) return;
        if (reviewAction === 'reject' && !reviewComment.trim()) {
            toast.error('A comment is required when rejecting a booking');
            return;
        }
        setActionLoading(true);
        setConflict(null);
        try {
            if (reviewAction === 'approve') {
                await poolBookingRequestsApi.approve(selected.id, reviewComment || undefined);
            } else {
                await poolBookingRequestsApi.reject(selected.id, reviewComment);
            }
            setReviewOpen(false);
            toast.success(reviewAction === 'approve' ? 'Booking approved' : 'Booking rejected');
            loadBookings();
        } catch (err: any) {
            if (err.response?.status === 409) {
                setConflict(err.response.data.conflict);
                toast.error('This cart is already booked for an overlapping time');
            } else {
                toast.error(err.response?.data?.error || 'Failed to process booking');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const openEdit = (booking: Booking) => {
        setSelected(booking);
        setEditForm({
            startDate: booking.startDate,
            endDate: booking.endDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            fleetId: booking.fleetId,
        });
        setEditOpen(true);
    };

    useEffect(() => {
        if (!editOpen || !selected) return;
        const { startDate, endDate, startTime, endTime } = editForm;
        if (!startDate || !endDate || !startTime || !endTime || endTime <= startTime) {
            setEditCarts([]);
            return;
        }
        setEditCartsLoading(true);
        poolBookingRequestsApi
            .getAvailableCarts(selected.stadiumId, { startDate, endDate, startTime, endTime, excludeBookingId: selected.id })
            .then((res) => setEditCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setEditCartsLoading(false));
    }, [editOpen, selected, editForm.startDate, editForm.endDate, editForm.startTime, editForm.endTime]);

    const handleSaveEdit = async () => {
        if (!selected) return;
        if (!editForm.fleetId) {
            toast.error('Please select an available cart before saving');
            return;
        }
        setActionLoading(true);
        try {
            await poolBookingRequestsApi.amend(selected.id, editForm);
            setEditOpen(false);
            toast.success('Booking updated');
            loadBookings();
        } catch (err: any) {
            if (err.response?.status === 409) {
                toast.error('This cart is already booked for an overlapping time — pick another cart or adjust the schedule');
            } else {
                toast.error(err.response?.data?.error || 'Failed to update booking');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async (booking: Booking) => {
        setActionLoading(true);
        try {
            await poolBookingRequestsApi.amend(booking.id, { status: 'Cancelled' });
            toast.success('Booking cancelled');
            loadBookings();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to cancel booking');
        } finally {
            setActionLoading(false);
        }
    };

    const openHours = async () => {
        const targetStadiumId = isAdmin ? user?.stadiumId || '' : hoursStadiumId;
        if (!targetStadiumId) {
            setHoursOpen(true);
            return;
        }
        setHoursStadiumId(targetStadiumId);
        setHoursLoading(true);
        setHoursOpen(true);
        try {
            const res = await stadiumsApi.getPoolBookingHours(targetStadiumId);
            setHoursForm({
                poolBookingStartTime: res.data.poolBookingStartTime || '',
                poolBookingEndTime: res.data.poolBookingEndTime || '',
            });
        } catch (err) {
            console.error('Failed to load operating hours:', err);
        } finally {
            setHoursLoading(false);
        }
    };

    const handleLoadHoursForStadium = async (stadiumId: string) => {
        setHoursStadiumId(stadiumId);
        setHoursLoading(true);
        try {
            const res = await stadiumsApi.getPoolBookingHours(stadiumId);
            setHoursForm({
                poolBookingStartTime: res.data.poolBookingStartTime || '',
                poolBookingEndTime: res.data.poolBookingEndTime || '',
            });
        } catch (err) {
            console.error('Failed to load operating hours:', err);
        } finally {
            setHoursLoading(false);
        }
    };

    const handleSaveHours = async () => {
        if (!hoursStadiumId) return;
        setHoursLoading(true);
        try {
            await stadiumsApi.updatePoolBookingHours(hoursStadiumId, {
                poolBookingStartTime: hoursForm.poolBookingStartTime || null,
                poolBookingEndTime: hoursForm.poolBookingEndTime || null,
            });
            toast.success('Operating hours saved');
            setHoursOpen(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save operating hours');
        } finally {
            setHoursLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Bookings</h1>
                    <p className="text-muted-foreground mt-1">Review and manage pool cart booking requests</p>
                </div>
                <div className="flex gap-2">
                    {canManage && (
                        <Button variant="outline" size="sm" onClick={openHours}>
                            Operating Hours
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={loadBookings}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                </div>
            </div>

            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Venue</Label>
                                <Select value={stadiumFilter || '__all__'} onValueChange={(v) => setStadiumFilter(v === '__all__' ? '' : v)}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="All venues" />
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

            <Card>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No bookings found</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Requester</TableHead>
                                    <TableHead>Venue / Cart</TableHead>
                                    <TableHead>FA</TableHead>
                                    <TableHead>Schedule</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bookings.map((b) => (
                                    <TableRow key={b.id}>
                                        <TableCell>
                                            <p className="font-medium">{b.requesterName}</p>
                                            <p className="text-sm text-muted-foreground">{b.requesterEmail}</p>
                                        </TableCell>
                                        <TableCell>
                                            <p>{b.stadium?.name}</p>
                                            <p className="text-sm text-muted-foreground">{b.fleet?.carNumber} ({b.fleet?.carType})</p>
                                        </TableCell>
                                        <TableCell>{b.faUser?.name}</TableCell>
                                        <TableCell>
                                            <p className="text-sm">{b.startDate}{b.endDate !== b.startDate ? ` – ${b.endDate}` : ''}</p>
                                            <p className="text-sm text-muted-foreground">{b.startTime} – {b.endTime}</p>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariants[b.status] || 'outline'}>{b.status}</Badge>
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {b.status === 'Pending' && canManage && (
                                                    <>
                                                        <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700" onClick={() => openReview(b, 'approve')}>
                                                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                                                        </Button>
                                                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => openReview(b, 'reject')}>
                                                            <XCircle className="w-4 h-4 mr-1" /> Reject
                                                        </Button>
                                                    </>
                                                )}
                                                {(b.status === 'Pending' || b.status === 'Approved') && canManage && (
                                                    <>
                                                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)} title="Edit">
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleCancel(b)} title="Cancel" disabled={actionLoading}>
                                                            <Ban className="w-4 h-4" />
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
                </CardContent>
            </Card>

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{reviewAction === 'approve' ? 'Approve Booking' : 'Reject Booking'}</DialogTitle>
                        <DialogDescription>
                            {selected && (
                                <span>
                                    Booking from <strong>{selected.requesterName}</strong> for <strong>{selected.fleet?.carNumber}</strong> at{' '}
                                    <strong>{selected.stadium?.name}</strong>
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {conflict && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm space-y-1">
                                <div className="flex items-center gap-2 text-amber-800 font-medium">
                                    <AlertTriangle className="w-4 h-4" /> Conflicting approved booking
                                </div>
                                <p>
                                    <strong>{conflict.requesterName}</strong> already has this cart approved for{' '}
                                    {conflict.startDate}{conflict.endDate !== conflict.startDate ? ` – ${conflict.endDate}` : ''}, {conflict.startTime}–{conflict.endTime}.
                                </p>
                                <p className="text-amber-700">Edit or cancel that booking first, then retry.</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Comment {reviewAction === 'reject' ? '(required)' : '(optional)'}</Label>
                            <Textarea
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder={reviewAction === 'approve' ? 'Any notes for the requester...' : 'Reason for rejection...'}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleReview}
                            disabled={actionLoading}
                            className={reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {reviewAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Booking</DialogTitle>
                        <DialogDescription>Adjust the schedule or reassign the cart to resolve a conflict.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Start Time</Label>
                                <Input type="time" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Time</Label>
                                <Input type="time" value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value, fleetId: '' })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Cart</Label>
                            <Select value={editForm.fleetId} onValueChange={(v) => setEditForm({ ...editForm, fleetId: v })} disabled={editCartsLoading}>
                                <SelectTrigger>
                                    <SelectValue placeholder={editCartsLoading ? 'Checking availability...' : 'Select a cart'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {editCarts.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.carNumber} — {c.carType}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={actionLoading || !editForm.fleetId}>
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Operating Hours Dialog */}
            <Dialog open={hoursOpen} onOpenChange={setHoursOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Pool Booking Operating Hours</DialogTitle>
                        <DialogDescription>
                            Requests outside this daily window will be rejected by the form. Leave blank for no restriction.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Venue</Label>
                                <Select value={hoursStadiumId} onValueChange={handleLoadHoursForStadium}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select venue" />
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
                        )}
                        {hoursStadiumId && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Time</Label>
                                    <Input
                                        type="time"
                                        value={hoursForm.poolBookingStartTime}
                                        onChange={(e) => setHoursForm({ ...hoursForm, poolBookingStartTime: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Time</Label>
                                    <Input
                                        type="time"
                                        value={hoursForm.poolBookingEndTime}
                                        onChange={(e) => setHoursForm({ ...hoursForm, poolBookingEndTime: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHoursOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={handleSaveHours} disabled={hoursLoading || !hoursStadiumId}>
                            {hoursLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
