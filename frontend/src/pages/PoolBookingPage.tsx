import { useState, useEffect, useCallback } from 'react';
import { poolBookingsApi, fleetApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import {
    Car, Search, Loader2, CheckCircle, Clock, RotateCcw,
    Users, AlertCircle, Plus, Minus, FilterX, CalendarClock,
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/lib/dateUtils';

interface PoolCart {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    isPool: boolean;
    stadiumId: string;
    stadium: { id: string; name: string; code: string };
    poolBookings: ActiveBooking[];
}

interface ActiveBooking {
    id: string;
    driverName: string;
    driverPhone?: string;
    accreditationNumber?: string;
    purpose?: string;
    checkoutAt: string;
    expectedReturnAt?: string;
    status: string;
    createdBy: { id: string; name: string };
}

interface HistoryBooking {
    id: string;
    driverName: string;
    driverPhone?: string;
    accreditationNumber?: string;
    purpose?: string;
    checkoutAt: string;
    expectedReturnAt?: string;
    returnedAt?: string;
    status: string;
    returnNotes?: string;
    fleet: { id: string; carNumber: string; carType: string };
    createdBy: { id: string; name: string };
    returnedBy?: { id: string; name: string };
}

function elapsedSince(dateStr: string): string {
    const diff = Date.now() - new Date(dateStr).getTime();
    const h = Math.floor(diff / 3_600_000);
    const m = Math.floor((diff % 3_600_000) / 60_000);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
}

export function PoolBookingPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isAdmin = role === 'SuperAdmin' || role === 'Admin';
    const canCheckout = role === 'SuperAdmin' || role === 'Admin' || role === 'FA';

    const [poolCarts, setPoolCarts] = useState<PoolCart[]>([]);
    const [history, setHistory] = useState<HistoryBooking[]>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [allFleet, setAllFleet] = useState<Array<{ id: string; carNumber: string; carType: string; isPool: boolean; status: string; stadiumId: string }>>([]);

    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState<'all' | 'Available' | 'Dispatched'>('all');
    const [stadiumFilter, setStadiumFilter] = useState('all');

    // Checkout dialog
    const [checkoutCart, setCheckoutCart] = useState<PoolCart | null>(null);
    const [checkoutForm, setCheckoutForm] = useState({
        driverName: '', driverPhone: '', accreditationNumber: '', purpose: '', expectedReturnAt: '',
    });
    const [checkoutLoading, setCheckoutLoading] = useState(false);
    const [checkoutError, setCheckoutError] = useState('');

    // Return dialog
    const [returnBooking, setReturnBooking] = useState<{ cart: PoolCart; booking: ActiveBooking } | null>(null);
    const [returnNotes, setReturnNotes] = useState('');
    const [returnLoading, setReturnLoading] = useState(false);

    // Manage pool dialog (admin only)
    const [managePoolOpen, setManagePoolOpen] = useState(false);
    const [togglingId, setTogglingId] = useState<string | null>(null);

    const loadData = useCallback(async () => {
        try {
            setLoading(true);
            const [cartsRes, historyRes] = await Promise.all([
                poolBookingsApi.getPoolFleet(),
                poolBookingsApi.getBookings({ status: 'Returned', limit: 100 }),
            ]);
            setPoolCarts(cartsRes.data.data || []);
            setHistory(historyRes.data.data || []);
        } catch {
            // silent
        } finally {
            setLoading(false);
        }
    }, []);

    const loadManageData = useCallback(async () => {
        if (!isAdmin) return;
        try {
            const [stadRes, fleetRes] = await Promise.all([
                stadiumsApi.getAll(),
                fleetApi.getAll({ limit: 500 }),
            ]);
            setStadiums(stadRes.data.data || stadRes.data || []);
            const fleetData = fleetRes.data.data || fleetRes.data || [];
            setAllFleet(fleetData.map((c: any) => ({
                id: c.id,
                carNumber: c.carNumber,
                carType: c.carType,
                isPool: c.isPool ?? false,
                status: c.status,
                stadiumId: c.stadiumId,
            })));
        } catch {
            // silent
        }
    }, [isAdmin]);

    useEffect(() => { loadData(); }, [loadData]);

    const filteredCarts = poolCarts.filter(c => {
        const matchSearch = !search ||
            c.carNumber.toLowerCase().includes(search.toLowerCase()) ||
            c.carType.toLowerCase().includes(search.toLowerCase());
        const matchStatus = statusFilter === 'all' || c.status === statusFilter;
        const matchStadium = stadiumFilter === 'all' || c.stadiumId === stadiumFilter;
        return matchSearch && matchStatus && matchStadium;
    });

    const availableCount = poolCarts.filter(c => c.status === 'Available').length;
    const checkedOutCount = poolCarts.filter(c => c.status === 'Dispatched').length;

    // Unique venues in pool
    const poolVenues = Array.from(new Map(poolCarts.map(c => [c.stadiumId, c.stadium])).values());

    async function handleCheckout() {
        if (!checkoutCart || !checkoutForm.driverName.trim()) return;
        setCheckoutLoading(true);
        setCheckoutError('');
        try {
            await poolBookingsApi.checkout({
                fleetId: checkoutCart.id,
                driverName: checkoutForm.driverName.trim(),
                driverPhone: checkoutForm.driverPhone.trim() || undefined,
                accreditationNumber: checkoutForm.accreditationNumber.trim() || undefined,
                purpose: checkoutForm.purpose.trim() || undefined,
                expectedReturnAt: checkoutForm.expectedReturnAt || undefined,
            });
            setCheckoutCart(null);
            setCheckoutForm({ driverName: '', driverPhone: '', accreditationNumber: '', purpose: '', expectedReturnAt: '' });
            await loadData();
        } catch (err: any) {
            setCheckoutError(err.response?.data?.error || 'Checkout failed');
        } finally {
            setCheckoutLoading(false);
        }
    }

    async function handleReturn() {
        if (!returnBooking) return;
        setReturnLoading(true);
        try {
            await poolBookingsApi.returnCart(returnBooking.booking.id, returnNotes.trim() || undefined);
            setReturnBooking(null);
            setReturnNotes('');
            await loadData();
        } catch {
            // silent — keep dialog open
        } finally {
            setReturnLoading(false);
        }
    }

    async function handleTogglePool(fleetId: string, currentIsPool: boolean) {
        setTogglingId(fleetId);
        try {
            await poolBookingsApi.togglePool(fleetId, !currentIsPool);
            setAllFleet(prev =>
                prev.map(c => c.id === fleetId ? { ...c, isPool: !currentIsPool } : c),
            );
            await loadData();
        } catch {
            // silent
        } finally {
            setTogglingId(null);
        }
    }

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-6 space-y-6">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div>
                    <h1 className="text-2xl font-bold flex items-center gap-2">
                        <Car className="w-6 h-6" />
                        Pool Booking
                    </h1>
                    <p className="text-sm text-muted-foreground mt-1">
                        Shared pool carts — short-term checkout without a formal handover
                    </p>
                </div>
                {isAdmin && (
                    <Button variant="outline" onClick={() => { loadManageData(); setManagePoolOpen(true); }}>
                        <Users className="w-4 h-4 mr-2" />
                        Manage Pool
                    </Button>
                )}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4">
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="text-2xl font-bold">{poolCarts.length}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Total Pool Carts</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="text-2xl font-bold text-green-600">{availableCount}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Available</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardContent className="pt-4 pb-4">
                        <div className="text-2xl font-bold text-orange-500">{checkedOutCount}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">Checked Out</div>
                    </CardContent>
                </Card>
            </div>

            <Tabs defaultValue="pool">
                <TabsList>
                    <TabsTrigger value="pool">Pool Carts</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                {/* Pool Carts Tab */}
                <TabsContent value="pool" className="space-y-4 mt-4">
                    {/* Filters */}
                    <div className="flex flex-col sm:flex-row gap-2">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                            <Input
                                placeholder="Search cart number or type..."
                                className="pl-9"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={(v: any) => setStatusFilter(v)}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="Available">Available</SelectItem>
                                <SelectItem value="Dispatched">Checked Out</SelectItem>
                            </SelectContent>
                        </Select>
                        {poolVenues.length > 1 && (
                            <Select value={stadiumFilter} onValueChange={setStadiumFilter}>
                                <SelectTrigger className="w-48">
                                    <SelectValue placeholder="Venue" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="all">All Venues</SelectItem>
                                    {poolVenues.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                        {(search || statusFilter !== 'all' || stadiumFilter !== 'all') && (
                            <Button variant="ghost" size="icon" onClick={() => { setSearch(''); setStatusFilter('all'); setStadiumFilter('all'); }}>
                                <FilterX className="w-4 h-4" />
                            </Button>
                        )}
                    </div>

                    {poolCarts.length === 0 ? (
                        <div className="text-center py-16 text-muted-foreground">
                            <Car className="w-12 h-12 mx-auto mb-3 opacity-30" />
                            <p className="font-medium">No pool carts configured</p>
                            {isAdmin && (
                                <p className="text-sm mt-1">Use "Manage Pool" to add carts to the pool</p>
                            )}
                        </div>
                    ) : filteredCarts.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
                            <p>No carts match your filter</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                            {filteredCarts.map(cart => {
                                const activeBooking = cart.poolBookings[0];
                                const isOut = cart.status === 'Dispatched' && activeBooking;

                                return (
                                    <Card key={cart.id} className={`transition-shadow hover:shadow-md ${isOut ? 'border-orange-200 dark:border-orange-800' : 'border-green-200 dark:border-green-900'}`}>
                                        <CardHeader className="pb-2 pt-4 px-4">
                                            <div className="flex items-start justify-between">
                                                <div>
                                                    <div className="font-bold text-lg leading-tight">{cart.carNumber}</div>
                                                    <div className="text-xs text-muted-foreground">{cart.carType}</div>
                                                </div>
                                                <Badge className={isOut
                                                    ? 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-400'
                                                    : 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400'
                                                }>
                                                    {isOut ? (
                                                        <><Clock className="w-3 h-3 mr-1" />Checked Out</>
                                                    ) : (
                                                        <><CheckCircle className="w-3 h-3 mr-1" />Available</>
                                                    )}
                                                </Badge>
                                            </div>
                                        </CardHeader>
                                        <CardContent className="px-4 pb-4 space-y-3">
                                            {poolVenues.length > 1 && (
                                                <div className="text-xs text-muted-foreground">{cart.stadium.name}</div>
                                            )}

                                            {isOut && activeBooking ? (
                                                <div className="space-y-1 text-sm border-t pt-2">
                                                    <div className="font-medium truncate">{activeBooking.driverName}</div>
                                                    {activeBooking.accreditationNumber && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Badge: {activeBooking.accreditationNumber}
                                                        </div>
                                                    )}
                                                    {activeBooking.driverPhone && (
                                                        <div className="text-xs text-muted-foreground">{activeBooking.driverPhone}</div>
                                                    )}
                                                    {activeBooking.purpose && (
                                                        <div className="text-xs text-muted-foreground truncate">{activeBooking.purpose}</div>
                                                    )}
                                                    <div className="text-xs text-orange-600 font-medium flex items-center gap-1 mt-1">
                                                        <CalendarClock className="w-3 h-3" />
                                                        Out {elapsedSince(activeBooking.checkoutAt)} ago
                                                    </div>
                                                    {activeBooking.expectedReturnAt && (
                                                        <div className="text-xs text-muted-foreground">
                                                            Expected: {formatDateTime(activeBooking.expectedReturnAt)}
                                                        </div>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="text-xs text-muted-foreground border-t pt-2">
                                                    Ready for checkout
                                                </div>
                                            )}

                                            {isOut && canCheckout ? (
                                                <Button
                                                    size="sm"
                                                    variant="outline"
                                                    className="w-full border-orange-300 text-orange-700 hover:bg-orange-50"
                                                    onClick={() => { setReturnBooking({ cart, booking: activeBooking! }); setReturnNotes(''); }}
                                                >
                                                    <RotateCcw className="w-4 h-4 mr-2" />
                                                    Return Cart
                                                </Button>
                                            ) : !isOut && canCheckout ? (
                                                <Button
                                                    size="sm"
                                                    className="w-full"
                                                    onClick={() => {
                                                        setCheckoutCart(cart);
                                                        setCheckoutForm({ driverName: '', driverPhone: '', accreditationNumber: '', purpose: '', expectedReturnAt: '' });
                                                        setCheckoutError('');
                                                    }}
                                                >
                                                    <Car className="w-4 h-4 mr-2" />
                                                    Check Out
                                                </Button>
                                            ) : null}
                                        </CardContent>
                                    </Card>
                                );
                            })}
                        </div>
                    )}
                </TabsContent>

                {/* History Tab */}
                <TabsContent value="history" className="mt-4">
                    <Card>
                        <CardContent className="p-0">
                            <div className="overflow-x-auto">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Cart</TableHead>
                                            <TableHead>Driver</TableHead>
                                            <TableHead>Badge</TableHead>
                                            <TableHead>Purpose</TableHead>
                                            <TableHead>Checked Out</TableHead>
                                            <TableHead>Returned</TableHead>
                                            <TableHead>Duration</TableHead>
                                            <TableHead>By</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {history.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                                                    No return history yet
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            history.map(b => {
                                                const duration = b.returnedAt
                                                    ? (() => {
                                                        const ms = new Date(b.returnedAt).getTime() - new Date(b.checkoutAt).getTime();
                                                        const h = Math.floor(ms / 3_600_000);
                                                        const m = Math.floor((ms % 3_600_000) / 60_000);
                                                        return h > 0 ? `${h}h ${m}m` : `${m}m`;
                                                    })()
                                                    : '—';

                                                return (
                                                    <TableRow key={b.id}>
                                                        <TableCell className="font-medium">
                                                            <div>{b.fleet.carNumber}</div>
                                                            <div className="text-xs text-muted-foreground">{b.fleet.carType}</div>
                                                        </TableCell>
                                                        <TableCell>
                                                            <div className="font-medium">{b.driverName}</div>
                                                            {b.driverPhone && <div className="text-xs text-muted-foreground">{b.driverPhone}</div>}
                                                        </TableCell>
                                                        <TableCell className="text-sm">{b.accreditationNumber || '—'}</TableCell>
                                                        <TableCell className="text-sm max-w-[140px] truncate">{b.purpose || '—'}</TableCell>
                                                        <TableCell className="text-sm whitespace-nowrap">{formatDateTime(b.checkoutAt)}</TableCell>
                                                        <TableCell className="text-sm whitespace-nowrap">
                                                            {b.returnedAt ? formatDateTime(b.returnedAt) : '—'}
                                                        </TableCell>
                                                        <TableCell className="text-sm">{duration}</TableCell>
                                                        <TableCell className="text-xs text-muted-foreground">{b.createdBy.name}</TableCell>
                                                    </TableRow>
                                                );
                                            })
                                        )}
                                    </TableBody>
                                </Table>
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Checkout Dialog */}
            <Dialog open={!!checkoutCart} onOpenChange={open => !open && setCheckoutCart(null)}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check Out Cart — {checkoutCart?.carNumber}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="space-y-1.5">
                            <Label>Driver Name <span className="text-red-500">*</span></Label>
                            <Input
                                placeholder="Full name"
                                value={checkoutForm.driverName}
                                onChange={e => setCheckoutForm(f => ({ ...f, driverName: e.target.value }))}
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label>Phone</Label>
                                <Input
                                    placeholder="+974 ..."
                                    value={checkoutForm.driverPhone}
                                    onChange={e => setCheckoutForm(f => ({ ...f, driverPhone: e.target.value }))}
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label>Accreditation / Badge</Label>
                                <Input
                                    placeholder="Badge number"
                                    value={checkoutForm.accreditationNumber}
                                    onChange={e => setCheckoutForm(f => ({ ...f, accreditationNumber: e.target.value }))}
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <Label>Purpose</Label>
                            <Input
                                placeholder="e.g. Transport to Gate 5"
                                value={checkoutForm.purpose}
                                onChange={e => setCheckoutForm(f => ({ ...f, purpose: e.target.value }))}
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label>Expected Return</Label>
                            <Input
                                type="datetime-local"
                                value={checkoutForm.expectedReturnAt}
                                onChange={e => setCheckoutForm(f => ({ ...f, expectedReturnAt: e.target.value }))}
                            />
                        </div>
                        {checkoutError && (
                            <div className="text-sm text-red-600 flex items-center gap-1.5">
                                <AlertCircle className="w-4 h-4 flex-shrink-0" />
                                {checkoutError}
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setCheckoutCart(null)}>Cancel</Button>
                        <Button
                            onClick={handleCheckout}
                            disabled={checkoutLoading || !checkoutForm.driverName.trim()}
                        >
                            {checkoutLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirm Checkout
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Return Dialog */}
            <Dialog open={!!returnBooking} onOpenChange={open => !open && setReturnBooking(null)}>
                <DialogContent className="sm:max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Return Cart — {returnBooking?.cart.carNumber}</DialogTitle>
                    </DialogHeader>
                    {returnBooking && (
                        <div className="space-y-4 py-2">
                            <div className="text-sm bg-muted rounded-md p-3 space-y-1">
                                <div><span className="font-medium">Driver:</span> {returnBooking.booking.driverName}</div>
                                {returnBooking.booking.accreditationNumber && (
                                    <div><span className="font-medium">Badge:</span> {returnBooking.booking.accreditationNumber}</div>
                                )}
                                <div><span className="font-medium">Out since:</span> {formatDateTime(returnBooking.booking.checkoutAt)}</div>
                                <div className="text-orange-600 font-medium">
                                    Duration: {elapsedSince(returnBooking.booking.checkoutAt)}
                                </div>
                            </div>
                            <div className="space-y-1.5">
                                <Label>Return Notes (optional)</Label>
                                <Textarea
                                    placeholder="Any notes about condition, issues..."
                                    value={returnNotes}
                                    onChange={e => setReturnNotes(e.target.value)}
                                    rows={3}
                                />
                            </div>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReturnBooking(null)}>Cancel</Button>
                        <Button
                            onClick={handleReturn}
                            disabled={returnLoading}
                            variant="default"
                        >
                            {returnLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Confirm Return
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Manage Pool Dialog (Admin only) */}
            <Dialog open={managePoolOpen} onOpenChange={setManagePoolOpen}>
                <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Manage Pool Carts</DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-muted-foreground">
                        Toggle which carts belong to the shared pool. Pool carts are not assigned to a dedicated FA and can be checked out by anyone.
                    </p>
                    {stadiums.length > 0 && (
                        <div className="space-y-4 mt-2">
                            {stadiums.map(stadium => {
                                const stadiumFleet = allFleet.filter(c => c.stadiumId === stadium.id);
                                if (stadiumFleet.length === 0) return null;
                                return (
                                    <div key={stadium.id} className="space-y-2">
                                        <div className="text-sm font-semibold text-muted-foreground">{stadium.name}</div>
                                        {stadiumFleet.map(cart => (
                                            <div key={cart.id} className="flex items-center justify-between px-3 py-2 rounded-md border hover:bg-muted/40 transition-colors">
                                                <div>
                                                    <span className="font-medium text-sm">{cart.carNumber}</span>
                                                    <span className="text-xs text-muted-foreground ml-2">{cart.carType}</span>
                                                </div>
                                                <Button
                                                    size="sm"
                                                    variant={cart.isPool ? 'destructive' : 'outline'}
                                                    disabled={togglingId === cart.id}
                                                    onClick={() => handleTogglePool(cart.id, cart.isPool)}
                                                    className="h-7 text-xs"
                                                >
                                                    {togglingId === cart.id ? (
                                                        <Loader2 className="w-3 h-3 animate-spin" />
                                                    ) : cart.isPool ? (
                                                        <><Minus className="w-3 h-3 mr-1" />Remove</>
                                                    ) : (
                                                        <><Plus className="w-3 h-3 mr-1" />Add to Pool</>
                                                    )}
                                                </Button>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {allFleet.length === 0 && (
                        <div className="text-center text-muted-foreground py-8">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                            Loading fleet...
                        </div>
                    )}
                    <DialogFooter>
                        <Button onClick={() => setManagePoolOpen(false)}>Done</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
