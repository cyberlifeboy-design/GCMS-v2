import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
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
        requestType: 'one-time',
        stadiumId: stadiumIdParam || '',
        departmentId: departmentIdParam || '',
        cargoCount: 0,
        fourSeaterCount: 0,
        sixSeaterCount: 0,
        accessibilityCount: 0,
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
                notes: formData.notes || undefined,
            });

            setRequestToken(res.data.data.requestToken);
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
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                        <h2 className="text-2xl font-bold mb-2">Request Submitted!</h2>
                        <p className="text-muted-foreground mb-4">
                            Your car request has been submitted successfully. Our team will review it shortly.
                        </p>
                        <p className="text-sm text-muted-foreground mb-4">
                            A confirmation email has been sent to <strong>{formData.requesterEmail}</strong>
                        </p>
                        <div className="bg-muted p-3 rounded-md">
                            <p className="text-sm text-muted-foreground mb-2">Track your request:</p>
                            <a
                                href={trackingUrl}
                                className="text-primary hover:underline text-sm break-all"
                            >
                                {trackingUrl}
                            </a>
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
                <div className="w-full bg-primary py-4 px-6 flex items-center gap-3">
                    {branding.logoUrl && <img src={branding.logoUrl} alt="Logo" className="h-10 object-contain" />}
                    <span className="text-white font-bold text-xl">{branding.tournamentName}</span>
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

                    <Card>
                        <CardHeader>
                            <CardTitle>Request Details</CardTitle>
                            <CardDescription>
                                Fill in the form below to request golf carts for your department.
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
                                    <div className="space-y-2">
                                        <Label htmlFor="requestType">Request Type *</Label>
                                        <Select
                                            value={formData.requestType}
                                            onValueChange={(value) => setFormData({ ...formData, requestType: value })}
                                        >
                                            <SelectTrigger>
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="one-time">One-time use</SelectItem>
                                                <SelectItem value="dedicated">Dedicated tournament operational use</SelectItem>
                                            </SelectContent>
                                        </Select>
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

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <Card className="max-w-md w-full">
                    <CardContent className="pt-6 text-center">
                        <XCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold mb-2">Error</h2>
                        <p className="text-muted-foreground">{error}</p>
                    </CardContent>
                </Card>
            </div>
        );
    }

    const statusColors: Record<string, string> = {
        Pending: 'bg-yellow-100 text-yellow-800',
        Approved: 'bg-green-100 text-green-800',
        Rejected: 'bg-red-100 text-red-800',
    };

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <Card>
                    <CardHeader>
                        <div className="flex justify-between items-start">
                            <div>
                                <CardTitle>Request Status</CardTitle>
                                <CardDescription>
                                    Submitted on {formatDate(request.createdAt)}
                                </CardDescription>
                            </div>
                            <span className={`px-3 py-1 rounded-full text-sm font-medium ${statusColors[request.status] || 'bg-gray-100'}`}>
                                {request.status}
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
                                <p className="text-sm text-muted-foreground">Review Notes</p>
                                <p className="font-medium">{request.reviewNotes}</p>
                            </div>
                        )}
                        {request.reviewedBy && (
                            <div>
                                <p className="text-sm text-muted-foreground">Reviewed By</p>
                                <p className="font-medium">{request.reviewedBy.name}</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}