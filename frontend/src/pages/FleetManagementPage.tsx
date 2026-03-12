import { useState, useEffect } from 'react';
import { fleetApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Users, Grid, History, X, ArrowRightLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';

interface FleetCart {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    requiresVAP: boolean;
    stadiumId: string;
    stadium: { id: string; name: string; code: string };
    department?: { id: string; name: string; code?: string };
    assignedUser?: { id: string; name: string; email: string; phone?: string } | null;
}

interface FAUser {
    id: string;
    name: string;
    email: string;
    phone?: string;
    stadium?: { id: string; name: string };
}

interface Stadium {
    id: string;
    name: string;
    code: string;
}

interface AssignmentLog {
    id: string;
    action: string;
    fleetId: string;
    user: { id: string; name: string; email: string; role: string };
    oldValue: any;
    newValue: any;
    timestamp: string;
}

const STATUS_COLORS: Record<string, string> = {
    'Available': 'text-green-600 font-semibold',
    'Assigned': 'text-purple-600 font-semibold',
    'Dispatched': 'text-blue-600 font-semibold',
    'Under Maintenance': 'text-red-600 font-semibold',
};

const CAR_TYPES = ['Cargo', 'Accessibility', '6-Seater', '4-Seater'] as const;

export function FleetManagementPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';

    // Data state
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [selectedStadium, setSelectedStadium] = useState<string>('all');
    const [fleet, setFleet] = useState<FleetCart[]>([]);
    const [faUsers, setFaUsers] = useState<FAUser[]>([]);
    const [history, setHistory] = useState<AssignmentLog[]>([]);
    const [loading, setLoading] = useState(true);
    const [historyLoading, setHistoryLoading] = useState(false);

    // Selection for bulk operations
    const [selectedCarts, setSelectedCarts] = useState<Set<string>>(new Set());

    // Modals
    const [assignModalOpen, setAssignModalOpen] = useState(false);
    const [bulkAssignModalOpen, setBulkAssignModalOpen] = useState(false);
    const [selectedCart, setSelectedCart] = useState<FleetCart | null>(null);
    const [assignUserId, setAssignUserId] = useState<string>('');
    const [bulkAssignUserId, setBulkAssignUserId] = useState<string>('');
    const [submitting, setSubmitting] = useState(false);

    // Search/filter
    const [searchTerm, setSearchTerm] = useState('');
    const [carTypeFilter, setCarTypeFilter] = useState<string>('all');
    const [faFilter, setFaFilter] = useState<string>('all');

    // Load stadiums on mount
    useEffect(() => {
        loadStadiums();
    }, []);

    // Load fleet when stadium changes
    useEffect(() => {
        loadFleet();
    }, [selectedStadium]);

    const loadStadiums = async () => {
        try {
            const res = await stadiumsApi.getAll();
            const stadiumList = res.data.data || [];
            setStadiums(stadiumList);
            // Auto-select user's stadium for Admin
            if (isAdmin && user?.stadiumId) {
                setSelectedStadium(user.stadiumId);
            }
        } catch (e) {
            console.error('Failed to load stadiums', e);
        }
    };

    const loadFleet = async () => {
        try {
            setLoading(true);
            const params: Record<string, unknown> = {};
            if (selectedStadium !== 'all') {
                params.stadiumId = selectedStadium;
            }

            const res = await fleetApi.getAssignmentMatrix(params);
            setFleet(res.data.fleet || []);
            setFaUsers(res.data.users || []);
        } catch (e) {
            console.error('Failed to load fleet', e);
        } finally {
            setLoading(false);
        }
    };

    const loadHistory = async () => {
        try {
            setHistoryLoading(true);
            const params: Record<string, unknown> = { limit: 50 };
            if (selectedStadium !== 'all') {
                // Note: history endpoint may need stadium filtering server-side
            }
            const res = await fleetApi.getAssignmentHistory(params);
            setHistory(res.data.data || []);
        } catch (e) {
            console.error('Failed to load history', e);
        } finally {
            setHistoryLoading(false);
        }
    };

    const handleAssign = async () => {
        if (!selectedCart) return;
        setSubmitting(true);
        try {
            await fleetApi.assignUser(selectedCart.id, assignUserId || null);
            setAssignModalOpen(false);
            setSelectedCart(null);
            setAssignUserId('');
            loadFleet();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to assign');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkAssign = async () => {
        if (selectedCarts.size === 0 || !bulkAssignUserId) return;
        setSubmitting(true);
        try {
            const assignments = Array.from(selectedCarts).map(fleetId => ({
                fleetId,
                userId: bulkAssignUserId,
            }));
            const res = await fleetApi.bulkAssign(assignments);
            setBulkAssignModalOpen(false);
            setSelectedCarts(new Set());
            setBulkAssignUserId('');
            loadFleet();
            alert(`Assigned ${res.data.success} carts. ${res.data.failed} failed.`);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to bulk assign');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkUnassign = async () => {
        if (selectedCarts.size === 0) return;
        setSubmitting(true);
        try {
            const assignments = Array.from(selectedCarts).map(fleetId => ({
                fleetId,
                userId: null,
            }));
            const res = await fleetApi.bulkAssign(assignments);
            setSelectedCarts(new Set());
            loadFleet();
            alert(`Unassigned ${res.data.success} carts. ${res.data.failed} failed.`);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to unassign');
        } finally {
            setSubmitting(false);
        }
    };

    const openAssignModal = (cart: FleetCart) => {
        setSelectedCart(cart);
        setAssignUserId(cart.assignedUser?.id || '');
        setAssignModalOpen(true);
    };

    const toggleCartSelection = (cartId: string) => {
        const newSet = new Set(selectedCarts);
        if (newSet.has(cartId)) {
            newSet.delete(cartId);
        } else {
            newSet.add(cartId);
        }
        setSelectedCarts(newSet);
    };

    const toggleAllVisible = () => {
        if (selectedCarts.size === filteredFleet.length) {
            setSelectedCarts(new Set());
        } else {
            setSelectedCarts(new Set(filteredFleet.map(c => c.id)));
        }
    };

    const filteredFleet = fleet.filter(cart => {
        const matchSearch =
            cart.carNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cart.stadium?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cart.assignedUser?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            cart.carType.toLowerCase().includes(searchTerm.toLowerCase());
        const matchStadium = selectedStadium === 'all' || cart.stadiumId === selectedStadium;
        const matchCarType = carTypeFilter === 'all' || cart.carType === carTypeFilter;
        const matchFa = faFilter === 'all' ||
            (faFilter === 'unassigned' && !cart.assignedUser) ||
            (faFilter === 'assigned' && cart.assignedUser) ||
            cart.assignedUser?.id === faFilter;
        return matchSearch && matchStadium && matchCarType && matchFa;
    });

    // Car type breakdown counts
    const carTypeBreakdown = CAR_TYPES.reduce((acc, type) => {
        acc[type] = filteredFleet.filter(c => c.carType === type).length;
        return acc;
    }, {} as Record<string, number>);

    // Group by stadium for matrix view
    const fleetByStadium = filteredFleet.reduce((acc, cart) => {
        const key = cart.stadiumId;
        if (!acc[key]) acc[key] = { stadium: cart.stadium, carts: [] };
        acc[key].carts.push(cart);
        return acc;
    }, {} as Record<string, { stadium: Stadium; carts: FleetCart[] }>);

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fleet Management</h1>
                <div className="flex gap-2">
                    {selectedCarts.size > 0 && (
                        <>
                            <Button variant="outline" onClick={() => { setBulkAssignUserId(''); setBulkAssignModalOpen(true); }}>
                                <Users className="w-4 h-4 mr-2" />
                                Assign Selected ({selectedCarts.size})
                            </Button>
                            <Button variant="destructive" onClick={handleBulkUnassign} disabled={submitting}>
                                <X className="w-4 h-4 mr-2" />
                                Unassign Selected
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <Tabs defaultValue="matrix" onValueChange={(v) => v === 'history' && loadHistory()}>
                <TabsList>
                    <TabsTrigger value="matrix"><Grid className="w-4 h-4 mr-2 inline" />Assignment Matrix</TabsTrigger>
                    <TabsTrigger value="history"><History className="w-4 h-4 mr-2 inline" />Assignment History</TabsTrigger>
                </TabsList>

                <TabsContent value="matrix" className="space-y-4">
                    {/* Car Type Breakdown Summary */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg">Car Type Breakdown</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                {CAR_TYPES.map(type => (
                                    <div key={type} className="flex items-center gap-3">
                                        <Badge className={`${carTypeColors[type]} text-sm px-3 py-1`} variant="secondary">
                                            {type}
                                        </Badge>
                                        <span className="text-2xl font-bold">{carTypeBreakdown[type] || 0}</span>
                                    </div>
                                ))}
                            </div>
                        </CardContent>
                    </Card>

                    {/* Assignments by Stadium - moved to top */}
                    {isSuperAdmin && selectedStadium === 'all' && Object.keys(fleetByStadium).length > 0 && (
                        <Card>
                            <CardHeader>
                                <CardTitle className="text-lg">Assignments by Stadium</CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {Object.entries(fleetByStadium).map(([stadiumId, { stadium, carts }]) => (
                                        <div key={stadiumId} className="border rounded-lg p-3">
                                            <h3 className="font-semibold mb-2">{stadium.name}</h3>
                                            <div className="text-sm text-muted-foreground">
                                                <div className="flex justify-between">
                                                    <span>Total Carts:</span>
                                                    <span className="font-medium">{carts.length}</span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Assigned:</span>
                                                    <span className="font-medium text-blue-600">
                                                        {carts.filter(c => c.assignedUser).length}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span>Available:</span>
                                                    <span className="font-medium text-green-600">
                                                        {carts.filter(c => c.status === 'Available').length}
                                                    </span>
                                                </div>
                                            </div>
                                            {/* Focal Points at this stadium */}
                                            <div className="mt-3 pt-3 border-t">
                                                <p className="text-xs text-muted-foreground mb-1">Focal Points at this venue:</p>
                                                <div className="flex flex-wrap gap-1">
                                                    {faUsers
                                                        .filter(u => u.stadium?.id === stadiumId)
                                                        .slice(0, 5)
                                                        .map(u => (
                                                            <Badge key={u.id} variant="outline" className="text-xs">
                                                                {u.name}
                                                            </Badge>
                                                        ))
                                                    }
                                                    {faUsers.filter(u => u.stadium?.id === stadiumId).length > 5 && (
                                                        <span className="text-xs text-muted-foreground">
                                                            +{faUsers.filter(u => u.stadium?.id === stadiumId).length - 5} more
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Filters */}
                    <Card>
                        <CardHeader className="pb-3">
                            <div className="flex gap-4 items-center flex-wrap">
                                <Input
                                    placeholder="Search by cart #, stadium, type, or Focal Point..."
                                    value={searchTerm}
                                    onChange={e => setSearchTerm(e.target.value)}
                                    className="max-w-sm"
                                />
                                <Select value={carTypeFilter} onValueChange={setCarTypeFilter}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="All Types" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Types</SelectItem>
                                        {CAR_TYPES.map(type => (
                                            <SelectItem key={type} value={type}>{type}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <Select value={faFilter} onValueChange={setFaFilter}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="All Focal Points" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Focal Points</SelectItem>
                                        <SelectItem value="assigned">Assigned</SelectItem>
                                        <SelectItem value="unassigned">Unassigned</SelectItem>
                                        {faUsers
                                            .filter(u => !selectedStadium || selectedStadium === 'all' || u.stadium?.id === selectedStadium)
                                            .map(u => (
                                                <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                                            ))
                                        }
                                    </SelectContent>
                                </Select>
                                {isSuperAdmin && (
                                    <Select value={selectedStadium} onValueChange={setSelectedStadium}>
                                        <SelectTrigger className="w-48">
                                            <SelectValue placeholder="All Stadiums" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Stadiums</SelectItem>
                                            {stadiums.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="flex items-center justify-center py-12">
                                    <Loader2 className="w-8 h-8 animate-spin" />
                                </div>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10">
                                                <Checkbox
                                                    checked={selectedCarts.size === filteredFleet.length && filteredFleet.length > 0}
                                                    onCheckedChange={toggleAllVisible}
                                                />
                                            </TableHead>
                                            <TableHead>Cart #</TableHead>
                                            <TableHead>Type</TableHead>
                                            {isSuperAdmin && <TableHead>Stadium</TableHead>}
                                            <TableHead>Status</TableHead>
                                            <TableHead>Focal Point</TableHead>
                                            <TableHead>Dept</TableHead>
                                            <TableHead>VAP</TableHead>
                                            <TableHead className="text-right">Actions</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {filteredFleet.length === 0 ? (
                                            <TableRow>
                                                <TableCell colSpan={isSuperAdmin ? 9 : 8} className="text-center py-8 text-muted-foreground">
                                                    No carts found
                                                </TableCell>
                                            </TableRow>
                                        ) : (
                                            filteredFleet.map(cart => (
                                                <TableRow key={cart.id} className={selectedCarts.has(cart.id) ? 'bg-blue-50' : ''}>
                                                    <TableCell>
                                                        <Checkbox
                                                            checked={selectedCarts.has(cart.id)}
                                                            onCheckedChange={() => toggleCartSelection(cart.id)}
                                                        />
                                                    </TableCell>
                                                    <TableCell className="text-center text-lg font-bold">{cart.carNumber}</TableCell>
                                                    <TableCell>
                                                        <Badge className={carTypeColors[cart.carType] || 'bg-gray-100 text-gray-800'} variant="secondary">
                                                            {cart.carType}
                                                        </Badge>
                                                    </TableCell>
                                                    {isSuperAdmin && (
                                                        <TableCell>{cart.stadium?.code || cart.stadium?.name || '—'}</TableCell>
                                                    )}
                                                    <TableCell>
                                                        <span className={STATUS_COLORS[cart.status] || 'text-gray-600'}>
                                                            {cart.status}
                                                        </span>
                                                    </TableCell>
                                                    <TableCell>
                                                        {cart.assignedUser ? (
                                                            <span className="font-medium">{cart.assignedUser.name}</span>
                                                        ) : (
                                                            <span className="text-muted-foreground italic">Unassigned</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {cart.department ? (
                                                            <Badge variant="outline">{cart.department.code || cart.department.name}</Badge>
                                                        ) : (
                                                            <span className="text-muted-foreground">—</span>
                                                        )}
                                                    </TableCell>
                                                    <TableCell>
                                                        {cart.requiresVAP && <Badge variant="outline" className="text-orange-600 border-orange-400">VAP</Badge>}
                                                    </TableCell>
                                                    <TableCell className="text-right">
                                                        <Button variant="outline" size="sm" onClick={() => openAssignModal(cart)}>
                                                            <ArrowRightLeft className="w-4 h-4 mr-1" />
                                                            Assign
                                                        </Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))
                                        )}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history" className="space-y-4">
                    <Card>
                        <CardHeader>
                            <CardTitle>Assignment History</CardTitle>
                        </CardHeader>
                        <CardContent>
                            {historyLoading ? (
                                <div className="flex items-center justify-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin" />
                                </div>
                            ) : history.length === 0 ? (
                                <p className="text-center text-muted-foreground py-8">No assignment history found</p>
                            ) : (
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead>Date/Time</TableHead>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Cart</TableHead>
                                            <TableHead>By User</TableHead>
                                            <TableHead>Details</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {history.map(log => (
                                            <TableRow key={log.id}>
                                                <TableCell className="text-sm">
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge>{log.action}</Badge>
                                                </TableCell>
                                                <TableCell className="font-mono">{log.fleetId.slice(0, 8)}...</TableCell>
                                                <TableCell>{log.user?.name || 'System'}</TableCell>
                                                <TableCell className="text-sm text-muted-foreground">
                                                    {log.oldValue?.assignedUser || 'None'} → {log.newValue?.assignedUser || 'None'}
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Single Assign Modal */}
            <Dialog open={assignModalOpen} onOpenChange={setAssignModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Assign Focal Point to Cart</DialogTitle>
                        <DialogDescription>
                            Select a Focal Point to assign to cart <strong>{selectedCart?.carNumber}</strong>
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Select Focal Point</Label>
                            <Select value={assignUserId || '__none__'} onValueChange={v => setAssignUserId(v === '__none__' ? '' : v)}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Unassigned (clear)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">Clear Assignment</SelectItem>
                                    {faUsers
                                        .filter(u => !selectedStadium || selectedStadium === 'all' || u.stadium?.id === selectedStadium)
                                        .map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name} {u.stadium ? `(${u.stadium.name})` : ''}
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Current: {selectedCart?.assignedUser?.name || 'Unassigned'}
                        </p>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleAssign} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {assignUserId ? 'Assign' : 'Clear Assignment'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Assign Modal */}
            <Dialog open={bulkAssignModalOpen} onOpenChange={setBulkAssignModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Bulk Assign Focal Points</DialogTitle>
                        <DialogDescription>
                            Assign one Focal Point to {selectedCarts.size} selected carts
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="space-y-2">
                            <Label>Select Focal Point</Label>
                            <Select value={bulkAssignUserId} onValueChange={setBulkAssignUserId}>
                                <SelectTrigger>
                                    <SelectValue placeholder="Choose Focal Point..." />
                                </SelectTrigger>
                                <SelectContent>
                                    {faUsers
                                        .filter(u => !selectedStadium || selectedStadium === 'all' || u.stadium?.id === selectedStadium)
                                        .map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name} {u.stadium ? `(${u.stadium.name})` : ''}
                                            </SelectItem>
                                        ))
                                    }
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkAssignModalOpen(false)}>Cancel</Button>
                        <Button onClick={handleBulkAssign} disabled={submitting || !bulkAssignUserId}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Assign to {selectedCarts.size} Carts
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

export default FleetManagementPage;