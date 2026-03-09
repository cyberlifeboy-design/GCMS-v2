import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { authApi } from '@/lib/api';

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
    const { isAuthenticated, logout, user } = useAuthStore();
    const [verified, setVerified] = useState<boolean | null>(null);

    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (!token || !isAuthenticated || !user) {
            logout();
            setVerified(false);
            return;
        }

        // Verify token is still valid with the server
        authApi.me()
            .then(() => {
                setVerified(true);
            })
            .catch((err) => {
                console.error('Auth verification failed:', err);
                logout();
                setVerified(false);
            });
    }, [isAuthenticated, user, logout]);

    // Show nothing while checking (avoids flash of content)
    if (verified === null) return null;

    return verified ? <>{children}</> : <Navigate to="/login" replace />;
}
