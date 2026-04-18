import { useState, useEffect, useRef } from 'react';
import { usersApi, stadiumsApi, departmentsApi, requestsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Upload, Loader2, ToggleLeft, ToggleRight, Edit2, Download, Ban, CheckCircle, UserPlus, Trash2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Pagination } from '@/components/shared/Pagination';
import { formatDate } from '@/lib/dateUtils';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';
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

const ROLES = ['SuperAdmin', 'Admin', 'FA', 'Observer'] as const;
const ROLE_ORDER = ['SuperAdmin', 'Admin', 'Observer', 'FA'] as const;

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

    const [users, setUsers] = useState<User[]>([]);
    const [allFaUsers, setAllFaUsers] = useState<User[]>([]);
    const [faLoading, setFaLoading] = useState(true);
    const [loading, setLoading] = useState(true);
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

    const loadUsers = async () => {
        try {
            setLoading(true);
            // Only load non-FA system users with pagination
            const params: Record<string, unknown> = { page, limit: pagination.limit };
            if (roleFilter !== 'all' && roleFilter !== 'FA') {
                params.role = roleFilter;
            } else if (roleFilter === 'all') {
                // Exclude FA from paginated system users — FA users loaded separately
                params.excludeRole = 'FA';
            } else {
                // roleFilter === 'FA' — system users section is empty
                setUsers([]);
                setLoading(false);
                return;
            }
            const res = await usersApi.getAll(params);
            setUsers(res.data.data || []);
            if (res.data.pagination) {
                setPagination(prev => ({ ...prev, ...res.data.pagination }));
            }
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadAllFaUsers = async () => {
        try {
            setFaLoading(true);
            const res = await usersApi.getAll({ role: 'FA', limit: 500 });
            setAllFaUsers(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setFaLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, [roleFilter, page]);
    useEffect(() => { loadAllFaUsers(); }, []);

    // Load stadiums for SuperAdmin
    useEffect(() => {
        if (isSuperAdmin && stadiums.length === 0) {
            loadStadiums();
        }
    }, [isSuperAdmin]);

    // Load departments when stadiums load or when Admin views
    useEffect(() => {
        if ((isSuperAdmin || isAdmin) && departments.length === 0) {
            loadDepartments();
        }
    }, [isSuperAdmin, isAdmin]);

    const loadStadiums = async () => {
        try {
            const res = await stadiumsApi.getAll();
            setStadiums(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const loadDepartments = async (stadiumId?: string) => {
        try {
            const params = stadiumId ? { stadiumId } : {};
            const res = await departmentsApi.getAll(params);
            setDepartments(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    const filtered = users.filter(u => {
        const matchSearch =
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase()) ||
            u.phone?.includes(search) ||
            u.accreditationNumber?.toLowerCase().includes(search.toLowerCase());
        return matchSearch;
    });

    // Group users by role
    const groupedUsers = () => {
        const groups: Record<string, User[]> = {};
        ROLE_ORDER.forEach(r => { groups[r] = []; });
        filtered.forEach(u => {
            if (groups[u.role]) {
                groups[u.role].push(u);
            }
        });
        return groups;
    };

    const handleCreate = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await usersApi.create({
                name: formData.name,
                email: formData.email,
                password: formData.password || 'changeme123',
                phone: formData.phone || undefined,
                role: formData.role,
                accreditationNumber: formData.accreditationNumber || undefined,
                stadiumId: isSuperAdmin ? formData.stadiumId || undefined : currentUser?.stadiumId,
                departmentId: formData.departmentId || undefined,
                assignAllStadiums: formData.assignAllStadiums,
            });
            setCreateOpen(false);
            setFormData(EMPTY_FORM);
            loadUsers();
            loadAllFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to create user');
        } finally {
            setSubmitting(false);
        }
    };

    const openDeleteConfirm = (u: User) => {
        setDeleteUser(u);
        setDeleteConfirmOpen(true);
    };

    const handleDelete = async () => {
        if (!deleteUser) return;
        setDeleting(true);
        try {
            await usersApi.delete(deleteUser.id);
            setDeleteConfirmOpen(false);
            setDeleteUser(null);
            loadUsers();
            loadAllFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to delete user');
        } finally {
            setDeleting(false);
        }
    };

    const handleToggleActive = async (u: User) => {
        try {
            await usersApi.setStatus(u.id, !u.isActive);
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
            setAllFaUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update status');
        }
    };

    const handleToggleBlocked = async (u: User) => {
        try {
            await usersApi.setBlocked(u.id, !u.isBlocked);
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isBlocked: !u.isBlocked } : x));
            setAllFaUsers(prev => prev.map(x => x.id === u.id ? { ...x, isBlocked: !u.isBlocked } : x));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update block status');
        }
    };

    const openEdit = (u: User) => {
        setEditUser(u);
        setEditData({
            name: u.name || '',
            email: u.email || '',
            phone: u.phone || '',
            role: u.role || 'FA',
            accreditationNumber: u.accreditationNumber || '',
            stadiumId: u.stadium?.id || '',
            departmentId: u.department?.id || '',
            assignAllStadiums: u.assignAllStadiums || false,
            newPassword: '',
        });
        setEditOpen(true);
    };

    const handleEdit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editUser) return;
        setSubmitting(true);
        try {
            await usersApi.update(editUser.id, {
                name: editData.name,
                email: editData.email,
                phone: editData.phone || undefined,
                role: editData.role as any,
                accreditationNumber: editData.accreditationNumber || undefined,
                stadiumId: isSuperAdmin ? editData.stadiumId || undefined : undefined,
                departmentId: editData.departmentId || undefined,
                assignAllStadiums: editData.assignAllStadiums,
                ...(isSuperAdmin && editData.newPassword ? { password: editData.newPassword } : {}),
            });
            setEditOpen(false);
            setEditUser(null);
            loadUsers();
            loadAllFaUsers();
        } catch (err: any) {
            const errorData = err.response?.data;
            if (errorData?.details?.length) {
                const messages = errorData.details.map((d: any) => `${d.path?.join('.')}: ${d.message}`).join('\n');
                alert(messages);
            } else {
                alert(errorData?.error || 'Failed to update user');
            }
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
            loadUsers();
            loadAllFaUsers();
            alert(`Created ${parsed.length} users`);
        } catch {
            setBulkError('Failed — check format (JSON array or CSV with headers: name,email,role,password)');
        }
    };

    const handleFileRead = (e: React.ChangeEvent<HTMLInputElement>) => {
        const f = e.target.files?.[0];
        if (!f) return;
        const reader = new FileReader();
        reader.onload = ev => setBulkData(ev.target?.result as string);
        reader.readAsText(f);
    };

    // Load pending requests for import
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
            loadUsers();
            loadAllFaUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to import users');
        } finally {
            setSubmitting(false);
        }
    };

    // Export users to Excel
    const handleExport = async () => {
        try {
            const res = await usersApi.getAll({ limit: 1000 }); // Get all users
            const usersData = res.data.data || [];

            // Create CSV content
            const headers = ['Name', 'Email', 'Phone', 'Role', 'Accreditation Number', 'Status', 'Blocked', 'Stadium', 'Department', 'Assign All Stadiums', 'Created At'];
            const rows = usersData.map((u: User) => [
                u.name,
                u.email,
                u.phone || '',
                u.role,
                u.accreditationNumber || '',
                u.isActive ? 'Active' : 'Inactive',
                u.isBlocked ? 'Yes' : 'No',
                u.stadium?.name || '',
                u.department?.name || '',
                u.assignAllStadiums ? 'Yes' : 'No',
                formatDate(u.createdAt),
            ]);

            const csvContent = [
                headers.join(','),
                ...rows.map((row: string[]) => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            ].join('\n');

            // Download
            const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
            const link = document.createElement('a');
            link.href = URL.createObjectURL(blob);
            link.download = `users_export_${new Date().toISOString().split('T')[0]}.csv`;
            link.click();
            URL.revokeObjectURL(link.href);
        } catch (err) {
            console.error(err);
            alert('Failed to export users');
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">User Management</h1>
                <div className="flex gap-2 flex-wrap">
                    <Button variant="outline" onClick={handleExport}>
                        <Download className="w-4 h-4 mr-2" />Export
                    </Button>
                    {isSuperAdmin && (
                        <Button variant="outline" onClick={() => { loadPendingRequests(); setImportOpen(true); }}>
                            <UserPlus className="w-4 h-4 mr-2" />Import from Requests
                        </Button>
                    )}
                    {canManage && (
                        <>
                            <input type="file" accept=".csv,.json" ref={fileInputRef} onChange={handleFileRead} className="hidden" />
                            <Button variant="outline" onClick={() => { setBulkData(''); setBulkError(''); setBulkOpen(true); }}>
                                <Upload className="w-4 h-4 mr-2" />Bulk Upload
                            </Button>
                            <Button onClick={() => { setFormData(EMPTY_FORM); setCreateOpen(true); }}>
                                <Plus className="w-4 h-4 mr-2" />Add User
                            </Button>
                        </>
                    )}
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, phone, or accreditation number…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={v => { setRoleFilter(v); setPage(1); }}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="All Roles" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent className="p-0">
                    {(() => {
                        const groups = groupedUsers();

                        const renderRoleSection = (roleKey: string, showAccreditation: boolean) => {
                            const roleUsers = groups[roleKey];
                            if (!roleUsers || roleUsers.length === 0) return null;
                            return (
                                <div key={roleKey} className="border-b last:border-b-0">
                                    <div className="bg-muted/50 px-4 py-2 font-semibold text-sm flex items-center gap-2">
                                        <span>{roleKey}</span>
                                        <span className="text-muted-foreground">({roleUsers.length})</span>
                                    </div>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Name</TableHead>
                                                <TableHead>User Type</TableHead>
                                                <TableHead>Email</TableHead>
                                                <TableHead>Phone</TableHead>
                                                {showAccreditation && <TableHead>Accreditation #</TableHead>}
                                                <TableHead>Stadium</TableHead>
                                                <TableHead>Department</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead>Blocked</TableHead>
                                                {canManage && <TableHead className="text-right">Actions</TableHead>}
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {roleUsers.map(u => (
                                                <TableRow key={u.id}>
                                                    <TableCell className="font-medium">{u.name}</TableCell>
                                                    <TableCell className="text-sm text-muted-foreground">{u.role}</TableCell>
                                                    <TableCell>{u.email}</TableCell>
                                                    <TableCell>{u.phone || '—'}</TableCell>
                                                    {showAccreditation && <TableCell>{u.accreditationNumber || '—'}</TableCell>}
                                                    <TableCell>{u.assignAllStadiums ? 'All Stadiums' : (u.stadium?.name || '—')}</TableCell>
                                                    <TableCell>{u.department?.name || '—'}</TableCell>
                                                    <TableCell>
                                                        <Badge className={u.isActive ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}>
                                                            {u.isActive ? 'Active' : 'Inactive'}
                                                        </Badge>
                                                    </TableCell>
                                                    <TableCell>
                                                        {u.isBlocked ? (
                                                            <Badge className="bg-red-600 text-white"><Ban className="w-3 h-3 mr-1" />Blocked</Badge>
                                                        ) : (
                                                            <Badge className="bg-gray-200 text-gray-600">No</Badge>
                                                        )}
                                                    </TableCell>
                                                    {canManage && (
                                                        <TableCell className="text-right">
                                                            <div className="flex gap-1 justify-end">
                                                                <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Edit user">
                                                                    <Edit2 className="w-4 h-4" />
                                                                </Button>
                                                                        {(role === 'Admin' || role === 'SuperAdmin') && (<>
                                                                        {isSuperAdmin && u.id !== currentUser?.id && (
                                                                            <Button
                                                                                variant="ghost"
                                                                                size="sm"
                                                                                onClick={() => openDeleteConfirm(u)}
                                                                                title="Delete user"
                                                                            >
                                                                                <Trash2 className="w-4 h-4 text-red-500" />
                                                                            </Button>
                                                                        )}
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => handleToggleBlocked(u)}
                                                                            title={u.isBlocked ? 'Unblock user' : 'Block user'}
                                                                        >
                                                                            {u.isBlocked
                                                                                ? <CheckCircle className="w-4 h-4 text-green-600" />
                                                                                : <Ban className="w-4 h-4 text-gray-400" />}
                                                                        </Button>
                                                                        <Button
                                                                            variant="ghost"
                                                                            size="sm"
                                                                            onClick={() => handleToggleActive(u)}
                                                                            title={u.isActive ? 'Deactivate' : 'Activate'}
                                                                        >
                                                                            {u.isActive
                                                                                ? <ToggleRight className="w-5 h-5 text-green-600" />
                                                                                : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                                                        </Button>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </TableCell>
                                                    )}
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </div>
                            );
                        };

                        const systemUsersList = [...(['SuperAdmin', 'Admin', 'Observer'] as const)].flatMap(r => groups[r] || []);

                        // FA users come from separate state (scrollable, no pagination)
                        const filteredFaUsers = allFaUsers.filter(u => {
                            const matchSearch =
                                u.name?.toLowerCase().includes(search.toLowerCase()) ||
                                u.email?.toLowerCase().includes(search.toLowerCase()) ||
                                u.phone?.includes(search) ||
                                u.accreditationNumber?.toLowerCase().includes(search.toLowerCase());
                            return matchSearch;
                        });

                        const renderFaRow = (u: User) => (
                            <TableRow key={u.id}>
                                <TableCell className="font-medium">{u.name}</TableCell>
                                <TableCell className="text-sm text-muted-foreground">{u.role}</TableCell>
                                <TableCell>{u.email}</TableCell>
                                <TableCell>{u.phone || '—'}</TableCell>
                                <TableCell>{u.accreditationNumber || '—'}</TableCell>
                                <TableCell>{u.assignAllStadiums ? 'All Stadiums' : (u.stadium?.name || '—')}</TableCell>
                                <TableCell>{u.department?.name || '—'}</TableCell>
                                <TableCell>
                                    <Badge className={u.isActive ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}>
                                        {u.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                </TableCell>
                                <TableCell>
                                    {u.isBlocked ? (
                                        <Badge className="bg-red-600 text-white"><Ban className="w-3 h-3 mr-1" />Blocked</Badge>
                                    ) : (
                                        <Badge className="bg-gray-200 text-gray-600">No</Badge>
                                    )}
                                </TableCell>
                                {canManage && (
                                    <TableCell className="text-right">
                                        <div className="flex gap-1 justify-end">
                                            <Button variant="ghost" size="sm" onClick={() => openEdit(u)} title="Edit user">
                                                <Edit2 className="w-4 h-4" />
                                            </Button>
                                            {(role === 'Admin' || role === 'SuperAdmin') && (<>
                                                {isSuperAdmin && u.id !== currentUser?.id && (
                                                    <Button variant="ghost" size="sm" onClick={() => openDeleteConfirm(u)} title="Delete user">
                                                        <Trash2 className="w-4 h-4 text-red-500" />
                                                    </Button>
                                                )}
                                                <Button variant="ghost" size="sm" onClick={() => handleToggleBlocked(u)} title={u.isBlocked ? 'Unblock user' : 'Block user'}>
                                                    {u.isBlocked ? <CheckCircle className="w-4 h-4 text-green-600" /> : <Ban className="w-4 h-4 text-gray-400" />}
                                                </Button>
                                                <Button variant="ghost" size="sm" onClick={() => handleToggleActive(u)} title={u.isActive ? 'Deactivate' : 'Activate'}>
                                                    {u.isActive ? <ToggleRight className="w-5 h-5 text-green-600" /> : <ToggleLeft className="w-5 h-5 text-gray-400" />}
                                                </Button>
                                            </>)}
                                        </div>
                                    </TableCell>
                                )}
                            </TableRow>
                        );

                        return (
                            <>
                                {(roleFilter === 'all' || roleFilter !== 'FA') && systemUsersList.length > 0 && (
                                    <div>
                                        <div className="bg-blue-50 dark:bg-blue-950/30 px-4 py-2 text-sm font-bold text-blue-800 dark:text-blue-300 border-b flex items-center gap-2">
                                            🔧 System Users
                                            <span className="font-normal text-muted-foreground">({systemUsersList.length})</span>
                                        </div>
                                        {(['SuperAdmin', 'Admin', 'Observer'] as const).map(r => renderRoleSection(r, false))}
                                    </div>
                                )}
                                {(roleFilter === 'all' || roleFilter === 'FA') && (
                                    <div>
                                        <div className="bg-green-50 dark:bg-green-950/30 px-4 py-2 text-sm font-bold text-green-800 dark:text-green-300 border-b flex items-center gap-2">
                                            🏟️ FA Department Users
                                            <span className="font-normal text-muted-foreground">({filteredFaUsers.length})</span>
                                        </div>
                                        {faLoading ? (
                                            <div className="text-center py-6"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></div>
                                        ) : filteredFaUsers.length === 0 ? (
                                            <div className="text-center py-6 text-muted-foreground">No FA users found</div>
                                        ) : (
                                            <div className="max-h-[600px] overflow-y-auto">
                                                <Table>
                                                    <TableHeader>
                                                        <TableRow>
                                                            <TableHead>Name</TableHead>
                                                            <TableHead>User Type</TableHead>
                                                            <TableHead>Email</TableHead>
                                                            <TableHead>Phone</TableHead>
                                                            <TableHead>Accreditation #</TableHead>
                                                            <TableHead>Stadium</TableHead>
                                                            <TableHead>Department</TableHead>
                                                            <TableHead>Status</TableHead>
                                                            <TableHead>Blocked</TableHead>
                                                            {canManage && <TableHead className="text-right">Actions</TableHead>}
                                                        </TableRow>
                                                    </TableHeader>
                                                    <TableBody>
                                                        {filteredFaUsers.map(renderFaRow)}
                                                    </TableBody>
                                                </Table>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </>
                        );
                    })()}
                    {loading && (
                        <div className="text-center py-8">
                            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                        </div>
                    )}
                    {!loading && filtered.length === 0 && roleFilter !== 'FA' && (
                        <div className="text-center py-8 text-muted-foreground">No users found</div>
                    )}
                    {roleFilter !== 'FA' && (
                        <Pagination
                            page={page}
                            totalPages={pagination.totalPages}
                            onPageChange={setPage}
                            total={pagination.total}
                            limit={pagination.limit}
                        />
                    )}
                </CardContent>
            </Card>

            {/* Create User Modal */}
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                        <DialogDescription>Create a new system user.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCreate} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Full Name *</Label>
                            <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} required placeholder="John Doe" />
                        </div>
                        <div className="space-y-2">
                            <Label>Email *</Label>
                            <Input type="email" value={formData.email} onChange={e => setFormData(f => ({ ...f, email: e.target.value }))} required placeholder="john@example.com" />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input value={formData.phone} onChange={e => setFormData(f => ({ ...f, phone: e.target.value }))} placeholder="+1 555 0100" />
                        </div>
                        {formData.role === 'FA' && (
                        <div className="space-y-2">
                            <Label>Accreditation Number (Optional)</Label>
                            <Input value={formData.accreditationNumber} onChange={e => setFormData(f => ({ ...f, accreditationNumber: e.target.value }))} placeholder="ACC-12345" />
                        </div>
                        )}
                        <div className="space-y-2">
                            <Label>Role *</Label>
                            <Select value={formData.role} onValueChange={v => setFormData(f => ({ ...f, role: v }))}>
                                <SelectTrigger><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {isSuperAdmin ? ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>) : (
                                        <SelectItem value="FA">FA (Fleet Attendant)</SelectItem>
                                    )}
                                </SelectContent>
                            </Select>
                        </div>
                        {isSuperAdmin && (
                            <>
                                <div className="space-y-2">
                                    <Label>Stadium</Label>
                                    <Select value={formData.stadiumId || '__none__'} onValueChange={v => {
                                        const val = v === '__none__' ? '' : v;
                                        setFormData(f => ({ ...f, stadiumId: val, departmentId: '' }));
                                        if (val) loadDepartments(val);
                                        else setDepartments([]);
                                    }}>
                                        <SelectTrigger><SelectValue placeholder="Select stadium" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No Stadium</SelectItem>
                                            {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="assignAllStadiums"
                                        checked={formData.assignAllStadiums}
                                        onCheckedChange={(checked) => setFormData(f => ({ ...f, assignAllStadiums: !!checked }))}
                                    />
                                    <Label htmlFor="assignAllStadiums" className="text-sm font-normal cursor-pointer">
                                        Assign to all stadiums
                                    </Label>
                                </div>
                            </>
                        )}
                        {isAdmin && !isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Stadium</Label>
                                <Input value={currentUser?.stadium?.name || 'Assigned Stadium'} disabled className="bg-gray-100" />
                                <p className="text-xs text-muted-foreground">Admins create users at their own venue</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Department</Label>
                            <Select
                                value={formData.departmentId || '__none__'}
                                onValueChange={v => setFormData(f => ({ ...f, departmentId: v === '__none__' ? '' : v }))}
                                disabled={!formData.stadiumId && isSuperAdmin}
                            >
                                <SelectTrigger><SelectValue placeholder={formData.stadiumId || !isSuperAdmin ? "Select department" : "Select stadium first"} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__none__">No Department</SelectItem>
                                    {(isSuperAdmin ? departments.filter(d => d.stadiumId === formData.stadiumId) : departments).map(d => (
                                        <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Password (default: changeme123)</Label>
                            <Input type="password" value={formData.password} onChange={e => setFormData(f => ({ ...f, password: e.target.value }))} placeholder="Leave blank for default" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Create User
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Bulk Upload Modal */}
            <Dialog open={bulkOpen} onOpenChange={setBulkOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Bulk Upload Users</DialogTitle>
                        <DialogDescription>Upload a CSV or paste a JSON array. Fields: name, email, role, password, phone, accreditationNumber (optional).</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkCreate} className="space-y-4">
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="w-4 h-4 mr-2" />Choose File (.csv or .json)
                        </Button>
                        <textarea
                            className="w-full h-44 p-3 border rounded-md font-mono text-sm"
                            placeholder={`JSON example:\n[\n  {"name":"Jane","email":"jane@gcms.com","role":"FA","password":"pass123","accreditationNumber":"ACC-001"}\n]`}
                            value={bulkData}
                            onChange={e => setBulkData(e.target.value)}
                        />
                        {bulkError && <p className="text-sm text-red-500">{bulkError}</p>}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => { setBulkOpen(false); setBulkData(''); setBulkError(''); }}>Cancel</Button>
                            <Button type="submit">Upload</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Import from Requests Modal */}
            <Dialog open={importOpen} onOpenChange={setImportOpen}>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                    <DialogHeader>
                        <DialogTitle>Import Users from Car Requests</DialogTitle>
                        <DialogDescription>Select approved car requests to create FA Focal Point users.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {loadingRequests ? (
                            <div className="flex justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin" />
                            </div>
                        ) : pendingRequests.length === 0 ? (
                            <p className="text-muted-foreground text-center py-8">No approved requests available to import.</p>
                        ) : (
                            <>
                                <div className="flex justify-between items-center mb-2">
                                    <span className="text-sm text-muted-foreground">{selectedRequests.size} selected</span>
                                    <div className="flex gap-2">
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setSelectedRequests(new Set(pendingRequests.map(r => r.id)))}
                                        >
                                            Select All
                                        </Button>
                                        <Button
                                            variant="outline"
                                            size="sm"
                                            onClick={() => setSelectedRequests(new Set())}
                                        >
                                            Clear Selection
                                        </Button>
                                    </div>
                                </div>
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="w-10"></TableHead>
                                            <TableHead>Name</TableHead>
                                            <TableHead>Email</TableHead>
                                            <TableHead>Phone</TableHead>
                                            <TableHead>Stadium</TableHead>
                                            <TableHead>Department</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {pendingRequests.map(r => (
                                            <TableRow
                                                key={r.id}
                                                className={selectedRequests.has(r.id) ? 'bg-muted/50' : ''}
                                            >
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
                                                <TableCell>{r.requesterPhone || '—'}</TableCell>
                                                <TableCell>{r.stadium?.name}</TableCell>
                                                <TableCell>{r.department?.name}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
                        <Button onClick={handleImportFromRequests} disabled={submitting || selectedRequests.size === 0}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Import Selected ({selectedRequests.size})
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit User Modal */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                        <DialogDescription>Update user details for {editUser?.name || editUser?.email}.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleEdit} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Full Name</Label>
                            <Input value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value }))} placeholder="John Doe" />
                        </div>
                        <div className="space-y-2">
                            <Label>Email</Label>
                            <Input type="email" value={editData.email} onChange={e => setEditData(d => ({ ...d, email: e.target.value }))} placeholder="john@example.com" />
                        </div>
                        <div className="space-y-2">
                            <Label>Phone</Label>
                            <Input value={editData.phone} onChange={e => setEditData(d => ({ ...d, phone: e.target.value }))} placeholder="+1 555 0100" />
                        </div>
                        <div className="space-y-2">
                            <Label>Accreditation Number</Label>
                            <Input value={editData.accreditationNumber} onChange={e => setEditData(d => ({ ...d, accreditationNumber: e.target.value }))} placeholder="ACC-12345" />
                        </div>
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>New Password <span className="text-muted-foreground font-normal">(leave blank to keep unchanged)</span></Label>
                                <Input type="password" value={editData.newPassword} onChange={e => setEditData(d => ({ ...d, newPassword: e.target.value }))} placeholder="New password" autoComplete="new-password" />
                            </div>
                        )}
                        {isSuperAdmin && (
                            <>
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select value={editData.role} onValueChange={v => setEditData(d => ({ ...d, role: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Stadium</Label>
                                    <Select value={editData.stadiumId || '__none__'} onValueChange={v => {
                                        const val = v === '__none__' ? '' : v;
                                        setEditData(d => ({ ...d, stadiumId: val, departmentId: '' }));
                                        if (val) loadDepartments(val);
                                        else setDepartments([]);
                                    }}>
                                        <SelectTrigger><SelectValue placeholder="Select stadium" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No Stadium</SelectItem>
                                            {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="flex items-center space-x-2">
                                    <Checkbox
                                        id="editAssignAllStadiums"
                                        checked={editData.assignAllStadiums}
                                        onCheckedChange={(checked) => setEditData(d => ({ ...d, assignAllStadiums: !!checked }))}
                                    />
                                    <Label htmlFor="editAssignAllStadiums" className="text-sm font-normal cursor-pointer">
                                        Assign to all stadiums
                                    </Label>
                                </div>
                                <div className="space-y-2">
                                    <Label>Department</Label>
                                    <Select value={editData.departmentId || '__none__'} onValueChange={v => setEditData(d => ({ ...d, departmentId: v === '__none__' ? '' : v }))}>
                                        <SelectTrigger><SelectValue placeholder={editData.stadiumId ? "Select department" : "Select stadium first"} /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No Department</SelectItem>
                                            {departments.filter(d => d.stadiumId === editData.stadiumId).map(d => (
                                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                        {isAdmin && !isSuperAdmin && (
                            <>
                                <div className="space-y-2">
                                    <Label>Role</Label>
                                    <Select value={editData.role} onValueChange={v => setEditData(d => ({ ...d, role: v }))}>
                                        <SelectTrigger><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="FA">FA</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">Admin can only edit FA users at their venue</p>
                                </div>
                                <div className="space-y-2">
                                    <Label>Department</Label>
                                    <Select value={editData.departmentId || '__none__'} onValueChange={v => setEditData(d => ({ ...d, departmentId: v === '__none__' ? '' : v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="__none__">No Department</SelectItem>
                                            {departments.map(d => (
                                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>
                            </>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={deleteConfirmOpen} onOpenChange={setDeleteConfirmOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete User</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to permanently delete <strong>{deleteUser?.name}</strong> ({deleteUser?.email})? This action cannot be undone.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setDeleteConfirmOpen(false)}>Cancel</Button>
                        <Button type="button" variant="destructive" onClick={handleDelete} disabled={deleting}>
                            {deleting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete User
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}