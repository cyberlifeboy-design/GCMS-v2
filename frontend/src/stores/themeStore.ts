import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type Theme = 'light' | 'dark' | 'system';

interface ThemeState {
    theme: Theme;
    setTheme: (theme: Theme) => void;
    resolvedTheme: 'light' | 'dark';
}

// Helper to get system preference
const getSystemTheme = (): 'light' | 'dark' => {
    if (typeof window === 'undefined') return 'light';
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

// Helper to apply theme to DOM
const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    const resolved = theme === 'system' ? getSystemTheme() : theme;
    
    if (resolved === 'dark') {
        root.classList.add('dark');
    } else {
        root.classList.remove('dark');
    }
    
    return resolved;
};

export const useThemeStore = create<ThemeState>()(
    persist(
        (set, get) => ({
            theme: 'system',
            resolvedTheme: 'light',
            setTheme: (theme: Theme) => {
                const resolved = applyTheme(theme);
                set({ theme, resolvedTheme: resolved });
            },
        }),
        {
            name: 'theme-storage',
            onRehydrateStorage: () => (state) => {
                if (state) {
                    // Apply theme on rehydration
                    const resolved = applyTheme(state.theme);
                    state.resolvedTheme = resolved;
                }
            },
        }
    )
);

// Initialize theme on app load
if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('theme-storage');
    if (stored) {
        try {
            const parsed = JSON.parse(stored);
            if (parsed.state?.theme) {
                applyTheme(parsed.state.theme);
            }
        } catch {
            // Ignore parsing errors
        }
    }
    
    // Listen for system theme changes
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        const state = useThemeStore.getState();
        if (state.theme === 'system') {
            const resolved = applyTheme('system');
            useThemeStore.setState({ resolvedTheme: resolved });
        }
    });
}