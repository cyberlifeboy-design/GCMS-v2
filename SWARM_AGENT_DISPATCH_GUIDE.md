# GCMS Swarm Agent Dispatch Guide

**Version:** 1.0
**Date:** 2026-02-12
**Project:** Golf Car Management System

---

## Quick Start for Agents

### Prerequisites for All Agents

```bash
# 1. Verify working directory
cd /home/ubuntu/projects/GCMS

# 2. Check services are running
docker ps
# Should see: gcms-postgres, gcms-minio

# 3. Test backend is running
curl http://localhost:3001/health

# 4. Verify frontend placeholder loads
# Open http://localhost:3000 (or check via curl)
```

---

## AGENT 1: Backend Critical Fixes

**Priority:** P0 (Blocker)
**Estimated Time:** 4-6 hours
**Dependencies:** None
**Blocks:** Agent 3 (Frontend)

### Tasks

#### FIX-001: Fix bulkCreate password field
**File:** `backend/src/modules/users/users.service.ts`
**Line:** 56

```typescript
// CURRENT (BROKEN):
password: await bcrypt.hash(user.password || 'welcome123', saltRounds),

// FIXED:
passwordHash: await bcrypt.hash(user.password || 'welcome123', saltRounds),
```

#### FIX-002: Add rate limiting
**Create:** `backend/src/middleware/rateLimit.middleware.ts`

```typescript
import rateLimit from 'express-rate-limit';

export const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5, // 5 attempts
    message: 'Too many authentication attempts, please try again later',
    standardHeaders: true,
    legacyHeaders: false,
});

export const apiLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute
});
```

**Apply to:** `backend/src/modules/auth/auth.routes.ts`
```typescript
import { authLimiter } from '../../middleware/rateLimit.middleware';

router.post('/login', authLimiter, AuthController.login);
router.post('/register', authLimiter, AuthController.register);
```

**Install:** `npm install express-rate-limit @types/express-rate-limit`

#### FIX-003: Add request timeout middleware
**Create:** `backend/src/middleware/timeout.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';

export const requestTimeout = (timeoutMs: number = 30000) => {
    return (req: Request, res: Response, next: NextFunction) => {
        req.setTimeout(timeoutMs, () => {
            res.status(408).json({ error: 'Request timeout' });
        });
        next();
    };
};
```

**Apply to:** `backend/src/app.ts` - Add before routes

#### FIX-004: Fix handover race condition
**File:** `backend/src/modules/handover/handover.service.ts`
**Lines:** 12-56

```typescript
// Add status verification inside transaction
async checkOut(data: {...}) {
    return this.prisma.$transaction(async (tx) => {
        // Lock the vehicle record
        const vehicle = await tx.fleet.findUnique({
            where: { id: data.fleetId },
        });

        if (!vehicle) throw new Error('Vehicle not found');
        if (vehicle.status !== 'Ready') {
            throw new Error(`Vehicle is not Ready (Current: ${vehicle.status})`);
        }

        // Rest of logic...
    }, {
        isolationLevel: 'Serializable', // Prevent race conditions
    });
}
```

#### FIX-005: Add pagination to all list endpoints
**Update:** All service files

```typescript
// Pattern to apply to all list methods
async getAll(filters: {...}, options: { page?: number; limit?: number } = {}) {
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
        this.prisma.fleet.findMany({
            where: {...},
            skip,
            take: limit,
            include: {...},
        }),
        this.prisma.fleet.count({ where: {...} }),
    ]);

    return {
        data,
        pagination: {
            total,
            page,
            limit,
            totalPages: Math.ceil(total / limit),
        },
    };
}
```

#### FIX-006: Add input sanitization
**Create:** `backend/src/middleware/sanitize.middleware.ts`

```typescript
import { Request, Response, NextFunction } from 'express';
import DOMPurify from 'isomorphic-dompurify';

export const sanitizeInput = (req: Request, res: Response, next: NextFunction) => {
    const sanitize = (obj: any): any => {
        if (typeof obj === 'string') {
            return DOMPurify.sanitize(obj);
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
```

**Install:** `npm install isomorphic-dompurify @types/dompurify`

#### FIX-007: Add Winston logger configuration
**Create:** `backend/src/config/logger.ts`

```typescript
import winston from 'winston';

export const logger = winston.createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            ),
        }),
        new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
        new winston.transports.File({ filename: 'logs/combined.log' }),
    ],
});
```

---

## AGENT 2: Database Optimization

**Priority:** P1
**Estimated Time:** 3-4 hours
**Dependencies:** None
**Blocks:** None (can run in parallel)

### Tasks

#### Create migration for indexes
**Create:** `backend/prisma/migrations/20250212_add_performance_indexes/migration.sql`

```sql
-- Indexes for Fleet table
CREATE INDEX IF NOT EXISTS "Fleet_stadiumId_idx" ON "Fleet"("stadiumId");
CREATE INDEX IF NOT EXISTS "Fleet_assignedToFA_idx" ON "Fleet"("assignedToFA");
CREATE INDEX IF NOT EXISTS "Fleet_status_idx" ON "Fleet"("status");
CREATE INDEX IF NOT EXISTS "Fleet_unitNumber_idx" ON "Fleet"("unitNumber");

-- Indexes for HandoverLog table
CREATE INDEX IF NOT EXISTS "HandoverLog_fleetId_idx" ON "HandoverLog"("fleetId");
CREATE INDEX IF NOT EXISTS "HandoverLog_userId_idx" ON "HandoverLog"("userId");
CREATE INDEX IF NOT EXISTS "HandoverLog_timestamp_idx" ON "HandoverLog"("timestamp");

-- Indexes for MaintenanceLog table
CREATE INDEX IF NOT EXISTS "MaintenanceLog_fleetId_idx" ON "MaintenanceLog"("fleetId");
CREATE INDEX IF NOT EXISTS "MaintenanceLog_reportedBy_idx" ON "MaintenanceLog"("reportedBy");
CREATE INDEX IF NOT EXISTS "MaintenanceLog_status_idx" ON "MaintenanceLog"("status");
CREATE INDEX IF NOT EXISTS "MaintenanceLog_reportedAt_idx" ON "MaintenanceLog"("reportedAt");

-- Indexes for User table
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_faTrigram_idx" ON "User"("faTrigram");

-- Indexes for AuditLog
CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_timestamp_idx" ON "AuditLog"("timestamp");
CREATE INDEX IF NOT EXISTS "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
```

#### Update schema with cascade deletes
**File:** `backend/prisma/schema.prisma`

```prisma
// Update relations to add cascade deletes
model Fleet {
    // ... existing fields
    handoverLogs    HandoverLog[]    @relation(onDelete: Cascade)
    maintenanceLogs MaintenanceLog[] @relation(onDelete: Cascade)
}

model User {
    // ... existing fields
    handoverLogs  HandoverLog[]  @relation(onDelete: Cascade)
    refreshTokens RefreshToken[] @relation(onDelete: Cascade)
}
```

#### Add soft delete fields
**File:** `backend/prisma/schema.prisma`

```prisma
// Add to all main models
model Fleet {
    // ... existing fields
    deletedAt DateTime?
}

model User {
    // ... existing fields
    deletedAt DateTime?
    isActive  Boolean  @default(true)
}

model HandoverLog {
    // ... existing fields
    deletedAt DateTime?
}

model MaintenanceLog {
    // ... existing fields
    deletedAt DateTime?
}
```

**Run migration:**
```bash
cd /home/ubuntu/projects/GCMS/backend
npx prisma migrate dev --name add_performance_indexes
npx prisma generate
```

---

## AGENT 3: Frontend Foundation

**Priority:** P0 (Blocker)
**Estimated Time:** 8-12 hours
**Dependencies:** Agent 1 (Backend fixes)
**Blocks:** Agents 4, 5, 6

### Tasks

#### TASK-001: Initialize shadcn/ui

```bash
cd /home/ubuntu/projects/GCMS/frontend

# Initialize shadcn
npx shadcn-ui@latest init --yes --template next --base-color slate

# Add required components
npx shadcn-ui@latest add button input card table dialog select label toast sheet badge avatar dropdown-menu separator scroll-area
```

#### TASK-002: Create API client
**Create:** `frontend/src/lib/api.ts`

```typescript
import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
    baseURL: API_BASE_URL,
    headers: {
        'Content-Type': 'application/json',
    },
    timeout: 30000,
});

// Request interceptor for JWT
apiClient.interceptors.request.use(
    (config) => {
        const token = localStorage.getItem('accessToken');
        if (token) {
            config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor for token refresh
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;

            try {
                const refreshToken = localStorage.getItem('refreshToken');
                const response = await axios.post(`${API_BASE_URL}/auth/refresh`, {
                    refreshToken,
                });

                const { accessToken } = response.data;
                localStorage.setItem('accessToken', accessToken);

                originalRequest.headers.Authorization = `Bearer ${accessToken}`;
                return apiClient(originalRequest);
            } catch (refreshError) {
                // Redirect to login
                window.location.href = '/login';
                return Promise.reject(refreshError);
            }
        }

        return Promise.reject(error);
    }
);

// API endpoints
export const authApi = {
    login: (email: string, password: string) =>
        apiClient.post('/auth/login', { email, password }),
    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me'),
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
    assign: (id: string, contractorId: string) =>
        apiClient.put(`/maintenance/${id}/assign`, { contractorId }),
    fix: (id: string, data: any) =>
        apiClient.put(`/maintenance/${id}/fix`, data),
};

export const usersApi = {
    getAll: () => apiClient.get('/users'),
    getById: (id: string) => apiClient.get(`/users/${id}`),
    update: (id: string, data: any) => apiClient.put(`/users/${id}`, data),
    delete: (id: string) => apiClient.delete(`/users/${id}`),
};
```

#### TASK-003: Create Zustand auth store
**Create:** `frontend/src/stores/authStore.ts`

```typescript
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
    accessToken: string | null;
    refreshToken: string | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => Promise<void>;
    setAuth: (data: { user: User; accessToken: string; refreshToken: string }) => void;
    clearAuth: () => void;
}

export const useAuthStore = create<AuthState>()(
    persist(
        (set, get) => ({
            user: null,
            accessToken: null,
            refreshToken: null,
            isAuthenticated: false,
            isLoading: false,

            login: async (email: string, password: string) => {
                set({ isLoading: true });
                try {
                    const response = await authApi.login(email, password);
                    const { user, accessToken, refreshToken } = response.data;

                    localStorage.setItem('accessToken', accessToken);
                    localStorage.setItem('refreshToken', refreshToken);

                    set({
                        user,
                        accessToken,
                        refreshToken,
                        isAuthenticated: true,
                        isLoading: false,
                    });
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
                get().clearAuth();
            },

            setAuth: (data) => {
                localStorage.setItem('accessToken', data.accessToken);
                localStorage.setItem('refreshToken', data.refreshToken);
                set({
                    user: data.user,
                    accessToken: data.accessToken,
                    refreshToken: data.refreshToken,
                    isAuthenticated: true,
                });
            },

            clearAuth: () => {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                set({
                    user: null,
                    accessToken: null,
                    refreshToken: null,
                    isAuthenticated: false,
                });
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({
                user: state.user,
                isAuthenticated: state.isAuthenticated,
            }),
        }
    )
);
```

#### TASK-004: Create protected route component
**Create:** `frontend/src/components/auth/ProtectedRoute.tsx`

```typescript
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
```

#### TASK-005: Create layout components
**Create:** `frontend/src/components/layout/MainLayout.tsx`

```typescript
import { Sidebar } from './Sidebar';
import { Header } from './Header';

interface MainLayoutProps {
    children: React.ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
    return (
        <div className="flex h-screen bg-background">
            <Sidebar />
            <div className="flex-1 flex flex-col overflow-hidden">
                <Header />
                <main className="flex-1 overflow-auto p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}
```

**Create:** `frontend/src/components/layout/Sidebar.tsx`

```typescript
import { NavLink } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import {
    LayoutDashboard,
    Car,
    ArrowLeftRight,
    Wrench,
    Users,
    FileText,
    LogOut
} from 'lucide-react';

export function Sidebar() {
    const { user, logout } = useAuthStore();

    const navItems = [
        { to: '/', label: 'Dashboard', icon: LayoutDashboard, roles: ['Admin', 'LCC', 'FocalPoint', 'Contractor'] },
        { to: '/fleet', label: 'Fleet', icon: Car, roles: ['Admin', 'LCC', 'FocalPoint'] },
        { to: '/handover', label: 'Handover', icon: ArrowLeftRight, roles: ['Admin', 'FocalPoint'] },
        { to: '/maintenance', label: 'Maintenance', icon: Wrench, roles: ['Admin', 'LCC', 'Contractor'] },
        { to: '/users', label: 'Users', icon: Users, roles: ['Admin'] },
        { to: '/reports', label: 'Reports', icon: FileText, roles: ['Admin', 'LCC'] },
    ];

    const visibleItems = navItems.filter(item => item.roles.includes(user?.role as any));

    return (
        <aside className="w-64 bg-card border-r flex flex-col">
            <div className="p-6 border-b">
                <h1 className="text-xl font-bold">GCMS</h1>
                <p className="text-sm text-muted-foreground">Fleet Management</p>
            </div>

            <nav className="flex-1 p-4 space-y-2">
                {visibleItems.map((item) => (
                    <NavLink
                        key={item.to}
                        to={item.to}
                        className={({ isActive }) =>
                            `flex items-center gap-3 px-4 py-2 rounded-lg transition-colors ${
                                isActive
                                    ? 'bg-primary text-primary-foreground'
                                    : 'hover:bg-accent'
                            }`
                        }
                    >
                        <item.icon className="w-5 h-5" />
                        <span>{item.label}</span>
                    </NavLink>
                ))}
            </nav>

            <div className="p-4 border-t">
                <div className="mb-4">
                    <p className="font-medium">{user?.name}</p>
                    <p className="text-sm text-muted-foreground">{user?.role}</p>
                </div>
                <button
                    onClick={logout}
                    className="flex items-center gap-3 px-4 py-2 w-full rounded-lg hover:bg-destructive/10 text-destructive transition-colors"
                >
                    <LogOut className="w-5 h-5" />
                    <span>Logout</span>
                </button>
            </div>
        </aside>
    );
}
```

**Create:** `frontend/src/components/layout/Header.tsx`

```typescript
import { Bell, User } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

export function Header() {
    const { user } = useAuthStore();

    return (
        <header className="h-16 border-b bg-card flex items-center justify-between px-6">
            <h2 className="text-lg font-semibold">
                {user?.stadiumId ? `Stadium: ${user.stadiumId}` : 'All Stadiums'}
            </h2>

            <div className="flex items-center gap-4">
                <button className="p-2 hover:bg-accent rounded-full relative">
                    <Bell className="w-5 h-5" />
                    <span className="absolute top-0 right-0 w-2 h-2 bg-destructive rounded-full" />
                </button>
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 bg-primary rounded-full flex items-center justify-center text-primary-foreground">
                        <User className="w-4 h-4" />
                    </div>
                    <span className="font-medium">{user?.name}</span>
                </div>
            </div>
        </header>
    );
}
```

#### TASK-006: Create login page
**Create:** `frontend/src/pages/LoginPage.tsx`

```typescript
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
                    <CardDescription>
                        Golf Car Management System
                    </CardDescription>
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
                            {isLoading ? (
                                <>
                                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    Signing in...
                                </>
                            ) : (
                                'Sign In'
                            )}
                        </Button>
                    </form>

                    <div className="mt-4 text-sm text-muted-foreground text-center">
                        <p>Test credentials:</p>
                        <p>admin@gcms.com / admin123456</p>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
```

#### TASK-007: Update App.tsx with routing
**File:** `frontend/src/App.tsx`

```typescript
import { Routes, Route, Navigate } from 'react-router-dom';
import { useEffect } from 'react';
import { useAuthStore } from './stores/authStore';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { MainLayout } from './components/layout/MainLayout';

// Pages
import { LoginPage } from './pages/LoginPage';
import { DashboardPage } from './pages/DashboardPage';
import { FleetPage } from './pages/fleet/FleetPage';
import { HandoverPage } from './pages/handover/HandoverPage';
import { MaintenancePage } from './pages/maintenance/MaintenancePage';
import { UsersPage } from './pages/users/UsersPage';
import { ReportsPage } from './pages/reports/ReportsPage';

function App() {
    const { isAuthenticated, user } = useAuthStore();

    // Check auth on mount
    useEffect(() => {
        const token = localStorage.getItem('accessToken');
        if (token && !isAuthenticated) {
            // TODO: Verify token and get user
        }
    }, []);

    return (
        <Routes>
            <Route path="/login" element={<LoginPage />} />

            <Route path="/" element={
                <ProtectedRoute>
                    <MainLayout>
                        <DashboardPage />
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/fleet" element={
                <ProtectedRoute allowedRoles={['Admin', 'LCC', 'FocalPoint']}>
                    <MainLayout>
                        <FleetPage />
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/handover" element={
                <ProtectedRoute allowedRoles={['Admin', 'FocalPoint']}>
                    <MainLayout>
                        <HandoverPage />
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/maintenance" element={
                <ProtectedRoute allowedRoles={['Admin', 'LCC', 'Contractor']}>
                    <MainLayout>
                        <MaintenancePage />
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/users" element={
                <ProtectedRoute allowedRoles={['Admin']}>
                    <MainLayout>
                        <UsersPage />
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="/reports" element={
                <ProtectedRoute allowedRoles={['Admin', 'LCC']}>
                    <MainLayout>
                        <ReportsPage />
                    </MainLayout>
                </ProtectedRoute>
            } />

            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
    );
}

export default App;
```

#### TASK-008: Create page stubs
**Create empty page files:**

```bash
mkdir -p frontend/src/pages/fleet
mkdir -p frontend/src/pages/handover
mkdir -p frontend/src/pages/maintenance
mkdir -p frontend/src/pages/users
mkdir -p frontend/src/pages/reports
```

**Create:** `frontend/src/pages/DashboardPage.tsx`
```typescript
export function DashboardPage() {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
            <p>Welcome to GCMS Dashboard</p>
        </div>
    );
}
```

**Create:** `frontend/src/pages/fleet/FleetPage.tsx`
```typescript
export function FleetPage() {
    return (
        <div>
            <h1 className="text-3xl font-bold mb-6">Fleet Management</h1>
            <p>Fleet page placeholder</p>
        </div>
    );
}
```

(Create similar stubs for other pages)

---

## AGENT 4: Fleet Module Frontend

**Priority:** P1
**Estimated Time:** 10-12 hours
**Dependencies:** Agent 3 (Frontend Foundation)
**Blocks:** None

### Tasks

#### Create fleet types
**Create:** `frontend/src/types/fleet.ts`

```typescript
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
    stadium?: {
        id: string;
        name: string;
    };
    createdAt: string;
    updatedAt: string;
}

export interface FleetFilters {
    status?: string;
    stadiumId?: string;
    faTrigram?: string;
}
```

#### Create fleet list page
**Create:** `frontend/src/pages/fleet/FleetPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { fleetApi } from '@/lib/api';
import { Fleet } from '@/types/fleet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Plus, Search, Filter } from 'lucide-react';

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

    useEffect(() => {
        loadFleet();
    }, []);

    const loadFleet = async () => {
        try {
            const response = await fleetApi.getAll();
            setFleet(response.data);
        } catch (error) {
            console.error('Failed to load fleet:', error);
        } finally {
            setLoading(false);
        }
    };

    const filteredFleet = fleet.filter(vehicle =>
        vehicle.unitNumber.toLowerCase().includes(search.toLowerCase()) ||
        vehicle.carType.toLowerCase().includes(search.toLowerCase())
    );

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Fleet Management</h1>
                <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    Add Vehicle
                </Button>
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
                        <Button variant="outline">
                            <Filter className="w-4 h-4 mr-2" />
                            Filters
                        </Button>
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
                                <TableHead>VAPS Permit</TableHead>
                                <TableHead>Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {filteredFleet.map((vehicle) => (
                                <TableRow key={vehicle.id}>
                                    <TableCell className="font-medium">
                                        {vehicle.unitNumber}
                                    </TableCell>
                                    <TableCell>{vehicle.carType}</TableCell>
                                    <TableCell>{vehicle.keyId}</TableCell>
                                    <TableCell>
                                        <span
                                            className="inline-block w-4 h-4 rounded-full mr-2"
                                            style={{ backgroundColor: vehicle.keyColorCode }}
                                        />
                                        {vehicle.keyColorCode}
                                    </TableCell>
                                    <TableCell>
                                        <Badge className={statusColors[vehicle.status]}>
                                            {vehicle.status}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>{vehicle.assignedToFA || '-'}</TableCell>
                                    <TableCell>{vehicle.vapsPermit || '-'}</TableCell>
                                    <TableCell>
                                        <Button variant="ghost" size="sm">
                                            View
                                        </Button>
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
```

---

## AGENT 5: Handover Module Frontend

**Priority:** P1
**Estimated Time:** 8-10 hours
**Dependencies:** Agent 3 (Frontend Foundation)
**Blocks:** None

### Tasks

#### Install signature canvas
```bash
cd /home/ubuntu/projects/GCMS/frontend
npm install react-signature-canvas @types/react-signature-canvas
```

#### Create signature component
**Create:** `frontend/src/components/handover/SignaturePad.tsx`

```typescript
import { useRef, useCallback } from 'react';
import SignatureCanvas from 'react-signature-canvas';
import { Button } from '@/components/ui/button';

interface SignaturePadProps {
    onSave: (signature: string) => void;
    onClear?: () => void;
}

export function SignaturePad({ onSave, onClear }: SignaturePadProps) {
    const sigRef = useRef<SignatureCanvas>(null);

    const handleClear = useCallback(() => {
        sigRef.current?.clear();
        onClear?.();
    }, [onClear]);

    const handleSave = useCallback(() => {
        if (sigRef.current?.isEmpty()) {
            alert('Please provide a signature');
            return;
        }
        const signature = sigRef.current?.toDataURL('image/png');
        if (signature) {
            onSave(signature);
        }
    }, [onSave]);

    return (
        <div className="space-y-4">
            <div className="border rounded-lg bg-white">
                <SignatureCanvas
                    ref={sigRef}
                    canvasProps={{
                        width: 500,
                        height: 200,
                        className: 'signature-canvas',
                    }}
                />
            </div>
            <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleClear}>
                    Clear
                </Button>
                <Button type="button" onClick={handleSave}>
                    Confirm Signature
                </Button>
            </div>
        </div>
    );
}
```

#### Create checkout form
**Create:** `frontend/src/pages/handover/HandoverPage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { handoverApi, fleetApi } from '@/lib/api';
import { Fleet } from '@/types/fleet';
import { SignaturePad } from '@/components/handover/SignaturePad';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

export function HandoverPage() {
    const [availableVehicles, setAvailableVehicles] = useState<Fleet[]>([]);
    const [selectedVehicle, setSelectedVehicle] = useState('');
    const [notes, setNotes] = useState('');
    const [signature, setSignature] = useState('');
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        loadAvailableVehicles();
    }, []);

    const loadAvailableVehicles = async () => {
        try {
            const response = await fleetApi.getAll({ status: 'Ready' });
            setAvailableVehicles(response.data);
        } catch (error) {
            console.error('Failed to load vehicles:', error);
        }
    };

    const handleCheckOut = async () => {
        if (!selectedVehicle || !signature) {
            alert('Please select a vehicle and provide signature');
            return;
        }

        setLoading(true);
        try {
            // Get current location
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
        } catch (error) {
            console.error('Check-out failed:', error);
            alert('Check-out failed');
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
                        <CardHeader>
                            <CardTitle>Check Out Vehicle</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div>
                                <label className="text-sm font-medium">Select Vehicle</label>
                                <Select value={selectedVehicle} onValueChange={setSelectedVehicle}>
                                    <SelectTrigger>
                                        <SelectValue placeholder="Choose a vehicle" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {availableVehicles.map((vehicle) => (
                                            <SelectItem key={vehicle.id} value={vehicle.id}>
                                                {vehicle.unitNumber} - {vehicle.carType}
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
                                    placeholder="Enter vehicle condition notes..."
                                />
                            </div>

                            <div>
                                <label className="text-sm font-medium">Signature</label>
                                <SignaturePad onSave={setSignature} />
                            </div>

                            <Button
                                onClick={handleCheckOut}
                                disabled={loading || !selectedVehicle || !signature}
                            >
                                {loading ? 'Processing...' : 'Complete Check Out'}
                            </Button>
                        </CardContent>
                    </Card>
                </TabsContent>

                {/* Similar for checkin and history tabs */}
            </Tabs>
        </div>
    );
}
```

---

## AGENT 6: Maintenance & Users Frontend

**Priority:** P1
**Estimated Time:** 8-10 hours
**Dependencies:** Agent 3 (Frontend Foundation)
**Blocks:** None

### Tasks

#### Create maintenance page
**Create:** `frontend/src/pages/maintenance/MaintenancePage.tsx`

```typescript
import { useState, useEffect } from 'react';
import { maintenanceApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MaintenanceTask {
    id: string;
    fleetId: string;
    issueDescription: string;
    status: 'Pending' | 'InProgress' | 'Fixed';
    reportedAt: string;
    fixedAt?: string;
    fleet?: {
        unitNumber: string;
    };
}

export function MaintenancePage() {
    const [tasks, setTasks] = useState<MaintenanceTask[]>([]);
    const [loading, setLoading] = useState(true);

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

    const statusColors = {
        'Pending': 'bg-yellow-500',
        'InProgress': 'bg-blue-500',
        'Fixed': 'bg-green-500',
    };

    if (loading) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Maintenance</h1>
                <Button>Report New Issue</Button>
            </div>

            <Tabs defaultValue="pending">
                <TabsList>
                    <TabsTrigger value="pending">Pending</TabsTrigger>
                    <TabsTrigger value="history">History</TabsTrigger>
                </TabsList>

                <TabsContent value="pending" className="space-y-4">
                    {tasks.filter(t => t.status !== 'Fixed').map((task) => (
                        <Card key={task.id}>
                            <CardHeader className="pb-2">
                                <div className="flex justify-between items-start">
                                    <CardTitle className="text-lg">
                                        Vehicle: {task.fleet?.unitNumber}
                                    </CardTitle>
                                    <Badge className={statusColors[task.status]}>
                                        {task.status}
                                    </Badge>
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
```

#### Create users page
**Create:** `frontend/src/pages/users/UsersPage.tsx`

(Similar pattern to fleet page with user management)

---

## AGENT 7: Testing & DevOps

**Priority:** P2
**Estimated Time:** 6-8 hours
**Dependencies:** Agents 1-6
**Blocks:** Deployment

### Tasks

#### Create backend tests
**Create:** `backend/src/__tests__/auth.test.ts`

```typescript
import request from 'supertest';
import app from '../app';

describe('Auth Endpoints', () => {
    describe('POST /api/v1/auth/login', () => {
        it('should login with valid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'admin@gcms.com',
                    password: 'admin123456',
                });

            expect(res.status).toBe(200);
            expect(res.body).toHaveProperty('accessToken');
            expect(res.body).toHaveProperty('user');
        });

        it('should reject invalid credentials', async () => {
            const res = await request(app)
                .post('/api/v1/auth/login')
                .send({
                    email: 'admin@gcms.com',
                    password: 'wrongpassword',
                });

            expect(res.status).toBe(401);
        });
    });
});
```

**Install:** `npm install --save-dev jest supertest @types/jest @types/supertest`

#### Create Dockerfile for backend
**Create:** `backend/Dockerfile`

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY prisma ./prisma/
RUN npx prisma generate

COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "dist/server.js"]
```

#### Create Dockerfile for frontend
**Create:** `frontend/Dockerfile`

```dockerfile
FROM node:20-alpine AS builder

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

---

## Coordination Protocol

### Daily Standup Format
Each agent should report:
1. Completed tasks
2. Blockers
3. Next tasks
4. Files modified

### Merge Protocol
1. Each agent works in feature branches
2. Test locally before requesting review
3. Document breaking changes
4. Update this guide with discoveries

### Emergency Contacts
- If Agent 1 finds frontend blockers → Notify Agent 3
- If Agent 3 finds API issues → Notify Agent 1
- If database schema changes needed → Notify Agent 2 + All

---

## Success Criteria

### Agent 1 Complete When:
- [ ] All backend bugs fixed
- [ ] Rate limiting working
- [ ] Tests pass

### Agent 2 Complete When:
- [ ] Indexes created
- [ ] Migrations applied
- [ ] Performance improved

### Agent 3 Complete When:
- [ ] Login page functional
- [ ] Protected routes working
- [ ] Sidebar navigation visible
- [ ] Can access all page stubs

### Agent 4 Complete When:
- [ ] Fleet list displays data
- [ ] Add vehicle works
- [ ] Filters functional

### Agent 5 Complete When:
- [ ] Check-out captures signature
- [ ] Check-in updates status
- [ ] History view works

### Agent 6 Complete When:
- [ ] Maintenance reporting works
- [ ] User list displays
- [ ] Basic user management works

### Agent 7 Complete When:
- [ ] Tests running in CI
- [ ] Docker builds work
- [ ] Deployment scripts ready

---

**END OF DISPATCH GUIDE**
