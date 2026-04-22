import axios from 'axios';

// Use Vite environment variable with fallback to port 3005
const API_URL = (import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'http://localhost:3005/api/v1';

export const apiClient = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
});

// Attach access token to every request
apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Auto-refresh on 401 (only for authenticated routes, not login/public pages)
apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // Skip auth redirect for public endpoints
        const publicEndpoints = ['/auth/login', '/auth/forgot-password', '/auth/reset-password', '/public/'];
        const isPublicEndpoint = publicEndpoints.some(ep => originalRequest.url?.includes(ep));

        // Don't redirect if already on login page
        const isLoginPage = window.location.pathname === '/login' ||
                            window.location.pathname === '/forgot-password' ||
                            window.location.pathname.startsWith('/reset-password');

        if (error.response?.status === 401 && !originalRequest._retry && !isPublicEndpoint && !isLoginPage) {
            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem('refreshToken');
                if (!refreshToken) {
                    throw new Error('No refresh token');
                }
                const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
                localStorage.setItem('accessToken', res.data.accessToken);
                originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
                return apiClient(originalRequest);
            } catch {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

// Auth
export const authApi = {
    login: (email: string, password: string) =>
        apiClient.post('/auth/login', { email, password }),
    logout: () => apiClient.post('/auth/logout'),
    refresh: (refreshToken: string) =>
        apiClient.post('/auth/refresh', { refreshToken }),
    me: () => apiClient.get('/auth/me'),
    forgotPassword: (email: string) =>
        apiClient.post('/auth/forgot-password', { email }),
    resetPassword: (data: Record<string, string>) =>
        apiClient.post('/auth/reset-password', data),
    changePassword: (currentPassword: string, newPassword: string) =>
        apiClient.post('/auth/change-password', { currentPassword, newPassword }),
};

// Fleet  (carNumber, requiresVAP, assignedUserId, statuses: Available/Dispatched/Under Maintenance/Retired)
export const fleetApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/fleet', { params }),
    getById: (id: string) =>
        apiClient.get(`/fleet/${id}`),
    getMyCarts: () =>
        apiClient.get('/fleet/my-carts'),
    create: (data: Record<string, unknown>) =>
        apiClient.post('/fleet', data),
    update: (id: string, data: Record<string, unknown>) =>
        apiClient.put(`/fleet/${id}`, data),
    delete: (id: string) =>
        apiClient.delete(`/fleet/${id}`),
    bulkImport: (file: File, stadiumId: string) => {
        const form = new FormData();
        form.append('file', file);
        form.append('stadiumId', stadiumId);
        return apiClient.post('/fleet/bulk-import', form, {
            headers: { 'Content-Type': 'multipart/form-data' },
        });
    },
    assignUser: (id: string, userId: string | null) =>
        apiClient.post(`/fleet/${id}/assign`, { userId }),
    getAssignmentMatrix: (params?: Record<string, unknown>) =>
        apiClient.get('/fleet/assignment-matrix', { params }),
    bulkAssign: (assignments: Array<{ fleetId: string; userId: string | null }>) =>
        apiClient.post('/fleet/bulk-assign', { assignments }),
    getAssignmentHistory: (params?: Record<string, unknown>) =>
        apiClient.get('/fleet/assignment-history', { params }),
};

// Handover  (actions: CheckedOut / CheckedIn / IssueReported)
export const handoverApi = {
    checkOut: (data: FormData) =>
        apiClient.post('/handover/checkout', data, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    checkIn: (data: Record<string, unknown>) =>
        apiClient.post('/handover/checkin', data),
    bulkCheckOut: (data: Record<string, unknown>) =>
        apiClient.post('/handover/bulk-checkout', data),
    bulkCheckIn: (data: Record<string, unknown>) =>
        apiClient.post('/handover/bulk-checkin', data),
    getHistory: (params?: Record<string, unknown>) =>
        apiClient.get('/handover/history', { params }),
    // Pool management endpoints
    getPoolStatus: () =>
        apiClient.get('/handover/pool-status'),
    getPoolDashboard: () =>
        apiClient.get('/handover/pool-dashboard'),
    getAvailableInPool: (stadiumId: string) =>
        apiClient.get(`/handover/available/${stadiumId}`),
    getInUse: (stadiumId: string) =>
        apiClient.get(`/handover/in-use/${stadiumId}`),
};

// Maintenance  (statuses: Open / PendingQuotation / PendingApproval / InProgress / Resolved)
export const maintenanceApi = {
    getAll: (params?: any) => apiClient.get('/maintenance', { params }),
    getById: (id: string) => apiClient.get(`/maintenance/${id}`),
    getByFleet: (fleetId: string) => apiClient.get(`/maintenance/fleet/${fleetId}`),
    report: (data: FormData) =>
        apiClient.post('/maintenance', data, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
    requestQuotation: (id: string) => apiClient.post(`/maintenance/${id}/request-quotation`),
    submitCost: (id: string, fixCost: number) => apiClient.post(`/maintenance/${id}/submit-cost`, { fixCost }),
    approveCost: (id: string) => apiClient.post(`/maintenance/${id}/approve-cost`),
    updateStatus: (id: string, data: { status: string; resolutionNotes?: string }) =>
        apiClient.patch(`/maintenance/${id}/status`, data),
    exportCsv: () =>
        apiClient.get('/maintenance/export', { responseType: 'blob' }),
};

// Stadiums
export const stadiumsApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/stadiums', { params }),
    getById: (id: string) =>
        apiClient.get(`/stadiums/${id}`),
    create: (data: Record<string, unknown>) =>
        apiClient.post('/stadiums', data),
    update: (id: string, data: Record<string, unknown>) =>
        apiClient.put(`/stadiums/${id}`, data),
    delete: (id: string) =>
        apiClient.delete(`/stadiums/${id}`),
    toggleActive: (id: string, isActive: boolean) =>
        apiClient.put(`/stadiums/${id}`, { isActive }),
};

// Departments
export const departmentsApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/departments', { params }),
    getById: (id: string) =>
        apiClient.get(`/departments/${id}`),
    create: (data: Record<string, unknown>) =>
        apiClient.post('/departments', data),
    createBulk: (data: { name: string; code?: string; stadiumIds: string[] }) =>
        apiClient.post('/departments/bulk', data),
    update: (id: string, data: Record<string, unknown>) =>
        apiClient.put(`/departments/${id}`, data),
    delete: (id: string) =>
        apiClient.delete(`/departments/${id}`),
};

// Users  (roles: SuperAdmin / Admin / FA / Observer / Contracts / MaintenanceTeam)
export const usersApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/users', { params }),
    getById: (id: string) =>
        apiClient.get(`/users/${id}`),
    create: (data: Record<string, unknown>) =>
        apiClient.post('/users', data),
    update: (id: string, data: Record<string, unknown>) =>
        apiClient.put(`/users/${id}`, data),
    bulkCreate: (users: Record<string, unknown>[]) =>
        apiClient.post('/users/bulk', users),
    setStatus: (id: string, isActive: boolean) =>
        apiClient.patch(`/users/${id}/status`, { isActive }),
    setBlocked: (id: string, isBlocked: boolean) =>
        apiClient.patch(`/users/${id}/blocked`, { isBlocked }),
    importFromRequests: (requestIds: string[]) =>
        apiClient.post('/users/import-requests', { requestIds }),
    updatePreferences: (data: { exportFormat?: string; exportPreferences?: Record<string, unknown>; emailNotifications?: { maintenance?: boolean; handover?: boolean; requests?: boolean; assignments?: boolean } }) =>
        apiClient.patch('/users/me/preferences', data),
    delete: (id: string) =>
        apiClient.delete(`/users/${id}`),
};

// Reports & Exports
export const reportsApi = {
    getUtilization: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/utilization', { params }),
    getActiveCarsUsage: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/active-usage', { params }),
    exportHandover: () =>
        apiClient.get('/reports/handover/export', { responseType: 'blob' }),
    exportMaintenance: () =>
        apiClient.get('/reports/maintenance/export', { responseType: 'blob' }),
    exportFleet: (queryString?: string) =>
        apiClient.get(`/reports/fleet/export${queryString ? `?${queryString}` : ''}`, { responseType: 'blob' }),
    exportActivity: () =>
        apiClient.get('/reports/activity/export', { responseType: 'blob' }),
    exportFull: () =>
        apiClient.get('/reports/full', { responseType: 'blob' }),
    getAuditLog: () =>
        apiClient.get('/reports/audit'),
    getFaTrail: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/fa-trail', { params }),

    // Stadium reports
    getStadiumReports: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/stadiums', { params }),
    exportStadiumReport: (format: 'xlsx' | 'pdf' = 'xlsx') =>
        apiClient.get(`/reports/stadiums/export${format === 'pdf' ? '/pdf' : ''}`, { responseType: 'blob' }),

    // Department reports
    getDepartmentReports: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/departments', { params }),
    exportDepartmentReport: () =>
        apiClient.get('/reports/departments/export', { responseType: 'blob' }),

    // User reports
    getUserReports: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/users', { params }),
    exportUserReport: (format: 'xlsx' | 'pdf' = 'xlsx') =>
        apiClient.get(`/reports/users/export${format === 'pdf' ? '/pdf' : ''}`, { responseType: 'blob' }),

    // Print Labels
    exportLabels: (format: 'docx' | 'pptx' | 'pdf' = 'pdf', params?: Record<string, unknown>) =>
        apiClient.get(`/reports/labels/${format}`, { params, responseType: 'blob' }),
};

// Settings  (singleton: tournament name, branding images)
export const settingsApi = {
    get: () =>
        apiClient.get('/settings'),
    update: (data: FormData) =>
        apiClient.put('/settings', data, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
};

export const publicSettingsApi = {
    getBranding: () => axios.get(`${API_URL}/settings/public`),
};

export const publicDataApi = {
    getStadiums: () => axios.get(`${API_URL}/public/stadiums`),
    getDepartments: (stadiumId?: string) => axios.get(`${API_URL}/public/departments`, { params: stadiumId ? { stadiumId } : {} }),
};

// Car Requests (public and admin)
export const requestsApi = {
    // Public endpoints (no auth)
    createPublic: (data: {
        requesterName: string;
        requesterEmail: string;
        requesterPhone?: string;
        accreditationNumber?: string;
        requestType?: string;
        departmentId: string;
        stadiumId: string;
        cargoCount: number;
        fourSeaterCount: number;
        sixSeaterCount: number;
        accessibilityCount: number;
        notes?: string;
    }) => axios.post(`${API_URL}/public/requests`, data),
    getByTokenPublic: (token: string) =>
        axios.get(`${API_URL}/public/requests/${token}`),

    // Admin endpoints (auth required)
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/requests', { params }),
    getById: (id: string) =>
        apiClient.get(`/requests/${id}`),
    approve: (id: string, reviewNotes?: string) =>
        apiClient.post(`/requests/${id}/approve`, { reviewNotes }),
    reject: (id: string, reviewNotes?: string) =>
        apiClient.post(`/requests/${id}/reject`, { reviewNotes }),
    updateQuantities: (id: string, data: {
        cargoCount?: number;
        fourSeaterCount?: number;
        sixSeaterCount?: number;
        accessibilityCount?: number;
    }) => apiClient.patch(`/requests/${id}/quantities`, data),
    delete: (id: string) =>
        apiClient.delete(`/requests/${id}`),
};

// Notifications
export const notificationsApi = {
    getAll: (params?: { page?: number; limit?: number }) =>
        apiClient.get('/notifications', { params }),
    getStats: () =>
        apiClient.get('/notifications/stats'),
    markAsRead: (id: string) =>
        apiClient.patch(`/notifications/${id}/read`),
    markAllAsRead: () =>
        apiClient.patch('/notifications/read-all'),
};

// Announcements
export const announcementsApi = {
    getActive: () =>
        apiClient.get('/announcements/active'),
    getAll: (params?: { page?: number; limit?: number; type?: string; targetType?: string; isActive?: boolean }) =>
        apiClient.get('/announcements', { params }),
    getById: (id: string) =>
        apiClient.get(`/announcements/${id}`),
    create: (data: {
        title: string;
        message: string;
        type?: 'info' | 'warning' | 'success' | 'error';
        targetType?: 'all' | 'fas' | 'users' | 'selected';
        targetUserIds?: string[];
        targetRole?: string;
        stadiumId?: string;
        scheduledAt?: string;
        expiresAt?: string;
        sendNow?: boolean;
    }) => apiClient.post('/announcements', data),
    update: (id: string, data: Record<string, unknown>) =>
        apiClient.put(`/announcements/${id}`, data),
    sendNow: (id: string) =>
        apiClient.post(`/announcements/${id}/send`),
    deactivate: (id: string) =>
        apiClient.post(`/announcements/${id}/deactivate`),
    delete: (id: string) =>
        apiClient.delete(`/announcements/${id}`),
};

export default apiClient;
