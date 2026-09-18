import { useState, useEffect } from 'react';
import { incidentsApi, usersApi, stadiumsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CameraCaptureButton } from '@/components/shared/CameraCaptureButton';
import { toast } from 'sonner';

interface Props {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    subjectUserId?: string;
    fleetId?: string;
    stadiumId?: string;
    onFiled?: () => void;
}

export function ReportIncidentModal({ open, onOpenChange, subjectUserId, fleetId, stadiumId, onFiled }: Props) {
    const { user } = useAuthStore();
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string }>>([]);
    const [venueId, setVenueId] = useState('');
    const [users, setUsers] = useState<Array<{ id: string; name: string; accreditationNumber?: string | null }>>([]);
    const [subject, setSubject] = useState(subjectUserId ?? '');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
    const [photos, setPhotos] = useState<File[]>([]);
    const [saving, setSaving] = useState(false);

    // Subject is always an FA of the chosen venue — never a SuperAdmin/Admin/Contracts/MaintenanceTeam
    // account. When the caller doesn't already pin a venue (stadiumId prop) and the current user
    // isn't scoped to one, an explicit venue picker gates the subject list.
    const needsVenuePicker = !stadiumId && !user?.stadiumId;

    useEffect(() => {
        if (!open) return;
        setSubject(subjectUserId ?? '');
        setTitle('');
        setDescription('');
        setOccurredAt(new Date().toISOString().slice(0, 16));
        setPhotos([]);
        const initialVenue = stadiumId || user?.stadiumId || '';
        setVenueId(initialVenue);
        if (!initialVenue) {
            stadiumsApi.getAll()
                .then(res => setStadiums(res.data.data ?? res.data ?? []))
                .catch(() => setStadiums([]));
        }
    }, [open, subjectUserId, stadiumId, user?.stadiumId]);

    useEffect(() => {
        if (!open || !venueId) { setUsers([]); return; }
        usersApi.getAll({ role: 'FA', stadiumId: venueId, isActive: true, limit: 500 })
            .then(res => setUsers((res.data.data ?? res.data ?? []).map((u: any) => ({ id: u.id, name: u.name, accreditationNumber: u.accreditationNumber }))))
            .catch(() => setUsers([]));
    }, [open, venueId]);

    const submit = async () => {
        if (!venueId || !subject || !title.trim() || !description.trim()) {
            toast.error('Venue, subject, title and description are required');
            return;
        }
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('subjectUserId', subject);
            fd.append('title', title.trim());
            fd.append('description', description.trim());
            fd.append('occurredAt', new Date(occurredAt).toISOString());
            if (fleetId) fd.append('fleetId', fleetId);
            fd.append('stadiumId', venueId);
            photos.slice(0, 5).forEach(f => fd.append('photos', f));
            const res = await incidentsApi.report(fd);
            toast.success(`Incident filed — ${res.data.data?.reference ?? 'reference pending'}`);
            onOpenChange(false);
            onFiled?.();
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to file incident');
        } finally {
            setSaving(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-lg">
                <DialogHeader>
                    <DialogTitle>Report an incident</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                    {needsVenuePicker && (
                        <div className="space-y-1">
                            <Label>Venue</Label>
                            <Select value={venueId} onValueChange={setVenueId} disabled={!!subjectUserId}>
                                <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
                                <SelectContent>
                                    {stadiums.map(s => (
                                        <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                    <div className="space-y-1">
                        <Label>Subject (person the incident is about)</Label>
                        <Select value={subject} onValueChange={setSubject} disabled={!!subjectUserId || !venueId}>
                            <SelectTrigger><SelectValue placeholder={venueId ? 'Select an FA' : 'Select a venue first'} /></SelectTrigger>
                            <SelectContent>
                                {users.map(u => (
                                    <SelectItem key={u.id} value={u.id}>
                                        {u.name}{u.accreditationNumber ? ` — FA ${u.accreditationNumber}` : ''}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="inc-title">Title</Label>
                        <Input id="inc-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary" />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="inc-desc">Description</Label>
                        <Textarea id="inc-desc" rows={4} value={description} onChange={e => setDescription(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="inc-when">Occurred at</Label>
                        <Input id="inc-when" type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                        <Label htmlFor="inc-photos">Photos (optional, up to 5)</Label>
                        <div className="flex items-center gap-2">
                            <input id="inc-photos" type="file" accept="image/*" multiple
                                onChange={e => setPhotos(Array.from(e.target.files || []).slice(0, 5))}
                                className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5" />
                            <CameraCaptureButton
                                disabled={photos.length >= 5}
                                onCapture={file => setPhotos(prev => [...prev, file].slice(0, 5))}
                            />
                        </div>
                        {photos.length > 0 && (
                            <p className="text-xs text-muted-foreground">{photos.length} photo(s) selected</p>
                        )}
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Cancel</Button>
                    <Button onClick={submit} disabled={saving}>{saving ? 'Filing…' : 'File incident'}</Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
