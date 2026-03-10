import { useEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';
import { Loader2 } from 'lucide-react';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, logout, user } = useAuthStore();
    const [verified, setVerified] = useState<boolean | null>(null);
    const verifyingRef = useRef(false);

    useEffect(() => {
        // Prevent duplicate verification runs
        if (verifyingRef.current) return;

        const token = localStorage.getItem('accessToken');
        if (!token || !isAuthenticated || !user) {
            logout();
            setVerified(false);
            return;
        }

        verifyingRef.current = true;

        // Verify token is still valid with the server
        authApi.me()
            .then(() => {
                setVerified(true);
            })
            .catch((err) => {
                console.error('Auth verification failed:', err);
                logout();
                setVerified(false);
            })
            .finally(() => {
                verifyingRef.current = false;
            });
    }, []); // Empty deps - only run once on mount

    // Show loading spinner while checking auth
    if (verified === null) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return verified ? <>{children}</> : <Navigate to="/login" replace />;
}
