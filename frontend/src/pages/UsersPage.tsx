import { useState, useEffect, useRef, useMemo } from 'react';
import { usersApi, stadiumsApi, departmentsApi, requestsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
    Plus, Search, Upload, Loader2, ToggleLeft, ToggleRight, 
    Edit2, Download, Ban, CheckCircle, UserPlus, Trash2, 
    Shield, User as UserIcon, Users as UsersIcon, Building2, 
    MapPin, Mail, Phone, Hash, ShieldCheck, UserCog
} from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Pagination } from '@/components/shared/Pagination';
import { formatDate } from '@/lib/dateUtils';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: 'SuperAdmin' | 'Admin' | 'FA' | 'Observer' | 'Contracts' | 'MaintenanceTeam';
    accreditationNumber?: string;
    isActive: boolean;
    isBlocked?: boolean;
    assignAllStadiums?: boolean;
    stadium?: { id: string; name: string };
    department?: { id: string; name: string };
    createdAt: string;
}

interface CarRequest {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone?: string;
    stadium: { id: string; name: string };
    department: { id: string; name: string };
    status: string;
    createdAt: string;
}

const ROLES = ['SuperAdmin', 'Admin', 'FA', 'Observer', 'Contracts', 'MaintenanceTeam'] as const;

type UserFormData = {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: string;
    accreditationNumber: string;
    stadiumId: string;
    departmentId: string;
    assignAllStadiums: boolean;
};

const EMPTY_FORM: UserFormData = {
    name: '', email: '', password: '', phone: '', role: 'FA', accreditationNumber: '', stadiumId: '', departmentId: '', assignAllStadiums: false,
};

export function UsersPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isSuperAdmin = role === 'SuperAdmin';
    const isAdmin = role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [activeTab, setActiveTab] = useState<'system' | 'fa'>('system');
    const [systemUsers, setSystemUsers] = useState<User[]>([]);
    const [faUsers, setFaUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [faLoading, setFaLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Pagination state (system users only)
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    // Modals
    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editUser, setEditUser] = useState<User | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [importOpen, setImportOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM);
    const [editData, setEditData] = useState({ name: '', email: '', phone: '', role: '', accreditationNumber: '', stadiumId: '', departmentId: '', assignAllStadiums: false, newPassword: '' });
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string; stadiumId: string }>>([]);

    // Delete
    const [deleteUser, setDeleteUser] = useState<User | null>(null);
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleting, setDeleting] = useState(false);

    // Import from requests
    const [pendingRequests, setPendingRequests] = useState<CarRequest[]>([]);
    const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
    const [loadingRequests, setLoadingRequests] = useState(false);

    // Bulk
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [bulkData, setBulkData] = useState('');
    const [bulkError, setBulkError] = useState('');

    const loadSystemUsers = async () => {
        try {
            setLoading(true);
            const params: Record<string, unknown> = { 
                page, 
                limit: pagination.limit,
                // Include all roles except FA in the system users tab
                role: roleFilter !== 'all' ? roleFilter : undefined
            };
            
            // If filter is 'all', the backend will return all users.
            // We want to filter out FA users on the frontend for this specific tab if filter is 'all'
            
            const res = await usersApi.getAll(params);
            let data = res.data.data || [];
            
            if (roleFilter === 'all') {
                data = data.filter((u: User) => u.role !== 'FA');
            }

            setSystemUsers(data);
            if (res.data.pagination) {
                setPagination(prev => ({ ...prev, ...res.data.pagination }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadFaUsers = async () => {
        try {
            setFaLoading(true);
            const res = await usersApi.getAll({ role: 'FA', limit: 1000 });
            setFaUsers(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setFaLoading(false);
        }
    };

    useEffect(() => { loadSystemUsers(); }, [roleFilter, page]);
    useEffect(() => { loadFaUsers(); }, []);

    // Load stadiums and departments
    useEffect(() => {
        const loadMetadata = async () => {
            try {
                const [sRes, dRes] = await Promise.all([
                    stadiumsApi.getAll(),
                    departmentsApi.getAll()
                ]);
                setStadiums(sRes.data.data || []);
                setDepartments(dRes.data.data || []);
            } catch (e) {
                console.error(e);
            }
        };
        if (isSuperAdmin || isAdmin) loadMetadata();
    }, [isSuperAdmin, isAdmin]);

    const filteredSystemUsers = useMemo(() => {
        return systemUsers.filter(u => 
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase()) ||
            u.phone?.includes(search)
        );
    }, [systemUsers, search]);

    const filteredFaUsers = useMemo(() => {
        return faUsers.filter(u => 
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase()) ||
            u.phone?.includes(search) ||
            u.accreditationNumber?.toLowerCase().includes(search.toLowerCase())
        );
    }, [faUsers, search]);

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await usersApi.create({
                ...formData,
                password: formData.password || 'Admin@2024!',
                stadiumId: isSuperAdmin ? formData.stadiumId || undefined : currentUser?.stadiumId,
            });
            setCreateOpen(false);
            setFormData(EMPTY_FORM);
            loadSystemUsers();
            loadFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to create user');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteUser) return;
        setDeleting(true);
        try {
            await usersApi.delete(deleteUser.id);
            setDeleteConfirmOpen(false);
            setDeleteUser(null);
            loadSystemUsers();
            loadFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleStatus = async (u: User, type: 'active' | 'blocked') => {
        try {
            if (type === 'active') {
                await usersApi.setStatus(u.id, !u.isActive);
            } else {
                await usersApi.setBlocked(u.id, !u.isBlocked);
            }
            loadSystemUsers();
            loadFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update user status');
        }
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editUser) return;
        setSubmitting(true);
        try {
            await usersApi.update(editUser.id, {
                ...editData,
                password: editData.newPassword || undefined,
            });
            setEditOpen(false);
            setEditUser(null);
            loadSystemUsers();
            loadFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update user');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setBulkError('');
        try {
            let parsed: any[];
            try {
                parsed = JSON.parse(bulkData);
                if (!Array.isArray(parsed)) throw new Error('Must be array');
            } catch {
                const lines = bulkData.trim().split('\n');
                if (lines.length < 2) throw new Error('Invalid CSV');
                const headers = lines[0].split(',').map(h => h.trim());
                parsed = lines.slice(1).map(line => {
                    const vals = line.split(',').map(v => v.trim());
                    const obj: any = {};
                    headers.forEach((h, i) => { obj[h] = vals[i]; });
                    return obj;
                });
            }
            if (parsed.length === 0) { setBulkError('No users found'); return; }
            await usersApi.bulkCreate(parsed);
            setBulkOpen(false);
            setBulkData('');
            loadSystemUsers();
            loadFaUsers();
            alert(`Created ${parsed.length} users`);
        } catch (e: any) {
            setBulkError(e.message || 'Failed — check format (JSON array or CSV with headers: name,email,role,password)');
        }
    };

    const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = ev => setBulkData(ev.target?.result as string);
        reader.readAsText(f);
    };

    const loadPendingRequests = async () => {
        setLoadingRequests(true);
        try {
            const res = await requestsApi.getAll({ status: 'Approved' });
            setPendingRequests(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoadingRequests(false);
        }
    };

    const handleImportFromRequests = async () => {
        if (selectedRequests.size === 0) {
            alert('Please select at least one request to import');
            return;
        }
        setSubmitting(true);
        try {
            const result = await usersApi.importFromRequests(Array.from(selectedRequests));
            alert(result.data.message);
            setImportOpen(false);
            setSelectedRequests(new Set());
            loadSystemUsers();
            loadFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to import users');
        } finally {
            setSubmitting(false);
        }
    };

    const handleExport = () => {
        const targetUsers = activeTab === 'system' ? filteredSystemUsers : filteredFaUsers;
        const headers = ['Name', 'Email', 'Role', 'Phone', 'Accreditation', 'Stadium', 'Department', 'Status'];
        const csv = [
            headers.join(','),
            ...targetUsers.map(u => [
                u.name, u.email, u.role, u.phone || '', u.accreditationNumber || '',
                u.stadium?.name || '', u.department?.name || '', u.isActive ? 'Active' : 'Inactive'
            ].map(v => `"${v}"`).join(','))
        ].join('\n');
        
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `users_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    };

    const UserActionButtons = ({ u }: { u: User }) => (
        <div className="flex items-center justify-end gap-1">
            <Button variant="ghost" size="icon" onClick={() => {
                setEditUser(u);
                setEditData({
                    name: u.name, email: u.email, phone: u.phone || '', role: u.role,
                    accreditationNumber: u.accreditationNumber || '',
                    stadiumId: u.stadium?.id || '', departmentId: u.department?.id || '',
                    assignAllStadiums: u.assignAllStadiums || false, newPassword: ''
                });
                setEditOpen(true);
            }}>
                <Edit2 className="w-4 h-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u, 'blocked')} title={u.isBlocked ? 'Unblock' : 'Block'}>
                {u.isBlocked ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Ban className="w-4 h-4 text-amber-500" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={() => handleToggleStatus(u, 'active')} title={u.isActive ? 'Deactivate' : 'Activate'}>
                {u.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-muted-foreground" />}
            </Button>
            {isSuperAdmin && u.id !== currentUser?.id && (
                <Button variant="ghost" size="icon" onClick={() => { setDeleteUser(u); setDeleteConfirmOpen(true); }}>
                    <Trash2 className="w-4 h-4 text-red-500" />
                </Button>
            )}
        </div>
    );

    const UserTable = ({ data, showAccreditation = false }: { data: User[], showAccreditation?: boolean }) => (
        <div className="rounded-md border overflow-hidden">
            <Table>
                <TableHeader className="bg-muted/50">
                    <TableRow>
                        <TableHead className="w-[250px]">User Info</TableHead>
                        <TableHead>Role / Type</TableHead>
                        <TableHead>Location Details</TableHead>
                        {showAccreditation && <TableHead>Accreditation</TableHead>}
                        <TableHead>Status</TableHead>
                        {canManage && <TableHead className="text-right">Actions</TableHead>}
                    </TableRow>
                </TableHeader>
                <TableBody>
                    {data.length === 0 ? (
                        <TableRow>
                            <TableCell colSpan={canManage ? 6 : 5} className="h-32 text-center text-muted-foreground">
                                No users found in this category.
                            </TableCell>
                        </TableRow>
                    ) : (
                        data.map(u => (
                            <TableRow key={u.id} className="hover:bg-muted/30 transition-colors">
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <div className="flex items-center gap-2">
                                            <span className="font-semibold text-foreground">{u.name}</span>
                                            {u.isBlocked && <Badge variant="destructive" className="text-[10px] h-4 px-1">Blocked</Badge>}
                                        </div>
                                        <div className="flex items-center gap-3 text-xs text-muted-foreground">
                                            <div className="flex items-center gap-1"><Mail className="w-3 h-3" />{u.email}</div>
                                            {u.phone && <div className="flex items-center gap-1"><Phone className="w-3 h-3" />{u.phone}</div>}
                                        </div>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1">
                                        <Badge variant="outline" className={`w-fit font-medium ${
                                            u.role === 'SuperAdmin' ? 'border-purple-200 bg-purple-50 text-purple-700' :
                                            u.role === 'Admin' ? 'border-blue-200 bg-blue-50 text-blue-700' :
                                            u.role === 'FA' ? 'border-green-200 bg-green-50 text-green-700' :
                                            'border-gray-200 bg-gray-50 text-gray-700'
                                        }`}>
                                            {u.role === 'SuperAdmin' && <Shield className="w-3 h-3 mr-1" />}
                                            {u.role === 'Admin' && <UserCog className="w-3 h-3 mr-1" />}
                                            {u.role === 'FA' && <UsersIcon className="w-3 h-3 mr-1" />}
                                            {u.role === 'Observer' && <UserIcon className="w-3 h-3 mr-1" />}
                                            {u.role}
                                        </Badge>
                                    </div>
                                </TableCell>
                                <TableCell>
                                    <div className="flex flex-col gap-1 text-xs">
                                        <div className="flex items-center gap-1.5 font-medium text-foreground">
                                            <MapPin className="w-3 h-3 text-muted-foreground" />
                                            {u.assignAllStadiums ? 'All Stadiums' : (u.stadium?.name || 'No Stadium')}
                                        </div>
                                        {u.department && (
                                            <div className="flex items-center gap-1.5 text-muted-foreground">
                                                <Building2 className="w-3 h-3" />
                                                {u.department.name}
                                            </div>
                                        )}
                                    </div>
                                </TableCell>
                                {showAccreditation && (
                                    <TableCell>
                                        {u.accreditationNumber ? (
                                            <div className="flex items-center gap-1.5 text-sm font-mono text-muted-foreground">
                                                <Hash className="w-3 h-3" />
                                                {u.accreditationNumber}
                                            </div>
                                        ) : '—'}
                                    </TableCell>
                                )}
                                <TableCell>
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-green-500 animate-pulse' : 'bg-red-400'}`} />
                                        <span className={`text-xs font-medium ${u.isActive ? 'text-green-700' : 'text-red-600'}`}>
                                            {u.isActive ? 'Active' : 'Inactive'}
                                        </span>
                                    </div>
                                </TableCell>
                                {canManage && (
                                    <TableCell className="text-right">
                                        <UserActionButtons u={u} />
                                    </TableCell>
                                )}
                            </TableRow>
                        ))
                    )}
                </TableBody>
            </Table>
        </div>
    );

    return (
        <div className="container mx-auto py-6 space-y-8 animate-in fade-in duration-500">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-extrabold tracking-tight">User Management</h1>
                    <p className="text-muted-foreground mt-1">Manage system administrators, venue admins, and field assistants.</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleExport} className="h-9">
                        <Download className="w-4 h-4 mr-2" /> Export
                    </Button>
                    {isSuperAdmin && (
                        <Button variant="outline" onClick={() => { loadPendingRequests(); setImportOpen(true); }} className="h-9">
                            <UserPlus className="w-4 h-4 mr-2" /> Import
                        </Button>
                    )}
                    {canManage && (
                        <>
                            <input type="file" accept=".csv,.json" ref={fileInputRef} onChange={handleFileRead} className="hidden" />
                            <Button variant="outline" onClick={() => { setBulkData(''); setBulkError(''); setBulkOpen(true); }} className="h-9">
                                <Upload className="w-4 h-4 mr-2" /> Bulk Upload
                            </Button>
                            <Button onClick={() => { setFormData(EMPTY_FORM); setCreateOpen(true); }} className="h-9 bg-primary hover:bg-primary/90 shadow-sm">
                                <Plus className="w-4 h-4 mr-2" /> Add User
                            </Button>
                        </>
                    )}
                </div>
            </div>

            {/* Filter Card */}
            <Card className="border-none shadow-sm bg-muted/30">
                <CardContent className="p-4">
                    <div className="flex flex-col md:flex-row gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, phone, or accreditation..."
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-9 h-10 border-none shadow-none focus-visible:ring-1 ring-primary/20 bg-background"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-full md:w-48 h-10 border-none bg-background shadow-none">
                                <SelectValue placeholder="Filter by Role" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardContent>
            </Card>

            {/* Content Tabs */}
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6 h-12 p-1 bg-muted/50 rounded-xl">
                    <TabsTrigger value="system" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <ShieldCheck className="w-4 h-4 mr-2" />
                        System Users
                        {!loading && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 h-4">{systemUsers.length}</Badge>}
                    </TabsTrigger>
                    <TabsTrigger value="fa" className="rounded-lg data-[state=active]:bg-background data-[state=active]:shadow-sm">
                        <UsersIcon className="w-4 h-4 mr-2" />
                        FA Department Users
                        {!faLoading && <Badge variant="secondary" className="ml-2 text-[10px] px-1.5 h-4">{faUsers.length}</Badge>}
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="system" className="mt-0 outline-none">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-blue-50/50 to-transparent dark:from-blue-950/10 border-b py-4">
                            <CardTitle className="text-lg flex items-center gap-2 text-blue-800 dark:text-blue-300">
                                <ShieldCheck className="w-5 h-5" />
                                System Administrators & Observers
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {loading ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground animate-pulse">Loading system users...</p>
                                </div>
                            ) : (
                                <>
                                    <UserTable data={filteredSystemUsers} />
                                    <Pagination
                                        page={page}
                                        totalPages={pagination.totalPages}
                                        onPageChange={setPage}
                                        total={pagination.total}
                                        limit={pagination.limit}
                                    />
                                </>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="fa" className="mt-0 outline-none">
                    <Card className="border-none shadow-sm overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-green-50/50 to-transparent dark:from-green-950/10 border-b py-4">
                            <CardTitle className="text-lg flex items-center gap-2 text-green-800 dark:text-green-300">
                                <UsersIcon className="w-5 h-5" />
                                Fleet Attendants (Field Operations)
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            {faLoading ? (
                                <div className="flex flex-col items-center justify-center h-64 gap-3">
                                    <Loader2 className="w-8 h-8 animate-spin text-primary" />
                                    <p className="text-sm text-muted-foreground animate-pulse">Loading FA users...</p>
                                </div>
                            ) : (
                                <div className="max-h-[600px] overflow-y-auto">
                                    <UserTable data={filteredFaUsers} showAccreditation={true} />
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>

            {/* Create User Modal */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Add New User</DialogTitle>
                        <DialogDescription>Create a new system user or field assistant.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Full Name *</Label>
                                <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} required placeholder="John Doe" />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Email *</Label>
                                <Input type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} required placeholder="john@example.com" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Phone</Label>
                                    <Input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="+1..." />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Role *</Label>
                                    <Select value={formData.role} onValueChange={v => setFormData(f => ({ ...f, role: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {isSuperAdmin ? ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>) : (
                                                <SelectItem value="FA">FA</SelectItem>
                                            )}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            {formData.role === 'FA' && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Accreditation Number</Label>
                                    <Input value={formData.accreditationNumber} onChange={e => setFormData(f => ({ ...f, accreditationNumber: e.target.value }))} placeholder="ACC-12345" />
                                </div>
                            )}
                            {isSuperAdmin && (
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Stadium / Venue</Label>
                                    <Select value={formData.stadiumId || '__none__'} onValueChange={v => {
                                        const val = v === '__none__' ? '' : v;
                                        setFormData(f => ({ ...f, stadiumId: val, departmentId: '' }));
                                    }}>
                                        <SelectTrigger><SelectValue placeholder="Select stadium" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No Stadium</SelectItem>
                                            {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            )}
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Department</Label>
                                <Select
                                    value={formData.departmentId || '__none__'}
                                    onValueChange={v => setFormData(f => ({ ...f, departmentId: v === '__none__' ? '' : v }))}
                                >
                                    <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No Department</SelectItem>
                                        {departments.filter(d => !formData.stadiumId || d.stadiumId === formData.stadiumId).map(d => (
                                            <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Password (default: Admin@2024!)</Label>
                                <Input type="password" value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank for default" />
                            </div>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting} className="min-w-[120px]">
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create User
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Upload Modal */}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent className="max-w-lg rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Bulk Upload Users</DialogTitle>
                        <DialogDescription>Upload a CSV or paste a JSON array.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkCreate} className="space-y-4">
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="w-4 h-4 mr-2" /> Choose File (.csv or .json)
                        </Button>
                        <textarea
                            className="w-full h-44 p-3 border rounded-md font-mono text-sm"
                            placeholder={`JSON example:\n[\n  {"name":"Jane","email":"jane@gcms.com","role":"FA","password":"pass123"}\n]`}
                            value={bulkData}
                            onChange={e => setBulkData(e.target.value)}
                        />
                        {bulkError && <p className="text-sm text-red-500">{bulkError}</p>}
                        <DialogFooter>
                            <Button type="button" variant="ghost" onClick={() => { setBulkOpen(false); setBulkData(''); setBulkError(''); }}>Cancel</Button>
                            <Button type="submit">Upload</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Import from Requests Modal */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Import from Car Requests</DialogTitle>
                        <DialogDescription>Select approved car requests to create FA Focal Point users.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {loadingRequests ? (
                            <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin" /></div>
                        ) : pendingRequests.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No approved requests available to import.</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead className="w-10"></TableHead>
                                        <TableHead>Name</TableHead>
                                        <TableHead>Email</TableHead>
                                        <TableHead>Stadium</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {pendingRequests.map(r => (
                                        <TableRow key={r.id}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedRequests.has(r.id)}
                                                    onCheckedChange={(checked) => {
                                                        const newSet = new Set(selectedRequests);
                                                        if (checked) newSet.add(r.id);
                                                        else newSet.delete(r.id);
                                                        setSelectedRequests(newSet);
                                                    }}
                                                />
                                            </TableCell>
                                            <TableCell>{r.requesterName}</TableCell>
                                            <TableCell>{r.requesterEmail}</TableCell>
                                            <TableCell>{r.stadium?.name}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setImportOpen(false)}>Cancel</Button>
                        <Button onClick={handleImportFromRequests} disabled={submitting || selectedRequests.size === 0}>
                            Import Selected ({selectedRequests.size})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Modal */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-w-md rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold">Edit User Profile</DialogTitle>
                        <DialogDescription>Modify user settings and access levels.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEdit} className="space-y-4 pt-4">
                        <div className="grid grid-cols-1 gap-4">
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Full Name</Label>
                                <Input value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Email Address</Label>
                                <Input value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Phone</Label>
                                    <Input value={editData.phone} onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))} />
                                </div>
                                <div className="space-y-2">
                                    <Label className="text-sm font-semibold">Role</Label>
                                    <Select value={editData.role} onValueChange={v => setEditData(d => ({ ...d, role: v }))} disabled={!isSuperAdmin}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">Accreditation Number</Label>
                                <Input value={editData.accreditationNumber} onChange={e => setEditData(d => ({ ...d, accreditationNumber: e.target.value }))} />
                            </div>
                            <div className="space-y-2">
                                <Label className="text-sm font-semibold">New Password (leave blank to keep unchanged)</Label>
                                <Input type="password" value={editData.newPassword} onChange={e => setEditData(d => ({ ...d, newPassword: e.target.value }))} autoComplete="new-password" />
                            </div>
                        </div>
                        <DialogFooter className="pt-4">
                            <Button type="button" variant="ghost" onClick={() => setEditOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting} className="min-w-[120px]">
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="max-w-sm rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold text-red-600">Delete User Account</DialogTitle>
                        <DialogDescription className="pt-2">
                            This will permanently remove <strong>{deleteUser?.name}</strong> from the system. This action is irreversible.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter className="pt-6">
                        <Button type="button" variant="ghost" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting} className="min-w-[100px]">
                            {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}