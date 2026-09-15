import { useEffect, useState } from 'react';
import { useLocation, useSearchParams, Link } from 'react-router-dom';
import { accessRequestsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, CheckCircle2, Mail } from 'lucide-react';

interface Stadium { id: string; name: string; code: string }
interface Department { id: string; name: string; code?: string; stadiumId: string }

export function AccessRequestPage() {
    const location = useLocation() as { state?: { email?: string; name?: string; source?: 'sso' } };
    const [searchParams] = useSearchParams();
    const inviteToken = searchParams.get('invite') || undefined;

    const [loadingInvite, setLoadingInvite] = useState(Boolean(inviteToken));
    const [inviteError, setInviteError] = useState('');

    const [name, setName] = useState(location.state?.name || '');
    const [email, setEmail] = useState(location.state?.email || '');
    const [emailLocked, setEmailLocked] = useState(Boolean(location.state?.email));
    const [phone, setPhone] = useState('');
    const [stadiumId, setStadiumId] = useState('');
    const [departmentId, setDepartmentId] = useState('');

    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [submitted, setSubmitted] = useState<{ requestNumber: number } | null>(null);

    useEffect(() => {
        accessRequestsApi.getPublicStadiums().then(res => setStadiums(res.data?.data || [])).catch(() => {});
    }, []);

    useEffect(() => {
        setDepartmentId('');
        if (!stadiumId) { setDepartments([]); return; }
        accessRequestsApi.getPublicDepartments(stadiumId).then(res => setDepartments(res.data?.data || [])).catch(() => {});
    }, [stadiumId]);

    useEffect(() => {
        if (!inviteToken) return;
        accessRequestsApi.getInvitationPublic(inviteToken)
            .then(res => {
                const invitation = res.data?.data;
                setEmail(invitation.email);
                setEmailLocked(true);
                if (invitation.stadiumId) setStadiumId(invitation.stadiumId);
                if (invitation.departmentId) setDepartmentId(invitation.departmentId);
            })
            .catch(err => setInviteError(err.response?.data?.error || 'This invitation link is invalid.'))
            .finally(() => setLoadingInvite(false));
    }, [inviteToken]);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSubmitting(true);
        try {
            const res = await accessRequestsApi.createPublic({
                name, email, phone: phone || undefined, stadiumId, departmentId,
                invitationToken: inviteToken,
            });
            setSubmitted({ requestNumber: res.data.data.requestNumber });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to submit your request. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    if (loadingInvite) {
        return (
            <div className="min-h-screen flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-[#3874ff]" />
            </div>
        );
    }

    if (inviteError) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center">
                    <p className="text-[#67728a]">{inviteError}</p>
                    <Link to="/login" className="mt-4 inline-block text-sm font-semibold text-[#3874ff] hover:underline">Back to sign in</Link>
                </div>
            </div>
        );
    }

    if (submitted) {
        return (
            <div className="min-h-screen flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8 text-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto mb-4" />
                    <h1 className="text-xl font-bold text-[#222834]">Request submitted</h1>
                    <p className="text-sm text-[#67728a] mt-2">
                        Your access request (#{submitted.requestNumber}) has been sent to the venue's Admin for review.
                        You'll get an email once it's been reviewed.
                    </p>
                    <Link to="/login" className="mt-6 inline-block text-sm font-semibold text-[#3874ff] hover:underline">Back to sign in</Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f7fa]">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
                <h1 className="text-xl font-bold text-[#222834] text-center">Request account access</h1>
                <p className="text-sm text-[#67728a] text-center mt-1">
                    Tell us where you're based and we'll route your request to the right Admin.
                </p>

                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 mt-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="name">Full name</Label>
                        <Input id="name" value={name} required onChange={e => setName(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="email">Email</Label>
                        <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa2b5]" />
                            <Input
                                id="email" type="email" value={email} required disabled={emailLocked}
                                onChange={e => !emailLocked && setEmail(e.target.value)}
                                className="pl-9"
                            />
                        </div>
                        {emailLocked && <p className="text-xs text-[#9aa2b5]">Verified — this can't be changed.</p>}
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="phone">Phone number</Label>
                        <Input id="phone" value={phone} onChange={e => setPhone(e.target.value)} />
                    </div>

                    <div className="space-y-1.5">
                        <Label>Venue</Label>
                        <Select value={stadiumId} onValueChange={setStadiumId}>
                            <SelectTrigger><SelectValue placeholder="Select a venue" /></SelectTrigger>
                            <SelectContent>
                                {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <div className="space-y-1.5">
                        <Label>Department (FA)</Label>
                        <Select value={departmentId} onValueChange={setDepartmentId} disabled={!stadiumId}>
                            <SelectTrigger><SelectValue placeholder={stadiumId ? 'Select a department' : 'Select a venue first'} /></SelectTrigger>
                            <SelectContent>
                                {departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>

                    <Button type="submit" disabled={submitting || !stadiumId || !departmentId} className="w-full">
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Submitting...</> : 'Submit Request'}
                    </Button>
                </form>
            </div>
        </div>
    );
}
