import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { authApi } from '@/lib/api';

export interface ExportPreferences {
    fleet?: {
        enabled?: boolean;
        includeCarNumber?: boolean;
        includeStatus?: boolean;
        includeAssignment?: boolean;
        includeStadium?: boolean;
        includeDepartment?: boolean;
    };
    handover?: {
        enabled?: boolean;
        includeCarNumber?: boolean;
        includeUser?: boolean;
        includeAction?: boolean;
        includeTimestamp?: boolean;
        includeNotes?: boolean;
    };
    maintenance?: {
        enabled?: boolean;
        includeCarNumber?: boolean;
        includeIssue?: boolean;
        includeStatus?: boolean;
        includeReporter?: boolean;
        includeDates?: boolean;
    };
    request?: {
        enabled?: boolean;
        includeRequester?: boolean;
        includeDepartment?: boolean;
        includeStadium?: boolean;
        includeQuantities?: boolean;
        includeStatus?: boolean;
        includeNotes?: boolean;
    };
    users?: {
        enabled?: boolean;
        includeName?: boolean;
        includeEmail?: boolean;
        includeRole?: boolean;
        includeStadium?: boolean;
        includeDepartment?: boolean;
        includeStatus?: boolean;
    };
    department?: {
        enabled?: boolean;
        includeName?: boolean;
        includeCode?: boolean;
        includeStadium?: boolean;
        includeFocalPoint?: boolean;
    };
    stadium?: {
        enabled?: boolean;
        includeName?: boolean;
        includeCode?: boolean;
        includeLocation?: boolean;
        includeStatus?: boolean;
    };
    theme?: 'light' | 'dark' | 'system';
}

export interface AuthUser {
    id: string;
    name: string;
    email: string;
    role: 'SuperAdmin' | 'Admin' | 'FA' | 'Observer';
    phone?: string;
    stadiumId?: string;
    stadium?: { id: string; name: string };
    isActive: boolean;
    exportFormat?: 'xlsx' | 'pdf' | 'docx';
    exportPreferences?: ExportPreferences;
}

interface AuthState {
    user: AuthUser | null;
    isAuthenticated: boolean;
    isLoading: boolean;
    login: (email: string, password: string) => Promise<void>;
    logout: () => void;
    updateExportFormat: (format: 'xlsx' | 'pdf' | 'docx') => void;
    updateExportPreferences: (preferences: ExportPreferences) => void;
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
            logout: () => {
                localStorage.removeItem('accessToken');
                localStorage.removeItem('refreshToken');
                set({ user: null, isAuthenticated: false });
            },
            updateExportFormat: (format: 'xlsx' | 'pdf' | 'docx') => {
                set((state) => ({
                    user: state.user ? { ...state.user, exportFormat: format } : null,
                }));
            },
            updateExportPreferences: (preferences: ExportPreferences) => {
                set((state) => ({
                    user: state.user ? { ...state.user, exportPreferences: preferences } : null,
                }));
            },
        }),
        {
            name: 'auth-storage',
            partialize: (state) => ({ user: state.user, isAuthenticated: state.isAuthenticated }),
        }
    )
);
