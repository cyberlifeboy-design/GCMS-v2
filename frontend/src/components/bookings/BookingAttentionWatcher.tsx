import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import { KeyRound, AlarmClock, Loader2 } from 'lucide-react';
import { poolBookingRequestsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AttentionBooking {
    id: string;
    bookingType: string;
    requesterName: string;
    requesterPhone: string;
    createdAt: string;
    reviewedAt: string | null;
    keyCollectedAt: string | null;
    startDate: string; startTime: string;
    endDate: string; endTime: string;
    autoReleaseAt?: string;
    fleet: { carNumber: string };
    stadium: { name: string };
}

const POLL_MS = 30_000;
const LATER_MS = 10 * 60_000;
/** BookingsPage listens for this to refresh after a popup action. */
export const BOOKINGS_CHANGED_EVENT = 'gcms:bookings-changed';

const pad = (n: number) => String(n).padStart(2, '0');
const toDate = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const toTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const fmt = (s?: string | null) => (s ? new Date(s).toLocaleString() : '—');
function duration(ms: number) {
    const m = Math.max(0, Math.floor(ms / 60_000));
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m ${pad(Math.max(0, Math.floor(ms / 1000) % 60))}s`;
}

/**
 * Admin/SuperAdmin popups for pool bookings (mounted once in MainLayout):
 *  - key check: the collection window passed — "was the key collected?" (unanswered → server auto-releases)
 *  - overdue:  past the return time — extend, mark returned, or ask again later (unanswered → stays overdue)
 */
export function BookingAttentionWatcher() {
    const { user } = useAuthStore();
    const enabled = user?.role === 'SuperAdmin' || user?.role === 'Admin';
    const [keyChecks, setKeyChecks] = useState<AttentionBooking[]>([]);
    const [overdue, setOverdue] = useState<AttentionBooking[]>([]);
    const snoozed = useRef(new Map<string, number>()); // bookingId -> snoozed until (ms)
    const [now, setNow] = useState(Date.now());
    const [busy, setBusy] = useState(false);
    const [extendDate, setExtendDate] = useState('');
    const [extendTime, setExtendTime] = useState('');

    const load = useCallback(async () => {
        try {
            const res = await poolBookingRequestsApi.getAttention();
            setKeyChecks(res.data.data.keyChecks || []);
            setOverdue(res.data.data.overdue || []);
        } catch {
            /* transient — next poll retries */
        }
    }, []);

    useEffect(() => {
        if (!enabled) return;
        load();
        const poll = setInterval(load, POLL_MS);
        const tick = setInterval(() => setNow(Date.now()), 1000);
        return () => { clearInterval(poll); clearInterval(tick); };
    }, [enabled, load]);

    const visible = (b: AttentionBooking) => (snoozed.current.get(b.id) ?? 0) <= now;
    const keyCheck = keyChecks.find(visible);
    const late = keyCheck ? undefined : overdue.find(visible);
    const current = keyCheck ?? late;

    // Pre-fill the extend form with "+1h from now" whenever a new overdue booking shows.
    useEffect(() => {
        if (!late) return;
        const d = new Date(Date.now() + 60 * 60_000);
        setExtendDate(toDate(d));
        setExtendTime(toTime(d));
    }, [late?.id]);

    if (!enabled || !current) return null;

    const snooze = (until: number) => {
        snoozed.current.set(current.id, until);
        setNow(Date.now());
    };

    const act = async (fn: () => Promise<unknown>, success: string) => {
        setBusy(true);
        try {
            await fn();
            toast.success(success);
            snoozed.current.delete(current.id);
            await load();
            window.dispatchEvent(new Event(BOOKINGS_CHANGED_EVENT));
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Action failed');
            await load();
        } finally {
            setBusy(false);
        }
    };

    const addToEnd = (minutes: number) => {
        const base = Math.max(Date.now(), new Date(`${current.endDate}T${current.endTime}:00`).getTime());
        const d = new Date(base + minutes * 60_000);
        setExtendDate(toDate(d));
        setExtendTime(toTime(d));
    };

    const details = (
        <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1">
            <div className="flex justify-between"><span className="text-muted-foreground">Car</span><b>{current.fleet.carNumber}</b></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Venue</span><span>{current.stadium.name}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Requester</span><span>{current.requesterName} · {current.requesterPhone}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Booked</span><span>{fmt(current.createdAt)}</span></div>
            <div className="flex justify-between"><span className="text-muted-foreground">Approved</span><span>{fmt(current.reviewedAt)}</span></div>
            {current.keyCollectedAt && (
                <div className="flex justify-between"><span className="text-muted-foreground">Key collected</span><span>{fmt(current.keyCollectedAt)}</span></div>
            )}
        </div>
    );

    if (keyCheck) {
        const releaseIn = keyCheck.autoReleaseAt ? new Date(keyCheck.autoReleaseAt).getTime() - now : 0;
        return (
            <Dialog open onOpenChange={(o) => !o && snooze(keyCheck.autoReleaseAt ? new Date(keyCheck.autoReleaseAt).getTime() : now + LATER_MS)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><KeyRound className="w-5 h-5 text-amber-600" /> Was the key collected?</DialogTitle>
                        <DialogDescription>
                            The key-collection window for this booking has passed. If nobody answers, the car is
                            released back to the pool automatically in <b>{duration(releaseIn)}</b>.
                        </DialogDescription>
                    </DialogHeader>
                    {details}
                    <DialogFooter className="gap-2 sm:gap-2">
                        <Button variant="outline" disabled={busy}
                            onClick={() => act(() => poolBookingRequestsApi.release(keyCheck.id), 'Car released back to the pool')}>
                            No — release the car
                        </Button>
                        <Button disabled={busy}
                            onClick={() => act(() => poolBookingRequestsApi.markKeyCollected(keyCheck.id), 'Key collection confirmed — trip timer started')}>
                            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Yes, key collected'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        );
    }

    const overdueBy = now - new Date(`${current.endDate}T${current.endTime}:00`).getTime();
    return (
        <Dialog open onOpenChange={(o) => !o && snooze(now + LATER_MS)}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle className="flex items-center gap-2"><AlarmClock className="w-5 h-5 text-red-600" /> Booking overdue — extend?</DialogTitle>
                    <DialogDescription>
                        Due back {current.endDate} {current.endTime} — overdue by <b>{duration(overdueBy)}</b>.
                        Extend the booking, or mark the car returned to the pool.
                    </DialogDescription>
                </DialogHeader>
                {details}
                <div className="space-y-2">
                    <Label>New return time</Label>
                    <div className="flex gap-2">
                        <Input type="date" value={extendDate} onChange={(e) => setExtendDate(e.target.value)} />
                        <Input type="time" value={extendTime} onChange={(e) => setExtendTime(e.target.value)} />
                    </div>
                    <div className="flex gap-2">
                        {[30, 60, 120].map((m) => (
                            <Button key={m} type="button" size="sm" variant="secondary" onClick={() => addToEnd(m)}>
                                +{m >= 60 ? `${m / 60}h` : `${m}m`}
                            </Button>
                        ))}
                    </div>
                </div>
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button variant="ghost" disabled={busy} onClick={() => snooze(now + LATER_MS)}>Ask again later</Button>
                    <Button variant="outline" disabled={busy}
                        onClick={() => act(() => poolBookingRequestsApi.markReturned(current.id), 'Marked returned — car is back in the pool')}>
                        No — mark returned
                    </Button>
                    <Button disabled={busy || !extendDate || !extendTime}
                        onClick={() => act(() => poolBookingRequestsApi.extendByAdmin(current.id, extendDate, extendTime), `Extended to ${extendDate} ${extendTime}`)}>
                        Extend
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
