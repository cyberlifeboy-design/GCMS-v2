import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { poolBookingRequestsApi, publicDataApi, publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Mail, Phone, MapPin, Car, Plus, Trash2 } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

interface Stadium {
    id: string;
    name: string;
    code: string;
}
interface Department {
    id: string;
    name: string;
    code?: string | null;
}
interface AvailableCart {
    id: string;
    carNumber: string;
    carType: string;
}
interface BookingSlot {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
}
interface Branding {
    tournamentName: string;
    logoUrl: string | null;
    headerUrl: string | null;
    footerUrl: string | null;
    footerText: string | null;
    bookingWindow?: { isOpen: boolean; opensAt: string | null; closesAt: string | null; message: string | null };
    instantBookingDurationMinutes?: string;
}

/** "60" -> "1 hour", "180" -> "3 hours" */
function durationLabel(minutes: number): string {
    const hours = minutes / 60;
    return `${hours} hour${hours === 1 ? '' : 's'}`;
}

let slotIdCounter = 0;
function newSlot(): BookingSlot {
    slotIdCounter += 1;
    return { id: `slot-${slotIdCounter}`, date: '', startTime: '', endTime: '' };
}

/** Expands a Daily booking's date range into one slot per calendar day, same time each day. */
function expandDailySlots(startDate: string, endDate: string, startTime: string, endTime: string) {
    if (!startDate || !endDate || !startTime || !endTime || endDate < startDate) return [];
    const slots: { date: string; startTime: string; endTime: string }[] = [];
    const cur = new Date(`${startDate}T00:00:00`);
    const last = new Date(`${endDate}T00:00:00`);
    while (cur <= last) {
        const y = cur.getFullYear();
        const m = String(cur.getMonth() + 1).padStart(2, '0');
        const d = String(cur.getDate()).padStart(2, '0');
        slots.push({ date: `${y}-${m}-${d}`, startTime, endTime });
        cur.setDate(cur.getDate() + 1);
    }
    return slots;
}

const statusColors: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Cancelled: 'bg-gray-100 text-gray-800',
};

function ConfirmCollectedButton({ token, onConfirmed }: { token: string; onConfirmed: () => void }) {
    const [busy, setBusy] = useState(false);
    const confirm = async () => {
        setBusy(true);
        try {
            await poolBookingRequestsApi.markKeyCollectedPublic(token);
            onConfirmed();
        } catch {
            // best-effort — leave the button clickable to retry
        } finally {
            setBusy(false);
        }
    };
    return (
        <Button size="sm" onClick={confirm} disabled={busy} className="bg-emerald-600 hover:bg-emerald-700">
            {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            I've collected the key
        </Button>
    );
}

function BookingConfirmationView({ token }: { token: string }) {
    const [loading, setLoading] = useState(true);
    const [booking, setBooking] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        poolBookingRequestsApi
            .getByTokenPublic(token)
            .then((res) => setBooking(res.data.data))
            .catch((err) => setError(err.response?.data?.error || 'Failed to load booking'))
            .finally(() => setLoading(false));
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !booking) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold mb-2">Error</h2>
                        <p className="text-muted-foreground">{error || 'Booking not found'}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Booking Status</CardTitle>
                                <CardDescription>Submitted on {formatDate(booking.createdAt)}</CardDescription>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[booking.status] || 'bg-gray-100'}`}>
                                {booking.status}
                            </span>
                        </div>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <p className="text-sm text-muted-foreground">Venue</p>
                                <p className="font-medium">{booking.stadium?.name}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Cart</p>
                                <p className="font-medium">{booking.fleet?.carNumber} ({booking.fleet?.carType})</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Dates</p>
                                <p className="font-medium">{booking.startDate}{booking.endDate !== booking.startDate ? ` – ${booking.endDate}` : ''}</p>
                            </div>
                            <div>
                                <p className="text-sm text-muted-foreground">Time</p>
                                <p className="font-medium">{booking.startTime} – {booking.endTime}</p>
                            </div>
                        </div>
                        {booking.status === 'Approved' && (
                            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4 text-sm text-emerald-900 space-y-2">
                                <p className="font-semibold">Request approved — please collect the car key.</p>
                                <p>
                                    Ensure the car is returned to the charging station once you are done, and hand
                                    back the key to the venue's logistics representative.
                                </p>
                                {booking.bookingType === 'Instant' && !booking.keyCollectedAt && (
                                    <>
                                        <p className="font-medium text-amber-800">
                                            If the key is not collected within 10 minutes of approval, this booking
                                            will be automatically cancelled and the car returned to the pool due to
                                            demand from other users.
                                        </p>
                                        <ConfirmCollectedButton token={token} onConfirmed={() => setBooking({ ...booking, keyCollectedAt: new Date().toISOString() })} />
                                    </>
                                )}
                                {booking.bookingType === 'Instant' && booking.keyCollectedAt && (
                                    <p className="text-emerald-700">Key collection confirmed — enjoy your booking.</p>
                                )}
                            </div>
                        )}
                        {booking.status === 'Cancelled' && booking.bookingType === 'Instant' && (
                            <div className="bg-gray-100 border border-gray-200 rounded-lg p-4 text-sm text-gray-700">
                                This instant booking was automatically cancelled because the key was not collected in
                                time, and the car has returned to the pool. You're welcome to submit a new request.
                            </div>
                        )}
                        {booking.reviewComment && (
                            <div>
                                <p className="text-sm text-muted-foreground">Review Comment</p>
                                <p className="font-medium">{booking.reviewComment}</p>
                            </div>
                        )}
                        {booking.reviewedBy && (
                            <div>
                                <p className="text-sm text-muted-foreground">Reviewed By</p>
                                <p className="font-medium">{booking.reviewedBy.name}</p>
                            </div>
                        )}
                        <div className="pt-2">
                            <Button asChild variant="outline" className="w-full">
                                <Link to="/login">Close</Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}

export function PoolBookingRequestPage() {
    const { token } = useParams<{ token: string }>();

    if (token) {
        return <BookingConfirmationView token={token} />;
    }

    return <NewPoolBookingRequestView />;
}

function NewPoolBookingRequestView() {
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [branding, setBranding] = useState<Branding>({ tournamentName: 'GCMS', logoUrl: null, headerUrl: null, footerUrl: null, footerText: null });

    const [mode, setMode] = useState<'schedule' | 'instant'>('schedule');

    const [departments, setDepartments] = useState<Department[]>([]);
    const [availableCarts, setAvailableCarts] = useState<AvailableCart[]>([]);
    const [loadingCarts, setLoadingCarts] = useState(false);
    const [instantCarts, setInstantCarts] = useState<AvailableCart[]>([]);
    const [loadingInstantCarts, setLoadingInstantCarts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submittedMode, setSubmittedMode] = useState<'schedule' | 'instant'>('schedule');
    const [requestTokens, setRequestTokens] = useState<string[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [slots, setSlots] = useState<BookingSlot[]>([newSlot(), newSlot()]);

    const [formData, setFormData] = useState({
        stadiumId: '',
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        departmentId: '',
        bookingType: 'Single' as 'Single' | 'Daily' | 'Recurring',
        startDate: '',
        endDate: '', // Daily only
        startTime: '',
        endTime: '',
        fleetId: '',
        purpose: '',
        instantDurationMinutes: 60,
    });

    useEffect(() => {
        Promise.all([publicDataApi.getStadiums(), publicSettingsApi.getBranding()])
            .then(([stadiumsRes, brandingRes]) => {
                setStadiums(stadiumsRes.data.data || []);
                setBranding(brandingRes.data);
                const opts = (brandingRes.data.instantBookingDurationMinutes || '60,180,300,480')
                    .split(',').map((s: string) => parseInt(s, 10)).filter((n: number) => n > 0);
                if (opts.length > 0) setFormData((prev) => ({ ...prev, instantDurationMinutes: opts[0] }));
            })
            .catch((err) => console.error('Failed to load initial data:', err))
            .finally(() => setLoadingInitial(false));
    }, []);

    const durationOptions = (branding.instantBookingDurationMinutes || '60,180,300,480')
        .split(',').map((s) => parseInt(s, 10)).filter((n) => n > 0);

    useEffect(() => {
        if (!formData.stadiumId) {
            setDepartments([]);
            return;
        }
        publicDataApi
            .getDepartments(formData.stadiumId)
            .then((res) => setDepartments(res.data.data || []))
            .catch((err) => console.error('Failed to load departments:', err));
    }, [formData.stadiumId]);

    // Single-day availability
    useEffect(() => {
        if (formData.bookingType !== 'Single') return;
        const { stadiumId, startDate, startTime, endTime } = formData;
        if (!stadiumId || !startDate || !startTime || !endTime || endTime <= startTime) {
            setAvailableCarts([]);
            return;
        }
        setLoadingCarts(true);
        poolBookingRequestsApi
            .getAvailableCarts(stadiumId, { startDate, endDate: startDate, startTime, endTime })
            .then((res) => setAvailableCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setLoadingCarts(false));
    }, [formData.stadiumId, formData.startDate, formData.startTime, formData.endTime, formData.bookingType]);

    // Recurring availability — one cart free across EVERY selected date/time slot
    const validSlots = slots.filter((s) => s.date && s.startTime && s.endTime && s.endTime > s.startTime);
    useEffect(() => {
        if (formData.bookingType !== 'Recurring') return;
        if (!formData.stadiumId || validSlots.length < 2) {
            setAvailableCarts([]);
            return;
        }
        setLoadingCarts(true);
        poolBookingRequestsApi
            .getAvailableCartsMulti(formData.stadiumId, validSlots.map(({ date, startTime, endTime }) => ({ date, startTime, endTime })))
            .then((res) => setAvailableCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setLoadingCarts(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.stadiumId, formData.bookingType, JSON.stringify(validSlots)]);

    // Daily availability — same shape as Recurring, slots are just every day in the range
    const dailySlots = expandDailySlots(formData.startDate, formData.endDate, formData.startTime, formData.endTime);
    useEffect(() => {
        if (formData.bookingType !== 'Daily') return;
        if (!formData.stadiumId || dailySlots.length === 0) {
            setAvailableCarts([]);
            return;
        }
        setLoadingCarts(true);
        poolBookingRequestsApi
            .getAvailableCartsMulti(formData.stadiumId, dailySlots)
            .then((res) => setAvailableCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setLoadingCarts(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [formData.stadiumId, formData.bookingType, JSON.stringify(dailySlots)]);

    useEffect(() => {
        if (mode !== 'instant' || !formData.stadiumId) {
            setInstantCarts([]);
            return;
        }
        setLoadingInstantCarts(true);
        poolBookingRequestsApi
            .getInstantAvailableCarts(formData.stadiumId)
            .then((res) => setInstantCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load instant available carts:', err))
            .finally(() => setLoadingInstantCarts(false));
    }, [mode, formData.stadiumId]);

    const switchMode = (next: 'schedule' | 'instant') => {
        setMode(next);
        setError(null);
        setFormData((f) => ({ ...f, fleetId: '' }));
    };

    const addSlot = () => setSlots((s) => [...s, newSlot()]);
    const removeSlot = (id: string) => setSlots((s) => (s.length > 2 ? s.filter((x) => x.id !== id) : s));
    const updateSlot = (id: string, patch: Partial<BookingSlot>) =>
        setSlots((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)));

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        if (!formData.fleetId) {
            setError('Please select a cart');
            return;
        }

        setSubmitting(true);
        try {
            if (mode === 'instant') {
                const res = await poolBookingRequestsApi.createInstantPublic({
                    stadiumId: formData.stadiumId,
                    fleetId: formData.fleetId,
                    requesterName: formData.requesterName,
                    requesterEmail: formData.requesterEmail,
                    requesterPhone: formData.requesterPhone,
                    departmentId: formData.departmentId,
                    purpose: formData.purpose || undefined,
                    instantDurationMinutes: formData.instantDurationMinutes,
                });
                setRequestTokens([res.data.data.requestToken]);
                setSubmittedMode('instant');
                setSubmitted(true);
                return;
            }

            if (formData.bookingType === 'Recurring' || formData.bookingType === 'Daily') {
                const slotsToSubmit = formData.bookingType === 'Daily'
                    ? dailySlots
                    : validSlots.map(({ date, startTime, endTime }) => ({ date, startTime, endTime }));
                if (slotsToSubmit.length < 2) {
                    setError(formData.bookingType === 'Daily'
                        ? 'End date must be at least one day after the start date for a daily booking'
                        : 'Add at least two dates');
                    setSubmitting(false);
                    return;
                }
                const res = await poolBookingRequestsApi.createRecurringPublic({
                    stadiumId: formData.stadiumId,
                    fleetId: formData.fleetId,
                    requesterName: formData.requesterName,
                    requesterEmail: formData.requesterEmail,
                    requesterPhone: formData.requesterPhone,
                    departmentId: formData.departmentId,
                    purpose: formData.purpose || undefined,
                    slots: slotsToSubmit,
                });
                setRequestTokens((res.data.data.bookings as { requestToken: string }[]).map((b) => b.requestToken));
                setSubmittedMode('schedule');
                setSubmitted(true);
                return;
            }

            const res = await poolBookingRequestsApi.createPublic({
                stadiumId: formData.stadiumId,
                fleetId: formData.fleetId,
                requesterName: formData.requesterName,
                requesterEmail: formData.requesterEmail,
                requesterPhone: formData.requesterPhone,
                departmentId: formData.departmentId,
                bookingType: 'Single',
                startDate: formData.startDate,
                endDate: formData.startDate,
                startTime: formData.startTime,
                endTime: formData.endTime,
                purpose: formData.purpose || undefined,
            });
            setRequestTokens([res.data.data.requestToken]);
            setSubmittedMode('schedule');
            setSubmitted(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit booking request');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingInitial) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (submitted) {
        const trackingUrls = requestTokens.map((t) => `${window.location.origin}/book-pool/confirm/${t}`);
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg">
                    <CardContent className="pt-8 pb-6 text-center">
                        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">
                            {trackingUrls.length > 1 ? `${trackingUrls.length} Booking Requests Submitted!` : 'Request Submitted!'}
                        </h2>
                        <p className="text-muted-foreground mb-4">
                            Logistics team will review your request{trackingUrls.length > 1 ? 's' : ''} and respond to you shortly.
                        </p>
                        {submittedMode === 'instant' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-900">
                                Once approved, collect the key within <strong>10 minutes</strong> — if the request
                                has not been attended and the key has not been collected in time, the booking will
                                be automatically cancelled and the car returned to the pool due to demand from other
                                users.
                            </div>
                        )}
                        <div className="bg-muted p-3 rounded-md mb-6 text-left">
                            <p className="text-sm text-muted-foreground mb-2 text-center">
                                {trackingUrls.length > 1 ? 'Track your bookings:' : 'Track your booking:'}
                            </p>
                            <div className="space-y-1">
                                {trackingUrls.map((url, i) => (
                                    <a key={url} href={url} className="block text-primary hover:underline text-sm break-all">
                                        {trackingUrls.length > 1 ? `${i + 1}. ` : ''}{url}
                                    </a>
                                ))}
                            </div>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button asChild variant="outline" className="flex-1">
                                <Link to="/login">Close</Link>
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={() => {
                                    setSubmitted(false);
                                    setRequestTokens([]);
                                    setSlots([newSlot(), newSlot()]);
                                    setFormData({
                                        stadiumId: '', requesterName: '', requesterEmail: '', requesterPhone: '',
                                        departmentId: '', bookingType: 'Single', startDate: '', endDate: '',
                                        startTime: '', endTime: '', fleetId: '', purpose: '',
                                        instantDurationMinutes: durationOptions[0] ?? 60,
                                    });
                                }}
                            >
                                Submit Another Request
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {branding.headerUrl ? (
                <div className="w-full bg-white border-b">
                    <img src={branding.headerUrl} alt="Header" className="w-full max-h-32 object-contain" />
                </div>
            ) : (
                <div
                    className="w-full py-6 px-6 flex items-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #0d2a4a 0%, #143b66 45%, #2e2e30 100%)' }}
                >
                    <Link to="/login" aria-label="Back to login" className="inline-block">
                        <img
                            src={branding.logoUrl || '/branding/sc-logo.png'}
                            alt="Logo"
                            className="h-16 object-contain cursor-pointer"
                            style={{ filter: 'drop-shadow(0 0 10px rgba(255,255,255,0.5))' }}
                            onError={(e) => {
                                const img = e.target as HTMLImageElement;
                                if (img.src !== window.location.origin + '/branding/sc-logo.png') img.src = '/branding/sc-logo.png';
                                else img.style.display = 'none';
                            }}
                        />
                    </Link>
                </div>
            )}

            <div className="flex-1 py-8 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold">Book a Pool Cart</h1>
                        <p className="text-muted-foreground mt-2">Request a shared pool cart at a venue — subject to admin approval</p>
                    </div>

                    <div className="flex justify-center gap-3 mb-6">
                        <Button
                            type="button"
                            variant={mode === 'schedule' ? 'default' : 'outline'}
                            onClick={() => switchMode('schedule')}
                            className="flex-1 max-w-[220px]"
                        >
                            Schedule a Booking
                        </Button>
                        <Button
                            type="button"
                            variant={mode === 'instant' ? 'default' : 'outline'}
                            onClick={() => switchMode('instant')}
                            className="flex-1 max-w-[220px]"
                        >
                            Instant Booking
                        </Button>
                    </div>

                    {branding.bookingWindow && !branding.bookingWindow.isOpen ? (
                        <Card className="max-w-lg mx-auto">
                            <CardContent className="py-10 text-center space-y-2">
                                <h2 className="text-xl font-semibold">Bookings are currently closed</h2>
                                <p className="text-muted-foreground">
                                    {branding.bookingWindow.message
                                        || (branding.bookingWindow.opensAt
                                            ? `The booking window opens ${new Date(branding.bookingWindow.opensAt).toLocaleString()}.`
                                            : 'Please check back later.')}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Booking Details</CardTitle>
                            {mode === 'schedule' && (
                                <p className="text-sm font-semibold text-foreground">Schedule Pool Car Booking in Advance</p>
                            )}
                            <CardDescription>
                                {mode === 'instant'
                                    ? 'Select a venue to see pool cars available right now — no date or time needed.'
                                    : 'Select a venue to begin.'}
                            </CardDescription>
                            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2 mt-2">
                                All bookings are subjected to approvals and to availability.
                            </p>
                        </CardHeader>
                        <CardContent>
                            <div className="space-y-6">
                                <div className="space-y-2">
                                    <Label htmlFor="stadium" className="flex items-center gap-2">
                                        <MapPin className="w-4 h-4" /> Venue *
                                    </Label>
                                    <Select
                                        value={formData.stadiumId}
                                        onValueChange={(value) =>
                                            setFormData({ ...formData, stadiumId: value, departmentId: '', fleetId: '' })
                                        }
                                    >
                                        <SelectTrigger>
                                            <SelectValue placeholder="Select venue" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {stadiums.map((s) => (
                                                <SelectItem key={s.id} value={s.id}>
                                                    {s.code} — {s.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </div>

                                {formData.stadiumId && (
                                    <form onSubmit={handleSubmit} className="space-y-6">
                                        <div className="space-y-4">
                                            <h3 className="font-medium flex items-center gap-2">
                                                <Mail className="w-4 h-4" /> Contact Information
                                            </h3>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="requesterName">Your Name *</Label>
                                                    <Input
                                                        id="requesterName"
                                                        value={formData.requesterName}
                                                        onChange={(e) => setFormData({ ...formData, requesterName: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="requesterEmail">Email Address *</Label>
                                                    <Input
                                                        id="requesterEmail"
                                                        type="email"
                                                        value={formData.requesterEmail}
                                                        onChange={(e) => setFormData({ ...formData, requesterEmail: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="requesterPhone" className="flex items-center gap-2">
                                                        <Phone className="w-3 h-3" /> Phone Number *
                                                    </Label>
                                                    <Input
                                                        id="requesterPhone"
                                                        value={formData.requesterPhone}
                                                        onChange={(e) => setFormData({ ...formData, requesterPhone: e.target.value })}
                                                        required
                                                    />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label htmlFor="departmentId">Department *</Label>
                                                    <Select
                                                        value={formData.departmentId}
                                                        onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={departments.length ? 'Select department' : 'No active departments at this venue'} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {departments.map((d) => (
                                                                <SelectItem key={d.id} value={d.id}>
                                                                    {d.name} — {d.code || 'No Code'}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>
                                                </div>
                                            </div>
                                        </div>

                                        {mode === 'schedule' && (
                                        <div className="space-y-4">
                                            <h3 className="font-medium">Schedule</h3>
                                            <div className="space-y-2">
                                                <Label htmlFor="bookingType">Booking Type *</Label>
                                                <Select
                                                    value={formData.bookingType}
                                                    onValueChange={(value) => setFormData({ ...formData, bookingType: value as 'Single' | 'Daily' | 'Recurring', fleetId: '' })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Single">Single day</SelectItem>
                                                        <SelectItem value="Daily">Daily (same time every day in a range)</SelectItem>
                                                        <SelectItem value="Recurring">Recurring (multiple dates, own timing each)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>

                                            {formData.bookingType === 'Single' ? (
                                                <>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="startDate">Date *</Label>
                                                            <Input
                                                                id="startDate"
                                                                type="date"
                                                                value={formData.startDate}
                                                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="startTime">Start Time *</Label>
                                                            <Input
                                                                id="startTime"
                                                                type="time"
                                                                value={formData.startTime}
                                                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="endTime">End Time *</Label>
                                                            <Input
                                                                id="endTime"
                                                                type="time"
                                                                value={formData.endTime}
                                                                onChange={(e) => setFormData({ ...formData, endTime: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                    </div>
                                                </>
                                            ) : formData.bookingType === 'Daily' ? (
                                                <>
                                                    <p className="text-xs text-muted-foreground">
                                                        Books the same time window every day from the start date through the end date.
                                                    </p>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="dailyStartDate">Start Date *</Label>
                                                            <Input
                                                                id="dailyStartDate"
                                                                type="date"
                                                                value={formData.startDate}
                                                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="dailyEndDate">End Date *</Label>
                                                            <Input
                                                                id="dailyEndDate"
                                                                type="date"
                                                                value={formData.endDate}
                                                                min={formData.startDate || undefined}
                                                                onChange={(e) => setFormData({ ...formData, endDate: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                    </div>
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div className="space-y-2">
                                                            <Label htmlFor="dailyStartTime">Time From *</Label>
                                                            <Input
                                                                id="dailyStartTime"
                                                                type="time"
                                                                value={formData.startTime}
                                                                onChange={(e) => setFormData({ ...formData, startTime: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                        <div className="space-y-2">
                                                            <Label htmlFor="dailyEndTime">Time To *</Label>
                                                            <Input
                                                                id="dailyEndTime"
                                                                type="time"
                                                                value={formData.endTime}
                                                                onChange={(e) => setFormData({ ...formData, endTime: e.target.value, fleetId: '' })}
                                                                required
                                                            />
                                                        </div>
                                                    </div>
                                                    {formData.startDate && formData.endDate && dailySlots.length === 1 && (
                                                        <p className="text-xs text-amber-700">
                                                            End date must be after the start date for a daily booking — use "Single day" for one date.
                                                        </p>
                                                    )}
                                                    {dailySlots.length > 1 && (
                                                        <p className="text-xs text-muted-foreground">{dailySlots.length} days will be booked.</p>
                                                    )}
                                                </>
                                            ) : (
                                                <div className="space-y-3">
                                                    <p className="text-xs text-muted-foreground">
                                                        Add each date you need the cart, with its own start/end time. One cart is
                                                        reserved across all of them.
                                                    </p>
                                                    {slots.map((s, i) => (
                                                        <div key={s.id} className="flex items-end gap-2 flex-wrap sm:flex-nowrap">
                                                            <div className="space-y-1 flex-1 min-w-[140px]">
                                                                {i === 0 && <Label className="text-xs">Date *</Label>}
                                                                <Input
                                                                    type="date"
                                                                    value={s.date}
                                                                    onChange={(e) => { updateSlot(s.id, { date: e.target.value }); setFormData((f) => ({ ...f, fleetId: '' })); }}
                                                                    required
                                                                />
                                                            </div>
                                                            <div className="space-y-1 flex-1 min-w-[110px]">
                                                                {i === 0 && <Label className="text-xs">Start Time *</Label>}
                                                                <Input
                                                                    type="time"
                                                                    value={s.startTime}
                                                                    onChange={(e) => { updateSlot(s.id, { startTime: e.target.value }); setFormData((f) => ({ ...f, fleetId: '' })); }}
                                                                    required
                                                                />
                                                            </div>
                                                            <div className="space-y-1 flex-1 min-w-[110px]">
                                                                {i === 0 && <Label className="text-xs">End Time *</Label>}
                                                                <Input
                                                                    type="time"
                                                                    value={s.endTime}
                                                                    onChange={(e) => { updateSlot(s.id, { endTime: e.target.value }); setFormData((f) => ({ ...f, fleetId: '' })); }}
                                                                    required
                                                                />
                                                            </div>
                                                            <Button
                                                                type="button"
                                                                variant="outline"
                                                                size="icon"
                                                                disabled={slots.length <= 2}
                                                                onClick={() => { removeSlot(s.id); setFormData((f) => ({ ...f, fleetId: '' })); }}
                                                                title={slots.length <= 2 ? 'A recurring booking needs at least two dates' : 'Remove this date'}
                                                            >
                                                                <Trash2 className="w-4 h-4" />
                                                            </Button>
                                                        </div>
                                                    ))}
                                                    <Button type="button" variant="outline" size="sm" onClick={addSlot} className="gap-1">
                                                        <Plus className="w-4 h-4" /> Add another date
                                                    </Button>
                                                </div>
                                            )}
                                        </div>
                                        )}

                                        {mode === 'schedule' ? (
                                        <div className="space-y-2">
                                            <Label htmlFor="fleetId" className="flex items-center gap-2">
                                                <Car className="w-4 h-4" /> Available Pool Cart *
                                            </Label>
                                            <Select
                                                value={formData.fleetId}
                                                onValueChange={(value) => setFormData({ ...formData, fleetId: value })}
                                                disabled={loadingCarts || availableCarts.length === 0}
                                            >
                                                <SelectTrigger>
                                                    <SelectValue
                                                        placeholder={
                                                            loadingCarts
                                                                ? 'Checking availability...'
                                                                : availableCarts.length === 0
                                                                  ? 'Fill in the schedule above to see available carts'
                                                                  : 'Select a cart'
                                                        }
                                                    />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    {availableCarts.map((c) => (
                                                        <SelectItem key={c.id} value={c.id}>
                                                            {c.carNumber} — {c.carType}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                        ) : (
                                        <div className="space-y-3">
                                            <h3 className="font-medium flex items-center gap-2">
                                                <Car className="w-4 h-4" /> Available Pool Cars Right Now *
                                            </h3>
                                            <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                                                Please note that if the car is not collected within 10 minutes from the booking,
                                                the booking will automatically be cancelled and the car will return to the shared pool.
                                            </p>
                                            {loadingInstantCarts ? (
                                                <div className="flex justify-center py-6">
                                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                                </div>
                                            ) : instantCarts.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">No pool cars are free at this venue right now.</p>
                                            ) : (
                                                <>
                                                <div className="flex flex-wrap gap-2">
                                                    {Object.entries(
                                                        instantCarts.reduce<Record<string, number>>((acc, c) => {
                                                            acc[c.carType] = (acc[c.carType] || 0) + 1;
                                                            return acc;
                                                        }, {}),
                                                    ).map(([carType, count]) => (
                                                        <span key={carType} className="text-xs font-semibold bg-emerald-100 text-emerald-800 rounded-full px-3 py-1">
                                                            {carType} — {count} Available
                                                        </span>
                                                    ))}
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                    {instantCarts.map((c) => {
                                                        const selected = formData.fleetId === c.id;
                                                        return (
                                                            <button
                                                                type="button"
                                                                key={c.id}
                                                                onClick={() => setFormData({ ...formData, fleetId: c.id })}
                                                                className={`rounded-xl border p-3 text-left transition ${
                                                                    selected
                                                                        ? 'bg-emerald-600 border-emerald-600 text-white'
                                                                        : 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                                                                }`}
                                                            >
                                                                <p className="font-bold">{c.carNumber}</p>
                                                                <p className={`text-xs ${selected ? 'text-emerald-50' : 'text-emerald-700'}`}>{c.carType}</p>
                                                            </button>
                                                        );
                                                    })}
                                                </div>
                                                </>
                                            )}
                                        </div>
                                        )}

                                        {mode === 'instant' && (
                                            <div className="space-y-2">
                                                <Label>How Long Do You Need It? *</Label>
                                                <div className="flex flex-wrap gap-2">
                                                    {durationOptions.map((mins) => (
                                                        <button
                                                            type="button"
                                                            key={mins}
                                                            onClick={() => setFormData({ ...formData, instantDurationMinutes: mins })}
                                                            className={`rounded-full border px-4 py-1.5 text-sm font-semibold transition ${
                                                                formData.instantDurationMinutes === mins
                                                                    ? 'bg-emerald-600 border-emerald-600 text-white'
                                                                    : 'bg-emerald-50 border-emerald-200 text-emerald-900 hover:bg-emerald-100'
                                                            }`}
                                                        >
                                                            {durationLabel(mins)}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        <div className="space-y-2">
                                            <Label htmlFor="purpose">Purpose (Optional)</Label>
                                            <Textarea
                                                id="purpose"
                                                value={formData.purpose}
                                                onChange={(e) => setFormData({ ...formData, purpose: e.target.value })}
                                                rows={3}
                                            />
                                        </div>

                                        {error && <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">{error}</div>}

                                        <Button type="submit" className="w-full" disabled={submitting}>
                                            {submitting ? (
                                                <>
                                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Submitting...
                                                </>
                                            ) : (
                                                'Submit Booking Request'
                                            )}
                                        </Button>
                                    </form>
                                )}
                            </div>
                        </CardContent>
                    </Card>
                    )}
                </div>
            </div>

            {(branding.footerUrl || branding.footerText) && (
                <div className="w-full mt-8 border-t bg-white py-4 px-6 text-center">
                    {branding.footerUrl && <img src={branding.footerUrl} alt="Footer" className="h-12 object-contain mx-auto mb-2" />}
                    {branding.footerText && <p className="text-sm text-muted-foreground">{branding.footerText}</p>}
                </div>
            )}
        </div>
    );
}
