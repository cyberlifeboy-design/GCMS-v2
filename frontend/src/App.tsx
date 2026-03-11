import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { useAuthStore } from '@/stores/authStore';

const LoginPage = lazy(() => import('@/pages/LoginPage').then(m => ({ default: m.LoginPage })));
const ForgotPasswordPage = lazy(() => import('@/pages/ForgotPasswordPage').then(m => ({ default: m.ForgotPasswordPage })));
const ResetPasswordPage = lazy(() => import('@/pages/ResetPasswordPage').then(m => ({ default: m.ResetPasswordPage })));
const DashboardPage = lazy(() => import('@/pages/DashboardPage').then(m => ({ default: m.DashboardPage })));
const FleetPage = lazy(() => import('@/pages/FleetPage').then(m => ({ default: m.FleetPage })));
const HandoverPage = lazy(() => import('@/pages/HandoverPage').then(m => ({ default: m.HandoverPage })));
const MaintenancePage = lazy(() => import('@/pages/MaintenancePage').then(m => ({ default: m.MaintenancePage })));
const UsersPage = lazy(() => import('@/pages/UsersPage').then(m => ({ default: m.UsersPage })));
const ReportsPage = lazy(() => import('@/pages/ReportsPage').then(m => ({ default: m.ReportsPage })));
const SystemSettingsPage = lazy(() => import('@/pages/SystemSettingsPage').then(m => ({ default: m.SystemSettingsPage })));
const StadiumsPage = lazy(() => import('@/pages/StadiumsPage').then(m => ({ default: m.StadiumsPage })));
const DepartmentsPage = lazy(() => import('@/pages/DepartmentsPage').then(m => ({ default: m.DepartmentsPage })));
const FleetManagementPage = lazy(() => import('@/pages/FleetManagementPage').then(m => ({ default: m.FleetManagementPage })));

function HomeRedirect() {
    const { user } = useAuthStore();
    if (user?.role === 'FA') return <Navigate to="/handover" replace />;
    return <DashboardPage />;
}

function AppContent() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <Routes>
                <Route path="/login" element={<LoginPage />} />
                <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                <Route path="/reset-password" element={<ResetPasswordPage />} />
                <Route
                    path="/*"
                    element={
                        <ProtectedRoute>
                            <MainLayout>
                                <Routes>
                                    <Route path="/" element={<HomeRedirect />} />
                                    <Route path="/fleet" element={<FleetPage />} />
                                    <Route path="/handover" element={<HandoverPage />} />
                                    <Route path="/maintenance" element={<MaintenancePage />} />
                                    <Route path="/users" element={<UsersPage />} />
                                    <Route path="/stadiums" element={<StadiumsPage />} />
                                    <Route path="/departments" element={<DepartmentsPage />} />
                                    <Route path="/fleet-management" element={<FleetManagementPage />} />
                                    <Route path="/reports" element={<ReportsPage />} />
                                    <Route path="/settings" element={<SystemSettingsPage />} />
                                    <Route path="*" element={<Navigate to="/" replace />} />
                                </Routes>
                            </MainLayout>
                        </ProtectedRoute>
                    }
                />
            </Routes>
        </Suspense>
    );
}

export default function App() {
    return <AppContent />;
}
