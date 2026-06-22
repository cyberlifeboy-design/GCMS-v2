import { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute, PageGuard } from '@/components/auth/ProtectedRoute';
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
const SettingsPage = lazy(() => import('@/pages/SettingsPage').then(m => ({ default: m.SettingsPage })));
const StadiumsPage = lazy(() => import('@/pages/StadiumsPage').then(m => ({ default: m.StadiumsPage })));
const DepartmentsPage = lazy(() => import('@/pages/DepartmentsPage').then(m => ({ default: m.DepartmentsPage })));
const FleetManagementPage = lazy(() => import('@/pages/FleetManagementPage').then(m => ({ default: m.FleetManagementPage })));
const RequestsManagementPage = lazy(() => import('@/pages/RequestsManagementPage').then(m => ({ default: m.RequestsManagementPage })));
const PublicRequestPage = lazy(() => import('@/pages/PublicRequestPage').then(m => ({ default: m.PublicRequestPage })));
const NotificationCenterPage = lazy(() => import('@/pages/NotificationCenterPage').then(m => ({ default: m.NotificationCenterPage })));
const UsageHistoryPage = lazy(() => import('@/pages/UsageHistoryPage').then(m => ({ default: m.UsageHistoryPage })));
const MyReportsPage = lazy(() => import('@/pages/MyReportsPage').then(m => ({ default: m.MyReportsPage })));
const ProfilePage = lazy(() => import('@/pages/ProfilePage'));

function HomeRedirect() {
    const { user } = useAuthStore();
    if (user?.role === 'FA') return <DashboardPage />;
    return <DashboardPage />;
}

import { useEffect } from 'react';
import { useThemeStore } from '@/stores/themeStore';

function AppContent() {
    const { user } = useAuthStore();
    const { setTheme } = useThemeStore();

    useEffect(() => {
        if (user?.exportPreferences?.theme) {
            setTheme(user.exportPreferences.theme as any);
        }
    }, [user, setTheme]);

    return (
        <Suspense fallback={
            <div className="flex items-center justify-center h-screen">
                <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
        }>
            <Routes>
                {/* Public routes (no auth) */}
                <Route path="/request" element={<PublicRequestPage />} />
                <Route path="/request/confirm/:token" element={<PublicRequestPage />} />

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
                                    <Route path="/fleet" element={<PageGuard pageKey="fleet"><FleetPage /></PageGuard>} />
                                    <Route path="/handover" element={<PageGuard pageKey="handover"><HandoverPage /></PageGuard>} />
                                    <Route path="/maintenance" element={<PageGuard pageKey="maintenance"><MaintenancePage /></PageGuard>} />
                                    <Route path="/users" element={<PageGuard pageKey="users"><UsersPage /></PageGuard>} />
                                    <Route path="/stadiums" element={<PageGuard pageKey="stadiums"><StadiumsPage /></PageGuard>} />
                                    <Route path="/departments" element={<PageGuard pageKey="departments"><DepartmentsPage /></PageGuard>} />
                                    <Route path="/fleet-management" element={<PageGuard pageKey="fleet"><FleetManagementPage /></PageGuard>} />
                                    <Route path="/reports" element={<PageGuard pageKey="reports"><ReportsPage /></PageGuard>} />
                                    <Route path="/notifications" element={<PageGuard pageKey="notifications"><NotificationCenterPage /></PageGuard>} />
                                    <Route path="/settings" element={<PageGuard pageKey="settings"><SettingsPage /></PageGuard>} />
                                    <Route path="/requests" element={<PageGuard pageKey="requests"><RequestsManagementPage /></PageGuard>} />
                                    <Route path="/usage-history" element={<UsageHistoryPage />} />
                                    <Route path="/my-reports" element={<MyReportsPage />} />
                                    <Route path="/profile" element={<ProfilePage />} />
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
