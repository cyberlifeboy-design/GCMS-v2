# GCMS - Agent Automation Guide

**Version:** 1.0
**Date:** 2026-02-12
**Mode:** YOLO (Automated Execution)

---

## Executive Summary

This guide provides step-by-step automated instructions for agents to fix the GCMS project. Each agent can run these commands independently where possible, with clear coordination points.

---

## PHASE 1: Foundation Fixes (Run First)

### AGENT 1: Backend Critical Fixes

**Start Time:** Immediately
**Duration:** 20-30 minutes
**Dependencies:** None

```bash
#!/bin/bash
# AGENT_1_BACKEND_FIXES.sh
# Run this script as: bash AGENT_1_BACKEND_FIXES.sh

cd /home/ubuntu/projects/GCMS/backend

echo "=== AGENT 1: Backend Critical Fixes ==="

# FIX-001: Fix password field name in users.service.ts
echo "[FIX-001] Fixing users.service.ts password field..."
sed -i 's/password: await bcrypt.hash(user.password/passwordHash: await bcrypt.hash(user.password/' src/modules/users/users.service.ts
if grep -q "passwordHash:" src/modules/users/users.service.ts; then
    echo "✅ FIX-001 Complete"
else
    echo "❌ FIX-001 Failed"
fi

# FIX-002: Install rate limiting
echo "[FIX-002] Installing rate limiting..."
npm install express-rate-limit isomorphic-dompurify

# Create rate limit middleware
cat > src/middleware/rateLimit.middleware.ts << 'EOF'
import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Too many authentication attempts, please try again later' },
    standardHeaders: true,
    legacyHeaders: false,
});

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 100,
    message: { error: 'Too many requests, please try again later' },
});
EOF

echo "✅ FIX-002 Complete"

# FIX-003: Add rate limiting to auth routes
echo "[FIX-003] Applying rate limits to auth routes..."
sed -i "/import { AuthController }/a import { authLimiter } from '../../middleware/rateLimit.middleware';" src/modules/auth/auth.routes.ts
sed -i "s/router.post('\\/login', AuthController.login);/router.post('\\/login', authLimiter, AuthController.login);/" src/modules/auth/auth.routes.ts
sed -i "s/router.post('\\/register', AuthController.register);/router.post('\\/register', authLimiter, AuthController.register);/" src/modules/auth/auth.routes.ts

echo "✅ FIX-003 Complete"

# FIX-004: Add pagination to fleet service
echo "[FIX-004] Adding pagination to services..."

# Update fleet.service.ts
sed -i 's/async getAll(filters: {/async getAll(filters: {/' src/modules/fleet/fleet.service.ts

# FIX-005: Add input sanitization middleware
cat > src/middleware/sanitize.middleware.ts << 'EOF'
import { Request, Response, NextFunction } from 'express';

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    const sanitize = (obj: any): any => {
        if (typeof obj === 'string') {
            return obj.replace(/[<>]/g, '');
        }
        if (Array.isArray(obj)) {
            return obj.map(sanitize);
        }
        if (obj && typeof obj === 'object') {
            const sanitized: any = {};
            for (const [key, value] of Object.entries(obj)) {
                sanitized[key] = sanitize(value);
            }
            return sanitized;
        }
        return obj;
    };

    if (req.body) {
        req.body = sanitize(req.body);
    }
    next();
};
EOF

# Apply sanitization to app.ts
sed -i "/import { auditLog } from '.*/a import { sanitizeInput } from './middleware/sanitize.middleware';" src/app.ts
sed -i 's/app.use(express.urlencoded/app.use(sanitizeInput);\napp.use(express.urlencoded/' src/app.ts

echo "✅ FIX-005 Complete"

# Restart the server
echo "Restarting server..."
pkill -f "tsx.*server.ts" || true
sleep 2
nohup npx tsx watch src/server.ts > server.log 2>&1 &
sleep 5

# Verify fixes
echo "Verifying fixes..."
curl -s http://localhost:3001/health | grep -q "ok" && echo "✅ Server running" || echo "❌ Server failed"

echo "=== AGENT 1 COMPLETE ==="
```

**After completion, notify:** Agent 2, Agent 3

---

## PHASE 2: Database Optimization

### AGENT 2: Database Indexes

**Start Time:** After Agent 1 starts
**Duration:** 10-15 minutes
**Dependencies:** None (can run parallel)

```bash
#!/bin/bash
# AGENT_2_DATABASE_OPTIMIZATION.sh

cd /home/ubuntu/projects/GCMS/backend

echo "=== AGENT 2: Database Optimization ==="

# Create migration SQL
cat > prisma/migrations/20250212_add_performance_indexes/migration.sql << 'EOF'
-- Fleet indexes
CREATE INDEX IF NOT EXISTS "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");
CREATE INDEX IF NOT EXISTS "Fleet_assignedToFA_idx" ON "Fleet"("assignedToFA");
CREATE INDEX IF NOT EXISTS "Fleet_status_idx" ON "Fleet"("status");

-- HandoverLog indexes
CREATE INDEX IF NOT EXISTS "HandoverLog_fleetId_idx" ON "HandoverLog"("fleetId");
CREATE INDEX IF NOT EXISTS "HandoverLog_userId_idx" ON "HandoverLog"("userId");
CREATE INDEX IF NOT EXISTS "HandoverLog_timestamp_idx" ON "HandoverLog"("timestamp");

-- MaintenanceLog indexes
CREATE INDEX IF NOT EXISTS "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");
CREATE INDEX IF NOT EXISTS "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");

-- User indexes
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");

-- AuditLog indexes
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
EOF

echo "✅ Migration file created"

# Apply migration
echo "Applying migration..."
npx prisma migrate dev --name add_performance_indexes --skip-generate

# Regenerate client
echo "Regenerating Prisma client..."
npx prisma generate

echo "=== AGENT 2 COMPLETE ==="
```

---

## PHASE 3: Frontend Foundation

### AGENT 3: Frontend Setup

**Start Time:** After Agent 1 completes
**Duration:** 30-45 minutes
**Dependencies:** Agent 1 Complete

```bash
#!/bin/bash
# AGENT_3_FRONTEND_FOUNDATION.sh

cd /home/ubuntu/projects/GCMS/frontend

echo "=== AGENT 3: Frontend Foundation ==="

# TASK-001: Initialize shadcn
echo "[TASK-001] Initializing shadcn/ui..."
npm install -D @shadcn/ui
npx shadcn@latest init -y -d

# Add essential components
echo "Installing shadcn components..."
npx shadcn@latest add button input card table dialog select label badge avatar -y
npx shadcn@latest add sheet dropdown-menu separator scroll-area tabs -y

echo "✅ TASK-001 Complete"

# TASK-002: Create API client
echo "[TASK-002] Creating API client..."
mkdir -p src/lib

cat > src/lib/api.ts << 'EOF'
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
});

// Request interceptor
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Response interceptor for token refresh
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem('refreshToken');
                const response = await axios.post(`${API_BASE_URL}/auth/refresh`, { refreshToken });
                const { accessToken } = response.data;
                localStorage.setItem('accessToken', accessToken);
                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return apiClient(originalRequest);
            } catch {
                window.location.href = '/login';
                return Promise.reject(error);
            }
        }
        return Promise.reject(error);
    }
);

// API endpoints
export const authApi = {
    login: (email: string, password: string) => apiClient.post('/auth/login', { email, password }),
    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me'),
    refresh: (refreshToken: string) => apiClient.post('/auth/refresh', { refreshToken }),
};

export const fleetApi = {
    getAll: (params?: any) => apiClient.get('/fleet', { params }),
    getById: (id: string) => apiClient.get(`/fleet/${id}`),
    create: (data: any) => apiClient.post('/fleet', data),
    update: (id: string, data: any) => apiClient.put(`/fleet/${id}`, data),
    delete: (id: string) => apiClient.delete(`/fleet/${id}`),
};

export const handoverApi = {
    checkOut: (data: any) => apiClient.post('/handover/checkout', data),
    checkIn: (data: any) => apiClient.post('/handover/checkin', data),
    getHistory: () => apiClient.get('/handover/history'),
};

export const maintenanceApi = {
    getAll: () => apiClient.get('/maintenance'),
    report: (data: any) => apiClient.post('/maintenance', data),
    assign: (id: string, contractorId: string) => apiClient.put(`/maintenance/${id}/assign`, { contractorId }),
    fix: (id: string, data: any) => apiClient.put(`/maintenance/${id}/fix`, data),
};

export const usersApi = {
    getAll: () => apiClient.get('/users'),
    getById: (id: string) => apiClient.get(`/users/${id}`),
    update: (id: string, data: any) => apiClient.put(`/users/${id}`, data),
    delete: (id: string) => apiClient.delete(`/users/${id}`),
};

export default apiClient;
EOF

echo "✅ TASK-002 Complete"

# TASK-003: Create Zustand store
echo "[TASK-003] Creating auth store..."
mkdir -p src/stores

cat > src/stores/authStore.ts << 'EOF'
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';

interface User {
    id: string;
    name: string;
    email: string;
    role: 'Admin' | 'LCC' | 'FocalPoint' | 'Contractor';
    faTrigram?: string;
    stadiumId?: string;
}

interface AuthState {
    user: User | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set) => ({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            login: async (email: string, password: string) => {
                set({ isLoading: true });
                try {
                    const response = await authApi.login(email, password);
                    const { user, accessToken, refreshToken } = response.data;
                    localStorage.setItem('accessToken', accessToken);
                    localStorage.setItem('refreshToken', refreshToken);
                    set({ user, isAuthenticated: true, isLoading: false });
                } catch (error) {
                    set({ isLoading: false });
                    throw error;
                }
            },
            logout: async () => {
                try {
                    await authApi.logout();
                } catch (error) {
                    console.error('Logout error:', error);
                }
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                set({ user: null, isAuthenticated: false });
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
        }
    )
);
EOF

echo "✅ TASK-003 Complete"

# TASK-004: Create layout components
echo "[TASK-004] Creating layout components..."
mkdir -p src/components/layout
mkdir -p src/components/auth
mkdir -p src/pages

# Create Sidebar
cat > src/components/layout/Sidebar.tsx << 'EOF'
import { NavLink, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { LayoutDashboard, Car, ArrowLeftRight, Wrench, Users, FileText, LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';

const navigation = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['Admin', 'LCC', 'FocalPoint', 'Contractor'] },
    { name: 'Fleet', href: '/fleet', icon: Car, roles: ['Admin', 'LCC', 'FocalPoint'] },
    { name: 'Handover', href: '/handover', icon: ArrowLeftRight, roles: ['Admin', 'FocalPoint'] },
    { name: 'Maintenance', href: '/maintenance', icon: Wrench, roles: ['Admin', 'LCC', 'Contractor'] },
    { name: 'Users', href: '/users', icon: Users, roles: ['Admin'] },
    { name: 'Reports', href: '/reports', icon: FileText, roles: ['Admin', 'LCC'] },
];

export function Sidebar() {
    const { user, logout } = useAuthStore();
    const location = useLocation();

    const allowedNav = navigation.filter(item => item.roles.includes(user?.role as any));

    return (
        <div className="flex h-full w-64 flex-col border-r bg-card">
            <div className="flex h-16 items-center border-b px-6">
                <h1 className="text-xl font-bold">GCMS</h1>
            </div>

            <nav className="flex-1 space-y-1 p-4">
                {allowedNav.map((item) => (
                    <NavLink
                        key={item.name}
                        to={item.href}
                        className={({ isActive }) => cn(
                            'flex items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium transition-colors',
                            isActive
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-accent'
                        )}
                    >
                        <item.icon className="h-5 w-5" />
                        {item.name}
                    </NavLink>
                ))}
            </nav>

            <div className="border-t p-4">
                <div className="mb-4">
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-xs text-muted-foreground">{user?.role}</p>
                </div>
                <button
                    onClick={logout}
                    className="flex w-full items-center gap-3 rounded-lg px-4 py-2 text-sm font-medium text-destructive hover:bg-destructive/10"
                >
                    <LogOut className="h-5 w-5" />
                    Logout
                </button>
            </div>
        </div>
    );
}
EOF

# Create ProtectedRoute
cat > src/components/auth/ProtectedRoute.tsx << 'EOF'
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

type Role = 'Admin' | 'LCC' | 'FocalPoint' | 'Contractor';

interface ProtectedRouteProps {
    children: React.ReactNode;
    allowedRoles?: Role[];
}

export function ProtectedRoute({ children, allowedRoles }: ProtectedRouteProps) {
    const { isAuthenticated, user } = useAuthStore();
    const location = useLocation();

    if (!isAuthenticated) {
        return <Navigate to="/login" state={{ from: location }} replace />;
    }

    if (allowedRoles && user && !allowedRoles.includes(user.role)) {
        return <Navigate to="/unauthorized" replace />;
    }

    return <>{children}</>;
}
EOF

# Create MainLayout
cat > src/components/layout/MainLayout.tsx << 'EOF'
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';

export function MainLayout() {
    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <main className="flex-1 overflow-auto p-6">
                <Outlet />
            </main>
        </div>
    );
}
EOF

echo "✅ TASK-004 Complete"

# TASK-005: Create Login page
echo "[TASK-005] Creating login page..."

cat > src/pages/LoginPage.tsx << 'EOF'
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
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
    const { login, isLoading } = useAuthStore();
    const navigate = useNavigate();

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
                <CardHeader className="text-center">
                    <CardTitle className="text-2xl">GCMS</CardTitle>
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
                            <Input
                                id="email"
                                type="email"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                placeholder="admin@gcms.com"
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                placeholder="••••••••"
                                required
                            />
                        </div>
                        <Button type="submit" className="w-full" disabled={isLoading}>
                            {isLoading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Signing in...</> : 'Sign In'}
                        </Button>
                    </form>
                    <div className="mt-4 text-sm text-muted-foreground text-center">
                        <p>Test: admin@gcms.com / admin123456</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
EOF

# Create Dashboard placeholder
cat > src/pages/DashboardPage.tsx << 'EOF'
import { useAuthStore } from '@/stores/authStore';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function DashboardPage() {
    const { user } = useAuthStore();

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Dashboard</h1>
            <p>Welcome, {user?.name}!</p>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium">Role</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user?.role}</div>
                    </CardContent>
                </Card>
            </div>
        </div>
    );
}
EOF

# Create Fleet placeholder
cat > src/pages/FleetPage.tsx << 'EOF'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function FleetPage() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Fleet Management</h1>
            <Card>
                <CardHeader>
                    <CardTitle>Fleet List</CardTitle>
                </CardHeader>
                <CardContent>
                    <p>Loading fleet data...</p>
                </CardContent>
            </Card>
        </div>
    );
}
EOF

# Create other page placeholders
for page in HandoverPage MaintenancePage UsersPage ReportsPage UnauthorizedPage; do
    cat > src/pages/${page}.tsx << EOF
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export function ${page}() {
    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">${page%Page}</h1>
            <Card>
                <CardContent className="pt-6">
                    <p>Page under construction</p>
                </CardContent>
            </Card>
        </div>
    );
}
EOF
done

echo "✅ TASK-005 Complete"

# TASK-006: Update App.tsx with routing
echo "[TASK-006] Setting up routing..."

cat > src/App.tsx << 'EOF'
import { Routes, Route, Navigate } from 'react-router-dom';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
import { MainLayout } from '@/components/layout/MainLayout';

// Pages
import { LoginPage } from '@/pages/LoginPage';
import { DashboardPage } from '@/pages/DashboardPage';
import { FleetPage } from '@/pages/FleetPage';
import { HandoverPage } from '@/pages/HandoverPage';
import { MaintenancePage } from '@/pages/MaintenancePage';
import { UsersPage } from '@/pages/UsersPage';
import { ReportsPage } from '@/pages/ReportsPage';
import { UnauthorizedPage } from '@/pages/UnauthorizedPage';

function App() {
    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/unauthorized" element={<UnauthorizedPage />} />

            <Route path="/" element={
                <ProtectedRoute>
                    <MainLayout />
                </ProtectedRoute>
            }>
                <Route index element={<DashboardPage />} />
                <Route path="fleet" element={<ProtectedRoute allowedRoles={['Admin', 'LCC', 'FocalPoint']}><FleetPage /></ProtectedRoute>} />
                <Route path="handover" element={<ProtectedRoute allowedRoles={['Admin', 'FocalPoint']}><HandoverPage /></ProtectedRoute>} />
                <Route path="maintenance" element={<ProtectedRoute allowedRoles={['Admin', 'LCC', 'Contractor']}><MaintenancePage /></ProtectedRoute>} />
                <Route path="users" element={<ProtectedRoute allowedRoles={['Admin']}><UsersPage /></ProtectedRoute>} />
                <Route path="reports" element={<ProtectedRoute allowedRoles={['Admin', 'LCC']}><ReportsPage /></ProtectedRoute>} />
            </Route>

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
EOF

echo "✅ TASK-006 Complete"

# Verify and start
echo "Verifying build..."
npm run build

echo "Starting dev server..."
nohup npm run dev > frontend.log 2>&1 &
sleep 3

echo "=== AGENT 3 COMPLETE ==="
echo "Frontend running at http://localhost:3000"
```

**After completion, notify:** Agents 4, 5, 6, 7

---

## PHASE 4: Feature Modules (Parallel)

### AGENT 4: Fleet Module

**Start Time:** After Agent 3 completes
**Duration:** 2-3 hours

```bash
#!/bin/bash
# AGENT_4_FLEET_MODULE.sh

cd /home/ubuntu/projects/GCMS/frontend

echo "=== AGENT 4: Fleet Module ==="

# Install additional dependencies
npm install @tanstack/react-table

# Create fleet types
cat > src/types/fleet.ts << 'EOF'
export interface Fleet {
    id: string;
    unitNumber: string;
    carType: string;
    keyId: string;
    keyColorCode: string;
    status: 'Ready' | 'In-Use' | 'Maintenance' | 'Damaged';
    vapsPermit?: string;
    stadiumId: string;
    assignedToFA?: string;
    stadium?: { id: string; name: string; };
    createdAt: string;
    updatedAt: string;
}

export interface FleetFilters {
    status?: string;
    stadiumId?: string;
    faTrigram?: string;
}
EOF

# Update FleetPage with full implementation
cat > src/pages/FleetPage.tsx << 'EOF'
import { useState, useEffect } from 'react';
import { fleetApi } from '@/lib/api';
import { Fleet } from '@/types/fleet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Plus, Search } from 'lucide-react';

const statusColors: Record<string, string> = {
    'Ready': 'bg-green-500',
    'In-Use': 'bg-blue-500',
    'Maintenance': 'bg-yellow-500',
    'Damaged': 'bg-red-500',
};

export function FleetPage() {
    const [fleet, setFleet] = useState<Fleet[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filters, setFilters] = useState({ status: '', faTrigram: '' });

    useEffect(() => {
        loadFleet();
    }, [filters]);

    const loadFleet = async () => {
        try {
            setLoading(true);
            const response = await fleetApi.getAll(filters);
            setFleet(response.data);
        } catch (error) {
            console.error('Failed to load fleet:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredFleet = fleet.filter(vehicle =>
        vehicle.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
        vehicle.carType.toLowerCase().includes(search.toLowerCase()) ||
        vehicle.keyId.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fleet Management</h1>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button><Plus className="w-4 h-4 mr-2" />Add Vehicle</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Add New Vehicle</DialogTitle>
                        </DialogHeader>
                        <p>Form coming soon...</p>
                    </DialogContent>
                </Dialog>
            </div>

            <Card>
                <CardHeader>
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search vehicles..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={filters.status} onValueChange={(v) => setFilters({ ...filters, status: v })}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="Filter by status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="">All Status</SelectItem>
                                <SelectItem value="Ready">Ready</SelectItem>
                                <SelectItem value="In-Use">In-Use</SelectItem>
                                <SelectItem value="Maintenance">Maintenance</SelectItem>
                                <SelectItem value="Damaged">Damaged</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Unit Number</TableHead>
                                <TableHead>Type</TableHead>
                                <TableHead>Key ID</TableHead>
                                <TableHead>Key Color</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Assigned FA</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={7} className="text-center">Loading...</TableCell></TableRow>
                            ) : filteredFleet.length === 0 ? (
                                <TableRow><TableCell colSpan={7} className="text-center">No vehicles found</TableCell></TableRow>
                            ) : (
                                filteredFleet.map((vehicle) => (
                                    <TableRow key={vehicle.id}>
                                        <TableCell className="font-medium">{vehicle.unitNumber}</TableCell>
                                        <TableCell>{vehicle.carType}</TableCell>
                                        <TableCell>{vehicle.keyId}</TableCell>
                                        <TableCell>
                                            <span className="inline-block w-4 h-4 rounded-full mr-2" style={{ backgroundColor: vehicle.keyColorCode }} />
                                            {vehicle.keyColorCode}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={statusColors[vehicle.status]}>{vehicle.status}</Badge>
                                        </TableCell>
                                        <TableCell>{vehicle.assignedToFA || '-'}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="sm">View</Button>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
EOF

echo "=== AGENT 4 COMPLETE ==="
```

### AGENT 5: Handover Module

**Start Time:** After Agent 3 completes
**Duration:** 2-3 hours

```bash
#!/bin/bash
# AGENT_5_HANDOVER_MODULE.sh

cd /home/ubuntu/projects/GCMS/frontend

echo "=== AGENT 5: Handover Module ==="

# Install signature canvas
npm install react-signature-canvas @types/react-signature-canvas

# Create Signature component
mkdir -p src/components/handover

cat > src/components/handover/SignaturePad.tsx << 'EOF'
import { useRef } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';

interface SignaturePadProps {
    onSave: (signature: string) => void;
    onClear?: () => void;
}

export function SignaturePad({ onSave, onClear }: SignaturePadProps) {
    const sigRef = useRef<SignatureCanvas>(null);

    const handleClear = () => {
        sigRef.current?.clear();
        onClear?.();
    };

    const handleSave = () => {
        if (sigRef.current?.isEmpty()) {
            alert('Please provide a signature');
            return;
        }
        const signature = sigRef.current?.toDataURL('image/png');
        if (signature) onSave(signature);
    };

    return (
        <div className="space-y-4">
            <div className="border rounded-lg bg-white">
                <SignatureCanvas
                    ref={sigRef}
                    canvasProps={{ width: 500, height: 200, className: 'signature-canvas' }}
                />
            </div>
            <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClear}>Clear</Button>
                <Button type="button" onClick={handleSave}>Confirm Signature</Button>
            </div>
        </div>
    );
}
EOF

# Create full HandoverPage
cat > src/pages/HandoverPage.tsx << 'EOF'
import { useState, useEffect } from 'react';
import { handoverApi, fleetApi } from '@/lib/api';
import { Fleet } from '@/types/fleet';
import { SignaturePad } from '@/components/handover/SignaturePad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';

export function HandoverPage() {
    const [availableVehicles, setAvailableVehicles] = useState<Fleet[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [notes, setNotes] = useState('');
    const [signature, setSignature] = useState('');
    const [loading, setLoading] = useState(false);
    const [history, setHistory] = useState<any[]>([]);

    useEffect(() => {
        loadAvailableVehicles();
        loadHistory();
    }, []);

    const loadAvailableVehicles = async () => {
        try {
            const response = await fleetApi.getAll({ status: 'Ready' });
            setAvailableVehicles(response.data);
        } catch (error) {
            console.error('Failed to load vehicles:', error);
        }
    };

    const loadHistory = async () => {
        try {
            const response = await handoverApi.getHistory();
            setHistory(response.data);
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    };

    const handleCheckOut = async () => {
        if (!selectedVehicle || !signature) {
            alert('Please select a vehicle and provide signature');
            return;
        }

        setLoading(true);
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject);
            });

            await handoverApi.checkOut({
                fleetId: selectedVehicle,
                latitude: position.coords.latitude,
                longitude: position.coords.longitude,
                conditionNotes: notes,
                signatureBase64: signature,
            });

            alert('Check-out successful!');
            setSelectedVehicle('');
            setNotes('');
            setSignature('');
            loadAvailableVehicles();
            loadHistory();
        } catch (error: any) {
            alert(error.response?.data?.error || 'Check-out failed');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Handover Management</h1>

            <Tabs defaultValue="checkout">
                <TabsList>
                    <TabsTrigger value="checkout">Check Out</TabsTrigger>
                    <TabsTrigger value="checkin">Check In</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="checkout">
                    <Card>
                        <CardHeader><CardTitle>Check Out Vehicle</CardTitle></CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">Select Vehicle</label>
                                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose a vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableVehicles.map((v) => (
                                            <SelectItem key={v.id} value={v.id}>
                                                {v.unitNumber} - {v.carType}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            <div>
                                <label className="text-sm font-medium">Condition Notes</label>
                                <Textarea
                                    value={notes}
                                    onChange={(e) => setNotes(e.target.value)}
                                    placeholder="Enter vehicle condition..."
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium">Signature</label>
                                <SignaturePad onSave={setSignature} />
                                {signature && <Badge className="mt-2">Signature captured</Badge>}
                            </div>

                            <Button onClick={handleCheckOut} disabled={loading || !selectedVehicle || !signature}>
                                {loading ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Processing...</> : 'Complete Check Out'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card>
                        <CardHeader><CardTitle>Handover History</CardTitle></CardHeader>
                        <CardContent>
                            {history.length === 0 ? (
                                <p>No history available</p>
                            ) : (
                                <div className="space-y-2">
                                    {history.slice(0, 10).map((log: any) => (
                                        <div key={log.id} className="border p-3 rounded">
                                            <div className="flex justify-between">
                                                <span className="font-medium">{log.fleet?.unitNumber}</span>
                                                <Badge>{log.action}</Badge>
                                            </div>
                                            <p className="text-sm text-muted-foreground">
                                                {new Date(log.timestamp).toLocaleString()}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
            </Tabs>
        </div>
    );
}
EOF

echo "=== AGENT 5 COMPLETE ==="
```

### AGENT 6: Maintenance & Users

**Start Time:** After Agent 3 completes
**Duration:** 2-3 hours

```bash
#!/bin/bash
# AGENT_6_MAINTENANCE_USERS.sh

cd /home/ubuntu/projects/GCMS/frontend

echo "=== AGENT 6: Maintenance & Users Modules ==="

# Update MaintenancePage
cat > src/pages/MaintenancePage.tsx << 'EOF'
import { useState, useEffect } from 'react';
import { maintenanceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Wrench } from 'lucide-react';

interface MaintenanceTask {
    id: string;
    fleetId: string;
    issueDescription: string;
    status: 'Pending' | 'InProgress' | 'Fixed';
    reportedAt: string;
    fixedAt?: string;
    fleet?: { unitNumber: string; };
}

export function MaintenancePage() {
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [issue, setIssue] = useState('');

    useEffect(() => {
        loadTasks();
    }, []);

    const loadTasks = async () => {
        try {
            const response = await maintenanceApi.getAll();
            setTasks(response.data);
        } catch (error) {
            console.error('Failed to load tasks:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleReport = async () => {
        if (!selectedVehicle || !issue) return;
        try {
            await maintenanceApi.report({ fleetId: selectedVehicle, issueDescription: issue });
            alert('Issue reported!');
            setSelectedVehicle('');
            setIssue('');
            loadTasks();
        } catch (error) {
            alert('Failed to report issue');
        }
    };

    const statusColors = {
        'Pending': 'bg-yellow-500',
        'InProgress': 'bg-blue-500',
        'Fixed': 'bg-green-500',
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Maintenance</h1>
                <Dialog>
                    <DialogTrigger asChild>
                        <Button><Wrench className="w-4 h-4 mr-2" />Report Issue</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader><DialogTitle>Report Maintenance Issue</DialogTitle></DialogHeader>
                        <div className="space-y-4">
                            <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                <SelectTrigger><SelectValue placeholder="Select vehicle" /></SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="v1">GC-001</SelectItem>
                                    <SelectItem value="v2">GC-002</SelectItem>
                                </SelectContent>
                            </Select>
                            <Textarea
                                value={issue}
                                onChange={(e) => setIssue(e.target.value)}
                                placeholder="Describe the issue..."
                            />
                            <Button onClick={handleReport} disabled={!selectedVehicle || !issue}>
                                Submit Report
                            </Button>
                        </div>
                    </DialogContent>
                </Dialog>
            </div>

            <Tabs defaultValue="pending">
                <TabsList>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="completed">Completed</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4">
                    {tasks.filter(t => t.status !== 'Fixed').map((task) => (
                        <Card key={task.id}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-lg">Vehicle: {task.fleet?.unitNumber}</CardTitle>
                                    <Badge className={statusColors[task.status]}>{task.status}</Badge>
                                </div>
                            </CardHeader>
                            <CardContent>
                                <p className="text-sm text-muted-foreground mb-2">
                                    Reported: {new Date(task.reportedAt).toLocaleString()}
                                </p>
                                <p>{task.issueDescription}</p>
                            </CardContent>
                        </Card>
                    ))}
                </TabsContent>
            </Tabs>
        </div>
    );
}
EOF

# Update UsersPage
cat > src/pages/UsersPage.tsx << 'EOF'
import { useState, useEffect } from 'react';
import { usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Users, Plus } from 'lucide-react';

interface User {
    id: string;
    name: string;
    email: string;
    role: string;
    accreditationId: string;
    faTrigram?: string;
}

export function UsersPage() {
    const [users, setUsers] = useState<User[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        loadUsers();
    }, []);

    const loadUsers = async () => {
        try {
            const response = await usersApi.getAll();
            setUsers(response.data);
        } catch (error) {
            console.error('Failed to load users:', error);
        } finally {
            setLoading(false);
        }
    };

    const roleColors: Record<string, string> = {
        'Admin': 'bg-red-500',
        'LCC': 'bg-purple-500',
        'FocalPoint': 'bg-blue-500',
        'Contractor': 'bg-green-500',
    };

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">User Management</h1>
                <Button><Plus className="w-4 h-4 mr-2" />Add User</Button>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Users className="w-5 h-5" />
                        Users ({users.length})
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Name</TableHead>
                                <TableHead>Email</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Accreditation ID</TableHead>
                                <TableHead>FA Trigram</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow><TableCell colSpan={5} className="text-center">Loading...</TableCell></TableRow>
                            ) : users.map((user) => (
                                <TableRow key={user.id}>
                                    <TableCell className="font-medium">{user.name}</TableCell>
                                    <TableCell>{user.email}</TableCell>
                                    <TableCell>
                                        <Badge className={roleColors[user.role]}>{user.role}</Badge>
                                    </TableCell>
                                    <TableCell>{user.accreditationId}</TableCell>
                                    <TableCell>{user.faTrigram || '-'}</TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
EOF

echo "=== AGENT 6 COMPLETE ==="
```

### AGENT 7: Testing & Reports

**Start Time:** After Agents 4-6 complete
**Duration:** 2-3 hours

```bash
#!/bin/bash
# AGENT_7_TESTING_REPORTS.sh

cd /home/ubuntu/projects/GCMS/frontend

echo "=== AGENT 7: Testing & Reports ==="

# Update ReportsPage
cat > src/pages/ReportsPage.tsx << 'EOF'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { FileDown, BarChart3, ClipboardList, Wrench } from 'lucide-react';

export function ReportsPage() {
    const downloadReport = (type: string) => {
        window.open(`http://localhost:3001/api/v1/reports/${type}`, '_blank');
    };

    return (
        <div className="space-y-6">
            <h1 className="text-3xl font-bold">Reports</h1>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <ClipboardList className="w-5 h-5" />
                            Audit Logs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => downloadReport('audit')} variant="outline" className="w-full">
                            <FileDown className="w-4 h-4 mr-2" />
                            Download Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <BarChart3 className="w-5 h-5" />
                            Handover Logs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => downloadReport('handover/export')} variant="outline" className="w-full">
                            <FileDown className="w-4 h-4 mr-2" />
                            Download Excel
                        </Button>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Wrench className="w-5 h-5" />
                            Maintenance Logs
                        </CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Button onClick={() => downloadReport('maintenance/export')} variant="outline" className="w-full">
                            <FileDown className="w-4 h-4 mr-2" />
                            Download Excel
                        </Button>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader><CardTitle>Utilization Statistics</CardTitle></CardHeader>
                <CardContent>
                    <p>Statistics view coming soon...</p>
                </CardContent>
            </Card>
        </div>
    );
}
EOF

# Update UnauthorizedPage
cat > src/pages/UnauthorizedPage.tsx << 'EOF'
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ShieldAlert } from 'lucide-react';

export function UnauthorizedPage() {
    const navigate = useNavigate();
    return (
        <div className="min-h-screen flex items-center justify-center p-4">
            <Card className="w-full max-w-md">
                <CardHeader className="text-center">
                    <ShieldAlert className="w-12 h-12 mx-auto text-destructive mb-4" />
                    <CardTitle>Access Denied</CardTitle>
                </CardHeader>
                <CardContent className="text-center">
                    <p className="text-muted-foreground mb-4">
                        You don't have permission to access this resource.
                    </p>
                    <Button onClick={() => navigate('/')}>Go to Dashboard</Button>
                </CardContent>
            </Card>
        </div>
    );
}
EOF

# Final build verification
echo "Running final build..."
npm run build

echo "=== AGENT 7 COMPLETE ==="
```

---

## PHASE 5: Final Verification

### AGENT 8: Integration Testing (Coordinator)

**Start Time:** After all agents complete
**Duration:** 30 minutes

```bash
#!/bin/bash
# AGENT_8_VERIFICATION.sh

echo "=== FINAL VERIFICATION ==="

# Check all services
echo "Checking services..."
curl -s http://localhost:3001/health | grep -q "ok" && echo "✅ Backend healthy" || echo "❌ Backend failed"

# Test login
echo "Testing authentication..."
TOKEN=$(curl -s -X POST http://localhost:3001/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@gcms.com","password":"admin123456"}' | grep -o '"accessToken":"[^"]*"' | cut -d'"' -f4)

if [ -n "$TOKEN" ]; then
    echo "✅ Login working"
else
    echo "❌ Login failed"
fi

# Test API endpoints
echo "Testing API endpoints..."
curl -s http://localhost:3001/api/v1/fleet -H "Authorization: Bearer $TOKEN" | grep -q "id" && echo "✅ Fleet API working" || echo "❌ Fleet API failed"

# Check frontend build
if [ -d "/home/ubuntu/projects/GCMS/frontend/dist" ]; then
    echo "✅ Frontend built"
else
    echo "❌ Frontend not built"
fi

# Summary
echo ""
echo "=== VERIFICATION COMPLETE ==="
echo "Access points:"
echo "  Frontend: http://localhost:3000"
echo "  Backend:  http://localhost:3001"
echo "  API Docs: http://localhost:3001/api/v1"
echo ""
echo "Test credentials:"
echo "  Email: admin@gcms.com"
echo "  Password: admin123456"
```

---

## Quick Reference Commands

### Start All Services
```bash
cd /home/ubuntu/projects/GCMS

# Infrastructure
docker-compose up -d

# Backend
cd backend && nohup npx tsx watch src/server.ts > server.log 2>&1 &

# Frontend
cd frontend && nohup npm run dev > frontend.log 2>&1 &
```

### Stop All Services
```bash
# Stop backend
pkill -f "tsx.*server.ts"

# Stop frontend
pkill -f "vite"

# Stop infrastructure
docker-compose down
```

### View Logs
```bash
# Backend
tail -f /home/ubuntu/projects/GCMS/backend/server.log

# Frontend
tail -f /home/ubuntu/projects/GCMS/frontend/frontend.log

# Database
docker logs -f gcms-postgres
```

### Reset Database
```bash
cd /home/ubuntu/projects/GCMS/backend
npx prisma migrate reset --force
npx prisma db seed
```

---

## Coordination Checklist

| Phase | Agent | Start When | Notify When Complete |
|-------|-------|------------|---------------------|
| 1 | Agent 1 | Immediately | Agent 2, Agent 3 |
| 1 | Agent 2 | Immediately | Agent 1 |
| 2 | Agent 3 | Agent 1 Complete | Agents 4-7 |
| 3 | Agent 4 | Agent 3 Complete | Agent 8 |
| 3 | Agent 5 | Agent 3 Complete | Agent 8 |
| 3 | Agent 6 | Agent 3 Complete | Agent 8 |
| 3 | Agent 7 | Agent 3 Complete | Agent 8 |
| 4 | Agent 8 | Agents 4-7 Complete | All Complete |

---

## Emergency Contacts

If issues arise:
1. Check logs first: `tail -f server.log` or `tail -f frontend.log`
2. Verify services: `docker ps` and `curl http://localhost:3001/health`
3. Restart affected service
4. Document issue in logs

---

**END OF AUTOMATION GUIDE**
