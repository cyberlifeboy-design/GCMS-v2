import { useState, useEffect, useRef } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { fleetApi, usersApi, stadiumsApi, departmentsApi, maintenanceApi, reportsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Search, Upload, Edit2, Trash2, UserCheck, Loader2, Shield, ChevronDown, Check, Wrench, Download } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';
import { Pagination } from '@/components/shared/Pagination';

interface FleetCart {
    id: string;
    carNumber: string;
    carType: 'Cargo' | 'Accessibility' | '6-Seater' | '4-Seater';
    status: 'Available' | 'Assigned' | 'Dispatched' | 'Under Maintenance';
    requiresVAP: boolean;
    stadium?: { id: string; name: string; code: string };
    department?: { id: string; name: string; code?: string };
    assignedUser?: { id: string; name: string; email: string };
}

const statusColors: Record<string, string> = {
    'Available': 'text-green-600 font-semibold',
    'Assigned': 'text-purple-600 font-semibold',
    'Dispatched': 'text-blue-600 font-semibold',
    'Under Maintenance': 'text-red-600 font-semibold',
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

// Multi-select dropdown component for car types
function CarTypeMultiSelect({
    selected,
    onChange,
}: {
    selected: string[];
    onChange: (types: string[]) => void;
}) {
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                setOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleType = (type: string) => {
        if (selected.includes(type)) {
            onChange(selected.filter(t => t !== type));
        } else {
            onChange([...selected, type]);
        }
    };

    const displayText = selected.length === 0
        ? 'All Types'
        : selected.length === 1
            ? selected[0]
            : `${selected.length} types selected`;

    return (
        <div ref={ref} className="relative">
            <button
                type="button"
                onClick={() => setOpen(!open)}
                className="flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring disabled:cursor-not-allowed disabled:opacity-50 [&>span]:line-clamp-1"
            >
                <span className={selected.length === 0 ? 'text-muted-foreground' : ''}>{displayText}</span>
                <ChevronDown className="ml-2 h-4 w-4 opacity-50" />
            </button>
            {open && (
                <div className="absolute z-50 mt-1 min-w-[8rem] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md animate-in fade-in-0 zoom-in-95">
                    <div className="p-1">
                        {CAR_TYPES.map(type => (
                            <div
                                key={type}
                                className="relative flex cursor-pointer select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                                onClick={() => toggleType(type)}
                            >
                                <span className="absolute left-2 flex h-3.5 w-3.5 items-center justify-center">
                                    {selected.includes(type) && <Check className="h-4 w-4" />}
                                </span>
                                <Badge className={carTypeColors[type]} variant="secondary">{type}</Badge>
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
}

export function FleetPage() {
    const { user } = useAuthStore();
    const role = user?.role;
    const isSuperAdmin = role === 'SuperAdmin';
    const isAdmin = role === 'SuperAdmin' || role === 'Admin';
    const isFA = role === 'FA';

    // URL params for filter persistence
    const [searchParams, setSearchParams] = useSearchParams();

    const [fleet, setFleet] = useState<FleetCart[]>([]);
    const [myCarts, setMyCarts] = useState<FleetCart[]>([]);
    const [faUsers, setFaUsers] = useState<Array<{ id: string; name: string; email: string; departmentId?: string; department?: { id: string; name: string } }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [stadiumsLoading, setStadiumsLoading] = useState(false);
    const [search, setSearch] = useState('');

    // Filters with URL persistence
    const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') || 'all');
    const [carTypeFilter, setCarTypeFilter] = useState<string[]>(() => {
        const carType = searchParams.get('carType');
        return carType ? carType.split(',').filter(t => CAR_TYPES.includes(t as typeof CAR_TYPES[number])) : [];
    });
    const [stadiumFilter, setStadiumFilter] = useState(() => searchParams.get('stadium') || 'all');
    const [departmentFilter, setDepartmentFilter] = useState(() => searchParams.get('department') || 'all');

    // Pagination state
    const [page, setPage] = useState(() => {
        const p = searchParams.get('page');
        return p ? parseInt(p, 10) || 1 : 1;
    });
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    // Modal states
    const [cartModal, setCartModal] = useState<{ open: boolean; mode: 'create' | 'edit'; cart?: FleetCart }>({ open: false, mode: 'create' });
    const [assignModal, setAssignModal] = useState<{ open: boolean; cart?: FleetCart }>({ open: false });
    const [deleteModal, setDeleteModal] = useState<{ open: boolean; cart?: FleetCart }>({ open: false });
    const [bulkModal, setBulkModal] = useState(false);
    const [maintModal, setMaintModal] = useState<{ open: boolean; cart?: FleetCart }>({ open: false });
    const [submitting, setSubmitting] = useState(false);

    // Form state
    const [formData, setFormData] = useState<CartFormData>(EMPTY_FORM);
    const [assignUserId, setAssignUserId] = useState('');
    const [bulkStadiumId, setBulkStadiumId] = useState('');
    const [maintForm, setMaintForm] = useState({ issueDescription: '' });
    const [maintPhotos, setMaintPhotos] = useState<File[]>([]);

    // Bulk import
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [importResult, setImportResult] = useState<string>('');

    // Update URL params when filters change
    useEffect(() => {
        const params = new URLSearchParams();
        if (statusFilter !== 'all') params.set('status', statusFilter);
        if (carTypeFilter.length > 0) params.set('carType', carTypeFilter.join(','));
        if (stadiumFilter !== 'all') params.set('stadium', stadiumFilter);
        if (departmentFilter !== 'all') params.set('department', departmentFilter);
        if (page > 1) params.set('page', page.toString());
        setSearchParams(params, { replace: true });
    }, [statusFilter, carTypeFilter, stadiumFilter, departmentFilter, page, setSearchParams]);

    const loadFleet = async () => {
        try {
            setLoading(true);
            const params: Record<string, unknown> = {
                ...(statusFilter !== 'all' && { status: statusFilter }),
                ...(carTypeFilter.length > 0 && { carType: carTypeFilter.join(',') }),
                ...(stadiumFilter !== 'all' && { stadiumId: stadiumFilter }),
                ...(departmentFilter !== 'all' && { departmentId: departmentFilter }),
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
    }, [statusFilter, carTypeFilter, stadiumFilter, departmentFilter, page]);

    // Load stadiums for SuperAdmin (to select venue when creating carts)
    useEffect(() => {
        if (isSuperAdmin && stadiums.length === 0) {
            loadStadiums();
        }
    }, [isSuperAdmin]);

    // Load departments for non-SuperAdmin users (based on their assigned stadium)
    useEffect(() => {
        if (!isSuperAdmin && user?.stadiumId && departments.length === 0) {
            loadDepartments(user.stadiumId);
        }
    }, [isSuperAdmin, user?.stadiumId]);

    // Handle stadium change in create/edit modal - reload FA users and departments
    const handleStadiumChange = async (stadiumId: string) => {
        setFormData(d => ({ ...d, stadiumId, assignedUserId: '', departmentId: '' }));
        if (stadiumId) {
            await loadFAUsers(stadiumId);
            await loadDepartments(stadiumId);
        }
    };

    // Handle car type filter changes
    const handleCarTypeFilterChange = (types: string[]) => {
        setCarTypeFilter(types);
        setPage(1); // Reset to first page when filter changes
    };

    // Handle stadium filter change - reload departments
    const handleStadiumFilterChange = async (stadiumId: string) => {
        setStadiumFilter(stadiumId);
        setDepartmentFilter('all');
        setPage(1);
        if (stadiumId && stadiumId !== 'all') {
            await loadDepartments(stadiumId);
        } else {
            setDepartments([]);
        }
    };

    // Export fleet to Excel
    const handleExportFleet = async () => {
        try {
            setSubmitting(true);
            const params = new URLSearchParams();
            if (statusFilter !== 'all') params.set('status', statusFilter);
            if (carTypeFilter.length > 0) params.set('carType', carTypeFilter.join(','));
            if (stadiumFilter !== 'all') params.set('stadiumId', stadiumFilter);
            if (departmentFilter !== 'all') params.set('departmentId', departmentFilter);

            const res = await reportsApi.exportFleet(params.toString());
            const blob = new Blob([res.data], {
                type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
            });
            const url = window.URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = `fleet_report_${new Date().toISOString().split('T')[0]}.xlsx`;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);
        } catch (e) {
            console.error(e);
            alert('Failed to export fleet');
        } finally {
            setSubmitting(false);
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

    const handleReportMaintenance = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!maintModal.cart) return;
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('fleetId', maintModal.cart.id);
            fd.append('issueDescription', maintForm.issueDescription);
            maintPhotos.forEach(f => fd.append('photos', f));
            await maintenanceApi.report(fd);
            setMaintModal({ open: false });
            setMaintForm({ issueDescription: '' });
            setMaintPhotos([]);
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
                alert(errorData?.error || 'Failed to report maintenance');
            }
        } finally {
            setSubmitting(false);
        }
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
                        <TableHead>FA Focal Point</TableHead>
                        <TableHead>Department</TableHead>
                        <TableHead>Stadium</TableHead>
                        {(isAdmin || isFA) && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {loading ? (
                        <TableRow><TableCell colSpan={(isAdmin || isFA) ? 8 : 7} className="text-center py-8">
                            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
                        </TableCell></TableRow>
                    ) : data.length === 0 ? (
                        <TableRow><TableCell colSpan={(isAdmin || isFA) ? 8 : 7} className="text-center py-8 text-muted-foreground">
                            No carts found
                        </TableCell></TableRow>
                    ) : data.map(cart => (
                        <TableRow key={cart.id}>
                            <TableCell className="text-center text-lg font-bold">{cart.carNumber}</TableCell>
                            <TableCell>
                                <Badge className={carTypeColors[cart.carType]} variant="secondary">{cart.carType}</Badge>
                            </TableCell>
                            <TableCell>
                                <span className={statusColors[cart.status]}>{cart.status}</span>
                            </TableCell>
                            <TableCell>
                                {cart.requiresVAP && <span title="Requires VAP"><Shield className="w-4 h-4 text-amber-500" /></span>}
                            </TableCell>
                            <TableCell>{cart.assignedUser?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell>{cart.department?.code || cart.department?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            <TableCell>{cart.stadium?.code || cart.stadium?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                            {(isAdmin || isFA) && (
                                <TableCell className="text-right">
                                    <div className="flex justify-end gap-1">
                                        {isAdmin && (
                                            <>
                                                <Button variant="ghost" size="sm" onClick={() => openAssign(cart)} title="Assign FA">
                                                    <UserCheck className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => openEdit(cart)} title="Edit">
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700" onClick={() => setDeleteModal({ open: true, cart })} title="Delete">
                                                    <Trash2 className="w-4 h-4" />
                                                </Button>
                                            </>
                                        )}
                                        <Button variant="ghost" size="sm" onClick={() => setMaintModal({ open: true, cart })} title="Report Maintenance">
                                            <Wrench className="w-4 h-4" />
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
                <div className="flex gap-2">
                    {!isFA && (
                        <Button variant="outline" onClick={handleExportFleet} disabled={submitting}>
                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
                            Export All
                        </Button>
                    )}
                    {isAdmin && (
                        <>
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
                        </>
                    )}
                </div>
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
                            <div className="flex gap-4 flex-wrap items-center">
                                <div className="relative flex-1 min-w-[200px]">
                                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                    <Input
                                        placeholder="Search by car number, type, or stadium…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                        className="pl-10"
                                    />
                                </div>
                                <Select value={statusFilter} onValueChange={v => { setStatusFilter(v); setPage(1); }}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="All Statuses" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Statuses</SelectItem>
                                        {STATUSES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                                <CarTypeMultiSelect
                                    selected={carTypeFilter}
                                    onChange={handleCarTypeFilterChange}
                                />
                                {isSuperAdmin && (
                                    <Select value={stadiumFilter} onValueChange={handleStadiumFilterChange}>
                                        <SelectTrigger className="w-40">
                                            <SelectValue placeholder="All Stadiums" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Stadiums</SelectItem>
                                            {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                )}
                                <Select value={departmentFilter} onValueChange={v => { setDepartmentFilter(v); setPage(1); }}>
                                    <SelectTrigger className="w-40">
                                        <SelectValue placeholder="All Departments" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Departments</SelectItem>
                                        {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
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
                                                <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>
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
                                value={formData.departmentId || '__none__'}
                                onValueChange={v => setFormData(d => ({ ...d, departmentId: v === '__none__' ? '' : v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select department (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">— None —</SelectItem>
                                    {departments.map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="assignedUserId">Assign to FA</Label>
                            <Select
                                value={formData.assignedUserId || '__none__'}
                                onValueChange={v => setFormData(d => ({ ...d, assignedUserId: v === '__none__' ? '' : v }))}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select FA (optional)" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">— Unassigned —</SelectItem>
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
                            <Select value={assignUserId || '__none__'} onValueChange={v => setAssignUserId(v === '__none__' ? '' : v)}>
                                <SelectTrigger><SelectValue placeholder="Select FA user" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">— Unassign —</SelectItem>
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
                                    {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
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

            {/* Report Maintenance Modal */}
            <Dialog open={maintModal.open} onOpenChange={o => setMaintModal(m => ({ ...m, open: o }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Report Maintenance</DialogTitle>
                        <DialogDescription>
                            Report an issue with cart <strong>{maintModal.cart?.carNumber}</strong>. This will change the cart status to "Under Maintenance".
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleReportMaintenance} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="maintIssue">Issue Description *</Label>
                            <textarea
                                id="maintIssue"
                                className="w-full min-h-[100px] p-3 border rounded-md text-sm"
                                value={maintForm.issueDescription}
                                onChange={e => setMaintForm(f => ({ ...f, issueDescription: e.target.value }))}
                                placeholder="Describe the maintenance issue in detail…"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="maintPhotos">Photos (optional, max 5)</Label>
                            <Input
                                id="maintPhotos"
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={e => setMaintPhotos(Array.from(e.target.files || []).slice(0, 5))}
                            />
                            {maintPhotos.length > 0 && (
                                <p className="text-xs text-muted-foreground">{maintPhotos.length} file(s) selected</p>
                            )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                            View all maintenance issues on the <Link to="/maintenance" className="text-primary hover:underline">Maintenance page</Link>.
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setMaintModal(m => ({ ...m, open: false }))}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Report Issue
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}