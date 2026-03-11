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
        const publicEndpoints = ['/auth/login', '/auth/forgot-password', '/auth/reset-password', '/settings'];
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
};

// Maintenance  (statuses: Open / InProgress / Resolved)
export const maintenanceApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/maintenance', { params }),
    getByFleet: (fleetId: string) =>
        apiClient.get(`/maintenance/fleet/${fleetId}`),
    report: (data: FormData) =>
        apiClient.post('/maintenance', data, {
            headers: { 'Content-Type': 'multipart/form-data' },
        }),
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
};

// Departments
export const departmentsApi = {
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/departments', { params }),
    getById: (id: string) =>
        apiClient.get(`/departments/${id}`),
    create: (data: Record<string, unknown>) =>
        apiClient.post('/departments', data),
    update: (id: string, data: Record<string, unknown>) =>
        apiClient.put(`/departments/${id}`, data),
    delete: (id: string) =>
        apiClient.delete(`/departments/${id}`),
};

// Users  (roles: SuperAdmin / Admin / FA / Observer)
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
};

// Reports & Exports
export const reportsApi = {
    getUtilization: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/utilization', { params }),
    exportHandover: () =>
        apiClient.get('/reports/handover/export', { responseType: 'blob' }),
    exportMaintenance: () =>
        apiClient.get('/reports/maintenance/export', { responseType: 'blob' }),
    exportFleet: () =>
        apiClient.get('/reports/fleet/export', { responseType: 'blob' }),
    exportActivity: () =>
        apiClient.get('/reports/activity/export', { responseType: 'blob' }),
    exportFull: () =>
        apiClient.get('/reports/full', { responseType: 'blob' }),
    getAuditLog: () =>
        apiClient.get('/reports/audit'),
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

export default apiClient;