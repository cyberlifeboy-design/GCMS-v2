import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { FleetPage } from '@/pages/FleetPage';
import { HandoverPage } from '@/pages/HandoverPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { UsersPage } from '@/pages/UsersPage';
import { ReportsPage } from '@/pages/ReportsPage';

function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            
            <Route path="/" element={<ProtectedRoute><MainLayout><DashboardPage /></MainLayout></ProtectedRoute>} />
            <Route path="/fleet" element={<ProtectedRoute><MainLayout><FleetPage /></MainLayout></ProtectedRoute>} />
            <Route path="/handover" element={<ProtectedRoute><MainLayout><HandoverPage /></MainLayout></ProtectedRoute>} />
            <Route path="/maintenance" element={<ProtectedRoute><MainLayout><MaintenancePage /></MainLayout></ProtectedRoute>} />
            <Route path="/users" element={<ProtectedRoute><MainLayout><UsersPage /></MainLayout></ProtectedRoute>} />
            <Route path="/reports" element={<ProtectedRoute><MainLayout><ReportsPage /></MainLayout></ProtectedRoute>} />
            
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
