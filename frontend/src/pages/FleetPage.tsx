import { useState, useEffect, useRef } from 'react';
import { fleetApi, usersApi, stadiumsApi, departmentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Upload, Edit2, Trash2, UserCheck, Loader2, Shield } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';
import { Pagination } from '@/components/shared/Pagination';

interface FleetCart {
    id: string;
    carNumber: string;
    carType: 'Cargo' | 'Accessibility' | '6-Seater' | '4-Seater';
    status: 'Available' | 'Assigned' | 'Dispatched' | 'Under Maintenance';
    requiresVAP: boolean;
    stadium?: { id: string; name: string };
    department?: { id: string; name: string };
    assignedUser?: { id: string; name: string; email: string };
}

const statusColors: Record<string, string> = {
    'Available': 'bg-green-500 text-white',
    'Assigned': 'bg-purple-500 text-white',
    'Dispatched': 'bg-blue-500 text-white',
    'Under Maintenance': 'bg-red-500 text-white',
};

const CAR_TYPES = ['Cargo', 'Accessibility', '6-Seater', '4-Seater'] as const;
const STATUSES = ['Available', 'Assigned', 'Dispatched', 'Under Maintenance'] as const;

type CartFormData = {
    carNumber: string;
    carType: string;
    status: string;
    requiresVAP: boolean;
    stadiumId: string;
    assignedUserId: string;
    departmentId: string;
};

const EMPTY_FORM: CartFormData = {
    carNumber: '',
    carType: '4-Seater',
    status: 'Available',
    requiresVAP: false,
    stadiumId: '',
    assignedUserId: '',
    departmentId: '',
};

export function FleetPage() {
    const { user } = useAuthStore();
    const role = user?.role;
    const isSuperAdmin = role === 'SuperAdmin';
    const isAdmin = role === 'SuperAdmin' || role === 'Admin';
    const isFA = role === 'FA';

    const [fleet, setFleet] = useState<FleetCart[]>([]);
    const [myCarts, setMyCarts] = useState<FleetCart[]>([]);
    const [faUsers, setFaUsers] = useState<Array<{ id: string; name: string; email: string; departmentId?: string; department?: { id: string; name: string } }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [stadiumsLoading, setStadiumsLoading] = useState(false);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');

    // Pagination state
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    // Modal states
    const [cartModal, setCartModal] = useState<{ open: boolean; mode: 'create' | 'edit'; cart?: FleetCart }>({ open: false, mode: 'create' });
    const [assignModal, setAssignModal] = useState<{ open: boolean; cart?: FleetCart }>({ open: false });
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; cart?: FleetCart }>({ open: false });
    const [bulkModal, setBulkModal] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState<CartFormData>(EMPTY_FORM);
    const [assignUserId, setAssignUserId] = useState('');
    const [bulkStadiumId, setBulkStadiumId] = useState('');

    // Bulk import
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importResult, setImportResult] = useState<string>('');

    const loadFleet = async () => {
        try {
            setLoading(true);
            const params = {
                ...(statusFilter !== 'all' && { status: statusFilter }),
                page,
                limit: pagination.limit
            };
            const res = await fleetApi.getAll(params);
            setFleet(res.data.data || []);
            if (res.data.pagination) {
                setPagination(prev => ({ ...prev, ...res.data.pagination }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadMyCarts = async () => {
        try {
            const res = await fleetApi.getMyCarts();
            setMyCarts(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadFAUsers = async (stadiumId?: string) => {
        try {
            const params: Record<string, unknown> = { role: 'FA', isActive: true };
            if (stadiumId) params.stadiumId = stadiumId;
            const res = await usersApi.getAll(params);
            setFaUsers(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadDepartments = async (stadiumId?: string) => {
        try {
            const params: Record<string, unknown> = {};
            if (stadiumId) params.stadiumId = stadiumId;
            const res = await departmentsApi.getAll(params);
            setDepartments(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadStadiums = async () => {
        try {
            setStadiumsLoading(true);
            const res = await stadiumsApi.getAll();
            setStadiums(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setStadiumsLoading(false);
        }
    };

    useEffect(() => {
        if (isFA) {
            loadMyCarts();
        } else {
            loadFleet();
        }
    }, [statusFilter, page]);

    // Load stadiums for SuperAdmin (to select venue when creating carts)
    useEffect(() => {
        if (isSuperAdmin && stadiums.length === 0) {
            loadStadiums();
        }
    }, [isSuperAdmin]);

    // Handle stadium change in create/edit modal - reload FA users and departments
    const handleStadiumChange = async (stadiumId: string) => {
        setFormData(d => ({ ...d, stadiumId, assignedUserId: '', departmentId: '' }));
        if (stadiumId) {
            await loadFAUsers(stadiumId);
            await loadDepartments(stadiumId);
        }
    };

    const filteredFleet = fleet.filter(c =>
        c.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
        c.carType?.toLowerCase().includes(search.toLowerCase()) ||
        c.stadium?.name?.toLowerCase().includes(search.toLowerCase())
    );

    const filteredMyCarts = myCarts.filter(c =>
        c.carNumber?.toLowerCase().includes(search.toLowerCase())
    );

    const openCreate = async () => {
        // For non-SuperAdmin, use their assigned stadium
        const defaultStadiumId = isSuperAdmin ? '' : (user?.stadiumId || '');
        setFormData({ ...EMPTY_FORM, stadiumId: defaultStadiumId });
        // Load FA users and departments for the stadium
        await loadFAUsers(defaultStadiumId || user?.stadiumId);
        await loadDepartments(defaultStadiumId || user?.stadiumId);
        setCartModal({ open: true, mode: 'create' });
    };

    const openEdit = async (cart: FleetCart) => {
        setFormData({
            carNumber: cart.carNumber,
            carType: cart.carType,
            status: cart.status,
            requiresVAP: cart.requiresVAP,
            stadiumId: cart.stadium?.id || '',
            assignedUserId: cart.assignedUser?.id || '',
            departmentId: cart.department?.id || '',
        });
        // Load FA users and departments for editing
        await loadFAUsers(cart.stadium?.id || user?.stadiumId);
        await loadDepartments(cart.stadium?.id || user?.stadiumId);
        setCartModal({ open: true, mode: 'edit', cart });
    };

    const openAssign = async (cart: FleetCart) => {
        await loadFAUsers(cart.stadium?.id || user?.stadiumId);
        setAssignUserId(cart.assignedUser?.id || '');
        setAssignModal({ open: true, cart });
    };

    const handleSaveCart = async (e: React.FormEvent) => {
        e.preventDefault();

        // For non-SuperAdmin, ensure stadiumId comes from user's assignment
        const submitData = {
            carNumber: formData.carNumber.trim(),
            carType: formData.carType,
            status: formData.status || 'Available',
            requiresVAP: formData.requiresVAP || false,
            stadiumId: isSuperAdmin ? formData.stadiumId : (user?.stadiumId || formData.stadiumId),
            assignedUserId: formData.assignedUserId || null,
            departmentId: formData.departmentId || null,
        };

        if (!submitData.stadiumId) {
            alert('Please select a stadium');
            return;
        }
        if (!submitData.carNumber) {
            alert('Please enter a car number');
            return;
        }
        setSubmitting(true);
        try {
            if (cartModal.mode === 'create') {
                await fleetApi.create(submitData);
            } else {
                await fleetApi.update(cartModal.cart!.id, submitData);
            }
            setCartModal({ open: false, mode: 'create' });
            loadFleet();
        } catch (err: any) {
            const errorData = err.response?.data;
            if (errorData?.details?.length) {
                const messages = errorData.details.map((d: any) => {
                    const field = d.path?.join('.') || 'Field';
                    return `${field}: ${d.message}`;
                }).join('\n');
                alert(messages);
            } else {
                alert(errorData?.error || 'Failed to save cart');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteModal.cart) return;
        setSubmitting(true);
        try {
            await fleetApi.delete(deleteModal.cart.id);
            setDeleteModal({ open: false });
            loadFleet();
        } catch (err: any) {
            const errorData = err.response?.data;
            if (errorData?.details?.length) {
                const messages = errorData.details.map((d: any) => {
                    const field = d.path?.join('.') || 'Field';
                    return `${field}: ${d.message}`;
                }).join('\n');
                alert(messages);
            } else {
                alert(errorData?.error || 'Failed to delete cart');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssign = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!assignModal.cart) return;
        setSubmitting(true);
        try {
            await fleetApi.assignUser(assignModal.cart.id, assignUserId || null);
            setAssignModal({ open: false });
            loadFleet();
        } catch (err: any) {
            const errorData = err.response?.data;
            if (errorData?.details?.length) {
                const messages = errorData.details.map((d: any) => {
                    const field = d.path?.join('.') || 'Field';
                    return `${field}: ${d.message}`;
                }).join('\n');
                alert(messages);
            } else {
                alert(errorData?.error || 'Failed to assign user');
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const stadiumId = isSuperAdmin ? bulkStadiumId : (user?.stadiumId || '');
        if (!stadiumId) {
            alert('Stadium selection is required for bulk import.');
            if (fileInputRef.current) fileInputRef.current.value = '';
            return;
        }
        try {
            setSubmitting(true);
            const res = await fleetApi.bulkImport(file, stadiumId);
            const { created, errors } = res.data;
            setImportResult(`Imported ${created} carts. ${errors?.length ? `Errors: ${errors.length}` : ''}`);
            loadFleet();
            setBulkModal(false);
        } catch (err: any) {
            setImportResult(err.response?.data?.error || 'Import failed');
        } finally {
            setSubmitting(false);
        }
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const CartTable = ({ data }: { data: FleetCart[] }) => (
        <div className="flex flex-col">
            <Table>
                <TableHeader>
                    <TableRow>
                        <TableHead>Car #</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>VAP</TableHead>
                        <TableHead>Assigned FA</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Stadium</TableHead>
                        {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell></TableRow>
                    ) : data.length === 0 ? (
                        <TableRow><TableCell colSpan={isAdmin ? 8 : 7} className="text-center py-8 text-muted-foreground">
                            No carts found
                        </TableCell></TableRow>
                    ) : data.map(cart => (
                        <TableRow key={cart.id}>
                            <TableCell className="font-mono font-semibold">{cart.carNumber}</TableCell>
                            <TableCell>
                                <Badge className={carTypeColors[cart.carType]} variant="secondary">{cart.carType}</Badge>
                            </TableCell>
                            <TableCell>
                                <Badge className={statusColors[cart.status]}>{cart.status}</Badge>
                            </TableCell>
                            <TableCell>
                                {cart.requiresVAP && <span title="Requires VAP"><Shield className="w-4 h-4 text-amber-500" /></span>}
                            </TableCell>
                            <TableCell>{cart.assignedUser?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell>{cart.department?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell>{cart.stadium?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            {isAdmin && (
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => openAssign(cart)} title="Assign FA">
                                            <UserCheck className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" onClick={() => openEdit(cart)} title="Edit">
                                            <Edit2 className="w-4 h-4" />
                                        </Button>
                                        <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeleteModal({ open: true, cart })} title="Delete">
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>
                                </TableCell>
                            )}
                        </TableRow>
                    ))}
                </TableBody>
            </Table>
            {!isFA && (
                <Pagination
                    page={page}
                    totalPages={pagination.totalPages}
                    onPageChange={setPage}
                    total={pagination.total}
                    limit={pagination.limit}
                />
            )}
        </div>
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fleet Management</h1>
                {isAdmin && (
                    <div className="flex gap-2">
                        <input type="file" accept=".xlsx,.xls" ref={fileInputRef} onChange={handleBulkImport} className="hidden" />
                        <Button variant="outline" onClick={() => {
                            if (isSuperAdmin) {
                                setBulkModal(true);
                            } else {
                                fileInputRef.current?.click();
                            }
                        }}>
                            <Upload className="w-4 h-4 mr-2" />Bulk Import
                        </Button>
                        <Button onClick={openCreate}>
                            <Plus className="w-4 h-4 mr-2" />Add Cart
                        </Button>
                    </div>
                )}
            </div>

            {importResult && (
                <div className="text-sm text-muted-foreground bg-muted rounded p-3">{importResult}</div>
            )}

            <Tabs defaultValue={isFA ? 'my-carts' : 'all'}>
                {isFA && (
                    <TabsList>
                        <TabsTrigger value="my-carts">My Assigned Carts</TabsTrigger>
                    </TabsList>
                )}

                {!isFA && (
                    <Card>
                        <CardHeader>
                            <div className="flex gap-4">
                                <div className="relative flex-1">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by car number, type, or stadium…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                                    <SelectTrigger className="w-48">
                                        <SelectValue placeholder="All Statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <CartTable data={filteredFleet} />
                        </CardContent>
                    </Card>
                )}

                {isFA && (
                    <TabsContent value="my-carts">
                        <Card>
                            <CardHeader>
                                <div className="relative">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search my carts…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                            </CardHeader>
                            <CardContent className="p-0">
                                <CartTable data={filteredMyCarts} />
                            </CardContent>
                        </Card>
                    </TabsContent>
                )}
            </Tabs>

            {/* Create / Edit Cart Modal */}
            <Dialog open={cartModal.open} onOpenChange={o => setCartModal(m => ({ ...m, open: o }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{cartModal.mode === 'create' ? 'Add New Cart' : 'Edit Cart'}</DialogTitle>
                        <DialogDescription>
                            {cartModal.mode === 'create' ? 'Enter cart details below.' : `Editing cart ${cartModal.cart?.carNumber}`}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleSaveCart} className="space-y-4">
                        {cartModal.mode === 'create' ? (
                            isSuperAdmin ? (
                                <div className="space-y-2">
                                    <Label htmlFor="stadiumId">Stadium *</Label>
                                    <Select
                                        value={formData.stadiumId}
                                        onValueChange={v => handleStadiumChange(v)}
                                        disabled={stadiumsLoading}
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder={stadiumsLoading ? 'Loading...' : 'Select stadium'} />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stadiums.map(s => (
                                                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <Label>Stadium</Label>
                                    <Input value={stadiums.find(s => s.id === user?.stadiumId)?.name || 'Your assigned venue'} disabled className="bg-muted" />
                                    <p className="text-xs text-muted-foreground">Carts are created at your assigned venue</p>
                                    <input type="hidden" name="stadiumId" value={user?.stadiumId || ''} />
                                </div>
                            )
                        ) : (
                            <div className="space-y-2">
                                <Label>Stadium</Label>
                                <Input value={cartModal.cart?.stadium?.name || 'Unknown'} disabled className="bg-muted" />
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label htmlFor="carNumber">Car Number *</Label>
                            <Input id="carNumber" value={formData.carNumber}
                                onChange={e => setFormData(d => ({ ...d, carNumber: e.target.value }))}
                                placeholder="e.g. GC-001" required />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="carType">Car Type *</Label>
                            <Select value={formData.carType} onValueChange={v => setFormData(d => ({ ...d, carType: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {CAR_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="status">Status *</Label>
                            <Select value={formData.status} onValueChange={v => setFormData(d => ({ ...d, status: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="flex items-center gap-3">
                            <input type="checkbox" id="requiresVAP" checked={formData.requiresVAP}
                                onChange={e => setFormData(d => ({ ...d, requiresVAP: e.target.checked }))}
                                className="w-4 h-4 rounded" />
                            <Label htmlFor="requiresVAP" className="cursor-pointer">Requires VAP (VIP Access Pass)</Label>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="departmentId">Department</Label>
                            <Select
                                value={formData.departmentId}
                                onValueChange={v => setFormData(d => ({ ...d, departmentId: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select department (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">— None —</SelectItem>
                                    {departments.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="assignedUserId">Assign to FA</Label>
                            <Select
                                value={formData.assignedUserId}
                                onValueChange={v => setFormData(d => ({ ...d, assignedUserId: v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select FA (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">— Unassigned —</SelectItem>
                                    {faUsers.map(u => (
                                        <SelectItem key={u.id} value={u.id}>
                                            {u.name}{u.department?.name ? ` (${u.department.name})` : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            <p className="text-xs text-muted-foreground">Assign a Fleet Attendant to this cart during creation</p>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCartModal(m => ({ ...m, open: false }))}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {cartModal.mode === 'create' ? 'Add Cart' : 'Save Changes'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Assign FA Modal */}
            <Dialog open={assignModal.open} onOpenChange={o => setAssignModal(m => ({ ...m, open: o }))}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Assign FA User</DialogTitle>
                        <DialogDescription>Cart: {assignModal.cart?.carNumber}</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAssign} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Fleet Attendant</Label>
                            <Select value={assignUserId} onValueChange={setAssignUserId}>
                                <SelectTrigger><SelectValue placeholder="Select FA user" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">— Unassign —</SelectItem>
                                    {faUsers.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setAssignModal(m => ({ ...m, open: false }))}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirm Modal */}
            <Dialog open={deleteModal.open} onOpenChange={o => setDeleteModal(m => ({ ...m, open: o }))}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete Cart</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete cart <strong>{deleteModal.cart?.carNumber}</strong>? This cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteModal(m => ({ ...m, open: false }))}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Import Modal */}
            <Dialog open={bulkModal} onOpenChange={setBulkModal}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Bulk Import Carts</DialogTitle>
                        <DialogDescription>Select the stadium and upload your .xlsx or .xls file.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label>Target Stadium *</Label>
                            <Select value={bulkStadiumId} onValueChange={setBulkStadiumId}>
                                <SelectTrigger><SelectValue placeholder="Select stadium" /></SelectTrigger>
                                <SelectContent>
                                    {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        </div>
                        <Button className="w-full" disabled={!bulkStadiumId || submitting} onClick={() => fileInputRef.current?.click()}>
                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                            Choose File & Upload
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
