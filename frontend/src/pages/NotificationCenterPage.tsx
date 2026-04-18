import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { notificationsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Bell, CheckCheck, Wrench, ArrowRightLeft, Car, UserPlus, CheckCircle, XCircle, Loader2 } from 'lucide-react';
import { formatDate } from '@/lib/dateUtils';

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

const typeIcons: Record<string, React.ReactNode> = {
    IssueReported: <Wrench className="w-5 h-5 text-red-500" />,
    CheckIn: <ArrowRightLeft className="w-5 h-5 text-green-500" />,
    CheckOut: <ArrowRightLeft className="w-5 h-5 text-blue-500" />,
    CarRequest: <Car className="w-5 h-5 text-purple-500" />,
    AssignmentChange: <UserPlus className="w-5 h-5 text-cyan-500" />,
    RequestApproved: <CheckCircle className="w-5 h-5 text-green-500" />,
    RequestRejected: <XCircle className="w-5 h-5 text-red-500" />,
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



export function NotificationCenterPage() {
    const navigate = useNavigate();
    const [notifications, setNotifications] = useState<Notification[]>([]);
    const [loading, setLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [totalPages, setTotalPages] = useState(1);
    const [unreadCount, setUnreadCount] = useState(0);

    useEffect(() => {
        loadNotifications();
    }, []);

    const loadNotifications = async (pageNum: number = 1) => {
        try {
            setLoading(true);
            const res = await notificationsApi.getAll({ page: pageNum, limit: 20 });
            const data = res.data;

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
        return formatDate(dateStr);
    };

    const handleNotificationClick = (notification: Notification) => {
        if (!notification.isRead) {
            markAsRead(notification.id);
        }
        const link = typeLinks[notification.type];
        if (link) {
            navigate(link);
        }
    };

    const loadMore = () => {
        if (page < totalPages && !loading) {
            loadNotifications(page + 1);
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-3xl font-bold">Notification Center</h1>
                    <p className="text-muted-foreground mt-1">
                        {unreadCount > 0
                            ? `${unreadCount} unread notification${unreadCount !== 1 ? 's' : ''}`
                            : 'All caught up!'
                        }
                    </p>
                </div>
                {unreadCount > 0 && (
                    <Button variant="outline" onClick={markAllAsRead}>
                        <CheckCheck className="w-4 h-4 mr-2" />
                        Mark all as read
                    </Button>
                )}
            </div>

            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Bell className="w-5 h-5" />
                        All Notifications
                    </CardTitle>
                </CardHeader>
                <CardContent>
                    {loading && notifications.length === 0 ? (
                        <div className="flex items-center justify-center py-12">
                            <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
                        </div>
                    ) : notifications.length === 0 ? (
                        <div className="text-center py-12 text-muted-foreground">
                            <Bell className="w-12 h-12 mx-auto mb-4 opacity-50" />
                            <p className="text-lg font-medium">No notifications yet</p>
                            <p className="text-sm">When you receive notifications, they'll appear here.</p>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {notifications.map((notification) => (
                                <div
                                    key={notification.id}
                                    onClick={() => handleNotificationClick(notification)}
                                    className={`flex gap-4 p-4 rounded-lg cursor-pointer transition-colors ${!notification.isRead
                                        ? 'bg-primary/5 hover:bg-primary/10'
                                        : 'hover:bg-muted'
                                        }`}
                                >
                                    <div className="flex-shrink-0 mt-1">
                                        {typeIcons[notification.type] || <Bell className="w-5 h-5 text-gray-500" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className={`font-medium ${!notification.isRead ? '' : 'text-muted-foreground'}`}>
                                                {notification.title}
                                            </p>
                                            {!notification.isRead && (
                                                <span className="flex-shrink-0 w-2 h-2 bg-primary rounded-full mt-2" />
                                            )}
                                        </div>
                                        <p className="text-sm text-muted-foreground mt-1">
                                            {notification.message}
                                        </p>
                                        <p className="text-xs text-muted-foreground/70 mt-2">
                                            {formatTime(notification.createdAt)}
                                        </p>
                                    </div>
                                </div>
                            ))}

                            {page < totalPages && (
                                <div className="pt-4 text-center">
                                    <Button
                                        variant="outline"
                                        onClick={loadMore}
                                        disabled={loading}
                                    >
                                        {loading ? (
                                            <Loader2 className="w-4 h-4 animate-spin mr-2" />
                                        ) : null}
                                        Load more notifications
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}