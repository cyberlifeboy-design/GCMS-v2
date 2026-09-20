import { create } from 'zustand';
import { settingsApi } from '@/lib/api';

interface SettingsState {
    timezone: string;
    tournamentName: string;
    enableTrainings: boolean;
    enablePolicies: boolean;
    allowDocumentDownloads: boolean;
    isLoading: boolean;
    fetchSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    timezone: 'UTC',
    tournamentName: 'GCMS',
    enableTrainings: true,
    enablePolicies: true,
    allowDocumentDownloads: true,
    isLoading: false,
    fetchSettings: async () => {
        set({ isLoading: true });
        try {
            const res = await settingsApi.get();
            const settings = res.data.data || res.data; // Handle both {data: settings} and settings
            set({
                timezone: settings.timezone || 'UTC',
                tournamentName: settings.tournamentName || 'GCMS',
                enableTrainings: settings.enableTrainings ?? true,
                enablePolicies: settings.enablePolicies ?? true,
                allowDocumentDownloads: settings.allowDocumentDownloads ?? true,
            });
        } catch (error) {
            console.error('Failed to fetch system settings:', error);
        } finally {
            set({ isLoading: false });
        }
    },
}));
