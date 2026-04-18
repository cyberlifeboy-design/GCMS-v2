import { create } from 'zustand';
import { settingsApi } from '@/lib/api';

interface SettingsState {
    timezone: string;
    tournamentName: string;
    isLoading: boolean;
    fetchSettings: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set) => ({
    timezone: 'UTC',
    tournamentName: 'GCMS',
    isLoading: false,
    fetchSettings: async () => {
        set({ isLoading: true });
        try {
            const res = await settingsApi.get();
            const settings = res.data.data || res.data; // Handle both {data: settings} and settings
            set({
                timezone: settings.timezone || 'UTC',
                tournamentName: settings.tournamentName || 'GCMS',
            });
        } catch (error) {
            console.error('Failed to fetch system settings:', error);
        } finally {
            set({ isLoading: false });
        }
    },
}));
