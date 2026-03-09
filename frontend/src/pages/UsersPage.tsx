import { useState, useEffect, useRef } from 'react';
import { usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Upload, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface User {
    id: string;
    name: string;
    email: string;
    phone?: string;
    role: 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';
    isActive: boolean;
    stadium?: { id: string; name: string };
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
};

const EMPTY_FORM: UserFormData = {
    name: '', email: '', password: '', phone: '', role: 'FA',
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

    // Modals
    const [createOpen, setCreateOpen] = useState(false);
    const [bulkOpen, setBulkOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM);

    // Bulk
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [bulkData, setBulkData] = useState('');
    const [bulkError, setBulkError] = useState('');

    const loadUsers = async () => {
        try {
            setLoading(true);
            const res = await usersApi.getAll();
            setUsers(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadUsers(); }, []);

    const filtered = users.filter(u => {
        const matchSearch =
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase()) ||
            u.phone?.includes(search);
        const matchRole = roleFilter === 'all' || u.role === roleFilter;
        return matchSearch && matchRole;
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
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-44"><SelectValue placeholder="All Roles" /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                {ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Phone</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Stadium</TableHead>
                                <TableHead>Status</TableHead>
                                {canManage && <TableHead className="text-right">Active</TableHead>}
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
                                    <TableCell>
                                        <Badge className={u.isActive ? 'bg-green-500 text-white' : 'bg-red-400 text-white'}>
                                            {u.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    {canManage && (
                                        <TableCell className="text-right">
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
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
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
                                    {/* Admin can only create FA users */}
                                    {isSuperAdmin ? ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>) : (
                                        <SelectItem value="FA">FA (Fleet Attendant)</SelectItem>
                                    )}
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
        </div>
    );
}
