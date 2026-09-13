import { useState, useEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { poolBookingRequestsApi, publicDataApi, publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Mail, Phone, MapPin, Car } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

interface Stadium {
    id: string;
    name: string;
    code: string;
}
interface FA {
    id: string;
    name: string;
}
interface AvailableCart {
    id: string;
    carNumber: string;
    carType: string;
}
interface Branding {
    tournamentName: string;
    logoUrl: string | null;
    headerUrl: string | null;
    footerUrl: string | null;
    footerText: string | null;
    requestWindow?: { isOpen: boolean; opensAt: string | null; closesAt: string | null; message: string | null };
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

    const [fas, setFAs] = useState<FA[]>([]);
    const [availableCarts, setAvailableCarts] = useState<AvailableCart[]>([]);
    const [loadingCarts, setLoadingCarts] = useState(false);
    const [instantCarts, setInstantCarts] = useState<AvailableCart[]>([]);
    const [loadingInstantCarts, setLoadingInstantCarts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [submittedMode, setSubmittedMode] = useState<'schedule' | 'instant'>('schedule');
    const [requestToken, setRequestToken] = useState('');
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        stadiumId: '',
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        faUserId: '',
        bookingType: 'Single' as 'Single' | 'Recurring',
        startDate: '',
        endDate: '',
        startTime: '',
        endTime: '',
        fleetId: '',
        purpose: '',
    });

    useEffect(() => {
        Promise.all([publicDataApi.getStadiums(), publicSettingsApi.getBranding()])
            .then(([stadiumsRes, brandingRes]) => {
                setStadiums(stadiumsRes.data.data || []);
                setBranding(brandingRes.data);
            })
            .catch((err) => console.error('Failed to load initial data:', err))
            .finally(() => setLoadingInitial(false));
    }, []);

    useEffect(() => {
        if (!formData.stadiumId) {
            setFAs([]);
            return;
        }
        poolBookingRequestsApi
            .getFAs(formData.stadiumId)
            .then((res) => setFAs(res.data.data || []))
            .catch((err) => console.error('Failed to load FAs:', err));
    }, [formData.stadiumId]);

    useEffect(() => {
        const { stadiumId, startDate, endDate, startTime, endTime } = formData;
        const effectiveEndDate = formData.bookingType === 'Single' ? startDate : endDate;
        if (!stadiumId || !startDate || !effectiveEndDate || !startTime || !endTime) {
            setAvailableCarts([]);
            return;
        }
        if (endTime <= startTime) {
            setAvailableCarts([]);
            return;
        }
        setLoadingCarts(true);
        poolBookingRequestsApi
            .getAvailableCarts(stadiumId, { startDate, endDate: effectiveEndDate, startTime, endTime })
            .then((res) => setAvailableCarts(res.data.data || []))
            .catch((err) => console.error('Failed to load available carts:', err))
            .finally(() => setLoadingCarts(false));
    }, [formData.stadiumId, formData.startDate, formData.endDate, formData.startTime, formData.endTime, formData.bookingType]);

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
                    faUserId: formData.faUserId,
                    purpose: formData.purpose || undefined,
                });
                setRequestToken(res.data.data.requestToken);
                setSubmittedMode('instant');
                setSubmitted(true);
                return;
            }

            const effectiveEndDate = formData.bookingType === 'Single' ? formData.startDate : formData.endDate;
            const res = await poolBookingRequestsApi.createPublic({
                stadiumId: formData.stadiumId,
                fleetId: formData.fleetId,
                requesterName: formData.requesterName,
                requesterEmail: formData.requesterEmail,
                requesterPhone: formData.requesterPhone,
                faUserId: formData.faUserId,
                bookingType: formData.bookingType,
                startDate: formData.startDate,
                endDate: effectiveEndDate,
                startTime: formData.startTime,
                endTime: formData.endTime,
                purpose: formData.purpose || undefined,
            });
            setRequestToken(res.data.data.requestToken);
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
        const trackingUrl = `${window.location.origin}/book-pool/confirm/${requestToken}`;
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg">
                    <CardContent className="pt-8 pb-6 text-center">
                        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Request Submitted!</h2>
                        <p className="text-muted-foreground mb-4">
                            Logistics team will review your request and respond to you shortly.
                        </p>
                        {submittedMode === 'instant' && (
                            <div className="bg-amber-50 border border-amber-200 rounded-md p-3 mb-4 text-sm text-amber-900">
                                Once approved, collect the key within <strong>10 minutes</strong> — if the request
                                has not been attended and the key has not been collected in time, the booking will
                                be automatically cancelled and the car returned to the pool due to demand from other
                                users.
                            </div>
                        )}
                        <div className="bg-muted p-3 rounded-md mb-6">
                            <p className="text-sm text-muted-foreground mb-2">Track your booking:</p>
                            <a href={trackingUrl} className="text-primary hover:underline text-sm break-all">
                                {trackingUrl}
                            </a>
                        </div>
                        <div className="flex flex-col sm:flex-row gap-3">
                            <Button asChild variant="outline" className="flex-1">
                                <Link to="/login">Close</Link>
                            </Button>
                            <Button
                                className="flex-1"
                                onClick={() => {
                                    setSubmitted(false);
                                    setRequestToken('');
                                    setFormData({
                                        stadiumId: '', requesterName: '', requesterEmail: '', requesterPhone: '',
                                        faUserId: '', bookingType: 'Single', startDate: '', endDate: '',
                                        startTime: '', endTime: '', fleetId: '', purpose: '',
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
                    className="w-full py-4 px-6 flex items-center gap-3"
                    style={{ background: 'linear-gradient(135deg, #5b2a9e 0%, #4a4fc4 38%, #2f6fd6 62%, #14a3ac 100%)' }}
                >
                    <img
                        src={branding.logoUrl || '/branding/sc-logo.png'}
                        alt="Logo"
                        className="h-10 object-contain"
                        onError={(e) => {
                            const img = e.target as HTMLImageElement;
                            if (img.src !== window.location.origin + '/branding/sc-logo.png') img.src = '/branding/sc-logo.png';
                            else img.style.display = 'none';
                        }}
                    />
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

                    {branding.requestWindow && !branding.requestWindow.isOpen ? (
                        <Card className="max-w-lg mx-auto">
                            <CardContent className="py-10 text-center space-y-2">
                                <h2 className="text-xl font-semibold">Bookings are currently closed</h2>
                                <p className="text-muted-foreground">
                                    {branding.requestWindow.message
                                        || (branding.requestWindow.opensAt
                                            ? `The booking window opens ${new Date(branding.requestWindow.opensAt).toLocaleString()}.`
                                            : 'Please check back later.')}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                    <Card>
                        <CardHeader>
                            <CardTitle>Booking Details</CardTitle>
                            <CardDescription>
                                {mode === 'instant'
                                    ? 'Select a venue to see pool cars available right now — no date or time needed.'
                                    : 'Select a venue to begin.'}
                            </CardDescription>
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
                                            setFormData({ ...formData, stadiumId: value, faUserId: '', fleetId: '' })
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
                                                    <Label htmlFor="faUserId">FA *</Label>
                                                    <Select
                                                        value={formData.faUserId}
                                                        onValueChange={(value) => setFormData({ ...formData, faUserId: value })}
                                                    >
                                                        <SelectTrigger>
                                                            <SelectValue placeholder={fas.length ? 'Select FA' : 'No FAs at this venue'} />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {fas.map((fa) => (
                                                                <SelectItem key={fa.id} value={fa.id}>
                                                                    {fa.name}
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
                                                    onValueChange={(value) => setFormData({ ...formData, bookingType: value as 'Single' | 'Recurring', fleetId: '' })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="Single">Single day</SelectItem>
                                                        <SelectItem value="Recurring">Recurring (every day in a date range)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="startDate">{formData.bookingType === 'Single' ? 'Date *' : 'Start Date *'}</Label>
                                                    <Input
                                                        id="startDate"
                                                        type="date"
                                                        value={formData.startDate}
                                                        onChange={(e) => setFormData({ ...formData, startDate: e.target.value, fleetId: '' })}
                                                        required
                                                    />
                                                </div>
                                                {formData.bookingType === 'Recurring' && (
                                                    <div className="space-y-2">
                                                        <Label htmlFor="endDate">End Date *</Label>
                                                        <Input
                                                            id="endDate"
                                                            type="date"
                                                            value={formData.endDate}
                                                            min={formData.startDate || undefined}
                                                            onChange={(e) => setFormData({ ...formData, endDate: e.target.value, fleetId: '' })}
                                                            required
                                                        />
                                                    </div>
                                                )}
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
                                            {loadingInstantCarts ? (
                                                <div className="flex justify-center py-6">
                                                    <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                                                </div>
                                            ) : instantCarts.length === 0 ? (
                                                <p className="text-sm text-muted-foreground">No pool cars are free at this venue right now.</p>
                                            ) : (
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
                                            )}
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
