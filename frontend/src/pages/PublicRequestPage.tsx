import { useState, useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { requestsApi, publicDataApi, publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, XCircle, Mail, Phone, Building, MapPin, Lock } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

interface Stadium {
    id: string;
    name: string;
    code: string;
}

interface Department {
    id: string;
    name: string;
    code?: string;
    stadiumId: string;
}

interface Branding {
    tournamentName: string;
    logoUrl: string | null;
    headerUrl: string | null;
    footerUrl: string | null;
    footerText: string | null;
    requestWindow?: { isOpen: boolean; opensAt: string | null; closesAt: string | null; message: string | null };
}

export function PublicRequestPage() {
    const [searchParams] = useSearchParams();
    const stadiumIdParam = searchParams.get('stadium');
    const departmentIdParam = searchParams.get('department');

    // When dept param is set without stadium, we'll resolve it
    const isStadiumLocked = !!stadiumIdParam;
    const isDeptLocked = !!departmentIdParam;

    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [requestToken, setRequestToken] = useState<string>('');
    const [requestNumber, setRequestNumber] = useState<number | null>(null);
    const [error, setError] = useState<string | null>(null);

    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);
    const [branding, setBranding] = useState<Branding>({ tournamentName: 'GCMS', logoUrl: null, headerUrl: null, footerUrl: null, footerText: null });

    const [formData, setFormData] = useState({
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
        accreditationNumber: '',
        // The public request form only ever requests dedicated cars — pool/shared
        // cars are booked (with live availability) from the separate /book-pool page.
        requestType: 'dedicated',
        stadiumId: stadiumIdParam || '',
        departmentId: departmentIdParam || '',
        cargoCount: 0,
        fourSeaterCount: 0,
        sixSeaterCount: 0,
        accessibilityCount: 0,
        justification: '',
        notes: '',
    });

    useEffect(() => {
        const loadData = async () => {
            try {
                const [stadiumsRes, brandingRes] = await Promise.all([
                    publicDataApi.getStadiums(),
                    publicSettingsApi.getBranding(),
                ]);
                setStadiums(stadiumsRes.data.data || []);
                setBranding(brandingRes.data);
            } catch (err) {
                console.error('Failed to load initial data:', err);
            } finally {
                setLoadingInitial(false);
            }
        };
        loadData();
    }, []);

    useEffect(() => {
        const loadDepartments = async () => {
            if (!formData.stadiumId) {
                setDepartments([]);
                return;
            }
            try {
                const res = await publicDataApi.getDepartments(formData.stadiumId);
                setDepartments(res.data.data || []);
            } catch (err) {
                console.error('Failed to load departments:', err);
            }
        };
        loadDepartments();
    }, [formData.stadiumId]);

    // If departmentIdParam is set but stadiumId is missing, fetch dept to get stadiumId
    useEffect(() => {
        if (departmentIdParam && !stadiumIdParam) {
            publicDataApi.getDepartments().then(res => {
                const depts: Department[] = res.data.data || [];
                const dept = depts.find(d => d.id === departmentIdParam);
                if (dept) {
                    setFormData(f => ({ ...f, stadiumId: dept.stadiumId }));
                }
            }).catch(() => {});
        }
    }, [departmentIdParam, stadiumIdParam]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        const totalRequested =
            formData.cargoCount +
            formData.fourSeaterCount +
            formData.sixSeaterCount +
            formData.accessibilityCount;

        if (totalRequested === 0) {
            setError('Please request at least one cart');
            setLoading(false);
            return;
        }

        if (!formData.justification.trim()) {
            setError('Please explain why your department needs these carts');
            setLoading(false);
            return;
        }

        try {
            const res = await requestsApi.createPublic({
                requesterName: formData.requesterName,
                requesterEmail: formData.requesterEmail,
                requesterPhone: formData.requesterPhone || undefined,
                accreditationNumber: formData.accreditationNumber || undefined,
                requestType: formData.requestType,
                stadiumId: formData.stadiumId,
                departmentId: formData.departmentId,
                cargoCount: formData.cargoCount,
                fourSeaterCount: formData.fourSeaterCount,
                sixSeaterCount: formData.sixSeaterCount,
                accessibilityCount: formData.accessibilityCount,
                justification: formData.justification,
                notes: formData.notes || undefined,
            });

            setRequestToken(res.data.data.requestToken);
            setRequestNumber(res.data.data.requestNumber);
            setSubmitted(true);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit request');
        } finally {
            setLoading(false);
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
        const trackingUrl = `${window.location.origin}/request/confirm/${requestToken}`;
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg">
                    <CardContent className="pt-8 pb-6 text-center">
                        <CheckCircle className="w-16 h-16 text-emerald-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Thank You!</h2>
                        <p className="text-muted-foreground mb-1">
                            Your request has been submitted successfully.
                        </p>
                        <p className="text-muted-foreground mb-4">
                            Logistics team will review your request and respond to you shortly.
                        </p>
                        <div className="bg-[#eef4ff] border border-[#3874ff]/20 rounded-lg py-3 px-4 mb-4">
                            <p className="text-xs uppercase tracking-wide text-[#3874ff]/80 font-bold">Request Number</p>
                            <p className="text-2xl font-extrabold text-[#3874ff]">#{requestNumber}</p>
                        </div>
                        <p className="text-sm text-muted-foreground mb-4">
                            A confirmation email has been sent to <strong>{formData.requesterEmail}</strong>
                        </p>
                        <div className="bg-muted p-3 rounded-md mb-6">
                            <p className="text-sm text-muted-foreground mb-2">Track your request anytime:</p>
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
                                    setRequestNumber(null);
                                    setFormData({
                                        requesterName: '', requesterEmail: '', requesterPhone: '', accreditationNumber: '',
                                        requestType: 'dedicated',
                                        stadiumId: stadiumIdParam || '', departmentId: departmentIdParam || '',
                                        cargoCount: 0, fourSeaterCount: 0, sixSeaterCount: 0, accessibilityCount: 0,
                                        justification: '', notes: '',
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

    const selectedStadium = stadiums.find(s => s.id === formData.stadiumId);
    const selectedDept = departments.find(d => d.id === formData.departmentId);

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col">
            {/* Header branding */}
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
                        <h1 className="text-3xl font-bold">Car Request Form</h1>
                        <p className="text-muted-foreground mt-2">
                            Submit a request for golf carts for your department
                        </p>
                        {(isStadiumLocked || isDeptLocked) && (
                            <div className="mt-3 flex items-center justify-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-4 py-2 inline-flex mx-auto">
                                <Lock className="w-4 h-4" />
                                <span>
                                    {isDeptLocked ? 'Department and stadium pre-selected by link' : 'Stadium pre-selected by link'}
                                </span>
                            </div>
                        )}
                    </div>

                    {branding.requestWindow && !branding.requestWindow.isOpen ? (
                        <Card className="max-w-lg mx-auto">
                            <CardContent className="py-10 text-center space-y-2">
                                <h2 className="text-xl font-semibold">Requests are currently closed</h2>
                                <p className="text-muted-foreground">
                                    {branding.requestWindow.message
                                        || (branding.requestWindow.opensAt
                                            ? `Requirement collection opens ${new Date(branding.requestWindow.opensAt).toLocaleString()}.`
                                            : 'Please check back later.')}
                                </p>
                            </CardContent>
                        </Card>
                    ) : (
                    <Card>
                        <CardHeader className="text-center">
                            <CardTitle>Request Details</CardTitle>
                            <CardDescription>
                                Fill in the form below to request golf carts for your department venue operations.
                            </CardDescription>
                        </CardHeader>
                        <CardContent>
                            <form onSubmit={handleSubmit} className="space-y-6">
                                {/* Requester Information */}
                                <div className="space-y-4">
                                    <h3 className="font-medium flex items-center gap-2">
                                        <Mail className="w-4 h-4" />
                                        Contact Information
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="requesterName">Your Name *</Label>
                                            <Input
                                                id="requesterName"
                                                value={formData.requesterName}
                                                onChange={(e) => setFormData({ ...formData, requesterName: e.target.value })}
                                                placeholder="John Doe"
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
                                                placeholder="john@department.org"
                                                required
                                            />
                                        </div>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="requesterPhone" className="flex items-center gap-2">
                                                <Phone className="w-3 h-3" />
                                                Phone Number (Optional)
                                            </Label>
                                            <Input
                                                id="requesterPhone"
                                                value={formData.requesterPhone}
                                                onChange={(e) => setFormData({ ...formData, requesterPhone: e.target.value })}
                                                placeholder="+1 234 567 8900"
                                            />
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="accreditationNumber">Accreditation / Badge # (Optional)</Label>
                                            <Input
                                                id="accreditationNumber"
                                                value={formData.accreditationNumber}
                                                onChange={(e) => setFormData({ ...formData, accreditationNumber: e.target.value })}
                                                placeholder="e.g. ACC-12345"
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Stadium & Department */}
                                <div className="space-y-4">
                                    <h3 className="font-medium flex items-center gap-2">
                                        <MapPin className="w-4 h-4" />
                                        Location
                                    </h3>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div className="space-y-2">
                                            <Label htmlFor="stadium" className="flex items-center gap-2">
                                                Stadium *
                                                {isStadiumLocked && <Badge variant="outline" className="text-xs flex items-center gap-1"><Lock className="w-3 h-3" />Locked</Badge>}
                                            </Label>
                                            {isStadiumLocked && selectedStadium ? (
                                                <div className="p-2 border rounded-md bg-muted text-sm font-medium">
                                                    {selectedStadium.code} — {selectedStadium.name}
                                                </div>
                                            ) : (
                                                <Select
                                                    value={formData.stadiumId}
                                                    onValueChange={(value) => setFormData({ ...formData, stadiumId: value, departmentId: '' })}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder="Select stadium" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {stadiums.map((s) => (
                                                            <SelectItem key={s.id} value={s.id}>
                                                                {s.code} — {s.name}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                        <div className="space-y-2">
                                            <Label htmlFor="department" className="flex items-center gap-2">
                                                Department *
                                                {isDeptLocked && <Badge variant="outline" className="text-xs flex items-center gap-1"><Lock className="w-3 h-3" />Locked</Badge>}
                                            </Label>
                                            {isDeptLocked && selectedDept ? (
                                                <div className="p-2 border rounded-md bg-muted text-sm font-medium">
                                                    {selectedDept.name}{selectedDept.code ? ` (${selectedDept.code})` : ''}
                                                </div>
                                            ) : (
                                                <Select
                                                    value={formData.departmentId}
                                                    onValueChange={(value) => setFormData({ ...formData, departmentId: value })}
                                                    disabled={!formData.stadiumId}
                                                >
                                                    <SelectTrigger>
                                                        <SelectValue placeholder={formData.stadiumId ? "Select department" : "Select stadium first"} />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        {departments.map((d) => (
                                                            <SelectItem key={d.id} value={d.id}>
                                                                {d.name}{d.code ? ` (${d.code})` : ''}
                                                            </SelectItem>
                                                        ))}
                                                    </SelectContent>
                                                </Select>
                                            )}
                                        </div>
                                    </div>
                                </div>

                            {/* Cart Quantities */}
                            <div className="space-y-4">
                                <h3 className="font-medium flex items-center gap-2">
                                    <Building className="w-4 h-4" />
                                    Cart Quantities
                                </h3>
                                <p className="text-sm text-muted-foreground">
                                    Specify the number of each cart type you need.
                                </p>
                                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="cargoCount">Cargo</Label>
                                        <Input
                                            id="cargoCount"
                                            type="number"
                                            min="0"
                                            value={formData.cargoCount}
                                            onChange={(e) => setFormData({ ...formData, cargoCount: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="fourSeaterCount">4-Seater</Label>
                                        <Input
                                            id="fourSeaterCount"
                                            type="number"
                                            min="0"
                                            value={formData.fourSeaterCount}
                                            onChange={(e) => setFormData({ ...formData, fourSeaterCount: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="sixSeaterCount">6-Seater</Label>
                                        <Input
                                            id="sixSeaterCount"
                                            type="number"
                                            min="0"
                                            value={formData.sixSeaterCount}
                                            onChange={(e) => setFormData({ ...formData, sixSeaterCount: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="accessibilityCount">Accessibility</Label>
                                        <Input
                                            id="accessibilityCount"
                                            type="number"
                                            min="0"
                                            value={formData.accessibilityCount}
                                            onChange={(e) => setFormData({ ...formData, accessibilityCount: parseInt(e.target.value) || 0 })}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Justification */}
                            <div className="space-y-2">
                                <Label htmlFor="justification">Business Justification *</Label>
                                <Textarea
                                    id="justification"
                                    value={formData.justification}
                                    onChange={(e) => setFormData({ ...formData, justification: e.target.value })}
                                    placeholder="Explain why your department needs these carts (e.g. operational requirement, event coverage)..."
                                    rows={3}
                                    required
                                />
                            </div>

                            {/* Notes */}
                            <div className="space-y-2">
                                <Label htmlFor="notes">Additional Notes</Label>
                                <Textarea
                                    id="notes"
                                    value={formData.notes}
                                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                                    placeholder="Any special requirements or notes..."
                                    rows={3}
                                />
                            </div>

                            {error && (
                                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm">
                                    {error}
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={loading}>
                                {loading ? (
                                    <>
                                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                        Submitting...
                                    </>
                                ) : (
                                    'Submit Request'
                                )}
                            </Button>
                        </form>
                    </CardContent>
                </Card>
                    )}
            </div>

            {/* Footer branding */}
            {(branding.footerUrl || branding.footerText) && (
                <div className="w-full mt-8 border-t bg-white py-4 px-6 text-center">
                    {branding.footerUrl && (
                        <img src={branding.footerUrl} alt="Footer" className="h-12 object-contain mx-auto mb-2" />
                    )}
                    {branding.footerText && (
                        <p className="text-sm text-muted-foreground">{branding.footerText}</p>
                    )}
                </div>
            )}
        </div>
    </div>
    );
}

const REQUEST_STATUS_LABELS: Record<string, string> = {
    Pending: 'Under Review',
    Approved: 'Approved',
    Rejected: 'Rejected',
};

const REQUEST_STATUS_COLORS: Record<string, string> = {
    Pending: 'bg-amber-100 text-amber-800',
    Approved: 'bg-emerald-100 text-emerald-800',
    Rejected: 'bg-red-100 text-red-800',
};

function RequestStatusCard({ request }: { request: any }) {
    return (
        <Card className="shadow-lg">
            <CardHeader>
                <div className="flex justify-between items-start gap-3">
                    <div>
                        <CardTitle>Request #{request.requestNumber}</CardTitle>
                        <CardDescription>
                            Submitted on {formatDate(request.createdAt)}
                        </CardDescription>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-sm font-semibold whitespace-nowrap ${REQUEST_STATUS_COLORS[request.status] || 'bg-gray-100 text-gray-800'}`}>
                        {REQUEST_STATUS_LABELS[request.status] || request.status}
                    </span>
                </div>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <p className="text-sm text-muted-foreground">Stadium</p>
                        <p className="font-medium">{request.stadium?.name}</p>
                    </div>
                    <div>
                        <p className="text-sm text-muted-foreground">Department</p>
                        <p className="font-medium">{request.department?.name}</p>
                    </div>
                </div>
                <div>
                    <p className="text-sm text-muted-foreground mb-2">Carts Requested</p>
                    <div className="flex gap-4 flex-wrap">
                        {request.cargoCount > 0 && <span>Cargo: {request.cargoCount}</span>}
                        {request.fourSeaterCount > 0 && <span>4-Seater: {request.fourSeaterCount}</span>}
                        {request.sixSeaterCount > 0 && <span>6-Seater: {request.sixSeaterCount}</span>}
                        {request.accessibilityCount > 0 && <span>Accessibility: {request.accessibilityCount}</span>}
                    </div>
                </div>
                {request.reviewNotes && (
                    <div>
                        <p className="text-sm text-muted-foreground">Notes</p>
                        <p className="font-medium">{request.reviewNotes}</p>
                    </div>
                )}
                {request.reviewedBy && (
                    <div>
                        <p className="text-sm text-muted-foreground">Reviewed By</p>
                        <p className="font-medium">{request.reviewedBy.name}</p>
                    </div>
                )}
                <div className="pt-2">
                    <Button asChild variant="outline" className="w-full">
                        <Link to="/login">Close</Link>
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}

export function RequestConfirmationPage() {
    const { token } = useParams<{ token: string }>();
    const [loading, setLoading] = useState(true);
    const [request, setRequest] = useState<any>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const fetchRequest = async () => {
            if (!token) return;

            try {
                const res = await requestsApi.getByTokenPublic(token);
                setRequest(res.data.data);
            } catch (err: any) {
                setError(err.response?.data?.error || 'Failed to load request');
            } finally {
                setLoading(false);
            }
        };

        fetchRequest();
    }, [token]);

    if (loading) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
        );
    }

    if (error || !request) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold mb-2">Error</h2>
                        <p className="text-muted-foreground">{error || 'Request not found'}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <RequestStatusCard request={request} />
            </div>
        </div>
    );
}

/** Public "track my request" lookup by request number + the requester's own email. */
export function TrackRequestPage() {
    const [requestNumber, setRequestNumberInput] = useState('');
    const [email, setEmail] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [request, setRequest] = useState<any>(null);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);
        setRequest(null);
        try {
            const res = await requestsApi.trackPublic(parseInt(requestNumber, 10), email);
            setRequest(res.data.data);
        } catch (err: any) {
            setError(err.response?.data?.error || 'No matching request found');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto space-y-6">
                <div className="text-center">
                    <h1 className="text-2xl font-bold">Track Your Request</h1>
                    <p className="text-muted-foreground mt-1">
                        Enter your request number and the email you submitted with.
                    </p>
                </div>
                <Card>
                    <CardContent className="pt-6">
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-end">
                            <div className="space-y-2">
                                <Label htmlFor="trackNumber">Request Number</Label>
                                <Input
                                    id="trackNumber" type="number" min="1" required
                                    value={requestNumber}
                                    onChange={(e) => setRequestNumberInput(e.target.value)}
                                    placeholder="e.g. 42"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="trackEmail">Email</Label>
                                <Input
                                    id="trackEmail" type="email" required
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="you@department.org"
                                />
                            </div>
                            <div className="sm:col-span-2">
                                <Button type="submit" className="w-full" disabled={loading}>
                                    {loading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Searching...</> : 'Track Request'}
                                </Button>
                            </div>
                        </form>
                        {error && <p className="text-sm text-red-600 mt-3 text-center">{error}</p>}
                    </CardContent>
                </Card>
                {request && <RequestStatusCard request={request} />}
            </div>
        </div>
    );
}