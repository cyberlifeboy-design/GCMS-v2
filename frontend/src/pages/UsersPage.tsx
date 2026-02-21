import { useState, useEffect, useRef } from 'react';
import { usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit2, Trash2, Upload, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface User {
    id: string;
    accreditationId: string;
    name: string;
    email: string;
    role: 'Admin' | 'LCC' | 'FocalPoint' | 'Contractor';
    faTrigram?: string;
    stadium?: { id: string; name: string };
    createdAt: string;
}

const roleColors: Record<string, string> = {
    'Admin': 'bg-purple-500',
    'LCC': 'bg-blue-500',
    'FocalPoint': 'bg-green-500',
    'Contractor': 'bg-orange-500',
};

const faTrigramOptions = ['LOG', 'MOB', 'SPS', 'VUM', 'GOP'];

export function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [roleFilter, setRoleFilter] = useState('all');
    const { user: currentUser } = useAuthStore();

    // Modal states
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [isEditModalOpen, setIsEditModalOpen] = useState(false);
    const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
    const [isBulkModalOpen, setIsBulkModalOpen] = useState(false);
    const [selectedUser, setSelectedUser] = useState<User | null>(null);
    const [submitting, setSubmitting] = useState(false);

    // Form states
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        role: 'FocalPoint',
        accreditationId: '',
        faTrigram: 'none',
        password: '',
    });
    const [bulkData, setBulkData] = useState('');
    const [bulkError, setBulkError] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            setLoading(true);
            const response = await usersApi.getAll();
            setUsers(response.data.data || []);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredUsers = users.filter(u => {
        const matchesSearch =
            u.name?.toLowerCase().includes(search.toLowerCase()) ||
            u.email?.toLowerCase().includes(search.toLowerCase()) ||
            u.accreditationId?.toLowerCase().includes(search.toLowerCase());
        const matchesRole = roleFilter === 'all' || u.role === roleFilter;
        return matchesSearch && matchesRole;
    });

    const handleAddUser = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await usersApi.bulkCreate([{
                name: formData.name,
                email: formData.email,
                role: formData.role,
                accreditationId: formData.accreditationId,
                faTrigram: formData.faTrigram && formData.faTrigram !== 'none' ? formData.faTrigram : undefined,
                password: formData.password || 'changeme123',
            }]);
            setIsAddModalOpen(false);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Failed to add user:', error);
            alert('Failed to add user. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleEditUser = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedUser) return;
        setSubmitting(true);
        try {
            await usersApi.update(selectedUser.id, {
                name: formData.name,
                email: formData.email,
                role: formData.role,
                faTrigram: formData.faTrigram && formData.faTrigram !== 'none' ? formData.faTrigram : undefined,
            });
            setIsEditModalOpen(false);
            setSelectedUser(null);
            resetForm();
            loadUsers();
        } catch (error) {
            console.error('Failed to update user:', error);
            alert('Failed to update user. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDeleteUser = async () => {
        if (!selectedUser) return;
        setSubmitting(true);
        try {
            await usersApi.delete(selectedUser.id);
            setIsDeleteModalOpen(false);
            setSelectedUser(null);
            loadUsers();
        } catch (error) {
            console.error('Failed to delete user:', error);
            alert('Failed to delete user. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        setBulkError('');
        try {
            let usersToCreate: any[] = [];

            // Try parsing as JSON first
            try {
                usersToCreate = JSON.parse(bulkData);
                if (!Array.isArray(usersToCreate)) {
                    throw new Error('Data must be an array of users');
                }
            } catch {
                // Try CSV format
                const lines = bulkData.trim().split('\n');
                const headers = lines[0].split(',').map(h => h.trim());
                usersToCreate = lines.slice(1).map(line => {
                    const values = line.split(',').map(v => v.trim());
                    const user: any = {};
                    headers.forEach((h, i) => {
                        user[h] = values[i];
                    });
                    return user;
                });
            }

            if (usersToCreate.length === 0) {
                setBulkError('No users found in data');
                return;
            }

            await usersApi.bulkCreate(usersToCreate);
            setIsBulkModalOpen(false);
            setBulkData('');
            loadUsers();
            alert(`Successfully created ${usersToCreate.length} users`);
        } catch (error) {
            console.error('Failed to bulk upload:', error);
            setBulkError('Failed to process data. Check format and try again.');
        }
    };

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const text = event.target?.result as string;
            setBulkData(text);
        };
        reader.readAsText(file);
    };

    const openEditModal = (user: User) => {
        setSelectedUser(user);
        setFormData({
            name: user.name,
            email: user.email,
            role: user.role,
            accreditationId: user.accreditationId,
            faTrigram: user.faTrigram || 'none',
            password: '',
        });
        setIsEditModalOpen(true);
    };

    const openDeleteModal = (user: User) => {
        setSelectedUser(user);
        setIsDeleteModalOpen(true);
    };

    const resetForm = () => {
        setFormData({
            name: '',
            email: '',
            role: 'FocalPoint',
            accreditationId: '',
            faTrigram: 'none',
            password: '',
        });
    };

    const isAdmin = currentUser?.role === 'Admin';

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">User Management</h1>
                {isAdmin && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => setIsBulkModalOpen(true)}>
                            <Upload className="w-4 h-4 mr-2" />Bulk Upload
                        </Button>
                        <Button onClick={() => { resetForm(); setIsAddModalOpen(true); }}>
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
                                placeholder="Search users by name, email, or accreditation ID..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={roleFilter} onValueChange={setRoleFilter}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="All Roles" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Roles</SelectItem>
                                <SelectItem value="Admin">Admin</SelectItem>
                                <SelectItem value="LCC">LCC</SelectItem>
                                <SelectItem value="FocalPoint">Focal Point</SelectItem>
                                <SelectItem value="Contractor">Contractor</SelectItem>
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
                                <TableHead>Role</TableHead>
                                <TableHead>FA Trigram</TableHead>
                                <TableHead>Accreditation ID</TableHead>
                                <TableHead>Stadium</TableHead>
                                {isAdmin && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredUsers.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={isAdmin ? 7 : 6} className="text-center py-8 text-muted-foreground">
                                        No users found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredUsers.map((user) => (
                                    <TableRow key={user.id}>
                                        <TableCell className="font-medium">{user.name}</TableCell>
                                        <TableCell>{user.email}</TableCell>
                                        <TableCell>
                                            <Badge className={roleColors[user.role]}>{user.role}</Badge>
                                        </TableCell>
                                        <TableCell>{user.faTrigram || '-'}</TableCell>
                                        <TableCell>{user.accreditationId}</TableCell>
                                        <TableCell>{user.stadium?.name || '-'}</TableCell>
                                        {isAdmin && (
                                            <TableCell className="text-right">
                                                <div className="flex justify-end gap-2">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openEditModal(user)}
                                                    >
                                                        <Edit2 className="w-4 h-4" />
                                                    </Button>
                                                    {user.id !== currentUser?.id && (
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            className="text-red-600 hover:text-red-700"
                                                            onClick={() => openDeleteModal(user)}
                                                        >
                                                            <Trash2 className="w-4 h-4" />
                                                        </Button>
                                                    )}
                                                </div>
                                            </TableCell>
                                        )}
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Add User Modal */}
            <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Add New User</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleAddUser} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="name">Full Name *</Label>
                            <Input
                                id="name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="email">Email *</Label>
                            <Input
                                id="email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="accreditationId">Accreditation ID *</Label>
                            <Input
                                id="accreditationId"
                                value={formData.accreditationId}
                                onChange={(e) => setFormData({ ...formData, accreditationId: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="role">Role *</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Admin">Admin</SelectItem>
                                    <SelectItem value="LCC">LCC</SelectItem>
                                    <SelectItem value="FocalPoint">Focal Point</SelectItem>
                                    <SelectItem value="Contractor">Contractor</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="faTrigram">FA Trigram</Label>
                            <Select
                                value={formData.faTrigram}
                                onValueChange={(value) => setFormData({ ...formData, faTrigram: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select FA" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {faTrigramOptions.map(fa => (
                                        <SelectItem key={fa} value={fa}>{fa}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password (optional, defaults to changeme123)</Label>
                            <Input
                                id="password"
                                type="password"
                                value={formData.password}
                                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Add User
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Edit User Modal */}
            <Dialog open={isEditModalOpen} onOpenChange={setIsEditModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Edit User</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleEditUser} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="edit-name">Full Name</Label>
                            <Input
                                id="edit-name"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-email">Email</Label>
                            <Input
                                id="edit-email"
                                type="email"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-role">Role</Label>
                            <Select
                                value={formData.role}
                                onValueChange={(value) => setFormData({ ...formData, role: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Admin">Admin</SelectItem>
                                    <SelectItem value="LCC">LCC</SelectItem>
                                    <SelectItem value="FocalPoint">Focal Point</SelectItem>
                                    <SelectItem value="Contractor">Contractor</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="edit-faTrigram">FA Trigram</Label>
                            <Select
                                value={formData.faTrigram}
                                onValueChange={(value) => setFormData({ ...formData, faTrigram: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select FA" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="none">None</SelectItem>
                                    {faTrigramOptions.map(fa => (
                                        <SelectItem key={fa} value={fa}>{fa}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsEditModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Save Changes
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Modal */}
            <Dialog open={isDeleteModalOpen} onOpenChange={setIsDeleteModalOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Delete User</DialogTitle>
                    </DialogHeader>
                    <p className="text-muted-foreground">
                        Are you sure you want to delete <strong>{selectedUser?.name}</strong>? This action cannot be undone.
                    </p>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsDeleteModalOpen(false)}>
                            Cancel
                        </Button>
                        <Button type="button" variant="destructive" onClick={handleDeleteUser} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Bulk Upload Modal */}
            <Dialog open={isBulkModalOpen} onOpenChange={setIsBulkModalOpen}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Bulk Upload Users</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Upload CSV or paste JSON array. Required fields: name, email, accreditationId, role.
                        </p>
                        <div className="flex gap-2">
                            <input
                                type="file"
                                accept=".csv,.json"
                                ref={fileInputRef}
                                onChange={handleFileUpload}
                                className="hidden"
                            />
                            <Button variant="outline" onClick={() => fileInputRef.current?.click()}>
                                <Upload className="w-4 h-4 mr-2" />Choose File
                            </Button>
                        </div>
                        <form onSubmit={handleBulkUpload}>
                            <textarea
                                className="w-full h-40 p-3 border rounded-md font-mono text-sm"
                                placeholder={`Example JSON format:
[
  {
    "name": "John Doe",
    "email": "john@example.com",
    "accreditationId": "ACC001",
    "role": "FocalPoint",
    "faTrigram": "LOG"
  }
]`}
                                value={bulkData}
                                onChange={(e) => setBulkData(e.target.value)}
                            />
                            {bulkError && (
                                <p className="text-sm text-red-500 mt-2">{bulkError}</p>
                            )}
                            <DialogFooter className="mt-4">
                                <Button type="button" variant="outline" onClick={() => { setIsBulkModalOpen(false); setBulkData(''); setBulkError(''); }}>
                                    Cancel
                                </Button>
                                <Button type="submit">Upload</Button>
                            </DialogFooter>
                        </form>
                    </div>
                </DialogContent>
            </Dialog>
        </div>
    );
}
