import { useState, useEffect } from 'react';
import { departmentsApi, stadiumsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Search, Edit2, Loader2, User } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';

interface Department {
    id: string;
    name: string;
    code?: string;
    stadiumId: string;
    stadium: { id: string; name: string; code: string };
    focalPointId?: string | null;
    focalPoint?: { id: string; name: string; email: string } | null;
    _count?: { users: number; fleet: number };
}

interface FAUser {
    id: string;
    name: string;
    email: string;
}

type CreateMode = 'single' | 'all' | 'select';

export function DepartmentsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [departments, setDepartments] = useState<Department[]>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string; code: string }>>([]);
    const [faUsers, setFaUsers] = useState<FAUser[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [stadiumFilter, setStadiumFilter] = useState<string>('all');

    const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; department?: Department }>({ open: false, mode: 'create' });
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', stadiumId: '', focalPointId: '' });
    const [createMode, setCreateMode] = useState<CreateMode>('single');
    const [selectedStadiumIds, setSelectedStadiumIds] = useState<string[]>([]);

    const loadDepartments = async (stadiumId?: string) => {
        try {
            setLoading(true);
            const params = stadiumId && stadiumId !== 'all' ? { stadiumId } : {};
            const res = await departmentsApi.getAll(params);
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

    const loadFAUsers = async () => {
        try {
            const res = await usersApi.getAll({ role: 'FA', isActive: true });
            setFaUsers(res.data.data || []);
        } catch (e) {
            console.error(e);
        }
    };

    useEffect(() => {
        loadDepartments(stadiumFilter === 'all' ? undefined : stadiumFilter);
        if (isSuperAdmin) loadStadiums();
        loadFAUsers();
    }, []);

    useEffect(() => {
        loadDepartments(stadiumFilter === 'all' ? undefined : stadiumFilter);
    }, [stadiumFilter]);

    const filtered = departments.filter(d =>
        d.name.toLowerCase().includes(search.toLowerCase()) ||
        (d.code?.toLowerCase().includes(search.toLowerCase())) ||
        d.stadium.name.toLowerCase().includes(search.toLowerCase()) ||
        d.stadium.code.toLowerCase().includes(search.toLowerCase())
    );

    // Merge departments by name for display
    const mergedDepartments = filtered.reduce((acc, d) => {
        const key = d.name;
        if (!acc[key]) {
            acc[key] = { ...d, stadiums: [d.stadium], ids: [d.id] };
        } else {
            acc[key].stadiums.push(d.stadium);
            acc[key].ids.push(d.id);
            // Sum up counts
            if (acc[key]._count && d._count) {
                acc[key]._count.users += d._count.users;
                acc[key]._count.fleet += d._count.fleet;
            }
        }
        return acc;
    }, {} as Record<string, Department & { stadiums: Array<{ id: string; name: string; code: string }>; ids: string[] }>);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (modal.mode === 'create' && isSuperAdmin) {
                if (createMode === 'all') {
                    // Create for all stadiums
                    const allStadiumIds = stadiums.map(s => s.id);
                    await departmentsApi.createBulk({
                        name: formData.name,
                        code: formData.code || undefined,
                        stadiumIds: allStadiumIds,
                    });
                } else if (createMode === 'select') {
                    // Create for selected stadiums
                    if (selectedStadiumIds.length === 0) {
                        alert('Please select at least one stadium');
                        setSubmitting(false);
                        return;
                    }
                    await departmentsApi.createBulk({
                        name: formData.name,
                        code: formData.code || undefined,
                        stadiumIds: selectedStadiumIds,
                    });
                } else {
                    // Single stadium
                    const data = { ...formData, stadiumId: formData.stadiumId };
                    await departmentsApi.create(data);
                }
            } else {
                // Admin or edit mode
                const stadiumId = isSuperAdmin ? formData.stadiumId : (user?.stadiumId || '');
                const data = {
                    name: formData.name,
                    code: formData.code || undefined,
                    stadiumId,
                    ...(modal.mode === 'edit' && { focalPointId: formData.focalPointId || null }),
                };

                if (modal.mode === 'create') {
                    await departmentsApi.create(data);
                } else {
                    await departmentsApi.update(modal.department!.id, data);
                }
            }
            setModal({ open: false, mode: 'create' });
            loadDepartments(stadiumFilter === 'all' ? undefined : stadiumFilter);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save department');
        } finally {
            setSubmitting(false);
        }
    };

    const openCreate = () => {
        setFormData({ name: '', code: '', stadiumId: isSuperAdmin ? '' : (user?.stadiumId || ''), focalPointId: '' });
        setCreateMode('single');
        setSelectedStadiumIds([]);
        setModal({ open: true, mode: 'create' });
    };

    const toggleStadiumSelection = (stadiumId: string) => {
        setSelectedStadiumIds(prev =>
            prev.includes(stadiumId)
                ? prev.filter(id => id !== stadiumId)
                : [...prev, stadiumId]
        );
    };

    const selectAllStadiums = () => {
        setSelectedStadiumIds(stadiums.map(s => s.id));
    };

    const deselectAllStadiums = () => {
        setSelectedStadiumIds([]);
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
                    <div className="flex flex-wrap gap-4 items-center">
                        <div className="relative flex-1 min-w-[200px] max-w-sm">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search departments…"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        {isSuperAdmin && (
                            <Select value={stadiumFilter} onValueChange={setStadiumFilter}>
                                <SelectTrigger className="w-[200px]">
                                    <SelectValue placeholder="Filter by stadium" />
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
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Department Name</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Venues</TableHead>
                                <TableHead>Focal Point</TableHead>
                                <TableHead>Users / Carts</TableHead>
                                {canManage && <TableHead className="text-right">Actions</TableHead>}
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                            ) : Object.keys(mergedDepartments).length === 0 ? (
                                <TableRow><TableCell colSpan={canManage ? 6 : 5} className="text-center py-8 text-muted-foreground">No departments found</TableCell></TableRow>
                            ) : Object.values(mergedDepartments).map(d => (
                                <TableRow key={d.name}>
                                    <TableCell className="font-semibold">{d.name}</TableCell>
                                    <TableCell><code className="bg-muted px-1 rounded">{d.code || '—'}</code></TableCell>
                                    <TableCell>
                                        <div className="flex flex-wrap gap-1">
                                            {d.stadiums.map(s => (
                                                <Badge key={s.id} variant="outline" className="text-xs font-mono">{s.code}</Badge>
                                            ))}
                                        </div>
                                    </TableCell>
                                    <TableCell>
                                        {d.focalPoint ? (
                                            <div className="flex items-center gap-1">
                                                <User className="w-3 h-3 text-muted-foreground" />
                                                <span className="text-sm">{d.focalPoint.name}</span>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-sm">
                                        <span className="text-muted-foreground">Users:</span> {d._count?.users ?? '—'} / <span className="text-muted-foreground">Carts:</span> {d._count?.fleet ?? '—'}
                                    </TableCell>
                                    {canManage && (
                                        <TableCell className="text-right">
                                            <Button variant="ghost" size="sm" onClick={() => {
                                                setFormData({ name: d.name, code: d.code || '', stadiumId: d.stadiumId, focalPointId: d.focalPointId || '' });
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
                            <>
                                <div className="space-y-2">
                                    <Label>Create For</Label>
                                    <Select value={createMode} onValueChange={(v) => setCreateMode(v as CreateMode)}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="single">Single Stadium</SelectItem>
                                            <SelectItem value="all">All Stadiums</SelectItem>
                                            <SelectItem value="select">Select Stadiums</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>

                                {createMode === 'single' && (
                                    <div className="space-y-2">
                                        <Label>Stadium / Venue *</Label>
                                        <Select value={formData.stadiumId} onValueChange={v => setFormData(f => ({ ...f, stadiumId: v }))}>
                                            <SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger>
                                            <SelectContent>
                                                {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.code} - {s.name}</SelectItem>)}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                )}

                                {createMode === 'all' && (
                                    <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                                        This will create "<span className="font-medium text-foreground">{formData.name || 'Department'}</span>" in all {stadiums.length} stadiums.
                                    </div>
                                )}

                                {createMode === 'select' && (
                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <Label>Select Stadiums ({selectedStadiumIds.length} selected)</Label>
                                            <div className="flex gap-2">
                                                <Button type="button" variant="ghost" size="sm" onClick={selectAllStadiums}>Select All</Button>
                                                <Button type="button" variant="ghost" size="sm" onClick={deselectAllStadiums}>Deselect All</Button>
                                            </div>
                                        </div>
                                        <div className="max-h-48 overflow-y-auto border rounded-md p-2 space-y-1">
                                            {stadiums.map(s => (
                                                <label key={s.id} className="flex items-center gap-2 p-2 hover:bg-muted rounded cursor-pointer">
                                                    <Checkbox
                                                        checked={selectedStadiumIds.includes(s.id)}
                                                        onCheckedChange={() => toggleStadiumSelection(s.id)}
                                                    />
                                                    <span>{s.name}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </>
                        )}

                        {!isSuperAdmin && modal.mode === 'create' && (
                            <div className="p-3 bg-muted rounded-md text-sm text-muted-foreground">
                                Department will be created in your assigned venue.
                            </div>
                        )}

                        {modal.mode === 'edit' && (
                            <div className="space-y-2">
                                <Label>Focal Point (FA User)</Label>
                                <Select value={formData.focalPointId || 'none'} onValueChange={v => setFormData(f => ({ ...f, focalPointId: v === 'none' ? '' : v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select focal point" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="none">None</SelectItem>
                                        {faUsers.map(u => (
                                            <SelectItem key={u.id} value={u.id}>
                                                {u.name} ({u.email})
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <p className="text-xs text-muted-foreground">Only FA role users can be assigned as focal point.</p>
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
