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
        const publicEndpoints = ['/auth/login', '/auth/microsoft', '/auth/forgot-password', '/auth/reset-password', '/public/'];
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
    microsoftLogin: (idToken: string) =>
        apiClient.post('/auth/microsoft', { idToken }),
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
    getDrivers: (id: string) =>
        apiClient.get(`/fleet/${id}/drivers`),
    updateDrivers: (id: string, drivers: Array<{ name: string; phone: string; accreditationNumber: string }>) =>
        apiClient.patch(`/fleet/${id}/drivers`, { drivers }),
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
    
    // Refined Workflow Actions
    signHandover: (fleetId: string) =>
        apiClient.post('/handover/sign-handover', { fleetId }),
    requestHandback: (fleetId: string) =>
        apiClient.post('/handover/request-handback', { fleetId }),
    acceptHandback: (fleetId: string) =>
        apiClient.post('/handover/accept-handback', { fleetId }),

    // Handover Form
    createHandoverForm: (data: Record<string, unknown>) =>
        apiClient.post('/handover/forms', data),
    getHandoverForm: (fleetId: string) =>
        apiClient.get(`/handover/forms/${fleetId}`),
    downloadFormPdf: (fleetId: string, variant: 'handover' | 'handback' = 'handover') =>
        apiClient.get(`/handover/forms/${fleetId}/pdf`, { params: { type: variant }, responseType: 'blob' }),
    getPendingHandovers: () =>
        apiClient.get('/handover/forms/pending'),
    userSignHandoverForm: (data: Record<string, unknown>) =>
        apiClient.post('/handover/forms/user-sign', data),
    saveAfterUse: (data: Record<string, unknown>) =>
        apiClient.post('/handover/forms/afteruse', data),
    adminReturn: (data: Record<string, unknown>) =>
        apiClient.post('/handover/forms/admin-return', data),
    listForms: (params?: Record<string, unknown>) =>
        apiClient.get('/handover/forms/list', { params }),

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
        apiClient.post('/maintenance', data),
    escalateToContracts: (id: string) =>
        apiClient.post(`/maintenance/${id}/escalate`),
    requestQuotation: (id: string) =>
        apiClient.post(`/maintenance/${id}/request-quotation`),
    submitCost: (id: string, data: { fixCost: number; quotationDescription: string; quotationTimeline?: string }) =>
        apiClient.post(`/maintenance/${id}/submit-cost`, data),
    approveCost: (id: string) =>
        apiClient.post(`/maintenance/${id}/approve-cost`),
    rejectQuotation: (id: string, rejectionReason: string) =>
        apiClient.post(`/maintenance/${id}/reject-quotation`, { rejectionReason }),
    updateStatus: (id: string, data: { status: string; resolutionNotes?: string }) =>
        apiClient.patch(`/maintenance/${id}/status`, data),
    exportCsv: () =>
        apiClient.get('/maintenance/export', { responseType: 'blob' }),
    getPdfReportUrl: (id: string) =>
        `${(import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'http://localhost:3005/api/v1'}/maintenance/${id}/pdf`,
    downloadReportPdf: (id: string) =>
        apiClient.get(`/maintenance/${id}/report.pdf`, { responseType: 'blob' }),
    emailReport: (id: string, data: { recipients?: string[]; note?: string }) =>
        apiClient.post(`/maintenance/${id}/email-report`, data),
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
    bulkCreate: (venues: { name: string; code: string; location: string }[]) =>
        apiClient.post('/stadiums/bulk', { venues }),
    getPoolBookingHours: (id: string) =>
        apiClient.get(`/stadiums/${id}/pool-booking-hours`),
    updatePoolBookingHours: (id: string, data: { poolBookingStartTime: string | null; poolBookingEndTime: string | null }) =>
        apiClient.patch(`/stadiums/${id}/pool-booking-hours`, data),
    assignAdmin: (id: string, data: { name: string; email: string }) =>
        apiClient.post(`/stadiums/${id}/admins`, data),
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
    unblock: (id: string) =>
        apiClient.patch(`/users/${id}/unblock`),
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

    // Pool report
    getPoolReport: (params?: Record<string, unknown>) =>
        apiClient.get('/reports/pool', { params }),
    exportPoolReport: (format: 'xlsx' | 'pdf' = 'xlsx', params?: Record<string, unknown>) =>
        apiClient.get(`/reports/pool/export${format === 'pdf' ? '/pdf' : ''}`, { params, responseType: 'blob' }),

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
            headers: { 'Content-Type': undefined },
        }),
    announceWindow: () =>
        apiClient.post('/settings/request-window/announce'),
    testSmtp: (to: string) =>
        apiClient.post('/settings/smtp/test', { to }),
};

export const notificationTemplatesApi = {
    list: () => apiClient.get('/notification-templates'),
    update: (key: string, data: {
        emailEnabled?: boolean;
        emailSubject?: string | null;
        emailBody?: string | null;
        pushEnabled?: boolean;
        pushTitle?: string | null;
        pushMessage?: string | null;
    }) => apiClient.put(`/notification-templates/${key}`, data),
    reset: (key: string) => apiClient.post(`/notification-templates/${key}/reset`),
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
        justification?: string;
        notes?: string;
    }) => axios.post(`${API_URL}/public/requests`, data),
    getByTokenPublic: (token: string) =>
        axios.get(`${API_URL}/public/requests/${token}`),
    trackPublic: (requestNumber: number, email: string) =>
        axios.get(`${API_URL}/public/requests/track`, { params: { number: requestNumber, email } }),

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
    emailRequester: (id: string, message: string) =>
        apiClient.post(`/requests/${id}/email-requester`, { message }),
    export: (format: 'xlsx' | 'pdf' | 'docx', params?: Record<string, unknown>) =>
        apiClient.get('/requests/export', { params: { ...params, format }, responseType: 'blob' }),
};

// Account access requests (SSO self-service + invitation-originated)
export const accessRequestsApi = {
    // Public endpoints (no auth)
    getPublicStadiums: () => axios.get(`${API_URL}/public/stadiums`),
    getPublicDepartments: (stadiumId: string) =>
        axios.get(`${API_URL}/public/departments`, { params: { stadiumId } }),
    createPublic: (data: {
        name: string;
        email: string;
        phone?: string;
        stadiumId: string;
        departmentId: string;
        invitationToken?: string;
    }) => axios.post(`${API_URL}/public/access-requests`, data),
    getByTokenPublic: (token: string) =>
        axios.get(`${API_URL}/public/access-requests/${token}`),
    getInvitationPublic: (token: string) =>
        axios.get(`${API_URL}/public/invitations/${token}`),

    // Admin endpoints (auth required)
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/access-requests', { params }),
    getById: (id: string) =>
        apiClient.get(`/access-requests/${id}`),
    approve: (id: string, reviewNotes?: string, departmentId?: string) =>
        apiClient.post(`/access-requests/${id}/approve`, { reviewNotes, departmentId }),
    reject: (id: string, reviewNotes?: string) =>
        apiClient.post(`/access-requests/${id}/reject`, { reviewNotes }),
    delete: (id: string) =>
        apiClient.delete(`/access-requests/${id}`),
};

// Invitations (Admin/SuperAdmin invite a user by email)
export const invitationsApi = {
    create: (data: { email: string; stadiumId?: string; departmentId?: string }) =>
        apiClient.post('/invitations', data),
    getAll: (params?: Record<string, unknown>) =>
        apiClient.get('/invitations', { params }),
    revoke: (id: string) =>
        apiClient.post(`/invitations/${id}/revoke`),
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
        notifyInApp?: boolean;
        notifyEmail?: boolean;
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

export const documentsApi = {
    list: (category: 'training' | 'policy') =>
        apiClient.get('/documents', { params: { category } }),
    upload: (data: FormData) =>
        apiClient.post('/documents', data, { headers: { 'Content-Type': 'multipart/form-data' } }),
    delete: (id: string) =>
        apiClient.delete(`/documents/${id}`),
    download: (id: string) =>
        apiClient.get(`/documents/${id}/file`, { params: { download: 1 }, responseType: 'blob' }),
    getViewUrl: (id: string) =>
        `${(import.meta as unknown as { env?: { VITE_API_URL?: string } }).env?.VITE_API_URL || 'http://localhost:3005/api/v1'}/documents/${id}/file`,
};

export const poolBookingsApi = {
    getPoolFleet: (params?: { stadiumId?: string }) =>
        apiClient.get('/pool-bookings/fleet', { params }),
    getBookings: (params?: { fleetId?: string; stadiumId?: string; status?: string; limit?: number }) =>
        apiClient.get('/pool-bookings', { params }),
    // checkout()/returnCart() were removed — the backend no-approval checkout routes
    // no longer exist; all new bookings go through poolBookingRequestsApi.
    togglePool: (fleetId: string, isPool: boolean) =>
        apiClient.patch(`/pool-bookings/fleet/${fleetId}/toggle-pool`, { isPool }),
};

// Pool Booking Requests (public submission + admin/FA review — replaces the old
// no-approval immediate-checkout PoolBooking flow for new bookings)
export const poolBookingRequestsApi = {
    // Public endpoints — apiClient still attaches a Bearer token automatically
    // when the caller happens to be logged in, so createdById gets captured.
    // Deprecated — the public form now uses publicDataApi.getDepartments instead.
    getFAs: (stadiumId: string) =>
        apiClient.get(`/public/pool-booking-requests/venues/${stadiumId}/fas`),
    getAvailableCarts: (
        stadiumId: string,
        params: { startDate: string; endDate: string; startTime: string; endTime: string; excludeBookingId?: string },
    ) => apiClient.get(`/public/pool-booking-requests/venues/${stadiumId}/available-carts`, { params }),
    getAvailableCartsMulti: (stadiumId: string, slots: { date: string; startTime: string; endTime: string }[]) =>
        apiClient.post(`/public/pool-booking-requests/venues/${stadiumId}/available-carts-multi`, { slots }),
    getInstantAvailableCarts: (stadiumId: string) =>
        apiClient.get(`/public/pool-booking-requests/venues/${stadiumId}/instant-available-carts`),
    createPublic: (data: {
        stadiumId: string;
        fleetId: string;
        requesterName: string;
        requesterEmail: string;
        requesterPhone: string;
        departmentId: string;
        bookingType: 'Single';
        startDate: string;
        endDate: string;
        startTime: string;
        endTime: string;
        purpose?: string;
    }) => apiClient.post('/public/pool-booking-requests', data),
    createRecurringPublic: (data: {
        stadiumId: string;
        fleetId: string;
        requesterName: string;
        requesterEmail: string;
        requesterPhone: string;
        departmentId: string;
        purpose?: string;
        slots: { date: string; startTime: string; endTime: string }[];
    }) => apiClient.post('/public/pool-booking-requests/recurring', data),
    createInstantPublic: (data: {
        stadiumId: string;
        fleetId: string;
        requesterName: string;
        requesterEmail: string;
        requesterPhone: string;
        departmentId: string;
        purpose?: string;
        instantDurationMinutes?: number;
    }) => apiClient.post('/public/pool-booking-requests/instant', data),
    getByTokenPublic: (token: string) =>
        apiClient.get(`/public/pool-booking-requests/${token}`),
    markKeyCollectedPublic: (token: string) =>
        apiClient.patch(`/public/pool-booking-requests/${token}/collect`),

    // Admin/FA/Observer endpoints (auth required)
    getAll: (params?: { status?: string; stadiumId?: string; derivedState?: string }) =>
        apiClient.get('/pool-booking-requests', { params }),
    approve: (id: string, comment?: string) =>
        apiClient.patch(`/pool-booking-requests/${id}/approve`, { comment }),
    reject: (id: string, comment: string) =>
        apiClient.patch(`/pool-booking-requests/${id}/reject`, { comment }),
    amend: (id: string, data: Record<string, unknown>) =>
        apiClient.patch(`/pool-booking-requests/${id}`, data),
    markReturned: (id: string) =>
        apiClient.patch(`/pool-booking-requests/${id}/return`),
    markKeyCollected: (id: string) =>
        apiClient.patch(`/pool-booking-requests/${id}/collect`),
    requestExtension: (id: string, endDate: string, endTime: string) =>
        apiClient.post(`/pool-booking-requests/${id}/extension`, { endDate, endTime }),
    reviewExtension: (id: string, approve: boolean) =>
        apiClient.patch(`/pool-booking-requests/${id}/extension`, { approve }),
    getHistory: (params?: Record<string, string | undefined>) =>
        apiClient.get('/pool-booking-requests/history', { params }),
    exportHistory: (params: Record<string, string | undefined>) =>
        apiClient.get('/pool-booking-requests/history/export', { params, responseType: 'blob' }),
};

// Incidents & warnings (Phase 6 ticketing)
export const incidentsApi = {
    list: (params?: Record<string, string | undefined>) =>
        apiClient.get('/incidents', { params }),
    get: (id: string) =>
        apiClient.get(`/incidents/${id}`),
    report: (formData: FormData) =>
        apiClient.post('/incidents', formData),
    setStatus: (id: string, status: string) =>
        apiClient.patch(`/incidents/${id}/status`, { status }),
    downloadPdf: (id: string) =>
        apiClient.get(`/incidents/${id}/pdf`, { responseType: 'blob' }),
    issueWarning: (id: string, data: { level: number; reason: string }) =>
        apiClient.post(`/incidents/${id}/warnings`, data),
    saveForm: (id: string, formData: Record<string, unknown>) =>
        apiClient.patch(`/incidents/${id}/form`, { formData }),
    signForm: (id: string, signatureData: string) =>
        apiClient.post(`/incidents/${id}/form/sign`, { signatureData }),
    escalate: (id: string, data: { contracts?: boolean; maintenance?: boolean }) =>
        apiClient.post(`/incidents/${id}/escalate`, data),
};

export const warningsApi = {
    list: (params?: { userId?: string }) =>
        apiClient.get('/warnings', { params }),
    issue: (data: { userId: string; level: number; reason: string; incidentId?: string }) =>
        apiClient.post('/warnings', data),
    revoke: (id: string, unblock: boolean) =>
        apiClient.patch(`/warnings/${id}/revoke`, { unblock }),
};

export default apiClient;
