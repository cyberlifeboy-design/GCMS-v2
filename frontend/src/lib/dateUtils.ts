import { useSettingsStore } from '@/stores/settingsStore';

/**
 * Format a date string or object according to the system timezone.
 */
export const formatDate = (date: string | Date | null | undefined): string => {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const { timezone } = useSettingsStore.getState();

    try {
        return new Intl.DateTimeFormat('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            timeZone: timezone || 'UTC',
        }).format(dateObj);
    } catch (error) {
        console.error('Error formatting date:', error);
        return dateObj.toLocaleDateString();
    }
};

/**
 * Format a date and time string or object according to the system timezone.
 */
export const formatDateTime = (date: string | Date | null | undefined): string => {
    if (!date) return '—';
    const dateObj = typeof date === 'string' ? new Date(date) : date;
    const { timezone } = useSettingsStore.getState();

    try {
        return new Intl.DateTimeFormat('en-GB', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
            timeZone: timezone || 'UTC',
        }).format(dateObj);
    } catch (error) {
        console.error('Error formatting date time:', error);
        return dateObj.toLocaleString();
    }
};
