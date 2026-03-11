import { useState, useEffect } from 'react';
import { handoverApi, fleetApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { LogOut, LogIn, History, Loader2, AlertTriangle } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';
import { Pagination } from '@/components/shared/Pagination';

interface HandoverLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string };
    userId: string;
    user?: { id: string; name: string; email?: string; role?: string };
    action: 'CheckedIn' | 'CheckedOut' | 'IssueReported';
    createdAt: string;
    conditionNotes?: string;
    issueDescription?: string;
}

interface FleetCart {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    assignedUser?: {
        id: string;
        name: string;
        phone?: string;
        email?: string;
        role?: string;
    };
}

const actionColors: Record<string, string> = {
    'CheckedIn': 'bg-blue-500 text-white',
    'CheckedOut': 'bg-green-500 text-white',
    'IssueReported': 'bg-red-500 text-white',
};

const actionLabels: Record<string, string> = {
    'CheckedIn': 'Check-In',
    'CheckedOut': 'Check-Out',
    'IssueReported': 'Issue',
};

export function HandoverPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const canHandover = role === 'FA' || role === 'Admin' || role === 'SuperAdmin';

    const [history, setHistory] = useState<HandoverLog[]>([]);
    const [availableFleet, setAvailableFleet] = useState<FleetCart[]>([]);
    const [dispatchedFleet, setDispatchedFleet] = useState<FleetCart[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('all');

    // Pagination state
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    const [checkinOpen, setCheckinOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [checkinForm, setCheckinForm] = useState({ fleetId: '', conditionNotes: '' });
    const [checkoutForm, setCheckoutForm] = useState<{
        fleetId: string;
        conditionNotes: string;
        hasIssue: boolean;
        issueDescription: string;
        photos: File[];
    }>({
        fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '', photos: []
    });

    // Bulk selection state
    const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
    const [selectedDispatched, setSelectedDispatched] = useState<string[]>([]);

    const loadData = async () => {
        try {
            setLoading(true);
            const params = {
                ...(actionFilter !== 'all' && { action: actionFilter }),
                page,
                limit: pagination.limit
            };
            const [histRes, fleetRes] = await Promise.all([
                handoverApi.getHistory(params),
                fleetApi.getAll(),
            ]);
            setHistory(histRes.data.data || []);
            if (histRes.data.pagination) {
                setPagination(prev => ({ ...prev, ...histRes.data.pagination }));
            }
            const all: FleetCart[] = fleetRes.data.data || [];
            setAvailableFleet(all.filter(v => v.status === 'Available' || v.status === 'Assigned'));
            setDispatchedFleet(all.filter(v => v.status === 'Dispatched'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, [actionFilter, page]);

    const handleCheckin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkinForm.fleetId) { alert('Select a cart'); return; }
        setSubmitting(true);
        try {
            await handoverApi.checkIn({ fleetId: checkinForm.fleetId, conditionNotes: checkinForm.conditionNotes });
            setCheckinOpen(false);
            setCheckinForm({ fleetId: '', conditionNotes: '' });
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Check-in failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkoutForm.fleetId) { alert('Select a cart'); return; }
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('fleetId', checkoutForm.fleetId);
            fd.append('conditionNotes', checkoutForm.conditionNotes);
            fd.append('hasIssue', String(checkoutForm.hasIssue));
            if (checkoutForm.hasIssue && checkoutForm.issueDescription) {
                fd.append('issueDescription', checkoutForm.issueDescription);
            }
            checkoutForm.photos.forEach(p => fd.append('photos', p));

            await handoverApi.checkOut(fd);
            setCheckoutOpen(false);
            setCheckoutForm({ fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] });
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleAvailableSelection = (id: string) => {
        setSelectedAvailable(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleDispatchedSelection = (id: string) => {
        setSelectedDispatched(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleAllAvailable = () => {
        if (selectedAvailable.length === availableFleet.length) setSelectedAvailable([]);
        else setSelectedAvailable(availableFleet.map(v => v.id));
    };

    const toggleAllDispatched = () => {
        if (selectedDispatched.length === dispatchedFleet.length) setSelectedDispatched([]);
        else setSelectedDispatched(dispatchedFleet.map(v => v.id));
    };

    const handleBulkCheckin = async () => {
        if (selectedAvailable.length === 0) return;
        if (!confirm(`Check in ${selectedAvailable.length} selected cart(s)?`)) return;
        setSubmitting(true);
        try {
            await handoverApi.bulkCheckIn({ fleetIds: selectedAvailable });
            setSelectedAvailable([]);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Bulk check-in failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkCheckout = async () => {
        if (selectedDispatched.length === 0) return;
        if (!confirm(`Check out ${selectedDispatched.length} selected cart(s)?`)) return;
        setSubmitting(true);
        try {
            await handoverApi.bulkCheckOut({ fleetIds: selectedDispatched });
            setSelectedDispatched([]);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Bulk check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = history.filter(h => {
        const matchSearch =
            h.fleet?.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
            h.user?.name?.toLowerCase().includes(search.toLowerCase());
        return matchSearch;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Handover Management</h1>
                {canHandover && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => { setCheckinForm({ fleetId: '', conditionNotes: '' }); setCheckinOpen(true); }}>
                            <LogIn className="w-4 h-4 mr-2" />Check In
                        </Button>
                        <Button onClick={() => { setCheckoutForm({ fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] }); setCheckoutOpen(true); }}>
                            <LogOut className="w-4 h-4 mr-2" />Check Out
                        </Button>
                    </div>
                )}
            </div>

            <Tabs defaultValue="history">
                <TabsList>
                    <TabsTrigger value="history"><History className="w-4 h-4 mr-2" />History</TabsTrigger>
                    {canHandover && (
                        <>
                            <TabsTrigger value="available">Available ({availableFleet.length})</TabsTrigger>
                            <TabsTrigger value="dispatched">Dispatched ({dispatchedFleet.length})</TabsTrigger>
                        </>
                    )}
                </TabsList>

                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <div className="flex gap-4">
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Search by cart or user…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(1); }}>
                                    <SelectTrigger className="w-44">
                                        <SelectValue placeholder="All Actions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Actions</SelectItem>
                                        <SelectItem value="CheckedIn">Check-In</SelectItem>
                                        <SelectItem value="CheckedOut">Check-Out</SelectItem>
                                        <SelectItem value="IssueReported">Issue Reported</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>FA Name</TableHead>
                                        <TableHead>Date/Time</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                        </TableCell></TableRow>
                                    ) : filtered.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No handover history</TableCell></TableRow>
                                    ) : filtered.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-mono font-semibold">{log.fleet?.carNumber}</TableCell>
                                            <TableCell>
                                                <Badge className={actionColors[log.action]}>{actionLabels[log.action]}</Badge>
                                            </TableCell>
                                            <TableCell>{log.user?.name}</TableCell>
                                            <TableCell className="text-sm">{new Date(log.createdAt).toLocaleString()}</TableCell>
                                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                                                {log.issueDescription || log.conditionNotes || '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Pagination
                                page={page}
                                totalPages={pagination.totalPages}
                                onPageChange={setPage}
                                total={pagination.total}
                                limit={pagination.limit}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {canHandover && (
                    <>
                        <TabsContent value="available">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-semibold">Available / Assigned Carts</h3>
                                            <p className="text-xs text-muted-foreground">Check out a cart for use (marks as Dispatched)</p>
                                        </div>
                                        {selectedAvailable.length > 0 && (
                                            <Button size="sm" onClick={handleBulkCheckin} disabled={submitting}>
                                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                <LogIn className="w-4 h-4 mr-1" /> Check Out ({selectedAvailable.length})
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12"><Checkbox checked={availableFleet.length > 0 && selectedAvailable.length === availableFleet.length} onCheckedChange={toggleAllAvailable} /></TableHead>
                                                <TableHead>Cart #</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {availableFleet.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No available carts</TableCell></TableRow>
                                            ) : availableFleet.map(v => (
                                                <TableRow key={v.id} className={selectedAvailable.includes(v.id) ? 'bg-blue-50' : ''}>
                                                    <TableCell><Checkbox checked={selectedAvailable.includes(v.id)} onCheckedChange={() => toggleAvailableSelection(v.id)} /></TableCell>
                                                    <TableCell className="font-mono font-semibold">{v.carNumber}</TableCell>
                                                    <TableCell><Badge className={carTypeColors[v.carType] || 'bg-gray-500 text-white'} variant="secondary">{v.carType}</Badge></TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" onClick={() => { setCheckinForm({ fleetId: v.id, conditionNotes: '' }); setCheckinOpen(true); }}><LogIn className="w-4 h-4 mr-1" />Check Out</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="dispatched">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-semibold">Dispatched (In Use) Carts</h3>
                                            <p className="text-xs text-muted-foreground">Return a cart (marks as Available or Maintenance if issue)</p>
                                        </div>
                                        {selectedDispatched.length > 0 && (
                                            <Button size="sm" variant="outline" onClick={handleBulkCheckout} disabled={submitting}>
                                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                <LogOut className="w-4 h-4 mr-1" /> Return ({selectedDispatched.length})
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12"><Checkbox checked={dispatchedFleet.length > 0 && selectedDispatched.length === dispatchedFleet.length} onCheckedChange={toggleAllDispatched} /></TableHead>
                                                <TableHead>Cart #</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Checked Out By</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dispatchedFleet.length === 0 ? (
                                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No dispatched carts</TableCell></TableRow>
                                            ) : dispatchedFleet.map(v => (
                                                <TableRow key={v.id} className={selectedDispatched.includes(v.id) ? 'bg-green-50' : ''}>
                                                    <TableCell><Checkbox checked={selectedDispatched.includes(v.id)} onCheckedChange={() => toggleDispatchedSelection(v.id)} /></TableCell>
                                                    <TableCell className="font-mono font-semibold">{v.carNumber}</TableCell>
                                                    <TableCell><Badge className={carTypeColors[v.carType] || 'bg-gray-500 text-white'} variant="secondary">{v.carType}</Badge></TableCell>
                                                    <TableCell>{v.assignedUser?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" variant="outline" onClick={() => { setCheckoutForm({ fleetId: v.id, conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] }); setCheckoutOpen(true); }}><LogOut className="w-4 h-4 mr-1" />Return</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </>
                )}
            </Tabs>

            {/* Check-In Modal */}
            <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check Out Cart</DialogTitle>
                        <DialogDescription>Select a cart to check out. This marks it as "Dispatched".</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckin} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={checkinForm.fleetId} onValueChange={v => setCheckinForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>
                                    {availableFleet.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Condition Notes</Label>
                            <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={checkinForm.conditionNotes} onChange={e => setCheckinForm(f => ({ ...f, conditionNotes: e.target.value }))} placeholder="Any existing damage or observations…" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCheckinOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Check Out</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Check-Out Modal */}
            <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Return Cart</DialogTitle>
                        <DialogDescription>Return a cart. If there's an issue, it will be marked for maintenance.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckout} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={checkoutForm.fleetId} onValueChange={v => setCheckoutForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>
                                    {dispatchedFleet.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {checkoutForm.fleetId && (() => {
                                const selectedCart = dispatchedFleet.find(v => v.id === checkoutForm.fleetId);
                                if (selectedCart?.assignedUser) {
                                    return (
                                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                                            <span className="text-blue-700 font-medium">Previously checked out by: </span>
                                            <span className="text-blue-900 font-semibold">{selectedCart.assignedUser.name}</span>
                                            {selectedCart.assignedUser.phone && (
                                                <span className="text-blue-600 ml-2">({selectedCart.assignedUser.phone})</span>
                                            )}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="space-y-2">
                            <Label>Condition Notes</Label>
                            <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={checkoutForm.conditionNotes} onChange={e => setCheckoutForm(f => ({ ...f, conditionNotes: e.target.value }))} placeholder="Return condition observations…" />
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                            <input type="checkbox" id="hasIssue" checked={checkoutForm.hasIssue} onChange={e => setCheckoutForm(f => ({ ...f, hasIssue: e.target.checked }))} className="w-4 h-4 rounded" />
                            <Label htmlFor="hasIssue" className="cursor-pointer flex items-center gap-2 text-amber-800">
                                <AlertTriangle className="w-4 h-4" />Report an Issue (will set cart to Maintenance)
                            </Label>
                        </div>
                        {checkoutForm.hasIssue && (
                            <>
                                <div className="space-y-2">
                                    <Label>Issue Description *</Label>
                                    <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={checkoutForm.issueDescription} onChange={e => setCheckoutForm(f => ({ ...f, issueDescription: e.target.value }))} placeholder="Describe the issue in detail…" required={checkoutForm.hasIssue} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Photos (optional, max 5)</Label>
                                    <Input type="file" accept="image/*" multiple onChange={e => { const files = Array.from(e.target.files || []); setCheckoutForm(f => ({ ...f, photos: files.slice(0, 5) })); }} />
                                    {checkoutForm.photos.length > 0 && <p className="text-xs text-muted-foreground">{checkoutForm.photos.length} files selected</p>}
                                </div>
                            </>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Return Cart</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
