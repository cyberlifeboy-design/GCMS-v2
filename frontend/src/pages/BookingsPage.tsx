import { useState, useEffect, useCallback } from 'react';
import { poolBookingRequestsApi, poolBookingsApi, stadiumsApi, accessRequestsApi } from '@/lib/api';
import type { AuthUser } from '@/stores/authStore';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, RefreshCw, Edit2, Ban, AlertTriangle, Undo2, Download, ChevronDown, ChevronRight, ChevronLeft, ShieldAlert, Car, Bell, Clock } from 'lucide-react';
import { ReportIncidentModal } from '@/components/incidents/ReportIncidentModal';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

interface Booking {
    id: string;
    requesterName: string;
    requesterEmail: string;
    requesterPhone: string;
    stadiumId: string;
    stadium: { id: string; name: string; code: string };
    fleetId: string;
    fleet: { id: string; carNumber: string; carType: string };
    faUser: { id: string; name: string; accreditationNumber?: string | null };
    bookingType: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    purpose?: string;
    status: string;
    derivedState?: string;
    reviewComment?: string;
    reviewedBy?: { id: string; name: string };
    reviewedAt?: string;
    returnedAt?: string | null;
    returnedBy?: { id: string; name: string } | null;
    createdAt: string;
    extensionStatus?: string | null;
    extensionRequestedEndDate?: string | null;
    extensionRequestedEndTime?: string | null;
    keyCollectedAt?: string | null;
    instantDurationMinutes?: number | null;
}

const derivedBadge: Record<string, string> = {
    Upcoming: 'bg-sky-100 text-sky-700',
    Active: 'bg-emerald-100 text-emerald-700',
    Overdue: 'bg-red-100 text-red-700',
    Completed: 'bg-slate-100 text-slate-600',
};

function combineDateTime(dateStr: string, timeStr: string): Date {
    return new Date(`${dateStr}T${timeStr}:00`);
}

function formatElapsed(minutes: number): string {
    const m = Math.max(0, Math.round(minutes));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    const days = Math.floor(h / 24);
    if (days > 0) return `${days}d ${h % 24}h`;
    const remMin = m % 60;
    return remMin > 0 ? `${h}h ${remMin}m` : `${h}h`;
}

type Tone = 'red' | 'amber' | 'blue' | 'green' | 'muted';

/** A countdown chip's text + color tone, derived from the booking's live derivedState. */
function formatCountdown(b: Booking): { text: string; tone: Tone } {
    const now = Date.now();
    if (b.derivedState === 'Overdue') {
        const end = combineDateTime(b.endDate, b.endTime);
        return { text: `${formatElapsed((now - end.getTime()) / 60000)} overdue`, tone: 'red' };
    }
    if (b.derivedState === 'Active') {
        if (b.bookingType === 'Instant' && b.keyCollectedAt) {
            const end = combineDateTime(b.endDate, b.endTime);
            const remainingMin = (end.getTime() - now) / 60000;
            return { text: `${formatElapsed(remainingMin)} remaining`, tone: remainingMin <= 15 ? 'amber' : 'green' };
        }
        return { text: 'Active now', tone: 'green' };
    }
    if (b.derivedState === 'Upcoming') {
        const start = combineDateTime(b.startDate, b.startTime);
        const diffMin = (start.getTime() - now) / 60000;
        return { text: `starts in ${formatElapsed(diffMin)}`, tone: diffMin <= 120 ? 'blue' : 'muted' };
    }
    return { text: b.derivedState || b.status, tone: 'muted' };
}

/** "Today" / "Tomorrow" / "Yesterday" / "Fri, 20 Sep" for a YYYY-MM-DD date string. */
function dayLabel(dateStr: string): string {
    const d = new Date(`${dateStr}T00:00:00`);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((d.getTime() - today.getTime()) / 86400000);
    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    return d.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short' });
}

/** Groups bookings by their start date, sorted chronologically. */
function groupByDay(bookings: Booking[]): Array<[string, Booking[]]> {
    const map = new Map<string, Booking[]>();
    for (const b of bookings) {
        if (!map.has(b.startDate)) map.set(b.startDate, []);
        map.get(b.startDate)!.push(b);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
}

const toneCardCls: Record<Tone, string> = {
    red: 'border-red-200 bg-red-50/70',
    amber: 'border-amber-200 bg-amber-50/70',
    blue: 'border-sky-200 bg-sky-50/70',
    green: 'border-emerald-200 bg-emerald-50/70',
    muted: 'border-border bg-card',
};

const toneChipCls: Record<Tone, string> = {
    red: 'bg-red-600 text-white',
    amber: 'bg-amber-500 text-white',
    blue: 'bg-sky-600 text-white',
    green: 'bg-emerald-600 text-white',
    muted: 'bg-muted text-muted-foreground',
};

/** Expandable detail row shared by the live/history tables. */
function BookerDetail({ b }: { b: Booking }) {
    return (
        <div className="text-sm grid gap-1 p-3 bg-muted/40 rounded-md">
            <div>
                Requester: <b>{b.requesterName}</b> · FA {b.faUser?.accreditationNumber ?? '—'}
            </div>
            <div>{b.requesterPhone} · {b.requesterEmail}</div>
            <div>
                Type: <b>{b.bookingType}</b>
                {b.bookingType === 'Recurring' && ' — one date within a multi-date recurring booking (same cart)'}
                {b.bookingType === 'Instant' && ' — no schedule chosen, key must be collected within 10 min of approval'}
            </div>
            {b.bookingType !== 'Instant' && <div>Window: {b.startDate} {b.startTime} → {b.endDate} {b.endTime}</div>}
            {b.bookingType === 'Instant' && (
                <div>
                    Key collected:{' '}
                    <b>{b.keyCollectedAt ? new Date(b.keyCollectedAt).toLocaleString() : 'Not yet'}</b>
                </div>
            )}
            {b.returnedAt && (
                <div>Returned {new Date(b.returnedAt).toLocaleString()} by {b.returnedBy?.name ?? '—'}</div>
            )}
        </div>
    );
}

/** A single booking as a scannable card — cart, requester, time window, and a live
 * countdown/status chip — used by both the Upcoming/Active day-groups and the Calendar tab. */
function BookingCard({
    b,
    mode,
    canManage,
    currentUserId,
    busy,
    expanded,
    onToggleExpand,
    onMarkReturned,
    onMarkCollected,
    onExtend,
    onReviewExtension,
}: {
    b: Booking;
    mode?: 'live' | 'upcoming';
    canManage: boolean;
    currentUserId?: string;
    busy?: boolean;
    expanded?: boolean;
    onToggleExpand?: () => void;
    onMarkReturned?: () => void;
    onMarkCollected?: () => void;
    onExtend?: () => void;
    onReviewExtension?: (approve: boolean) => void;
}) {
    // Instant bookings' remaining-time text needs to tick on its own — the page's
    // periodic data refresh isn't frequent enough for a "counting down" feel.
    const isInstantRunning = b.bookingType === 'Instant' && !!b.keyCollectedAt && b.derivedState === 'Active';
    const [, forceTick] = useState(0);
    useEffect(() => {
        if (!isInstantRunning) return;
        const id = setInterval(() => forceTick((n) => n + 1), 30_000);
        return () => clearInterval(id);
    }, [isInstantRunning]);

    const cd = formatCountdown(b);
    const hasActions = mode === 'live';
    const instantProgressPct = (() => {
        if (!isInstantRunning || !b.instantDurationMinutes) return null;
        const collectedAt = new Date(b.keyCollectedAt!).getTime();
        const totalMs = b.instantDurationMinutes * 60_000;
        const elapsedMs = Date.now() - collectedAt;
        return Math.min(100, Math.max(0, (elapsedMs / totalMs) * 100));
    })();

    return (
        <div className={`rounded-xl border p-4 ${toneCardCls[cd.tone]}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center shrink-0">
                        <Car className="w-4 h-4 text-muted-foreground" />
                    </div>
                    <div>
                        <p className="font-semibold">
                            {b.fleet?.carNumber} <span className="font-normal text-muted-foreground text-sm">· {b.fleet?.carType}</span>
                        </p>
                        <p className="text-sm text-muted-foreground">{b.requesterName} · FA {b.faUser?.accreditationNumber ?? '—'}</p>
                        <p className="text-sm mt-0.5">
                            {b.startTime}–{b.endTime}{b.endDate !== b.startDate ? ` (→ ${b.endDate})` : ''}
                        </p>
                        {b.extensionStatus === 'Pending' && (
                            <p className="text-xs text-amber-700 font-semibold mt-1">
                                Extension requested → {b.extensionRequestedEndDate} {b.extensionRequestedEndTime}
                            </p>
                        )}
                    </div>
                </div>
                <div className="shrink-0 text-right">
                    <span className={`inline-block rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${toneChipCls[cd.tone]}`}>
                        {cd.text}
                    </span>
                    {instantProgressPct != null && (
                        <div className="mt-1.5 w-24 h-1.5 rounded-full bg-muted overflow-hidden">
                            <div
                                className={`h-full rounded-full transition-all ${instantProgressPct >= 85 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                                style={{ width: `${instantProgressPct}%` }}
                            />
                        </div>
                    )}
                </div>
            </div>
            {(onToggleExpand || hasActions) && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                    {onToggleExpand && (
                        <button onClick={onToggleExpand} className="text-xs text-muted-foreground hover:text-primary underline">
                            {expanded ? 'Hide details' : 'Details'}
                        </button>
                    )}
                    {hasActions && canManage && b.bookingType === 'Instant' && !b.keyCollectedAt && (
                        <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white" disabled={busy} onClick={onMarkCollected}>
                            Confirm Key Collected
                        </Button>
                    )}
                    {hasActions && canManage && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={onMarkReturned}>
                            <Undo2 className="w-4 h-4 mr-1" /> Mark Returned
                        </Button>
                    )}
                    {hasActions && canManage && b.extensionStatus === 'Pending' && (
                        <>
                            <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" disabled={busy} onClick={() => onReviewExtension?.(true)}>
                                Approve Extension
                            </Button>
                            <Button size="sm" variant="destructive" disabled={busy} onClick={() => onReviewExtension?.(false)}>
                                Reject
                            </Button>
                        </>
                    )}
                    {hasActions && !canManage && b.faUser?.id === currentUserId && b.extensionStatus !== 'Pending' && (
                        <Button size="sm" variant="outline" disabled={busy} onClick={onExtend}>
                            Request Extension
                        </Button>
                    )}
                </div>
            )}
            {expanded && (
                <div className="mt-3">
                    <BookerDetail b={b} />
                </div>
            )}
        </div>
    );
}

/** Alert chips surfacing what needs attention right now — overdue returns, pending
 * extension requests, and bookings about to start — without digging through tabs. */
function AlertsStrip({
    stadiumId,
    refreshKey,
    onNavigate,
}: {
    stadiumId?: string;
    refreshKey?: number;
    onNavigate: (tab: string) => void;
}) {
    const [rows, setRows] = useState<Booking[]>([]);

    useEffect(() => {
        const params: Record<string, string> = { status: 'Approved' };
        if (stadiumId) params.stadiumId = stadiumId;
        poolBookingRequestsApi.getAll(params)
            .then((res) => setRows(res.data.data || []))
            .catch(() => setRows([]));
    }, [stadiumId, refreshKey]);

    const overdue = rows.filter((b) => b.derivedState === 'Overdue');
    const extensions = rows.filter((b) => b.extensionStatus === 'Pending');
    const startingSoon = rows.filter((b) => {
        if (b.derivedState !== 'Upcoming') return false;
        return combineDateTime(b.startDate, b.startTime).getTime() - Date.now() <= 2 * 60 * 60 * 1000;
    });

    const chips: Array<{ tab: string; label: string; icon: typeof AlertTriangle; cls: string }> = [
        overdue.length > 0 && {
            tab: 'live',
            label: `${overdue.length} Overdue`,
            icon: AlertTriangle,
            cls: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-100',
        },
        extensions.length > 0 && {
            tab: 'live',
            label: `${extensions.length} Extension request${extensions.length > 1 ? 's' : ''}`,
            icon: Clock,
            cls: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
        },
        startingSoon.length > 0 && {
            tab: 'upcoming',
            label: `${startingSoon.length} starting soon`,
            icon: Bell,
            cls: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100',
        },
    ].filter(Boolean) as Array<{ tab: string; label: string; icon: typeof AlertTriangle; cls: string }>;

    if (chips.length === 0) return null;

    return (
        <div className="flex flex-wrap gap-2">
            {chips.map((c, i) => (
                <button
                    key={i}
                    onClick={() => onNavigate(c.tab)}
                    className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${c.cls}`}
                >
                    <c.icon className="w-3.5 h-3.5" /> {c.label}
                </button>
            ))}
        </div>
    );
}

/** Month calendar of approved bookings — click a day to see what's booked. Read-only;
 * approving/rejecting/managing stays in the Review queue / Active & Overdue tabs. */
function CalendarTab({ stadiumId, refreshKey }: { stadiumId?: string; refreshKey?: number }) {
    const [monthCursor, setMonthCursor] = useState(() => {
        const d = new Date();
        d.setDate(1);
        return d;
    });
    const [rows, setRows] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true);
        const params: Record<string, string> = { status: 'Approved' };
        if (stadiumId) params.stadiumId = stadiumId;
        poolBookingRequestsApi.getAll(params)
            .then((res) => setRows(res.data.data || []))
            .finally(() => setLoading(false));
    }, [stadiumId, refreshKey]);

    const byDate = new Map<string, Booking[]>();
    for (const b of rows) {
        const cur = new Date(`${b.startDate}T00:00:00`);
        const end = new Date(`${b.endDate}T00:00:00`);
        let guard = 0;
        while (cur <= end && guard < 366) {
            const key = cur.toISOString().slice(0, 10);
            if (!byDate.has(key)) byDate.set(key, []);
            byDate.get(key)!.push(b);
            cur.setDate(cur.getDate() + 1);
            guard++;
        }
    }

    const year = monthCursor.getFullYear();
    const month = monthCursor.getMonth();
    const firstOfMonth = new Date(year, month, 1);
    const startWeekday = firstOfMonth.getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const cells: Array<{ date: string | null; dayNum: number | null }> = [];
    for (let i = 0; i < startWeekday; i++) cells.push({ date: null, dayNum: null });
    for (let d = 1; d <= daysInMonth; d++) {
        cells.push({ date: `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`, dayNum: d });
    }

    const todayKey = new Date().toISOString().slice(0, 10);
    const dayTone = (dayBookings: Booking[]): Tone => {
        if (dayBookings.some((b) => b.derivedState === 'Overdue')) return 'red';
        if (dayBookings.some((b) => b.derivedState === 'Active')) return 'green';
        if (dayBookings.length > 0) return 'blue';
        return 'muted';
    };
    const dotCls: Record<Tone, string> = {
        red: 'bg-red-500',
        amber: 'bg-amber-500',
        blue: 'bg-sky-500',
        green: 'bg-emerald-500',
        muted: '',
    };

    const selectedRows = selectedDate ? byDate.get(selectedDate) || [] : [];

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <Button variant="outline" size="icon" onClick={() => setMonthCursor(new Date(year, month - 1, 1))}>
                    <ChevronLeft className="w-4 h-4" />
                </Button>
                <h3 className="font-semibold text-lg">
                    {monthCursor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}
                </h3>
                <Button variant="outline" size="icon" onClick={() => setMonthCursor(new Date(year, month + 1, 1))}>
                    <ChevronRight className="w-4 h-4" />
                </Button>
            </div>
            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : (
                <>
                    <div className="grid grid-cols-7 gap-1.5 text-center text-xs text-muted-foreground font-medium mb-1">
                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => <div key={d}>{d}</div>)}
                    </div>
                    <div className="grid grid-cols-7 gap-1.5">
                        {cells.map((c, i) => {
                            if (!c.date) return <div key={`blank-${i}`} />;
                            const dayBookings = byDate.get(c.date) || [];
                            const tone = dayTone(dayBookings);
                            const isToday = c.date === todayKey;
                            const isSelected = c.date === selectedDate;
                            return (
                                <button
                                    key={c.date}
                                    onClick={() => setSelectedDate(isSelected ? null : c.date)}
                                    className={`aspect-square rounded-lg border p-1.5 flex flex-col items-center justify-center gap-0.5 text-sm transition-colors
                                        ${isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-border hover:border-primary/50'}
                                        ${isToday ? 'bg-primary/5 font-bold' : ''}`}
                                >
                                    <span>{c.dayNum}</span>
                                    {dayBookings.length > 0 && <span className={`w-1.5 h-1.5 rounded-full ${dotCls[tone]}`} />}
                                </button>
                            );
                        })}
                    </div>
                    {selectedDate && (
                        <div className="pt-2">
                            <h4 className="text-sm font-semibold text-muted-foreground mb-2">
                                {dayLabel(selectedDate)} · {selectedRows.length} booking{selectedRows.length === 1 ? '' : 's'}
                            </h4>
                            {selectedRows.length === 0 ? (
                                <p className="text-sm text-muted-foreground py-4 text-center">No bookings this day.</p>
                            ) : (
                                <div className="space-y-3">
                                    {selectedRows.map((b) => <BookingCard key={b.id} b={b} canManage={false} />)}
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

function LiveBookingsPanel({
    mode,
    stadiumId,
    canManage,
    currentUserId,
    onChanged,
}: {
    mode: 'live' | 'upcoming';
    stadiumId?: string;
    canManage: boolean;
    currentUserId?: string;
    onChanged?: () => void;
}) {
    const [rows, setRows] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [busy, setBusy] = useState<string | null>(null);
    const [extendTarget, setExtendTarget] = useState<Booking | null>(null);
    const [extendDate, setExtendDate] = useState('');
    const [extendTime, setExtendTime] = useState('');

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = { status: 'Approved' };
            if (stadiumId) params.stadiumId = stadiumId;
            const res = await poolBookingRequestsApi.getAll(params);
            const all: Booking[] = res.data.data || [];
            setRows(
                all.filter((b) =>
                    mode === 'upcoming'
                        ? b.derivedState === 'Upcoming'
                        : b.derivedState === 'Active' || b.derivedState === 'Overdue',
                ),
            );
        } finally {
            setLoading(false);
        }
    }, [mode, stadiumId]);
    useEffect(() => { load(); }, [load]);

    const markReturned = async (id: string) => {
        setBusy(id);
        try {
            await poolBookingRequestsApi.markReturned(id);
            toast.success('Booking marked returned');
            load();
            onChanged?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Failed to mark returned');
        } finally {
            setBusy(null);
        }
    };

    const markCollected = async (id: string) => {
        setBusy(id);
        try {
            await poolBookingRequestsApi.markKeyCollected(id);
            toast.success('Key collection confirmed');
            load();
            onChanged?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Failed to confirm key collection');
        } finally {
            setBusy(null);
        }
    };

    const submitExtension = async () => {
        if (!extendTarget || !extendDate || !extendTime) return;
        setBusy(extendTarget.id);
        try {
            await poolBookingRequestsApi.requestExtension(extendTarget.id, extendDate, extendTime);
            toast.success('Extension requested — waiting for Admin approval');
            setExtendTarget(null);
            load();
            onChanged?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Failed to request extension');
        } finally {
            setBusy(null);
        }
    };

    const reviewExtension = async (id: string, approve: boolean) => {
        setBusy(id);
        try {
            await poolBookingRequestsApi.reviewExtension(id, approve);
            toast.success(approve ? 'Extension approved' : 'Extension rejected');
            load();
            onChanged?.();
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Failed to review extension');
        } finally {
            setBusy(null);
        }
    };

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    if (rows.length === 0) return <div className="text-center py-8 text-muted-foreground">Nothing here right now.</div>;

    const groups = groupByDay(rows);

    return (
        <div className="space-y-6">
            {groups.map(([date, dayRows]) => (
                <div key={date}>
                    <h3 className="text-sm font-semibold text-muted-foreground mb-2">{dayLabel(date)}</h3>
                    <div className="space-y-3">
                        {dayRows.map((b) => (
                            <BookingCard
                                key={b.id}
                                b={b}
                                mode={mode}
                                canManage={canManage}
                                currentUserId={currentUserId}
                                busy={busy === b.id}
                                expanded={expanded === b.id}
                                onToggleExpand={() => setExpanded(expanded === b.id ? null : b.id)}
                                onMarkReturned={() => markReturned(b.id)}
                                onMarkCollected={() => markCollected(b.id)}
                                onExtend={() => { setExtendTarget(b); setExtendDate(b.endDate); setExtendTime(b.endTime); }}
                                onReviewExtension={(approve) => reviewExtension(b.id, approve)}
                            />
                        ))}
                    </div>
                </div>
            ))}

            <Dialog open={!!extendTarget} onOpenChange={o => !o && setExtendTarget(null)}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Request Extension — {extendTarget?.fleet?.carNumber}</DialogTitle>
                        <DialogDescription>Pick the new return date/time. An Admin or SuperAdmin must approve it before it takes effect.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-3">
                        <div className="space-y-1">
                            <Label className="text-xs">New return date</Label>
                            <Input type="date" value={extendDate} onChange={e => setExtendDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                            <Label className="text-xs">New return time</Label>
                            <Input type="time" value={extendTime} onChange={e => setExtendTime(e.target.value)} />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setExtendTarget(null)}>Cancel</Button>
                        <Button onClick={submitExtension} disabled={busy === extendTarget?.id || !extendDate || !extendTime}>
                            Submit Request
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}

function AvailableCarsPanel({ stadiumId }: { stadiumId?: string }) {
    const [carts, setCarts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        setLoading(true);
        poolBookingsApi
            .getPoolFleet(stadiumId ? { stadiumId } : undefined)
            .then((res) => setCarts(res.data?.data ?? res.data ?? []))
            .finally(() => setLoading(false));
    }, [stadiumId]);

    if (loading) return <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>;
    if (carts.length === 0) return <div className="text-center py-8 text-muted-foreground">No pool cars configured for this venue.</div>;

    const availableCount = carts.filter((c) => !c.currentBooking).length;

    return (
        <div className="space-y-4">
            <div className="flex items-center gap-4 text-sm">
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Available ({availableCount})</span>
                <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-400" /> Booked ({carts.length - availableCount})</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {carts.map((c) => {
                    const booked = !!c.currentBooking;
                    return (
                        <div
                            key={c.id}
                            className={`rounded-xl border p-4 ${booked ? 'bg-gray-100 border-gray-200' : 'bg-emerald-50 border-emerald-200'}`}
                        >
                            <div className="flex items-start justify-between">
                                <div>
                                    <p className={`font-bold text-lg ${booked ? 'text-gray-500' : 'text-emerald-900'}`}>{c.carNumber}</p>
                                    <p className={`text-xs ${booked ? 'text-gray-400' : 'text-emerald-700'}`}>{c.carType} · {c.stadium?.name ?? '—'}</p>
                                </div>
                                <span className={`text-xs font-semibold px-2 py-1 rounded-full ${booked ? 'bg-gray-300 text-gray-700' : 'bg-emerald-500 text-white'}`}>
                                    {booked ? 'Booked' : 'Available'}
                                </span>
                            </div>
                            {booked && c.currentBooking && (
                                <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-500 space-y-0.5">
                                    <p>FA: {c.currentBooking.faUser?.name ?? '—'}</p>
                                    <p>Until {c.currentBooking.endDate} {c.currentBooking.endTime}</p>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

/** FA-only: instant pool booking with the requester's own identity locked to their
 * account — venue/name/email/department can't be changed, just pick a cart. Goes
 * through the same public instant-booking endpoint the standalone /book-pool page
 * uses (optionalAuth records createdById when a session is present). */
function FAInstantBookingModal({ open, onOpenChange, user, onBooked }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    user: AuthUser;
    onBooked: () => void;
}) {
    const [departmentName, setDepartmentName] = useState('');
    const [carts, setCarts] = useState<{ id: string; carNumber: string; carType: string }[]>([]);
    const [loadingCarts, setLoadingCarts] = useState(false);
    const [fleetId, setFleetId] = useState('');
    const [purpose, setPurpose] = useState('');
    const [durationMinutes, setDurationMinutes] = useState(60);
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!open || !user.stadiumId) return;
        setFleetId('');
        setPurpose('');
        accessRequestsApi.getPublicDepartments(user.stadiumId)
            .then(res => setDepartmentName((res.data?.data || []).find((d: { id: string; name: string }) => d.id === user.departmentId)?.name || ''))
            .catch(() => {});
        setLoadingCarts(true);
        poolBookingRequestsApi.getInstantAvailableCarts(user.stadiumId)
            .then(res => setCarts(res.data?.data || []))
            .catch(() => setCarts([]))
            .finally(() => setLoadingCarts(false));
    }, [open, user.stadiumId, user.departmentId]);

    const handleSubmit = async () => {
        if (!fleetId || !user.stadiumId || !user.departmentId) return;
        setSubmitting(true);
        try {
            await poolBookingRequestsApi.createInstantPublic({
                stadiumId: user.stadiumId,
                fleetId,
                requesterName: user.name,
                requesterEmail: user.email,
                requesterPhone: user.phone || '',
                departmentId: user.departmentId,
                purpose: purpose || undefined,
                instantDurationMinutes: durationMinutes,
            });
            toast.success('Booking request submitted — waiting on your venue Admin to approve it.');
            onOpenChange(false);
            onBooked();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to submit booking');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="max-w-md">
                <DialogHeader>
                    <DialogTitle>Book a Pool Car</DialogTitle>
                    <DialogDescription>Pick an available car — your request goes to your venue's Admin to approve or reject.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3 text-sm bg-muted/30 rounded-lg p-3">
                        <div><Label className="text-xs">Venue</Label><p className="font-medium">{user.stadium?.name ?? '—'}</p></div>
                        <div><Label className="text-xs">Department</Label><p className="font-medium">{departmentName || '—'}</p></div>
                        <div><Label className="text-xs">Name</Label><p className="font-medium">{user.name}</p></div>
                        <div><Label className="text-xs">Email</Label><p className="font-medium truncate">{user.email}</p></div>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Available cars right now</Label>
                        {loadingCarts ? (
                            <div className="flex justify-center py-4"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div>
                        ) : carts.length === 0 ? (
                            <p className="text-sm text-muted-foreground py-2">No pool cars are free at your venue right now.</p>
                        ) : (
                            <Select value={fleetId} onValueChange={setFleetId}>
                                <SelectTrigger><SelectValue placeholder="Select a car" /></SelectTrigger>
                                <SelectContent>
                                    {carts.map(c => <SelectItem key={c.id} value={c.id}>{c.carNumber} — {c.carType}</SelectItem>)}
                                </SelectContent>
                            </Select>
                        )}
                    </div>
                    <div className="space-y-1.5">
                        <Label>How long do you need it?</Label>
                        <Select value={String(durationMinutes)} onValueChange={(v) => setDurationMinutes(Number(v))}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="60">1 hour</SelectItem>
                                <SelectItem value="180">3 hours</SelectItem>
                                <SelectItem value="300">5 hours</SelectItem>
                                <SelectItem value="480">8 hours</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-1.5">
                        <Label>Purpose (optional)</Label>
                        <Textarea value={purpose} onChange={e => setPurpose(e.target.value)} rows={2} />
                    </div>
                </div>
                <DialogFooter>
                    <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button onClick={handleSubmit} disabled={!fleetId || submitting}>
                        {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                        Submit Booking
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

/** FA's whole Bookings page — a read-only history of their own department's
 * bookings at their venue, plus the ability to make a new instant pool booking.
 * No review queue, no approve/reject, no Operating Hours — that's the Admin/
 * SuperAdmin/Observer console rendered by BookingsPage itself. */
function FABookingsView({ user }: { user: AuthUser }) {
    const [bookOpen, setBookOpen] = useState(false);
    const [refreshKey, setRefreshKey] = useState(0);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Bookings</h1>
                    <p className="text-muted-foreground mt-1">Your department's booking history at {user.stadium?.name ?? 'your venue'}</p>
                </div>
                <Button size="sm" onClick={() => setBookOpen(true)}>
                    <Car className="w-4 h-4 mr-2" /> Booking Pool
                </Button>
            </div>
            <FAInstantBookingModal
                open={bookOpen}
                onOpenChange={setBookOpen}
                user={user}
                onBooked={() => setRefreshKey(k => k + 1)}
            />
            <Card><CardContent className="pt-6">
                <HistoryPanel stadiumId={user.stadiumId} departmentId={user.departmentId} canExport={false} refreshKey={refreshKey} />
            </CardContent></Card>
        </div>
    );
}

function HistoryPanel({ stadiumId, departmentId, canExport = true, refreshKey }: { stadiumId?: string; departmentId?: string; canExport?: boolean; refreshKey?: number }) {
    const [rows, setRows] = useState<Booking[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [filters, setFilters] = useState<{ fromDate: string; toDate: string; status: string }>({ fromDate: '', toDate: '', status: '' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (stadiumId) params.stadiumId = stadiumId;
            if (departmentId) params.departmentId = departmentId;
            if (filters.fromDate) params.fromDate = filters.fromDate;
            if (filters.toDate) params.toDate = filters.toDate;
            if (filters.status) params.status = filters.status;
            const res = await poolBookingRequestsApi.getHistory(params);
            setRows(res.data.data || []);
        } finally {
            setLoading(false);
        }
    }, [stadiumId, departmentId, filters]);
    useEffect(() => { load(); }, [load, refreshKey]);

    const download = async (format: 'pdf' | 'xlsx') => {
        try {
            const params: Record<string, string> = { format };
            if (stadiumId) params.stadiumId = stadiumId;
            if (departmentId) params.departmentId = departmentId;
            if (filters.fromDate) params.fromDate = filters.fromDate;
            if (filters.toDate) params.toDate = filters.toDate;
            if (filters.status) params.status = filters.status;
            const res = await poolBookingRequestsApi.exportHistory(params);
            const url = URL.createObjectURL(new Blob([res.data]));
            const a = document.createElement('a');
            a.href = url;
            a.download = `booking_history.${format}`;
            a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Download failed');
        }
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
                <div className="space-y-1">
                    <Label className="text-xs">From</Label>
                    <Input type="date" value={filters.fromDate} onChange={(e) => setFilters({ ...filters, fromDate: e.target.value })} className="w-40" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">To</Label>
                    <Input type="date" value={filters.toDate} onChange={(e) => setFilters({ ...filters, toDate: e.target.value })} className="w-40" />
                </div>
                <div className="space-y-1">
                    <Label className="text-xs">Status</Label>
                    <Select value={filters.status || '__all__'} onValueChange={(v) => setFilters({ ...filters, status: v === '__all__' ? '' : v })}>
                        <SelectTrigger className="w-40"><SelectValue placeholder="All" /></SelectTrigger>
                        <SelectContent>
                            <SelectItem value="__all__">All</SelectItem>
                            <SelectItem value="Pending">Pending</SelectItem>
                            <SelectItem value="Approved">Approved</SelectItem>
                            <SelectItem value="Rejected">Rejected</SelectItem>
                            <SelectItem value="Cancelled">Cancelled</SelectItem>
                            <SelectItem value="Completed">Completed</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
                {canExport && (
                    <div className="flex gap-2">
                        <Button variant="outline" size="sm" onClick={() => download('pdf')}><Download className="w-4 h-4 mr-1" /> PDF</Button>
                        <Button variant="outline" size="sm" onClick={() => download('xlsx')}><Download className="w-4 h-4 mr-1" /> Excel</Button>
                    </div>
                )}
            </div>
            {loading ? (
                <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
            ) : rows.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No bookings match these filters.</div>
            ) : (
                <div className="overflow-x-auto">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-8"></TableHead>
                                <TableHead>Cart</TableHead><TableHead>Requester / FA</TableHead>
                                <TableHead>Window</TableHead><TableHead>State</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {rows.map((b) => (
                                <>
                                    <TableRow key={b.id}>
                                        <TableCell>
                                            <button onClick={() => setExpanded(expanded === b.id ? null : b.id)} className="text-muted-foreground">
                                                {expanded === b.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                                            </button>
                                        </TableCell>
                                        <TableCell>
                                            <p className="font-medium">{b.fleet?.carNumber}</p>
                                            <p className="text-xs text-muted-foreground">{b.fleet?.carType} · {b.stadium?.name}</p>
                                        </TableCell>
                                        <TableCell>
                                            <p>{b.requesterName}</p>
                                            <p className="text-xs text-muted-foreground">FA {b.faUser?.accreditationNumber ?? '—'} · {b.bookingType}</p>
                                        </TableCell>
                                        <TableCell className="text-sm">{b.startDate} {b.startTime} → {b.endDate} {b.endTime}</TableCell>
                                        <TableCell>
                                            <span className={`rounded px-2 py-0.5 text-xs font-semibold ${derivedBadge[b.derivedState || ''] || 'bg-muted'}`}>
                                                {b.derivedState || b.status}
                                            </span>
                                        </TableCell>
                                    </TableRow>
                                    {expanded === b.id && (
                                        <TableRow><TableCell colSpan={5}><BookerDetail b={b} /></TableCell></TableRow>
                                    )}
                                </>
                            ))}
                        </TableBody>
                    </Table>
                </div>
            )}
        </div>
    );
}

interface Stadium {
    id: string;
    name: string;
    code: string;
}

interface AvailableCart {
    id: string;
    carNumber: string;
    carType: string;
}

const statusVariants: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
    Pending: 'secondary',
    Approved: 'default',
    Rejected: 'destructive',
    Cancelled: 'outline',
};

export function BookingsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const isAdmin = user?.role === 'Admin';
    const canManage = isSuperAdmin || isAdmin;

    const [loading, setLoading] = useState(true);
    const [bookings, setBookings] = useState<Booking[]>([]);
    const [statusFilter, setStatusFilter] = useState('');
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [stadiumFilter, setStadiumFilter] = useState('');
    // Panels are venue-scoped by the server for Admin/FA; SuperAdmin can narrow with the picker.
    const panelStadiumId = isAdmin ? user?.stadiumId || undefined : stadiumFilter || undefined;
    const [activeTab, setActiveTab] = useState('queue');
    // Bumped after any mutation so the alerts strip / calendar / live panels refetch in sync.
    const [refreshKey, setRefreshKey] = useState(0);

    const [selected, setSelected] = useState<Booking | null>(null);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
    const [reviewComment, setReviewComment] = useState('');
    const [conflict, setConflict] = useState<Booking | null>(null);
    const [actionLoading, setActionLoading] = useState(false);

    const [editOpen, setEditOpen] = useState(false);
    const [editForm, setEditForm] = useState({ startDate: '', endDate: '', startTime: '', endTime: '', fleetId: '' });
    const [editCarts, setEditCarts] = useState<AvailableCart[]>([]);
    const [editCartsLoading, setEditCartsLoading] = useState(false);

    const [hoursOpen, setHoursOpen] = useState(false);
    const [reportIncidentOpen, setReportIncidentOpen] = useState(false);
    const [hoursStadiumId, setHoursStadiumId] = useState('');
    const [hoursForm, setHoursForm] = useState<{ poolBookingStartTime: string; poolBookingEndTime: string }>({
        poolBookingStartTime: '',
        poolBookingEndTime: '',
    });
    const [hoursLoading, setHoursLoading] = useState(false);

    const loadBookings = useCallback(async () => {
        setLoading(true);
        try {
            const params: Record<string, string> = {};
            if (statusFilter) params.status = statusFilter;
            if (stadiumFilter) params.stadiumId = stadiumFilter;
            const res = await poolBookingRequestsApi.getAll(params);
            setBookings(res.data.data || []);
        } catch (err) {
            console.error('Failed to load bookings:', err);
        } finally {
            setLoading(false);
        }
    }, [statusFilter, stadiumFilter]);

    useEffect(() => {
        if (isSuperAdmin) {
            stadiumsApi
                .getAll()
                .then((res) => setStadiums(res.data.data || []))
                .catch((err) => console.error('Failed to load stadiums:', err));
        }
    }, [isSuperAdmin]);

    useEffect(() => {
        loadBookings();
    }, [loadBookings]);

    const openReview = (booking: Booking, action: 'approve' | 'reject') => {
        setSelected(booking);
        setReviewAction(action);
        setReviewComment('');
        setConflict(null);
        setReviewOpen(true);
    };

    const handleReview = async () => {
        if (!selected) return;
        if (reviewAction === 'reject' && !reviewComment.trim()) {
            toast.error('A comment is required when rejecting a booking');
            return;
        }
        setActionLoading(true);
        setConflict(null);
        try {
            if (reviewAction === 'approve') {
                await poolBookingRequestsApi.approve(selected.id, reviewComment || undefined);
            } else {
                await poolBookingRequestsApi.reject(selected.id, reviewComment);
            }
            setReviewOpen(false);
            toast.success(reviewAction === 'approve' ? 'Booking approved' : 'Booking rejected');
            loadBookings();
            setRefreshKey((k) => k + 1);
        } catch (err: any) {
            if (err.response?.status === 409) {
                setConflict(err.response.data.conflict);
                toast.error('This cart is already booked for an overlapping time');
            } else {
                toast.error(err.response?.data?.error || 'Failed to process booking');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const openEdit = (booking: Booking) => {
        setSelected(booking);
        setEditForm({
            startDate: booking.startDate,
            endDate: booking.endDate,
            startTime: booking.startTime,
            endTime: booking.endTime,
            fleetId: booking.fleetId,
        });
        setEditOpen(true);
    };

    useEffect(() => {
        if (!editOpen || !selected) return;
        const { startDate, endDate, startTime, endTime } = editForm;
        if (!startDate || !endDate || !startTime || !endTime || endTime <= startTime) {
            setEditCarts([]);
            return;
        }
        setEditCartsLoading(true);
        poolBookingRequestsApi
            .getAvailableCarts(selected.stadiumId, { startDate, endDate, startTime, endTime, excludeBookingId: selected.id })
            .then((res) => setEditCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setEditCartsLoading(false));
    }, [editOpen, selected, editForm.startDate, editForm.endDate, editForm.startTime, editForm.endTime]);

    const handleSaveEdit = async () => {
        if (!selected) return;
        if (!editForm.fleetId) {
            toast.error('Please select an available cart before saving');
            return;
        }
        setActionLoading(true);
        try {
            await poolBookingRequestsApi.amend(selected.id, editForm);
            setEditOpen(false);
            toast.success('Booking updated');
            loadBookings();
            setRefreshKey((k) => k + 1);
        } catch (err: any) {
            if (err.response?.status === 409) {
                toast.error('This cart is already booked for an overlapping time — pick another cart or adjust the schedule');
            } else {
                toast.error(err.response?.data?.error || 'Failed to update booking');
            }
        } finally {
            setActionLoading(false);
        }
    };

    const handleCancel = async (booking: Booking) => {
        setActionLoading(true);
        try {
            await poolBookingRequestsApi.amend(booking.id, { status: 'Cancelled' });
            toast.success('Booking cancelled');
            loadBookings();
            setRefreshKey((k) => k + 1);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to cancel booking');
        } finally {
            setActionLoading(false);
        }
    };

    const openHours = async () => {
        const targetStadiumId = isAdmin ? user?.stadiumId || '' : hoursStadiumId;
        if (!targetStadiumId) {
            setHoursOpen(true);
            return;
        }
        setHoursStadiumId(targetStadiumId);
        setHoursLoading(true);
        setHoursOpen(true);
        try {
            const res = await stadiumsApi.getPoolBookingHours(targetStadiumId);
            setHoursForm({
                poolBookingStartTime: res.data.poolBookingStartTime || '',
                poolBookingEndTime: res.data.poolBookingEndTime || '',
            });
        } catch (err) {
            console.error('Failed to load operating hours:', err);
        } finally {
            setHoursLoading(false);
        }
    };

    const handleLoadHoursForStadium = async (stadiumId: string) => {
        setHoursStadiumId(stadiumId);
        setHoursLoading(true);
        try {
            const res = await stadiumsApi.getPoolBookingHours(stadiumId);
            setHoursForm({
                poolBookingStartTime: res.data.poolBookingStartTime || '',
                poolBookingEndTime: res.data.poolBookingEndTime || '',
            });
        } catch (err) {
            console.error('Failed to load operating hours:', err);
        } finally {
            setHoursLoading(false);
        }
    };

    const handleSaveHours = async () => {
        if (!hoursStadiumId) return;
        setHoursLoading(true);
        try {
            await stadiumsApi.updatePoolBookingHours(hoursStadiumId, {
                poolBookingStartTime: hoursForm.poolBookingStartTime || null,
                poolBookingEndTime: hoursForm.poolBookingEndTime || null,
            });
            toast.success('Operating hours saved');
            setHoursOpen(false);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save operating hours');
        } finally {
            setHoursLoading(false);
        }
    };

    // FA gets a read-only history of their own department's bookings at their venue —
    // not the Admin/SuperAdmin/Observer review console (queue, live/upcoming, available
    // cars, operating hours). They can't approve or reject either way.
    if (user?.role === 'FA') {
        return <FABookingsView user={user} />;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-3xl font-bold">Bookings</h1>
                    <p className="text-muted-foreground mt-1">Review and manage pool cart booking requests</p>
                </div>
                <div className="flex gap-2">
                    {canManage && (
                        <Button variant="outline" size="sm" onClick={openHours}>
                            Operating Hours
                        </Button>
                    )}
                    <Button variant="outline" size="sm" onClick={() => { loadBookings(); setRefreshKey((k) => k + 1); }}>
                        <RefreshCw className="w-4 h-4 mr-2" /> Refresh
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setReportIncidentOpen(true)}>
                        <ShieldAlert className="w-4 h-4 mr-2" /> Report incident
                    </Button>
                </div>
            </div>

            <AlertsStrip stadiumId={panelStadiumId} refreshKey={refreshKey} onNavigate={setActiveTab} />

            <ReportIncidentModal open={reportIncidentOpen} onOpenChange={setReportIncidentOpen} />

            {/* Pinned above the tabs so availability is visible at a glance, not buried in its own tab */}
            <Card><CardContent className="pt-6">
                <AvailableCarsPanel stadiumId={panelStadiumId} />
            </CardContent></Card>

            <Tabs value={activeTab} onValueChange={setActiveTab}>
                <TabsList className="flex flex-wrap h-auto">
                    <TabsTrigger value="queue">Review queue</TabsTrigger>
                    <TabsTrigger value="live">Active &amp; Overdue</TabsTrigger>
                    <TabsTrigger value="upcoming">Upcoming</TabsTrigger>
                    <TabsTrigger value="calendar">Calendar</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="live" className="pt-4">
                    <Card><CardContent className="pt-6">
                        <LiveBookingsPanel
                            mode="live"
                            stadiumId={panelStadiumId}
                            canManage={canManage}
                            currentUserId={user?.id}
                            onChanged={() => setRefreshKey((k) => k + 1)}
                        />
                    </CardContent></Card>
                </TabsContent>
                <TabsContent value="upcoming" className="pt-4">
                    <Card><CardContent className="pt-6">
                        <LiveBookingsPanel
                            mode="upcoming"
                            stadiumId={panelStadiumId}
                            canManage={canManage}
                            onChanged={() => setRefreshKey((k) => k + 1)}
                        />
                    </CardContent></Card>
                </TabsContent>
                <TabsContent value="calendar" className="pt-4">
                    <Card><CardContent className="pt-6">
                        <CalendarTab stadiumId={panelStadiumId} refreshKey={refreshKey} />
                    </CardContent></Card>
                </TabsContent>
                <TabsContent value="history" className="pt-4">
                    <Card><CardContent className="pt-6">
                        <HistoryPanel stadiumId={panelStadiumId} />
                    </CardContent></Card>
                </TabsContent>

                <TabsContent value="queue" className="pt-4 space-y-6">
            <Card>
                <CardContent className="pt-6">
                    <div className="flex flex-wrap gap-4">
                        <div className="space-y-2">
                            <Label>Status</Label>
                            <Select value={statusFilter || '__all__'} onValueChange={(v) => setStatusFilter(v === '__all__' ? '' : v)}>
                                <SelectTrigger className="w-[150px]">
                                    <SelectValue placeholder="All statuses" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="__all__">All</SelectItem>
                                    <SelectItem value="Pending">Pending</SelectItem>
                                    <SelectItem value="Approved">Approved</SelectItem>
                                    <SelectItem value="Rejected">Rejected</SelectItem>
                                    <SelectItem value="Cancelled">Cancelled</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Venue</Label>
                                <Select value={stadiumFilter || '__all__'} onValueChange={(v) => setStadiumFilter(v === '__all__' ? '' : v)}>
                                    <SelectTrigger className="w-[200px]">
                                        <SelectValue placeholder="All venues" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__all__">All</SelectItem>
                                        {stadiums.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardContent className="pt-6">
                    {loading ? (
                        <div className="flex justify-center py-8">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : bookings.length === 0 ? (
                        <div className="text-center py-8 text-muted-foreground">No bookings found</div>
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Requester</TableHead>
                                    <TableHead>Venue / Cart</TableHead>
                                    <TableHead>FA</TableHead>
                                    <TableHead>Schedule</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {bookings.map((b) => (
                                    <TableRow key={b.id}>
                                        <TableCell>
                                            <p className="font-medium">{b.requesterName}</p>
                                            <p className="text-sm text-muted-foreground">{b.requesterEmail}</p>
                                        </TableCell>
                                        <TableCell>
                                            <p>{b.stadium?.name}</p>
                                            <p className="text-sm text-muted-foreground">{b.fleet?.carNumber} ({b.fleet?.carType})</p>
                                        </TableCell>
                                        <TableCell>{b.faUser?.name}</TableCell>
                                        <TableCell>
                                            {b.bookingType === 'Instant' ? (
                                                <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100">Instant — right now</Badge>
                                            ) : (
                                                <>
                                                    <p className="text-sm">{b.startDate}{b.endDate !== b.startDate ? ` – ${b.endDate}` : ''}</p>
                                                    <p className="text-sm text-muted-foreground">{b.startTime} – {b.endTime}</p>
                                                </>
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant={statusVariants[b.status] || 'outline'}>{b.status}</Badge>
                                            {b.bookingType === 'Instant' && b.status === 'Approved' && !b.keyCollectedAt && (
                                                <p className="text-[10px] text-amber-700 font-semibold mt-1">Awaiting key collection</p>
                                            )}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {b.status === 'Pending' && canManage && (
                                                    <>
                                                        <Button variant="outline" size="sm" className="text-green-600 hover:text-green-700" onClick={() => openReview(b, 'approve')}>
                                                            <CheckCircle className="w-4 h-4 mr-1" /> Approve
                                                        </Button>
                                                        <Button variant="outline" size="sm" className="text-red-600 hover:text-red-700" onClick={() => openReview(b, 'reject')}>
                                                            <XCircle className="w-4 h-4 mr-1" /> Reject
                                                        </Button>
                                                    </>
                                                )}
                                                {(b.status === 'Pending' || b.status === 'Approved') && canManage && (
                                                    <>
                                                        <Button variant="ghost" size="sm" onClick={() => openEdit(b)} title="Edit">
                                                            <Edit2 className="w-4 h-4" />
                                                        </Button>
                                                        <Button variant="ghost" size="sm" onClick={() => handleCancel(b)} title="Cancel" disabled={actionLoading}>
                                                            <Ban className="w-4 h-4" />
                                                        </Button>
                                                    </>
                                                )}
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </CardContent>
            </Card>
                </TabsContent>
            </Tabs>

            {/* Review Dialog */}
            <Dialog open={reviewOpen} onOpenChange={setReviewOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>{reviewAction === 'approve' ? 'Approve Booking' : 'Reject Booking'}</DialogTitle>
                        <DialogDescription>
                            {selected && (
                                <span>
                                    Booking from <strong>{selected.requesterName}</strong> for <strong>{selected.fleet?.carNumber}</strong> at{' '}
                                    <strong>{selected.stadium?.name}</strong>
                                </span>
                            )}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {conflict && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-sm space-y-1">
                                <div className="flex items-center gap-2 text-amber-800 font-medium">
                                    <AlertTriangle className="w-4 h-4" /> Conflicting approved booking
                                </div>
                                <p>
                                    <strong>{conflict.requesterName}</strong> already has this cart approved for{' '}
                                    {conflict.startDate}{conflict.endDate !== conflict.startDate ? ` – ${conflict.endDate}` : ''}, {conflict.startTime}–{conflict.endTime}.
                                </p>
                                <p className="text-amber-700">Edit or cancel that booking first, then retry.</p>
                            </div>
                        )}
                        <div className="space-y-2">
                            <Label>Comment {reviewAction === 'reject' ? '(required)' : '(optional)'}</Label>
                            <Textarea
                                value={reviewComment}
                                onChange={(e) => setReviewComment(e.target.value)}
                                placeholder={reviewAction === 'approve' ? 'Any notes for the requester...' : 'Reason for rejection...'}
                                rows={3}
                            />
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setReviewOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleReview}
                            disabled={actionLoading}
                            className={reviewAction === 'approve' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'}
                        >
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            {reviewAction === 'approve' ? 'Approve' : 'Reject'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Edit Dialog */}
            <Dialog open={editOpen} onOpenChange={setEditOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Edit Booking</DialogTitle>
                        <DialogDescription>Adjust the schedule or reassign the cart to resolve a conflict.</DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Start Date</Label>
                                <Input type="date" value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Date</Label>
                                <Input type="date" value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>Start Time</Label>
                                <Input type="time" value={editForm.startTime} onChange={(e) => setEditForm({ ...editForm, startTime: e.target.value, fleetId: '' })} />
                            </div>
                            <div className="space-y-2">
                                <Label>End Time</Label>
                                <Input type="time" value={editForm.endTime} onChange={(e) => setEditForm({ ...editForm, endTime: e.target.value, fleetId: '' })} />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Cart</Label>
                            <Select value={editForm.fleetId} onValueChange={(v) => setEditForm({ ...editForm, fleetId: v })} disabled={editCartsLoading}>
                                <SelectTrigger>
                                    <SelectValue placeholder={editCartsLoading ? 'Checking availability...' : 'Select a cart'} />
                                </SelectTrigger>
                                <SelectContent>
                                    {editCarts.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.carNumber} — {c.carType}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setEditOpen(false)}>
                            Cancel
                        </Button>
                        <Button onClick={handleSaveEdit} disabled={actionLoading || !editForm.fleetId}>
                            {actionLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Changes
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Operating Hours Dialog */}
            <Dialog open={hoursOpen} onOpenChange={setHoursOpen}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Pool Booking Operating Hours</DialogTitle>
                        <DialogDescription>
                            Requests outside this daily window will be rejected by the form. Leave blank for no restriction.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                        {isSuperAdmin && (
                            <div className="space-y-2">
                                <Label>Venue</Label>
                                <Select value={hoursStadiumId} onValueChange={handleLoadHoursForStadium}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Select venue" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {stadiums.map((s) => (
                                            <SelectItem key={s.id} value={s.id}>
                                                {s.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        )}
                        {hoursStadiumId && (
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Start Time</Label>
                                    <Input
                                        type="time"
                                        value={hoursForm.poolBookingStartTime}
                                        onChange={(e) => setHoursForm({ ...hoursForm, poolBookingStartTime: e.target.value })}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label>End Time</Label>
                                    <Input
                                        type="time"
                                        value={hoursForm.poolBookingEndTime}
                                        onChange={(e) => setHoursForm({ ...hoursForm, poolBookingEndTime: e.target.value })}
                                    />
                                </div>
                            </div>
                        )}
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setHoursOpen(false)}>
                            Close
                        </Button>
                        <Button onClick={handleSaveHours} disabled={hoursLoading || !hoursStadiumId}>
                            {hoursLoading && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
