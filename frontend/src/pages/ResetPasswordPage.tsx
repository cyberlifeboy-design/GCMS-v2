import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { authApi, publicSettingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, CheckCircle2, Check, X } from 'lucide-react';

type Branding = { tournamentName?: string; logoUrl?: string; headerUrl?: string; footerUrl?: string; footerText?: string };

function BrandingShell({ branding, children }: { branding: Branding; children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col bg-background">
            {branding.headerUrl && (
                <div className="w-full">
                    <img src={branding.headerUrl} alt="Header Branding" className="w-full max-h-24 object-cover" />
                </div>
            )}
            <div className="flex-1 flex items-center justify-center p-4">
                {children}
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

export function ResetPasswordPage() {
    const [password, setPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSuccess, setIsSuccess] = useState(false);
    const [branding, setBranding] = useState<Branding>({});
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();
    const token = searchParams.get('token');

    useEffect(() => {
        publicSettingsApi.getBranding().then(res => setBranding(res.data || {})).catch(() => {});
    }, []);

    const hasMinLength = password.length >= 8;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumber = /\d/.test(password);
    const passwordsMatch = password === confirmPassword && confirmPassword !== '';
    const allValid = hasMinLength && hasUpperCase && hasLowerCase && hasNumber && passwordsMatch;

    const Requirement = ({ met, text }: { met: boolean; text: string }) => (
        <div className={`flex items-center gap-2 text-sm ${met ? 'text-green-600' : 'text-muted-foreground'}`}>
            {met ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
            <span>{text}</span>
        </div>
    );

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (!token) { setError('Reset token is missing.'); return; }
        if (!allValid) { setError('Please meet all password requirements.'); return; }
        setIsLoading(true);
        try {
            await authApi.resetPassword({ token, password });
            setIsSuccess(true);
            setTimeout(() => navigate('/login'), 3000);
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to reset password');
        } finally {
            setIsLoading(false);
        }
    };

    if (isSuccess) {
        return (
            <BrandingShell branding={branding}>
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <div className="flex justify-center mb-4">
                            <CheckCircle2 className="h-12 w-12 text-primary" />
                        </div>
                        <CardTitle>Password reset successfully</CardTitle>
                        <CardDescription>
                            Your password has been updated. You will be redirected to the login page shortly.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button asChild className="w-full">
                            <Link to="/login">Go to Login</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </BrandingShell>
        );
    }

    if (!token) {
        return (
            <BrandingShell branding={branding}>
                <Card className="w-full max-w-md">
                    <CardHeader>
                        <CardTitle>Invalid Reset Link</CardTitle>
                        <CardDescription>
                            This password reset link is invalid or has expired.
                        </CardDescription>
                    </CardHeader>
                    <CardFooter>
                        <Button asChild variant="outline" className="w-full">
                            <Link to="/forgot-password">Request new link</Link>
                        </Button>
                    </CardFooter>
                </Card>
            </BrandingShell>
        );
    }

    return (
        <BrandingShell branding={branding}>
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    {branding.logoUrl && (
                        <div className="flex justify-center mb-2">
                            <img src={branding.logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                        </div>
                    )}
                    <CardTitle>{branding.tournamentName || 'GCMS'} – Reset Password</CardTitle>
                    <CardDescription>Enter your new password below.</CardDescription>
                </CardHeader>
                <CardContent>
                    {error && (
                        <Alert variant="destructive" className="mb-4">
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="password">New Password</Label>
                            <Input id="password" type="password" value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••" required />
                        </div>
                        <div className="space-y-1 text-sm">
                            <Requirement met={hasMinLength} text="At least 8 characters" />
                            <Requirement met={hasUpperCase} text="One uppercase letter" />
                            <Requirement met={hasLowerCase} text="One lowercase letter" />
                            <Requirement met={hasNumber} text="One number" />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="confirmPassword">Confirm Password</Label>
                            <Input id="confirmPassword" type="password" value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                placeholder="••••••••" required />
                            {confirmPassword && (
                                <Requirement met={passwordsMatch} text="Passwords match" />
                            )}
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading || !allValid}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Resetting...</> : 'Reset Password'}
                        </Button>
                    </form>
                </CardContent>
                <CardFooter>
                    <Button asChild variant="ghost" className="w-full">
                        <Link to="/login">
                            <ArrowLeft className="mr-2 h-4 w-4" />
                            Back to Login
                        </Link>
                    </Button>
                </CardFooter>
            </Card>
        </BrandingShell>
    );
}
