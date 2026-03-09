import { useState, useEffect } from 'react';
import { stadiumsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, Edit2, Trash2, Loader2, MapPin } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface Stadium {
    id: string;
    name: string;
    code: string;
    location: string;
    isActive: boolean;
}

export function StadiumsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');

    const [modal, setModal] = useState<{ open: boolean; mode: 'create' | 'edit'; stadium?: Stadium }>({ open: false, mode: 'create' });
    const [submitting, setSubmitting] = useState(false);
    const [formData, setFormData] = useState({ name: '', code: '', location: '' });

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
            } else {
                await stadiumsApi.update(modal.stadium!.id, formData);
            }
            setModal({ open: false, mode: 'create' });
            loadStadiums();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save stadium');
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
                <Button onClick={() => { setFormData({ name: '', code: '', location: '' }); setModal({ open: true, mode: 'create' }); }}>
                    <Plus className="w-4 h-4 mr-2" />Add Venue
                </Button>
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
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="animate-spin mx-auto" /></TableCell></TableRow>
                            ) : filtered.length === 0 ? (
                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No venues found</TableCell></TableRow>
                            ) : filtered.map(s => (
                                <TableRow key={s.id}>
                                    <TableCell className="font-semibold">{s.name}</TableCell>
                                    <TableCell><code className="bg-muted px-1 rounded">{s.code}</code></TableCell>
                                    <TableCell className="flex items-center gap-1 text-muted-foreground"><MapPin className="w-3 h-3" /> {s.location}</TableCell>
                                    <TableCell className="text-right">
                                        <Button variant="ghost" size="sm" onClick={() => {
                                            setFormData({ name: s.name, code: s.code, location: s.location });
                                            setModal({ open: true, mode: 'edit', stadium: s });
                                        }}><Edit2 className="w-4 h-4" /></Button>
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
        </div>
    );
}
