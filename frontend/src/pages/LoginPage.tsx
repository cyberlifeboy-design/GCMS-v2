import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2 } from 'lucide-react';

export function LoginPage() {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [branding, setBranding] = useState<{ tournamentName?: string; logoUrl?: string }>({});
    const { login, isLoading } = useAuthStore();
    const navigate = useNavigate();

    useEffect(() => {
        const loadBranding = async () => {
            try {
                const res = await settingsApi.get();
                setBranding(res.data);
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
        <div className="min-h-screen flex items-center justify-center bg-background p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center space-y-2">
                    {branding.logoUrl && (
                        <div className="flex justify-center mb-2">
                            <img src={branding.logoUrl} alt="Logo" className="h-16 w-auto object-contain" />
                        </div>
                    )}
                    <CardTitle className="text-2xl">{branding.tournamentName || 'GCMS'}</CardTitle>
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
                    {import.meta.env.DEV && (
                        <div className="mt-4 text-sm text-muted-foreground text-center">
                            <p>Dev: admin@gcms.com / Admin@2024!</p>
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}
