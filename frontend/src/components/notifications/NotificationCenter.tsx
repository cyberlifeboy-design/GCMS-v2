import { useState, useEffect, useRef } from 'react';
import { Bell, X, Check, CheckCheck, Wrench, ArrowRightLeft, Car, UserPlus, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { notificationsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';

interface Notification {
    id: string;
    type: string;
    title: string;
    message: string;
    entityType?: string;
    entityId?: string;
    isRead: boolean;
    createdAt: string;
}

interface NotificationResponse {
    data: Notification[];
    pagination: { page: number; limit: number; total: number; totalPages: number };
    unreadCount: number;
}

const typeIcons: Record<string, React.ReactNode> = {
    IssueReported: <Wrench className="w-4 h-4 text-red-500" />,
    CheckIn: <ArrowRightLeft className="w-4 h-4 text-green-500" />,
    CheckOut: <ArrowRightLeft className="w-4 h-4 text-blue-500" />,
    CarRequest: <Car className="w-4 h-4 text-purple-500" />,
    AssignmentChange: <UserPlus className="w-4 h-4 text-cyan-500" />,
    RequestApproved: <CheckCircle className="w-4 h-4 text-green-500" />,
    RequestRejected: <XCircle className="w-4 h-4 text-red-500" />,
};

const typeLinks: Record<string, string> = {
    IssueReported: '/maintenance',
    CheckIn: '/handover',
    CheckOut: '/handover',
    CarRequest: '/requests',
    AssignmentChange: '/fleet-management',
    RequestApproved: '/requests',
    RequestRejected: '/requests',
};

export function NotificationCenter() {
    const [isOpen, setIsOpen] = useState(false);
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        loadNotifications();
    }, []);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const loadNotifications = async (pageNum: number = 1) => {
        try {
            setLoading(true);
            const res = await notificationsApi.getAll({ page: pageNum, limit: 10 });
            const data: NotificationResponse = res.data;
            
            if (pageNum === 1) {
                setNotifications(data.data);
            } else {
                setNotifications(prev => [...prev, ...data.data]);
            }
            setUnreadCount(data.unreadCount);
            setTotalPages(data.pagination.totalPages);
            setPage(pageNum);
        } catch (err) {
            console.error('Failed to load notifications:', err);
        } finally {
            setLoading(false);
        }
    };

    const markAsRead = async (id: string) => {
        try {
            await notificationsApi.markAsRead(id);
            setNotifications(prev =>
                prev.map(n => n.id === id ? { ...n, isRead: true } : n)
            );
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch (err) {
            console.error('Failed to mark notification as read:', err);
        }
    };

    const markAllAsRead = async () => {
        try {
            await notificationsApi.markAllAsRead();
            setNotifications(prev => prev.map(n => ({ ...n, isRead: true })));
            setUnreadCount(0);
        } catch (err) {
            console.error('Failed to mark all as read:', err);
        }
    };

    const formatTime = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diffMs = now.getTime() - date.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMs / 3600000);
        const diffDays = Math.floor(diffMs / 86400000);

        if (diffMins < 1) return 'Just now';
        if (diffMins < 60) return `${diffMins}m ago`;
        if (diffHours < 24) return `${diffHours}h ago`;
        if (diffDays < 7) return `${diffDays}d ago`;
        return date.toLocaleDateString();
    };

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            markAsRead(notification.id);
        }
        // Navigate to relevant page
        const link = typeLinks[notification.type] || '/';
        window.location.href = link;
        setIsOpen(false);
    };

    const loadMore = () => {
        if (page < totalPages && !loading) {
            loadNotifications(page + 1);
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            {/* Bell Icon */}
            <button
                onClick={() => {
                    setIsOpen(!isOpen);
                    if (!isOpen && notifications.length === 0) {
                        loadNotifications();
                    }
                }}
                className="relative p-2 rounded-full hover:bg-accent transition-colors"
                title="Notifications"
            >
                <Bell className="w-5 h-5" />
                {unreadCount > 0 && (
                    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 flex items-center justify-center bg-red-500 text-white text-xs font-bold rounded-full">
                        {unreadCount > 99 ? '99+' : unreadCount}
                    </span>
                )}
            </button>

            {/* Dropdown Panel */}
            {isOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-card border rounded-lg shadow-xl z-50 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center justify-between p-3 border-b bg-muted/50">
                        <h3 className="font-semibold">Notifications</h3>
                        <div className="flex items-center gap-2">
                            {unreadCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={markAllAsRead}
                                    className="text-xs h-7 px-2"
                                >
                                    <CheckCheck className="w-3.5 h-3.5 mr-1" />
                                    Mark all read
                                </Button>
                            )}
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-1 hover:bg-accent rounded"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>

                    {/* Notification List */}
                    <div className="max-h-[400px] overflow-y-auto">
                        {loading && notifications.length === 0 ? (
                            <div className="flex items-center justify-center py-8">
                                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                            </div>
                        ) : notifications.length === 0 ? (
                            <div className="text-center py-8 text-muted-foreground">
                                <Bell className="w-8 h-8 mx-auto mb-2 opacity-50" />
                                <p className="text-sm">No notifications yet</p>
                            </div>
                        ) : (
                            <>
                                {notifications.map((notification) => (
                                    <div
                                        key={notification.id}
                                        onClick={() => handleNotificationClick(notification)}
                                        className={`flex gap-3 p-3 border-b cursor-pointer hover:bg-accent/50 transition-colors ${
                                            !notification.isRead ? 'bg-primary/5' : ''
                                        }`}
                                    >
                                        <div className="flex-shrink-0 mt-0.5">
                                            {typeIcons[notification.type] || <Bell className="w-4 h-4 text-gray-500" />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-start justify-between gap-2">
                                                <p className={`text-sm ${!notification.isRead ? 'font-medium' : ''}`}>
                                                    {notification.title}
                                                </p>
                                                {!notification.isRead && (
                                                    <span className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-1.5" />
                                                )}
                                            </div>
                                            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                                                {notification.message}
                                            </p>
                                            <p className="text-xs text-muted-foreground/70 mt-1">
                                                {formatTime(notification.createdAt)}
                                            </p>
                                        </div>
                                    </div>
                                ))}

                                {/* Load More Button */}
                                {page < totalPages && (
                                    <div className="p-2 text-center border-t">
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                loadMore();
                                            }}
                                            disabled={loading}
                                            className="w-full"
                                        >
                                            {loading ? (
                                                <Loader2 className="w-4 h-4 animate-spin" />
                                            ) : (
                                                'Load more'
                                            )}
                                        </Button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}