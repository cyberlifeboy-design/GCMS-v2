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

interface HandoverLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string };
    userId: string;
    user?: { name: string };
    action: 'CheckedOut' | 'CheckedIn' | 'IssueReported';
    createdAt: string;
    conditionNotes?: string;
    issueDescription?: string;
}

interface FleetCart {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
}

const actionColors: Record<string, string> = {
    'CheckedOut': 'bg-blue-500 text-white',
    'CheckedIn': 'bg-green-500 text-white',
    'IssueReported': 'bg-red-500 text-white',
};

const actionLabels: Record<string, string> = {
    'CheckedOut': 'Check-Out',
    'CheckedIn': 'Check-In',
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

    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [checkinOpen, setCheckinOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [checkoutForm, setCheckoutForm] = useState({ fleetId: '', conditionNotes: '' });
    const [checkinForm, setCheckinForm] = useState({
        fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '',
    });

    // Bulk selection state
    const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
    const [selectedDispatched, setSelectedDispatched] = useState<string[]>([]);

    const loadData = async () => {
        try {
            setLoading(true);
            const [histRes, fleetRes] = await Promise.all([
                handoverApi.getHistory(),
                fleetApi.getAll(),
            ]);
            setHistory(histRes.data.data || []);
            const all: FleetCart[] = fleetRes.data.data || [];
            setAvailableFleet(all.filter(v => v.status === 'Available'));
            setDispatchedFleet(all.filter(v => v.status === 'Dispatched'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadData(); }, []);

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkoutForm.fleetId) { alert('Select a cart'); return; }
        setSubmitting(true);
        try {
            await handoverApi.checkOut({ fleetId: checkoutForm.fleetId, conditionNotes: checkoutForm.conditionNotes });
            setCheckoutOpen(false);
            setCheckoutForm({ fleetId: '', conditionNotes: '' });
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkinForm.fleetId) { alert('Select a cart'); return; }
        setSubmitting(true);
        try {
            await handoverApi.checkIn({
                fleetId: checkinForm.fleetId,
                conditionNotes: checkinForm.conditionNotes,
                hasIssue: checkinForm.hasIssue,
                issueDescription: checkinForm.hasIssue ? checkinForm.issueDescription : undefined,
            });
            setCheckinOpen(false);
            setCheckinForm({ fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '' });
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Check-in failed');
        } finally {
            setSubmitting(false);
        }
    };

    // Bulk selection handlers
    const toggleAvailableSelection = (id: string) => {
        setSelectedAvailable(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleDispatchedSelection = (id: string) => {
        setSelectedDispatched(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleAllAvailable = () => {
        if (selectedAvailable.length === availableFleet.length) {
            setSelectedAvailable([]);
        } else {
            setSelectedAvailable(availableFleet.map(v => v.id));
        }
    };

    const toggleAllDispatched = () => {
        if (selectedDispatched.length === dispatchedFleet.length) {
            setSelectedDispatched([]);
        } else {
            setSelectedDispatched(dispatchedFleet.map(v => v.id));
        }
    };

    const handleBulkCheckout = async () => {
        if (selectedAvailable.length === 0) return;
        if (!confirm(`Check out ${selectedAvailable.length} selected cart(s)?`)) return;
        setSubmitting(true);
        try {
            await handoverApi.bulkCheckOut({ fleetIds: selectedAvailable });
            setSelectedAvailable([]);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Bulk check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkCheckin = async () => {
        if (selectedDispatched.length === 0) return;
        if (!confirm(`Check in ${selectedDispatched.length} selected cart(s)?`)) return;
        setSubmitting(true);
        try {
            await handoverApi.bulkCheckIn({ fleetIds: selectedDispatched });
            setSelectedDispatched([]);
            loadData();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Bulk check-in failed');
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = history.filter(h => {
        const matchSearch =
            h.fleet?.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
            h.user?.name?.toLowerCase().includes(search.toLowerCase());
        const matchAction = actionFilter === 'all' || h.action === actionFilter;
        return matchSearch && matchAction;
    });

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Handover Management</h1>
                {canHandover && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => { setCheckinForm({ fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '' }); setCheckinOpen(true); }}>
                            <LogIn className="w-4 h-4 mr-2" />Check In
                        </Button>
                        <Button onClick={() => { setCheckoutForm({ fleetId: '', conditionNotes: '' }); setCheckoutOpen(true); }}>
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
                                <Select value={actionFilter} onValueChange={setActionFilter}>
                                    <SelectTrigger className="w-44">
                                        <SelectValue placeholder="All Actions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Actions</SelectItem>
                                        <SelectItem value="CheckedOut">Check-Out</SelectItem>
                                        <SelectItem value="CheckedIn">Check-In</SelectItem>
                                        <SelectItem value="IssueReported">Issue Reported</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>User</TableHead>
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
                        </CardContent>
                    </Card>
                </TabsContent>

                {canHandover && (
                    <>
                        <TabsContent value="available">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <h3 className="font-semibold">Available Carts — Ready for Check-Out</h3>
                                        {selectedAvailable.length > 0 && (
                                            <Button
                                                size="sm"
                                                onClick={handleBulkCheckout}
                                                disabled={submitting}
                                            >
                                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                <LogOut className="w-4 h-4 mr-1" />
                                                Check Out Selected ({selectedAvailable.length})
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12">
                                                    <Checkbox
                                                        checked={availableFleet.length > 0 && selectedAvailable.length === availableFleet.length}
                                                        onCheckedChange={toggleAllAvailable}
                                                        aria-label="Select all available carts"
                                                    />
                                                </TableHead>
                                                <TableHead>Cart #</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {availableFleet.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No available carts</TableCell></TableRow>
                                            ) : availableFleet.map(v => (
                                                <TableRow
                                                    key={v.id}
                                                    className={selectedAvailable.includes(v.id) ? 'bg-blue-50' : ''}
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedAvailable.includes(v.id)}
                                                            onCheckedChange={() => toggleAvailableSelection(v.id)}
                                                            aria-label={`Select ${v.carNumber}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono font-semibold">{v.carNumber}</TableCell>
                                                    <TableCell>
                                                        <Badge className={carTypeColors[v.carType] || 'bg-gray-500 text-white'} variant="secondary">{v.carType}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" onClick={() => { setCheckoutForm({ fleetId: v.id, conditionNotes: '' }); setCheckoutOpen(true); }}>
                                                            <LogOut className="w-4 h-4 mr-1" />Check Out
                                                        </Button>
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
                                        <h3 className="font-semibold">Dispatched Carts — Ready for Check-In</h3>
                                        {selectedDispatched.length > 0 && (
                                            <Button
                                                size="sm"
                                                variant="outline"
                                                onClick={handleBulkCheckin}
                                                disabled={submitting}
                                            >
                                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                <LogIn className="w-4 h-4 mr-1" />
                                                Check In Selected ({selectedDispatched.length})
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12">
                                                    <Checkbox
                                                        checked={dispatchedFleet.length > 0 && selectedDispatched.length === dispatchedFleet.length}
                                                        onCheckedChange={toggleAllDispatched}
                                                        aria-label="Select all dispatched carts"
                                                    />
                                                </TableHead>
                                                <TableHead>Cart #</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dispatchedFleet.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No dispatched carts</TableCell></TableRow>
                                            ) : dispatchedFleet.map(v => (
                                                <TableRow
                                                    key={v.id}
                                                    className={selectedDispatched.includes(v.id) ? 'bg-green-50' : ''}
                                                >
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedDispatched.includes(v.id)}
                                                            onCheckedChange={() => toggleDispatchedSelection(v.id)}
                                                            aria-label={`Select ${v.carNumber}`}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="font-mono font-semibold">{v.carNumber}</TableCell>
                                                    <TableCell>
                                                        <Badge className={carTypeColors[v.carType] || 'bg-gray-500 text-white'} variant="secondary">{v.carType}</Badge>
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" variant="outline" onClick={() => { setCheckinForm({ fleetId: v.id, conditionNotes: '', hasIssue: false, issueDescription: '' }); setCheckinOpen(true); }}>
                                                            <LogIn className="w-4 h-4 mr-1" />Check In
                                                        </Button>
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

            {/* Check-Out Modal */}
            <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check Out Cart</DialogTitle>
                        <DialogDescription>Select a cart and confirm condition before dispatching.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckout} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={checkoutForm.fleetId} onValueChange={v => setCheckoutForm(f => ({ ...f, fleetId: v }))}>
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
                            <textarea
                                className="w-full min-h-[80px] p-3 border rounded-md text-sm"
                                value={checkoutForm.conditionNotes}
                                onChange={e => setCheckoutForm(f => ({ ...f, conditionNotes: e.target.value }))}
                                placeholder="Any existing damage or observations…"
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Check Out
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Check-In Modal */}
            <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check In Cart</DialogTitle>
                        <DialogDescription>Return a cart and note any issues found.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckin} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={checkinForm.fleetId} onValueChange={v => setCheckinForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>
                                    {dispatchedFleet.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Condition Notes</Label>
                            <textarea
                                className="w-full min-h-[80px] p-3 border rounded-md text-sm"
                                value={checkinForm.conditionNotes}
                                onChange={e => setCheckinForm(f => ({ ...f, conditionNotes: e.target.value }))}
                                placeholder="Return condition observations…"
                            />
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                            <input type="checkbox" id="hasIssue" checked={checkinForm.hasIssue}
                                onChange={e => setCheckinForm(f => ({ ...f, hasIssue: e.target.checked }))}
                                className="w-4 h-4 rounded" />
                            <Label htmlFor="hasIssue" className="cursor-pointer flex items-center gap-2 text-amber-800">
                                <AlertTriangle className="w-4 h-4" />Report an Issue (will set cart to Maintenance)
                            </Label>
                        </div>
                        {checkinForm.hasIssue && (
                            <div className="space-y-2">
                                <Label>Issue Description *</Label>
                                <textarea
                                    className="w-full min-h-[80px] p-3 border rounded-md text-sm"
                                    value={checkinForm.issueDescription}
                                    onChange={e => setCheckinForm(f => ({ ...f, issueDescription: e.target.value }))}
                                    placeholder="Describe the issue in detail…"
                                    required={checkinForm.hasIssue}
                                />
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCheckinOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Check In
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
