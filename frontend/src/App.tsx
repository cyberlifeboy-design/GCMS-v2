import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';

// Lazy load page components for code splitting
const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const FleetPage = lazy(() => import('@/pages/FleetPage').then(m => ({ default: m.FleetPage })));
const HandoverPage = lazy(() => import('@/pages/HandoverPage').then(m => ({ default: m.HandoverPage })));
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage').then(m => ({ default: m.MaintenancePage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then(m => ({ default: m.UsersPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));

// Loading fallback component
function PageLoader() {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-primary"></div>
                <p className="text-muted-foreground text-sm">Loading...</p>
            </div>
        </div>
    );
}

// Wrapper for lazy loaded components
function LazyPage({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<PageLoader />}>
            {children}
        </Suspense>
    );
}

function App() {
    return (
        <Routes>
            <Route path="/login" element={
                <LazyPage><LoginPage /></LazyPage>
            } />

            <Route path="/" element={
                <ProtectedRoute>
                    <MainLayout>
                        <LazyPage><DashboardPage /></LazyPage>
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/fleet" element={
                <ProtectedRoute>
                    <MainLayout>
                        <LazyPage><FleetPage /></LazyPage>
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/handover" element={
                <ProtectedRoute>
                    <MainLayout>
                        <LazyPage><HandoverPage /></LazyPage>
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/maintenance" element={
                <ProtectedRoute>
                    <MainLayout>
                        <LazyPage><MaintenancePage /></LazyPage>
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/users" element={
                <ProtectedRoute>
                    <MainLayout>
                        <LazyPage><UsersPage /></LazyPage>
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/reports" element={
                <ProtectedRoute>
                    <MainLayout>
                        <LazyPage><ReportsPage /></LazyPage>
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;