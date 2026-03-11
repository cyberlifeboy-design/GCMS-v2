import { useState, useEffect, useRef } from 'react';
import { usersApi, stadiumsApi, departmentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Upload, Loader2, ToggleLeft, ToggleRight, Edit2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Pagination } from '@/components/shared/Pagination';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';
    isActive: boolean;
    stadium?: { id: string; name: string };
    department?: { id: string; name: string };
    createdAt: string;
}

const roleColors: Record<string, string> = {
    'SuperAdmin': 'bg-purple-500 text-white',
    'Admin': 'bg-blue-500 text-white',
    'FA': 'bg-green-500 text-white',
    'Observer': 'bg-gray-400 text-white',
};

const ROLES = ['SuperAdmin', 'Admin', 'FA', 'Observer'] as const;

type UserFormData = {
    name: string;
    email: string;
    password: string;
    phone: string;
    role: string;
    stadiumId: string;
    departmentId: string;
};

const EMPTY_FORM: UserFormData = {
    name: '', email: '', password: '', phone: '', role: 'FA', stadiumId: '', departmentId: '',
};

export function UsersPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isSuperAdmin = role === 'SuperAdmin';
    const isAdmin = role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');

    // Pagination state
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    // Modals
    const [createOpen, setCreateOpen] = useState(false);
    const [editOpen, setEditOpen] = useState(false);
    const [editUser, setEditUser] = useState<User | null>(null);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM);
    const [editData, setEditData] = useState({ name: '', email: '', phone: '', role: '', stadiumId: '', departmentId: '' });
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string; stadiumId: string }>>([]);

    // Bulk
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [bulkData, setBulkData] = useState('');
    const [bulkError, setBulkError] = useState('');

    const loadUsers = async () => {
        try {
            setLoading(true);
            const params = {
                ...(roleFilter !== 'all' && { role: roleFilter }),
                page,
                limit: pagination.limit
            };
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

    useEffect(() => { loadUsers(); }, [roleFilter, page]);

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
            u.phone?.includes(search);
        return matchSearch;
    });

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
                stadiumId: isSuperAdmin ? formData.stadiumId || undefined : currentUser?.stadiumId,
                departmentId: formData.departmentId || undefined,
            });
            setCreateOpen(false);
            setFormData(EMPTY_FORM);
            loadUsers();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to create user');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (u: User) => {
        try {
            await usersApi.setStatus(u.id, !u.isActive);
            setUsers(prev => prev.map(x => x.id === u.id ? { ...x, isActive: !u.isActive } : x));
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to update status');
        }
    };

    const openEdit = (u: User) => {
        setEditUser(u);
        setEditData({
            name: u.name || '',
            email: u.email || '',
            phone: u.phone || '',
            role: u.role || 'FA',
            stadiumId: u.stadium?.id || '',
            departmentId: u.department?.id || '',
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
                stadiumId: isSuperAdmin ? editData.stadiumId || undefined : undefined,
                departmentId: editData.departmentId || undefined,
            });
            setEditOpen(false);
            setEditUser(null);
            loadUsers();
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

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">User Management</h1>
                {canManage && (
                    <div className="flex gap-2">
                        <input type="file" accept=".csv,.json" ref={fileInputRef} onChange={handleFileRead} className="hidden" />
                        <Button variant="outline" onClick={() => { setBulkData(''); setBulkError(''); setBulkOpen(true); }}>
                            <Upload className="w-4 h-4 mr-2" />Bulk Upload
                        </Button>
                        <Button onClick={() => { setFormData(EMPTY_FORM); setCreateOpen(true); }}>
                            <Plus className="w-4 h-4 mr-2" />Add User
                        </Button>
                    </div>
                )}
            </div>

            <Card>
                <CardHeader>
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by name, email, or phone…"
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
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Stadium</TableHead>
                                <TableHead>Department</TableHead>
                                <TableHead>Status</TableHead>
                                {canManage && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center py-8">
                                    <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                </TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={canManage ? 7 : 6} className="text-center py-8 text-muted-foreground">No users found</TableCell></TableRow>
                            ) : filtered.map(u => (
                                <TableRow key={u.id}>
                                    <TableCell className="font-medium">{u.name}</TableCell>
                                    <TableCell>{u.email}</TableCell>
                                    <TableCell>{u.phone || '—'}</TableCell>
                                    <TableCell><Badge className={roleColors[u.role]}>{u.role}</Badge></TableCell>
                                    <TableCell>{u.stadium?.name || '—'}</TableCell>
                                    <TableCell>{u.department?.name || '—'}</TableCell>
                                    <TableCell>
                                        <Badge className={u.isActive ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}>
                                            {u.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    {canManage && (
                                        <TableCell className="text-right">
                                            <div className="flex gap-1 justify-end">
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openEdit(u)}
                                                    title="Edit user"
                                                >
                                                    <Edit2 className="w-4 h-4" />
                                                </Button>
                                                {u.id !== currentUser?.id && (
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
                                                )}
                                            </div>
                                        </TableCell>
                                    )}
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
                            <div className="space-y-2">
                                <Label>Stadium</Label>
                                <Select value={formData.stadiumId} onValueChange={v => {
                                    setFormData(f => ({ ...f, stadiumId: v, departmentId: '' }));
                                    if (v) loadDepartments(v);
                                    else setDepartments([]);
                                }}>
                                    <SelectTrigger><SelectValue placeholder="Select stadium" /></SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="">No Stadium</SelectItem>
                                        {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
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
                                value={formData.departmentId}
                                onValueChange={v => setFormData(f => ({ ...f, departmentId: v }))}
                                disabled={!formData.stadiumId && isSuperAdmin}
                            >
                                <SelectTrigger><SelectValue placeholder={formData.stadiumId || !isSuperAdmin ? "Select department" : "Select stadium first"} /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="">No Department</SelectItem>
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
                        <DialogDescription>Upload a CSV or paste a JSON array. Fields: name, email, role, password, phone (optional).</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleBulkCreate} className="space-y-4">
                        <Button type="button" variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
                            <Upload className="w-4 h-4 mr-2" />Choose File (.csv or .json)
                        </Button>
                        <textarea
                            className="w-full h-44 p-3 border rounded-md font-mono text-sm"
                            placeholder={`JSON example:\n[\n  {"name":"Jane","email":"jane@gcms.com","role":"FA","password":"pass123"}\n]`}
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
                                    <Select value={editData.stadiumId} onValueChange={v => {
                                        setEditData(d => ({ ...d, stadiumId: v, departmentId: '' }));
                                        if (v) loadDepartments(v);
                                        else setDepartments([]);
                                    }}>
                                        <SelectTrigger><SelectValue placeholder="Select stadium" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">No Stadium</SelectItem>
                                            {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label>Department</Label>
                                    <Select value={editData.departmentId} onValueChange={v => setEditData(d => ({ ...d, departmentId: v }))}>
                                        <SelectTrigger><SelectValue placeholder={editData.stadiumId ? "Select department" : "Select stadium first"} /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">No Department</SelectItem>
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
                                    <Select value={editData.departmentId} onValueChange={v => setEditData(d => ({ ...d, departmentId: v }))}>
                                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="">No Department</SelectItem>
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
        </div>
    );
}
