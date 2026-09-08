import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
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
}

const statusColors: Record<string, string> = {
    Pending: 'bg-yellow-100 text-yellow-800',
    Approved: 'bg-green-100 text-green-800',
    Rejected: 'bg-red-100 text-red-800',
    Cancelled: 'bg-gray-100 text-gray-800',
};

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

    const [loadingInitial, setLoadingInitial] = useState(true);
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [branding, setBranding] = useState<Branding>({ tournamentName: 'GCMS', logoUrl: null, headerUrl: null, footerUrl: null, footerText: null });

    const [fas, setFAs] = useState<FA[]>([]);
    const [availableCarts, setAvailableCarts] = useState<AvailableCart[]>([]);
    const [loadingCarts, setLoadingCarts] = useState(false);

    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
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

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError(null);

        const effectiveEndDate = formData.bookingType === 'Single' ? formData.startDate : formData.endDate;
        if (!formData.fleetId) {
            setError('Please select a cart');
            return;
        }

        setSubmitting(true);
        try {
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
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Booking Request Submitted!</h2>
                        <p className="text-muted-foreground mb-4">
                            Your pool booking request has been sent to the venue admin for approval.
                        </p>
                        <div className="bg-muted p-3 rounded-md">
                            <p className="text-sm text-muted-foreground mb-2">Track your booking:</p>
                            <a href={trackingUrl} className="text-primary hover:underline text-sm break-all">
                                {trackingUrl}
                            </a>
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
                <div className="w-full bg-primary py-4 px-6 flex items-center gap-3">
                    {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" className="h-10 object-contain" />}
                    <span className="text-white font-bold text-xl">{branding.tournamentName}</span>
                </div>
            )}

            <div className="flex-1 py-8 px-4">
                <div className="max-w-2xl mx-auto">
                    <div className="text-center mb-8">
                        <h1 className="text-3xl font-bold">Book a Pool Cart</h1>
                        <p className="text-muted-foreground mt-2">Request a shared pool cart at a venue — subject to admin approval</p>
                    </div>

                    <Card>
                        <CardHeader>
                            <CardTitle>Booking Details</CardTitle>
                            <CardDescription>Select a venue to begin.</CardDescription>
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
