import { useState, useEffect } from 'react';
import { stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Plus, Search, Edit2, Loader2, MapPin, Truck, Users, UserPlus, Accessibility, PowerOff, Power, Trash2, Upload, CheckCircle2, SkipForward } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { toast } from 'sonner';

interface FleetStats {
    total: number;
    cargo: number;
    fourSeater: number;
    sixSeater: number;
    accessibility: number;
}

interface Stadium {
    id: string;
    name: string;
    code: string;
    location: string;
    isActive: boolean;
    fleetStats?: FleetStats;
}

const DEFAULT_VENUES = [
    { name: 'Al Bayt Stadium',           code: 'ABS',  location: 'https://maps.app.goo.gl/1yR2yyU9GDbocyMKA' },
    { name: 'Lusail Stadium',             code: 'LUS',  location: 'https://maps.app.goo.gl/z9DgEg2kicHEqx7h7' },
    { name: 'Education City Stadium',     code: 'ECS',  location: 'https://maps.app.goo.gl/m4q4YF5tW3JiYfwc7' },
    { name: 'Lusail Multipurpose Hall',   code: 'LMPH', location: 'https://maps.app.goo.gl/PUuKcku5YMXrdqbT7' },
    { name: 'Khalifa International Stadium', code: 'KIS', location: 'https://maps.app.goo.gl/LKa58NmXvdSa7FtAA' },
    { name: 'Ahmad bin Ali Stadium',      code: 'AAS',  location: 'https://maps.app.goo.gl/Xq5mFNQLr7dcQJuK9' },
    { name: 'Al Thumama Stadium',         code: 'ATS',  location: 'https://maps.app.goo.gl/kt4GeiYrVzbfLKww8' },
    { name: 'Al Janoub Stadium',          code: 'AJS',  location: 'https://maps.app.goo.gl/qYn8fHDWZZ27kjcP6' },
    { name: 'Jassim Bin Hamad Stadium',   code: 'JHS',  location: 'https://maps.app.goo.gl/rjodpBVHH7vpjnA3A' },
    { name: 'Qatar Sports Club',          code: 'QSC',  location: 'https://maps.app.goo.gl/d9AwmxGJGfjvpx7b7' },
];

export function StadiumsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; stadium?: Stadium }>({ open: false, mode: 'create' });
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', location: '' });
    const [deleteConfirm, setDeleteConfirm] = useState<Stadium | null>(null);

    const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);

    const loadStadiums = async () => {
        try {
            setLoading(true);
            const res = await stadiumsApi.getAll();
            setStadiums(res.data.data || []);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { loadStadiums(); }, []);

    const filtered = stadiums.filter(s =>
        s.name.toLowerCase().includes(search.toLowerCase()) ||
        s.code.toLowerCase().includes(search.toLowerCase()) ||
        s.location.toLowerCase().includes(search.toLowerCase())
    );

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            if (modal.mode === 'create') {
                await stadiumsApi.create(formData);
                toast.success('Venue created');
            } else {
                await stadiumsApi.update(modal.stadium!.id, formData);
                toast.success('Venue updated');
            }
            setModal({ open: false, mode: 'create' });
            loadStadiums();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save stadium');
        } finally {
            setSubmitting(false);
        }
    };

    const handleToggleActive = async (stadium: Stadium) => {
        try {
            await stadiumsApi.toggleActive(stadium.id, !stadium.isActive);
            toast.success(`Venue ${stadium.isActive ? 'deactivated' : 'activated'}`);
            loadStadiums();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to update stadium status');
        }
    };

    const handleDelete = async () => {
        if (!deleteConfirm) return;
        setSubmitting(true);
        try {
            await stadiumsApi.delete(deleteConfirm.id);
            toast.success('Venue deleted');
            setDeleteConfirm(null);
            loadStadiums();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to delete stadium');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkLoad = async () => {
        setSubmitting(true);
        try {
            const res = await stadiumsApi.bulkCreate(DEFAULT_VENUES);
            setBulkConfirmOpen(false);
            loadStadiums();
            if (res.data.created > 0) {
                toast.success(`Added ${res.data.created} venue${res.data.created !== 1 ? 's' : ''}${res.data.skipped ? `, ${res.data.skipped} already existed` : ''}`);
            } else {
                toast.info('All default venues already exist — nothing was added');
            }
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Bulk import failed');
        } finally {
            setSubmitting(false);
        }
    };

    if (!isSuperAdmin) {
        return <div className="p-8 text-center text-muted-foreground">Access denied. SuperAdmin only.</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Stadium & Venue Management</h1>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={() => setBulkConfirmOpen(true)}>
                        <Upload className="w-4 h-4 mr-2" />Add Bulk
                    </Button>
                    <Button onClick={() => { setFormData({ name: '', code: '', location: '' }); setModal({ open: true, mode: 'create' }); }}>
                        <Plus className="w-4 h-4 mr-2" />Add Venue
                    </Button>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="relative max-w-sm">
                        <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                        <Input
                            placeholder="Search venues…"
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
                                <TableHead>Venue Name</TableHead>
                                <TableHead>Code</TableHead>
                                <TableHead>Location</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Fleet</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={6} className="text-center py-8 text-muted-foreground">No venues found</TableCell></TableRow>
                            ) : filtered.map(s => (
                                <TableRow key={s.id} className={!s.isActive ? 'opacity-60 bg-muted/30' : ''}>
                                    <TableCell className="font-semibold">{s.name}</TableCell>
                                    <TableCell><code className="bg-muted px-1 rounded">{s.code}</code></TableCell>
                                    <TableCell className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" /> {s.location}</TableCell>
                                    <TableCell>
                                        <Badge variant={s.isActive ? 'default' : 'secondary'} className={s.isActive ? 'bg-green-600' : 'bg-gray-400'}>
                                            {s.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {s.fleetStats ? (
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <Badge variant="secondary" className="font-semibold">
                                                    {s.fleetStats.total} total
                                                </Badge>
                                                <div className="flex items-center gap-1 text-xs">
                                                    <span className="flex items-center gap-0.5" title="Cargo">
                                                        <Truck className="w-3 h-3 text-orange-500" />
                                                        {s.fleetStats.cargo}
                                                    </span>
                                                    <span className="flex items-center gap-0.5" title="4-Seater">
                                                        <Users className="w-3 h-3 text-blue-500" />
                                                        {s.fleetStats.fourSeater}
                                                    </span>
                                                    <span className="flex items-center gap-0.5" title="6-Seater">
                                                        <UserPlus className="w-3 h-3 text-green-500" />
                                                        {s.fleetStats.sixSeater}
                                                    </span>
                                                    <span className="flex items-center gap-0.5" title="Accessibility">
                                                        <Accessibility className="w-3 h-3 text-purple-500" />
                                                        {s.fleetStats.accessibility}
                                                    </span>
                                                </div>
                                            </div>
                                        ) : (
                                            <span className="text-muted-foreground text-sm">—</span>
                                        )}
                                    </TableCell>
                                    <TableCell className="text-right">
                                        <div className="flex justify-end gap-1">
                                            <Button variant="ghost" size="sm" title="Edit" onClick={() => {
                                                setFormData({ name: s.name, code: s.code, location: s.location });
                                                setModal({ open: true, mode: 'edit', stadium: s });
                                            }}><Edit2 className="w-4 h-4" /></Button>
                                            <Button variant="ghost" size="sm" title={s.isActive ? 'Make Inactive' : 'Make Active'} onClick={() => handleToggleActive(s)}>
                                                {s.isActive ? <PowerOff className="w-4 h-4 text-yellow-600" /> : <Power className="w-4 h-4 text-green-600" />}
                                            </Button>
                                            <Button variant="ghost" size="sm" title="Delete" onClick={() => setDeleteConfirm(s)}>
                                                <Trash2 className="w-4 h-4 text-red-500" />
                                            </Button>
                                        </div>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Dialog open={modal.open} onOpenChange={o => setModal(m => ({ ...m, open: o }))}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>{modal.mode === 'create' ? 'Add Venue' : 'Edit Venue'}</DialogTitle>
                    </DialogHeader>
                    <form onSubmit={handleSave} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Venue Name *</Label>
                            <Input value={formData.name} onChange={e => setFormData(f => ({ ...f, name: e.target.value }))} required placeholder="e.g. Al Bayt Stadium" />
                        </div>
                        <div className="space-y-2">
                            <Label>Venue Code *</Label>
                            <Input value={formData.code} onChange={e => setFormData(f => ({ ...f, code: e.target.value }))} required placeholder="e.g. ABS" />
                        </div>
                        <div className="space-y-2">
                            <Label>Location / Address</Label>
                            <Input value={formData.location} onChange={e => setFormData(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Al Khor, Qatar" />
                        </div>
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

            {/* Bulk Load Default Venues Dialog */}
            <Dialog open={bulkConfirmOpen} onOpenChange={o => { if (!submitting) setBulkConfirmOpen(o); }}>
                <DialogContent className="max-w-lg">
                    <DialogHeader>
                        <DialogTitle>Load Default Venues</DialogTitle>
                        <DialogDescription>
                            The following {DEFAULT_VENUES.length} venues from the GC project template will be added. Venues with an already-existing code will be skipped automatically.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-64 overflow-y-auto border rounded-lg divide-y text-sm">
                        {DEFAULT_VENUES.map(v => {
                            const alreadyExists = stadiums.some(s => s.code.toUpperCase() === v.code.toUpperCase());
                            return (
                                <div key={v.code} className="flex items-center justify-between px-3 py-2">
                                    <div>
                                        <span className="font-medium">{v.name}</span>
                                        <code className="ml-2 text-xs bg-muted px-1 rounded">{v.code}</code>
                                    </div>
                                    {alreadyExists ? (
                                        <Badge variant="secondary" className="text-xs flex items-center gap-1">
                                            <SkipForward className="w-3 h-3" />Skip
                                        </Badge>
                                    ) : (
                                        <Badge variant="default" className="text-xs flex items-center gap-1 bg-green-600">
                                            <CheckCircle2 className="w-3 h-3" />Add
                                        </Badge>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBulkConfirmOpen(false)} disabled={submitting}>Cancel</Button>
                        <Button onClick={handleBulkLoad} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Import Venues
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <Dialog open={!!deleteConfirm} onOpenChange={o => !o && setDeleteConfirm(null)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Delete Stadium</DialogTitle>
                        <DialogDescription>
                            Are you sure you want to delete <strong>{deleteConfirm?.name}</strong>?
                            This action cannot be undone. If the stadium has associated carts, users, or departments, deletion will be prevented — use "Make Inactive" instead.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setDeleteConfirm(null)}>Cancel</Button>
                        <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
                            {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Delete Stadium
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
