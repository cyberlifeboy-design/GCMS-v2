import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { requestsApi, stadiumsApi, departmentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, CheckCircle, XCircle, Mail, Phone, Building, MapPin } from 'lucide-react';
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

export function PublicRequestPage() {
    const [searchParams] = useSearchParams();
    const stadiumIdParam = searchParams.get('stadium');
    const departmentIdParam = searchParams.get('department');

    const [loading, setLoading] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const [requestToken, setRequestToken] = useState<string>('');
    const [error, setError] = useState<string | null>(null);

    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loadingInitial, setLoadingInitial] = useState(true);

    const [formData, setFormData] = useState({
        requesterName: '',
        requesterEmail: '',
        requesterPhone: '',
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
                const [stadiumsRes] = await Promise.all([
                    stadiumsApi.getAll(),
                ]);
                setStadiums(stadiumsRes.data.data || []);
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
                const res = await departmentsApi.getAll({ stadiumId: formData.stadiumId });
                setDepartments(res.data.data || []);
            } catch (err) {
                console.error('Failed to load departments:', err);
            }
        };
        loadDepartments();
    }, [formData.stadiumId]);

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

    return (
        <div className="min-h-screen bg-gray-50 py-8 px-4">
            <div className="max-w-2xl mx-auto">
                <div className="text-center mb-8">
                    <h1 className="text-3xl font-bold">Car Request Form</h1>
                    <p className="text-muted-foreground mt-2">
                        Submit a request for golf carts for your department
                    </p>
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
                            </div>

                            {/* Stadium & Department */}
                            <div className="space-y-4">
                                <h3 className="font-medium flex items-center gap-2">
                                    <MapPin className="w-4 h-4" />
                                    Location
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label htmlFor="stadium">Stadium *</Label>
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
                                                        {s.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="department">Department *</Label>
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
                                                        {d.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
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
                                <div className="bg-red-50 text-red-600 p-3 rounded-md text-sm flex items-center gap-2">
                                    <XCircle className="w-4 h-4" />
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