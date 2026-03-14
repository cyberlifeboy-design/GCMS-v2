import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { authApi, settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowLeft, CheckCircle2 } from 'lucide-react';

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

export function ForgotPasswordPage() {
    const [email, setEmail] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [error, setError] = useState('');
    const [isSubmitted, setIsSubmitted] = useState(false);
    const [branding, setBranding] = useState<Branding>({});

    useEffect(() => {
        settingsApi.get().then(res => setBranding(res.data.data || {})).catch(() => {});
    }, []);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setIsLoading(true);
        try {
            await authApi.forgotPassword(email);
            setIsSubmitted(true);
        } catch (err: any) {
            const errorMsg = err.response?.data?.error;
            if (errorMsg?.toLowerCase().includes('too many')) {
                setError('Too many attempts. Please wait 15 minutes before trying again.');
            } else {
                setError(errorMsg || 'Failed to send reset link');
            }
        } finally {
            setIsLoading(false);
        }
    };

    if (isSubmitted) {
        return (
            <BrandingShell branding={branding}>
                <Card className="w-full max-w-md text-center">
                    <CardHeader>
                        <div className="flex justify-center mb-4">
                            <CheckCircle2 className="h-12 w-12 text-primary" />
                        </div>
                        <CardTitle>Check your email</CardTitle>
                        <CardDescription>
                            We've sent a password reset link to <strong>{email}</strong>
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <p className="text-sm text-muted-foreground">
                            If you don't see it, check your spam folder.
                        </p>
                    </CardContent>
                    <CardFooter>
                        <Button asChild variant="outline" className="w-full">
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

    return (
        <BrandingShell branding={branding}>
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    {branding.logoUrl && (
                        <div className="flex justify-center mb-2">
                            <img src={branding.logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                        </div>
                    )}
                    <CardTitle>{branding.tournamentName || 'GCMS'} – Forgot Password</CardTitle>
                    <CardDescription>
                        Enter your email address and we'll send you a link to reset your password.
                    </CardDescription>
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
                                placeholder="name@example.com" required />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Sending...</> : 'Send Reset Link'}
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
