import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { ensureMsalInitialized, msalInstance } from '@/lib/msal';
import { useAuthStore } from '@/stores/authStore';

export function MicrosoftCallbackPage() {
    const navigate = useNavigate();
    const { loginWithMicrosoft } = useAuthStore();
    const [error, setError] = useState<string | null>(null);
    const ranRef = useRef(false);

    useEffect(() => {
        if (ranRef.current) return;
        ranRef.current = true;

        (async () => {
            try {
                await ensureMsalInitialized();
                const result = await msalInstance.handleRedirectPromise();
                if (!result?.idToken) {
                    setError('No sign-in result found. Please try signing in again.');
                    return;
                }

                const outcome = await loginWithMicrosoft(result.idToken);
                if (outcome.registered) {
                    const current = useAuthStore.getState().user;
                    navigate(current?.mustChangePassword ? '/force-change-password' : '/', { replace: true });
                } else {
                    navigate('/access-request', {
                        replace: true,
                        state: { email: outcome.email, name: outcome.name, source: 'sso' },
                    });
                }
            } catch (err) {
                console.error('Microsoft sign-in callback failed', err);
                setError('Sign-in failed, please try again.');
                toast.error('Sign-in failed, please try again.');
            }
        })();
    }, [loginWithMicrosoft, navigate]);

    return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[#f5f7fa]">
            {error ? (
                <>
                    <p className="text-sm text-[#67728a]">{error}</p>
                    <button
                        type="button"
                        onClick={() => navigate('/login', { replace: true })}
                        className="text-sm font-semibold text-[#143b66] hover:underline"
                    >
                        Back to sign in
                    </button>
                </>
            ) : (
                <>
                    <Loader2 className="w-8 h-8 animate-spin text-[#143b66]" />
                    <p className="text-sm text-[#67728a]">Completing sign-in…</p>
                </>
            )}
        </div>
    );
}
