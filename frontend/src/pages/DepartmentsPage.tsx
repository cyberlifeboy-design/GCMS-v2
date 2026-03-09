import { useState, useEffect } from 'react';
import { departmentsApi, stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search, Edit2, Trash2, Loader2, Building2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface Department {
    id: string;
    name: string;
    code?: string;
    stadiumId: string;
    stadium: { name: string };
    _count?: { users: number; fleet: number };
}

export function DepartmentsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [departments, setDepartments] = useState<Department[]>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; department?: Department }>({ open: false, mode: 'create' });
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', stadiumId: '' });

    const loadDepartments = async () => {
        try {
            setLoading(true);
            const res = await departmentsApi.getAll();
            setDepartments(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const loadStadiums = async () => {
        try {
            const res = await stadiumsApi.getAll();
            setStadiums(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadDepartments();
        if (isSuperAdmin) loadStadiums();
    }, []);

    const filtered = departments.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.code?.toLowerCase().includes(search.toLowerCase())) ||
        d.stadium.name.toLowerCase().includes(search.toLowerCase())
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            const stadiumId = isSuperAdmin ? formData.stadiumId : (user?.stadiumId || '');
            const data = { ...formData, stadiumId };

            if (modal.mode === 'create') {
                await departmentsApi.create(data);
            } else {
                await departmentsApi.update(modal.department!.id, data);
            }
            setModal({ open: false, mode: 'create' });
            loadDepartments();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save department');
        } finally {
            setSubmitting(false);
        }
    };

    const openCreate = () => {
        setFormData({ name: '', code: '', stadiumId: isSuperAdmin ? '' : (user?.stadiumId || '') });
        setModal({ open: true, mode: 'create' });
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">FA / Departments</h1>
                {canManage && (
                    <Button onClick={openCreate}>
                        <Plus className="w-4 h-4 mr-2" />Add Department
                    </Button>
                )}
            </div>

            <Card>
                <CardHeader>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search departments…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="pl-10"
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Department Name</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Stadium / Venue</TableHead>
                                <TableHead>Users / Carts</TableHead>
                                {canManage && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={canManage ? 5 : 4} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={canManage ? 5 : 4} className="text-center py-8 text-muted-foreground">No departments found</TableCell></TableRow>
                            ) : filtered.map(d => (
                                <TableRow key={d.id}>
                                    <TableCell className="font-semibold">{d.name}</TableCell>
                                    <TableCell><code className="bg-muted px-1 rounded">{d.code || '—'}</code></TableCell>
                                    <TableCell className="flex items-center gap-1 text-muted-foreground"><Building2 className="w-3 h-3" /> {d.stadium.name}</TableCell>
                                    <TableCell className="text-sm">
                                        <span className="text-muted-foreground">Users:</span> {d._count?.users} / <span className="text-muted-foreground">Carts:</span> {d._count?.fleet}
                                    </TableCell>
                                    {canManage && (
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setFormData({ name: d.name, code: d.code || '', stadiumId: d.stadiumId });
                                                setModal({ open: true, mode: 'edit', department: d });
                                            }}><Edit2 className="w-4 h-4" /></Button>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={modal.open} onOpenChange={o => setModal(m => ({ ...m, open: o }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{modal.mode === 'create' ? 'Add Department' : 'Edit Department'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Department Name *</Label>
                            <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Medical, Security" />
                        </div>
                        <div className="space-y-2">
                            <Label>Code</Label>
                            <Input value={formData.code} onChange={e => setFormData(f => ({ ...f, code: e.target.value }))} placeholder="e.g. MED, SEC" />
                        </div>
                        {isSuperAdmin && modal.mode === 'create' && (
                            <div className="space-y-2">
                                <Label>Stadium / Venue *</Label>
                                <Select value={formData.stadiumId} onValueChange={v => setFormData(f => ({ ...f, stadiumId: v }))}>
                                    <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                                    <SelectContent>
                                        {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setModal(m => ({ ...m, open: false }))}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                {modal.mode === 'create' ? 'Create' : 'Save'}
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
