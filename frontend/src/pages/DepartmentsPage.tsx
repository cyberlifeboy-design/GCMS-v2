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
import { Plus, Search, Edit2, Loader2, User, UserCheck, LayoutTemplate, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

const DEFAULT_DEPARTMENTS = [
    { code: 'ADM', name: 'Administration Support' },
    { code: 'HRS', name: 'Human Resources' },
    { code: 'ICT', name: 'ICT' },
    { code: 'WKF', name: 'Workforce' },
    { code: 'COM', name: 'Communications' },
    { code: 'LAN', name: 'Languages Services' },
    { code: 'MER', name: 'Media Relations' },
    { code: 'SHM', name: 'Stakeholder Management' },
    { code: 'CMP', name: 'Competition Management' },
    { code: 'RSV', name: 'Referee Services' },
    { code: 'TSV', name: 'Team Services' },
    { code: 'TFS', name: 'Teams Facilities' },
    { code: 'ACC', name: 'Accommodation' },
    { code: 'AND', name: 'Arrivals & Departures' },
    { code: 'CAT', name: 'Catering' },
    { code: 'FNB', name: 'F&B Concessions' },
    { code: 'GOR', name: 'Government Relations' },
    { code: 'GRE', name: 'Guest Relations' },
    { code: 'LOG', name: 'Logistics' },
    { code: 'MED', name: 'Medical' },
    { code: 'MOB', name: 'Mobility' },
    { code: 'TRA', name: 'Travel Services' },
    { code: 'FNP', name: 'Finance & Procurement' },
    { code: 'CEO', name: 'CEO Office' },
    { code: 'EXP', name: 'Experience (CEO)' },
    { code: 'GAF', name: 'Guest Affairs' },
    { code: 'BRP', name: 'Brand Protection' },
    { code: 'LGL', name: 'Legal' },
    { code: 'BMR', name: 'Broadcasting & Media Rights' },
    { code: 'CER', name: 'Ceremonies & Infotainment' },
    { code: 'ECR', name: 'Events & Community Relations' },
    { code: 'HOS', name: 'Hospitality' },
    { code: 'LIC', name: 'Licensing & Merchandise' },
    { code: 'MKP', name: 'Marketing & Promotion' },
    { code: 'MRD', name: 'Marketing Rights Delivery' },
    { code: 'SHU', name: 'Shukran' },
    { code: 'SGN', name: 'Signage & Dressing' },
    { code: 'TKT', name: 'Ticketing' },
    { code: 'ACS', name: 'Access Management' },
    { code: 'ACR', name: 'Accreditation' },
    { code: 'BRO', name: 'Broadcast Operations' },
    { code: 'BRS', name: 'Broadcast Services' },
    { code: 'CLW', name: 'Cleaning & Waste' },
    { code: 'SFM', name: 'Facility & Stadium Management' },
    { code: 'GOP', name: 'Guest Operations' },
    { code: 'HSE', name: 'Health & Safety' },
    { code: 'MAP', name: 'Maps & Drawing' },
    { code: 'MEO', name: 'Media Operations' },
    { code: 'OVL', name: 'Overlay' },
    { code: 'PWR', name: 'Power' },
    { code: 'SPS', name: 'Spectator Services' },
    { code: 'SSI', name: 'Security Systems Integration' },
    { code: 'VUM', name: 'Venue Management' },
    { code: 'PLI', name: 'Planning & Integration' },
    { code: 'PMO', name: 'Project Management Office' },
    { code: 'UEX', name: 'Experience (Project Mgmt)' },
    { code: 'SFG', name: 'Safeguarding' },
    { code: 'SUS', name: 'Sustainability' },
    { code: 'HAY', name: 'Hayya' },
    { code: 'SEC', name: 'SSOC' },
];

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

type MergedDept = Department & { stadiums: Array<{ id: string; name: string; code: string }>; ids: string[] };

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

    const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; department?: MergedDept }>({ open: false, mode: 'create' });
    const [bulkModal, setBulkModal] = useState(false);
    const [bulkLoading, setBulkLoading] = useState(false);
    const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', stadiumId: '', focalPointId: '' });
    const [createMode, setCreateMode] = useState<CreateMode>('single');
    const [selectedStadiumIds, setSelectedStadiumIds] = useState<string[]>([]);
    const [editStadiumIds, setEditStadiumIds] = useState<string[]>([]);

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
                    const allStadiumIds = stadiums.map(s => s.id);
                    await departmentsApi.createBulk({
                        name: formData.name,
                        code: formData.code || undefined,
                        stadiumIds: allStadiumIds,
                    });
                } else if (createMode === 'select') {
                    if (selectedStadiumIds.length === 0) {
                        toast.error('Please select at least one stadium');
                        setSubmitting(false);
                        return;
                    }
                    await departmentsApi.createBulk({
                        name: formData.name,
                        code: formData.code || undefined,
                        stadiumIds: selectedStadiumIds,
                    });
                } else {
                    await departmentsApi.create({ ...formData, stadiumId: formData.stadiumId });
                }
                toast.success('Department(s) created');
            } else if (modal.mode === 'edit' && isSuperAdmin && modal.department) {                // SuperAdmin edit: handle multi-stadium association changes
                if (editStadiumIds.length === 0) {
                    toast.error('Please select at least one stadium');
                    setSubmitting(false);
                    return;
                }
                const mergedDept = modal.department;
                const currentMap = new Map<string, string>(); // stadiumId -> deptId
                mergedDept.stadiums.forEach((s, i) => currentMap.set(s.id, mergedDept.ids[i]));
                const newStadiumSet = new Set(editStadiumIds);

                // Update or delete existing records
                for (const [stadiumId, deptId] of currentMap) {
                    if (newStadiumSet.has(stadiumId)) {
                        await departmentsApi.update(deptId, {
                            name: formData.name,
                            code: formData.code || undefined,
                            focalPointId: formData.focalPointId || null,
                        });
                    } else {
                        await departmentsApi.delete(deptId);
                    }
                }
                // Create records for newly added stadiums
                for (const stadiumId of editStadiumIds) {
                    if (!currentMap.has(stadiumId)) {
                        await departmentsApi.create({
                            name: formData.name,
                            code: formData.code || undefined,
                            stadiumId,
                        });
                    }
                }
                toast.success('Department updated');
            } else {
                // Admin create or Admin edit (single stadium)
                const stadiumId = isSuperAdmin ? formData.stadiumId : (user?.stadiumId || '');
                const data = {
                    name: formData.name,
                    code: formData.code || undefined,
                    stadiumId,
                    ...(modal.mode === 'edit' && { focalPointId: formData.focalPointId || null }),
                };
                if (modal.mode === 'create') {
                    await departmentsApi.create(data);
                    toast.success('Department created');
                } else {
                    await departmentsApi.update(modal.department!.id, data);
                    toast.success('Department updated');
                }
            }
            setModal({ open: false, mode: 'create' });
            loadDepartments(stadiumFilter === 'all' ? undefined : stadiumFilter);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save department');
        } finally {
            setSubmitting(false);
        }
    };

    const handleLoadTemplate = async () => {
        if (stadiums.length === 0) {
            toast.error('No venues found — add venues first');
            return;
        }
        setBulkLoading(true);
        setBulkProgress({ done: 0, total: DEFAULT_DEPARTMENTS.length });
        const allStadiumIds = stadiums.map(s => s.id);
        let success = 0, failed = 0;
        for (let i = 0; i < DEFAULT_DEPARTMENTS.length; i++) {
            const dept = DEFAULT_DEPARTMENTS[i];
            try {
                await departmentsApi.createBulk({ name: dept.name, code: dept.code, stadiumIds: allStadiumIds });
                success++;
            } catch {
                failed++;
            }
            setBulkProgress({ done: i + 1, total: DEFAULT_DEPARTMENTS.length });
        }
        setBulkLoading(false);
        setBulkModal(false);
        if (failed === 0) {
            toast.success(`Template loaded — ${success} departments added across ${allStadiumIds.length} venues`);
        } else {
            toast.warning(`Done: ${success} created, ${failed} skipped (already exist)`);
        }
        loadDepartments(stadiumFilter === 'all' ? undefined : stadiumFilter);
    };

    const openCreate = () => {
        setFormData({ name: '', code: '', stadiumId: isSuperAdmin ? '' : (user?.stadiumId || ''), focalPointId: '' });
        setCreateMode('single');
        setSelectedStadiumIds([]);
        setEditStadiumIds([]);
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
                    <div className="flex gap-2">
                        {isSuperAdmin && (
                            <Button variant="outline" onClick={() => { if (stadiums.length === 0) loadStadiums().then(() => setBulkModal(true)); else setBulkModal(true); }}>
                                <LayoutTemplate className="w-4 h-4 mr-2" />Load Default Template
                            </Button>
                        )}
                        <Button onClick={openCreate}>
                            <Plus className="w-4 h-4 mr-2" />Add Department
                        </Button>
                    </div>
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
                                            <div className="flex items-center justify-end gap-1">
                                                <Button variant="ghost" size="sm" title="Assign Focal Point" onClick={() => {
                                                    setFormData({ name: d.name, code: d.code || '', stadiumId: d.stadiumId, focalPointId: d.focalPointId || '' });
                                                    setEditStadiumIds(d.stadiums.map(s => s.id));
                                                    setModal({ open: true, mode: 'edit', department: d });
                                                }}><UserCheck className="w-4 h-4 text-green-600" /></Button>
                                                <Button variant="ghost" size="sm" onClick={() => {
                                                    setFormData({ name: d.name, code: d.code || '', stadiumId: d.stadiumId, focalPointId: d.focalPointId || '' });
                                                    setEditStadiumIds(d.stadiums.map(s => s.id));
                                                    setModal({ open: true, mode: 'edit', department: d });
                                                }}><Edit2 className="w-4 h-4" /></Button>
                                            </div>
                                        </TableCell>
                                    )}
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Bulk Default Template Dialog */}
            <Dialog open={bulkModal} onOpenChange={o => { if (!bulkLoading) setBulkModal(o); }}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <LayoutTemplate className="w-5 h-5 text-primary" />
                            Load Default Template
                        </DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                        <div className="flex gap-3 p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-800 dark:text-amber-300">
                            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>This will add all <strong>60 FAC25 functional areas</strong> across all <strong>{stadiums.length} venues</strong>. Existing departments will be skipped.</span>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                            <div className="bg-muted/40 rounded-lg p-3">
                                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">Departments</p>
                                <p className="text-2xl font-bold">60</p>
                                <p className="text-xs text-muted-foreground">Functional Areas</p>
                            </div>
                            <div className="bg-muted/40 rounded-lg p-3">
                                <p className="text-muted-foreground text-xs font-semibold uppercase tracking-wider mb-1">Venues</p>
                                <p className="text-2xl font-bold">{stadiums.length}</p>
                                <p className="text-xs text-muted-foreground">Total records: {60 * stadiums.length}</p>
                            </div>
                        </div>
                        {bulkLoading && (
                            <div className="space-y-2">
                                <div className="flex justify-between text-xs text-muted-foreground">
                                    <span>Loading departments…</span>
                                    <span>{bulkProgress.done} / {bulkProgress.total}</span>
                                </div>
                                <div className="w-full bg-muted rounded-full h-2">
                                    <div
                                        className="bg-primary h-2 rounded-full transition-all duration-300"
                                        style={{ width: `${bulkProgress.total > 0 ? (bulkProgress.done / bulkProgress.total) * 100 : 0}%` }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkModal(false)} disabled={bulkLoading}>Cancel</Button>
                        <Button onClick={handleLoadTemplate} disabled={bulkLoading}>
                            {bulkLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <LayoutTemplate className="w-4 h-4 mr-2" />}
                            {bulkLoading ? `Loading ${bulkProgress.done}/${bulkProgress.total}…` : 'Load All 60 Departments'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

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

                        {modal.mode === 'edit' && isSuperAdmin && (
                            <div className="space-y-2">
                                <div className="flex justify-between items-center">
                                    <Label>Venue Associations ({editStadiumIds.length} selected)</Label>
                                    <div className="flex gap-2">
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditStadiumIds(stadiums.map(s => s.id))}>All</Button>
                                        <Button type="button" variant="ghost" size="sm" onClick={() => setEditStadiumIds([])}>None</Button>
                                    </div>
                                </div>
                                <div className="max-h-40 overflow-y-auto border rounded-md p-2 space-y-1">
                                    {stadiums.map(s => (
                                        <label key={s.id} className="flex items-center gap-2 p-1.5 hover:bg-muted rounded cursor-pointer">
                                            <Checkbox
                                                checked={editStadiumIds.includes(s.id)}
                                                onCheckedChange={() => setEditStadiumIds(prev =>
                                                    prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id]
                                                )}
                                            />
                                            <span className="text-sm"><span className="font-mono text-xs bg-muted px-1 rounded mr-1">{s.code}</span>{s.name}</span>
                                        </label>
                                    ))}
                                </div>
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

                        {modal.mode === 'create' && (
                            <div className="space-y-2">
                                <Label>Assign FA User (Optional)</Label>
                                <Select value={formData.focalPointId || 'none'} onValueChange={v => setFormData(f => ({ ...f, focalPointId: v === 'none' ? '' : v }))}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select FA user (optional)" />
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
                                <p className="text-xs text-muted-foreground">Optionally assign an FA user as focal point at creation time.</p>
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
