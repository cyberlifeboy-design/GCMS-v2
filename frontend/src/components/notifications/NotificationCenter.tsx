import { useNavigate } from 'react-router-dom';
import { Bell } from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { useEffect, useState } from 'react';

export function NotificationCenter() {
    const navigate = useNavigate();
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        // Load unread count on mount
        loadUnreadCount();
    }, []);

    const loadUnreadCount = async () => {
        try {
            const res = await notificationsApi.getAll({ page: 1, limit: 1 });
            setUnreadCount(res.data.unreadCount);
        } catch (err) {
            console.error('Failed to load unread count:', err);
        }
    };

    const handleClick = () => {
        navigate('/notifications');
    };

    return (
        <button
            onClick={handleClick}
            className="relative p-2 rounded-full hover:bg-accent transition-colors"
            title="View all notifications"
        >
            <Bell className="w-5 h-5" />
            {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
                    {unreadCount > 99 ? '99+' : unreadCount}
                </span>
            )}
        </button>
    );
}