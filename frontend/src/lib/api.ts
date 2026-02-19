import axios from 'axios';

const API_URL = ((import.meta as any).env?.VITE_API_URL || 'http://localhost:3001/api/v1') || 'http://localhost:3001/api/v1';

export const apiClient = axios.create({
    baseURL: API_URL,
    headers: { 'Content-Type': 'application/json' },
    timeout: 30000,
});

apiClient.interceptors.request.use((config) => {
    const token = localStorage.getItem('accessToken');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

apiClient.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;
        if (error.response?.status === 401 && !originalRequest._retry) {
            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem('refreshToken');
                const res = await axios.post(`${API_URL}/auth/refresh`, { refreshToken });
                localStorage.setItem('accessToken', res.data.accessToken);
                originalRequest.headers.Authorization = `Bearer ${res.data.accessToken}`;
                return apiClient(originalRequest);
            } catch {
                window.location.href = '/login';
            }
        }
        return Promise.reject(error);
    }
);

export const authApi = {
    login: (email: string, password: string) =>
        apiClient.post('/auth/login', { email, password }),
    logout: () => apiClient.post('/auth/logout'),
    me: () => apiClient.get('/auth/me'),
};

export const fleetApi = {
    getAll: (params?: any) => apiClient.get('/fleet', { params }),
    getById: (id: string) => apiClient.get(`/fleet/${id}`),
};

export const handoverApi = {
    checkOut: (data: any) => apiClient.post('/handover/checkout', data),
    checkIn: (data: any) => apiClient.post('/handover/checkin', data),
    getHistory: () => apiClient.get('/handover/history'),
    getMyHistory: () => apiClient.get('/handover/my-history'),
};

export const maintenanceApi = {
    getAll: () => apiClient.get('/maintenance'),
    reportIssue: (data: any) => apiClient.post('/maintenance', data),
    assignContractor: (id: string, contractorId: string) =>
        apiClient.put(`/maintenance/${id}/assign`, { contractorId }),
    reportFix: (id: string, data: any) => apiClient.put(`/maintenance/${id}/fix`, data),
    getHistoryByFleet: (fleetId: string) => apiClient.get(`/maintenance/history/${fleetId}`),
};

export const usersApi = {
    getAll: () => apiClient.get('/users'),
    getById: (id: string) => apiClient.get(`/users/${id}`),
    update: (id: string, data: any) => apiClient.put(`/users/${id}`, data),
    delete: (id: string) => apiClient.delete(`/users/${id}`),
    bulkCreate: (users: any[]) => apiClient.post('/users/bulk', users),
};

export const reportsApi = {
    getUtilization: () => apiClient.get('/reports/utilization'),
    exportAudit: () => apiClient.get('/reports/audit', { responseType: 'blob' }),
    exportHandover: () => apiClient.get('/reports/handover/export', { responseType: 'blob' }),
    exportMaintenance: () => apiClient.get('/reports/maintenance/export', { responseType: 'blob' }),
};

export default apiClient;
