import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Lock } from 'lucide-react';

export function ForceChangePasswordPage() {
    const navigate = useNavigate();
    const { user, logout } = useAuthStore();
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [error, setError] = useState('');
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        if (newPassword !== confirmPassword) {
            setError('New passwords do not match.');
            return;
        }
        if (newPassword.length < 8) {
            setError('New password must be at least 8 characters.');
            return;
        }
        setSubmitting(true);
        try {
            await authApi.changePassword(currentPassword, newPassword);
            useAuthStore.setState((state) => ({ user: state.user ? { ...state.user, mustChangePassword: false } : null }));
            navigate('/', { replace: true });
        } catch (err: any) {
            setError(err.response?.data?.error || 'Failed to change password.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen flex items-center justify-center p-4 bg-[#f5f7fa]">
            <div className="w-full max-w-md rounded-2xl bg-white shadow-xl p-8">
                <Lock className="w-10 h-10 text-[#3874ff] mx-auto mb-2" />
                <h1 className="text-xl font-bold text-[#222834] text-center">Set a new password</h1>
                <p className="text-sm text-[#67728a] text-center mt-1">
                    Hi {user?.name || ''}, please set a new password before continuing.
                </p>

                {error && (
                    <Alert variant="destructive" className="mt-4">
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                <form onSubmit={handleSubmit} className="space-y-4 mt-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="currentPassword">Temporary / current password</Label>
                        <Input id="currentPassword" type="password" value={currentPassword} required onChange={e => setCurrentPassword(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="newPassword">New password</Label>
                        <Input id="newPassword" type="password" value={newPassword} required minLength={8} onChange={e => setNewPassword(e.target.value)} />
                    </div>
                    <div className="space-y-1.5">
                        <Label htmlFor="confirmPassword">Confirm new password</Label>
                        <Input id="confirmPassword" type="password" value={confirmPassword} required minLength={8} onChange={e => setConfirmPassword(e.target.value)} />
                    </div>

                    <Button type="submit" disabled={submitting} className="w-full">
                        {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Saving...</> : 'Set new password'}
                    </Button>

                    <button type="button" onClick={logout} className="w-full text-center text-xs text-[#9aa2b5] hover:underline">
                        Sign out instead
                    </button>
                </form>
            </div>
        </div>
    );
}
