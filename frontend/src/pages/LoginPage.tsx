import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [branding, setBranding] = useState<{
        tournamentName?: string; logoUrl?: string; headerUrl?: string; footerUrl?: string; footerText?: string;
        requestWindow?: { isOpen: boolean; opensAt: string | null; closesAt: string | null; message: string | null };
    }>({});
    const { login, isLoading } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        const loadBranding = async () => {
            try {
                const res = await publicSettingsApi.getBranding();
                setBranding(res.data || {});
            } catch (e) {
                console.error('Failed to load branding', e);
            }
        };
        loadBranding();
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        try {
            await login(email, password);
            navigate('/');
        } catch (err: any) {
            setError(err.response?.data?.error || 'Login failed');
        }
    };

    return (
        <div className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-background to-primary/5 dark:from-slate-950 dark:via-background dark:to-primary/10">
            {branding.headerUrl && (
                <div className="w-full">
                    <img src={branding.headerUrl} alt="Header Branding" className="w-full max-h-24 object-cover" />
                </div>
            )}
            <div className="flex-1 flex items-center justify-center p-4">
            <Card className="w-full max-w-md shadow-xl border-border/60 backdrop-blur-sm">
                <CardHeader className="text-center space-y-2">
                    {branding.logoUrl ? (
                        <div className="flex justify-center mb-2">
                            <img src={branding.logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                        </div>
                    ) : (
                        <div className="flex justify-center mb-2">
                            <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center ring-1 ring-primary/15">
                                <ShieldCheck className="h-7 w-7 text-primary" />
                            </div>
                        </div>
                    )}
                    <CardTitle className="text-2xl tracking-tight">{branding.tournamentName || 'GCMS'}</CardTitle>
                    <CardDescription>Golf Car Management System</CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="email">Email</Label>
                            <Input id="email" type="email" value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@gcms.com" required />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label htmlFor="password">Password</Label>
                                <Link to="/forgot-password" title="Forgot password?" className="text-xs text-primary hover:underline font-medium">
                                    Forgot password?
                                </Link>
                            </div>
                            <Input id="password" type="password" value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" required />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                        </Button>
                    </form>

                    <Button
                        type="button"
                        variant="outline"
                        className="w-full mt-3"
                        onClick={() => toast.info('Coming soon — Microsoft sign-in for @sc.qa accounts.')}
                    >
                        <ShieldCheck className="mr-2 h-4 w-4" />
                        Sign in with Microsoft Authenticator
                    </Button>

                    {(() => {
                        const w = branding.requestWindow;
                        const open = w ? w.isOpen : true;
                        const note = !open
                            ? (w?.message
                                || (w?.opensAt ? `Requirement collection opens ${new Date(w.opensAt).toLocaleDateString()}` : 'Requests are currently closed'))
                            : null;
                        return (
                            <div className="mt-4 space-y-2">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    <Button asChild={open} variant="secondary" className="w-full" disabled={!open}>
                                        {open ? <Link to="/request">Submit a Request</Link> : <span>Submit a Request</span>}
                                    </Button>
                                    <Button asChild={open} variant="secondary" className="w-full" disabled={!open}>
                                        {open ? <Link to="/book-pool">Bookings</Link> : <span>Bookings</span>}
                                    </Button>
                                </div>
                                {note && <p className="text-xs text-center text-muted-foreground">{note}</p>}
                            </div>
                        );
                    })()}
                </CardContent>
            </Card>
            </div>
            {(branding.footerUrl || branding.footerText) && (
                <div className="w-full bg-muted p-4 text-center">
                    {branding.footerUrl && (
                        <img src={branding.footerUrl} alt="Footer Branding" className="max-h-16 w-auto mx-auto object-contain" />
                    )}
                    {branding.footerText && (
                        <p className="text-sm text-muted-foreground mt-2">{branding.footerText}</p>
                    )}
                </div>
            )}
        </div>
    );
}
