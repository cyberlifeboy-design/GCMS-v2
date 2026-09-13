import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ShieldCheck, Mail, Lock, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);
    const [error, setError] = useState('');
    const [branding, setBranding] = useState<{
        tournamentName?: string; logoUrl?: string; headerUrl?: string; footerUrl?: string; footerText?: string;
        enableCarRequests?: boolean;
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
        <div className="min-h-screen flex flex-col relative overflow-hidden bg-[#3b2f7a]">
            {/* Diagonal gradient theme + soft wave blobs — matches the SC/LOC portal family look */}
            <div
                className="absolute inset-0"
                style={{ background: 'linear-gradient(135deg, #5b2a9e 0%, #4a4fc4 38%, #2f6fd6 62%, #14a3ac 100%)' }}
            />
            <div className="absolute -left-32 top-1/3 w-[32rem] h-[32rem] rounded-full bg-[#7c3aed]/30 blur-3xl" />
            <div className="absolute right-0 -bottom-24 w-[28rem] h-[28rem] rounded-full bg-[#0ea5a8]/30 blur-3xl" />
            <div className="absolute right-1/4 top-0 w-[24rem] h-[24rem] rounded-full bg-[#3b5fd9]/30 blur-3xl" />

            {branding.headerUrl && (
                <div className="relative w-full">
                    <img src={branding.headerUrl} alt="Header Branding" className="w-full max-h-24 object-cover" />
                </div>
            )}

            {/* Brand lockup — top-left, mirrors the SC/LOC portal layout */}
            <div className="relative z-10 flex items-center gap-3 px-8 pt-8">
                <img
                    src={branding.logoUrl || '/branding/sc-logo.png'}
                    alt="Logo"
                    className="h-14 w-auto object-contain"
                    onError={(e) => {
                        const img = e.target as HTMLImageElement;
                        if (img.src !== window.location.origin + '/branding/sc-logo.png') {
                            img.src = '/branding/sc-logo.png';
                        } else {
                            img.style.display = 'none';
                        }
                    }}
                />
            </div>

            <div className="relative z-10 flex-1 flex items-center justify-center p-4">
                <div className="w-full max-w-md rounded-2xl bg-white shadow-2xl p-8">
                    <div className="text-center mb-6">
                        <h1 className="text-2xl font-extrabold text-[#222834]">{branding.tournamentName || 'GCMS'}</h1>
                        <p className="text-sm text-[#67728a] mt-1">Please sign into your account.</p>
                    </div>

                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}

                    <button
                        type="button"
                        onClick={() => toast.info('Coming soon — sign in with your SC/LOC Microsoft account.')}
                        className="w-full mb-4 flex items-center justify-center gap-2 rounded-md border border-[#e3e6ed] bg-[#f5f7fa] hover:bg-[#eef0f5] transition-colors py-2.5 px-4 text-sm font-bold text-[#31374a]"
                    >
                        <span className="h-5 w-5 rounded bg-[#14a3ac] flex items-center justify-center shrink-0">
                            <ShieldCheck className="h-3.5 w-3.5 text-white" />
                        </span>
                        Sign in with your SC/LOC account
                    </button>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="h-px flex-1 bg-[#e3e6ed]" />
                        <span className="text-[11px] uppercase tracking-wide text-[#9aa2b5]">or use email</span>
                        <div className="h-px flex-1 bg-[#e3e6ed]" />
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-1.5">
                            <label htmlFor="email" className="text-[11px] font-bold uppercase tracking-wide text-[#67728a]">
                                Email
                            </label>
                            <div className="relative">
                                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa2b5]" />
                                <input
                                    id="email" type="email" value={email} required
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="name@example.com"
                                    className="w-full rounded-md border border-[#e3e6ed] bg-white pl-9 pr-3 py-2.5 text-sm text-[#222834] placeholder:text-[#9aa2b5] outline-none focus:ring-2 focus:ring-[#3874ff]/40 focus:border-[#3874ff]"
                                />
                            </div>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex items-center justify-between">
                                <label htmlFor="password" className="text-[11px] font-bold uppercase tracking-wide text-[#67728a]">
                                    Password
                                </label>
                                <Link to="/forgot-password" title="Forgot password?" className="text-xs font-semibold text-[#fd7e14] hover:underline">
                                    Forgot Password?
                                </Link>
                            </div>
                            <div className="relative">
                                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#9aa2b5]" />
                                <input
                                    id="password" type={showPassword ? 'text' : 'password'} value={password} required
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="Password"
                                    className="w-full rounded-md border border-[#e3e6ed] bg-white pl-9 pr-9 py-2.5 text-sm text-[#222834] placeholder:text-[#9aa2b5] outline-none focus:ring-2 focus:ring-[#3874ff]/40 focus:border-[#3874ff]"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword((v) => !v)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9aa2b5] hover:text-[#67728a]"
                                    tabIndex={-1}
                                >
                                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={isLoading}
                            className="w-full rounded-md bg-[#3874ff] hover:bg-[#2a63ea] transition-colors py-2.5 text-sm font-bold text-white disabled:opacity-60 flex items-center justify-center"
                        >
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                        </button>
                    </form>

                    {(() => {
                        const w = branding.requestWindow;
                        const open = w ? w.isOpen : true;
                        const requestsEnabled = branding.enableCarRequests !== false;
                        const note = requestsEnabled && !open
                            ? (w?.message
                                || (w?.opensAt ? `Requirement collection opens ${new Date(w.opensAt).toLocaleDateString()}` : 'Requests are currently closed'))
                            : null;
                        return (
                            <div className="mt-5 space-y-2">
                                <div className={`grid grid-cols-1 gap-3 ${requestsEnabled ? 'sm:grid-cols-2' : ''}`}>
                                    {requestsEnabled && (
                                        <Button asChild={open} variant="secondary" className="w-full" disabled={!open}>
                                            {open ? <Link to="/request">Submit a Request</Link> : <span>Submit a Request</span>}
                                        </Button>
                                    )}
                                    <Button asChild variant="secondary" className="w-full">
                                        <Link to="/book-pool">Bookings</Link>
                                    </Button>
                                </div>
                                {note && <p className="text-xs text-center text-[#9aa2b5]">{note}</p>}
                            </div>
                        );
                    })()}
                </div>
            </div>

            {(branding.footerUrl || branding.footerText) && (
                <div className="relative z-10 w-full bg-white/10 backdrop-blur-sm p-4 text-center">
                    {branding.footerUrl && (
                        <img src={branding.footerUrl} alt="Footer Branding" className="max-h-16 w-auto mx-auto object-contain" />
                    )}
                    {branding.footerText && (
                        <p className="text-sm text-white/80 mt-2">{branding.footerText}</p>
                    )}
                </div>
            )}
        </div>
    );
}
