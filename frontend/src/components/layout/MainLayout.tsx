import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Car, ArrowLeftRight, Wrench, Users, FileText, Settings, Menu, X, MapPin, Building2, UsersRound, Inbox, Calendar, Clock, Bell, UserCircle } from 'lucide-react';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { formatDate } from '@/lib/dateUtils';

function DateTimeDisplay() {
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setCurrentDate(new Date());
        }, 10000); // Update every 10 seconds for better precision

        return () => clearInterval(timer);
    }, []);

    return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(currentDate)}</span>
            <span className="text-muted-foreground/50">|</span>
            <Clock className="w-4 h-4" />
            <span>{new Intl.DateTimeFormat('en-GB', {
                hour: '2-digit',
                minute: '2-digit',
                hour12: false,
                timeZone: useSettingsStore.getState().timezone || 'UTC',
            }).format(currentDate)}</span>
        </div>
    );
}

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['SuperAdmin', 'Admin', 'Observer', 'FA'], pageKey: null },
    { name: 'Fleet', href: '/fleet', icon: Car, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'fleet' },
    { name: 'Fleet Management', href: '/fleet-management', icon: UsersRound, roles: ['SuperAdmin', 'Admin'], pageKey: 'fleet' },
    { name: 'Handover Management', href: '/handover', icon: ArrowLeftRight, roles: ['SuperAdmin', 'Admin', 'FA'], pageKey: 'handover' },
    { name: 'Maintenance', href: '/maintenance', icon: Wrench, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'maintenance' },
    { name: 'Requests', href: '/requests', icon: Inbox, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'requests' },
    { name: 'Users', href: '/users', icon: Users, roles: ['SuperAdmin', 'Admin'], pageKey: 'users' },
    { name: 'Departments', href: '/departments', icon: Building2, roles: ['SuperAdmin', 'Admin'], pageKey: 'departments' },
    { name: 'Stadiums', href: '/stadiums', icon: MapPin, roles: ['SuperAdmin'], pageKey: 'stadiums' },
    { name: 'Reports', href: '/reports', icon: FileText, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'reports' },
    { name: 'Notifications', href: '/notifications', icon: Bell, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'notifications' },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['SuperAdmin', 'Admin'], pageKey: 'settings' },
    { name: 'Account Settings', href: '/profile', icon: UserCircle, roles: ['SuperAdmin', 'Admin', 'FA', 'Observer'], pageKey: null },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuthStore();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [branding, setBranding] = useState<{ tournamentName?: string; logoUrl?: string; headerUrl?: string; footerUrl?: string; footerText?: string }>({});

    const { fetchSettings } = useSettingsStore();

    useEffect(() => {
        const loadSettings = async () => {
            try {
                await fetchSettings();
                const res = await settingsApi.get();
                setBranding(res.data.data || {});
            } catch (e) {
                console.error('Failed to load branding', e);
            }
        };
        loadSettings();
    }, [fetchSettings]);

    const handleNavClick = () => {
        setSidebarOpen(false);
    };

    const filteredNavItems = navItems.filter(item => {
        if (!user || !item.roles.includes(user.role)) return false;
        // SuperAdmin and FA are never page-restricted
        if (user.role === 'SuperAdmin' || user.role === 'FA') return true;
        // Dashboard and Account Settings are always accessible
        if (item.pageKey === null) return true;
        // If grantedPages is non-empty, restrict Admin/Observer to those pages only
        const granted = user.grantedPages;
        if (granted && granted.length > 0) {
            return granted.includes(item.pageKey);
        }
        return true;
    });

    return (
        <div className="flex h-screen overflow-hidden flex-col">
            {/* Header Branding */}
            {branding.headerUrl && (
                <div className="w-full h-12 bg-muted overflow-hidden flex-shrink-0 border-b">
                    <img src={branding.headerUrl} alt="Header Branding" className="w-full h-full object-cover" />
                </div>
            )}

            <div className="flex flex-1 overflow-hidden">
                {/* Mobile overlay */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside className={`
                    fixed lg:static inset-y-0 left-0 z-50 w-64 bg-card border-r
                    transform transition-transform duration-300 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                    flex flex-col
                `}>
                    {/* Header with Tournament Name and Logo */}
                    <div className="p-4 border-b">
                        <div className="flex items-center gap-3">
                            <div className="min-w-0">
                                <h1 className="text-lg font-bold truncate">
                                    {branding.tournamentName || 'GCMS Fleet Management'}
                                </h1>
                            </div>
                            {branding.logoUrl && (
                                <img
                                    src={branding.logoUrl}
                                    alt="Logo"
                                    className="w-10 h-10 object-contain flex-shrink-0"
                                />
                            )}
                        </div>
                        <button
                            className="lg:hidden absolute top-4 right-4 p-2 hover:bg-accent rounded-md"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    onClick={handleNavClick}
                                    className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                                        }`}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

                    {/* User section */}
                    <div className="p-4 border-t">
                        <div className="mb-4">
                            <p className="font-medium truncate">{user?.name}</p>
                            <div className="flex items-center gap-2">
                                <p className="text-xs text-muted-foreground">{user?.role}</p>
                                {user?.stadiumId && (
                                    <p className="text-[10px] px-1 bg-muted rounded text-muted-foreground">Stadium ID: {user.stadiumId.slice(0, 8)}</p>
                                )}
                            </div>
                        </div>
                        <Button onClick={logout} variant="outline" className="w-full">
                            Logout
                        </Button>
                    </div>
                </aside>

                {/* Main content area */}
                <div className="flex-1 flex flex-col overflow-hidden">
                    {/* Mobile header */}
                    <header className="lg:hidden flex items-center justify-between p-4 border-b bg-card">
                        <button
                            className="p-2 hover:bg-accent rounded-md"
                            onClick={() => setSidebarOpen(true)}
                        >
                            <Menu className="w-6 h-6" />
                        </button>
                        <div className="flex items-center gap-2">
                            <h1 className="text-lg font-semibold">{branding.tournamentName || 'GCMS Fleet Management'}</h1>
                            {branding.logoUrl && (
                                <img
                                    src={branding.logoUrl}
                                    alt="Logo"
                                    className="w-6 h-6 object-contain"
                                />
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <DateTimeDisplay />
                            <NotificationCenter />
                        </div>
                    </header>

                    {/* Desktop top bar */}
                    <header className="hidden lg:flex items-center justify-between px-6 py-3 border-b bg-card">
                        <DateTimeDisplay />
                        <NotificationCenter />
                    </header>

                    {/* Page content */}
                    <main className="flex-1 overflow-auto p-4 lg:p-6 flex flex-col">
                        <div className="flex-1">
                            {children}
                        </div>

                        {/* Footer Branding */}
                        {(branding.footerUrl || branding.footerText) && (
                            <div className="mt-8 pt-4 border-t w-full text-center">
                                {branding.footerUrl && (
                                    <img src={branding.footerUrl} alt="Footer Branding" className="max-h-16 w-auto mx-auto object-contain" />
                                )}
                                {branding.footerText && (
                                    <p className="text-sm text-muted-foreground mt-2">{branding.footerText}</p>
                                )}
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}