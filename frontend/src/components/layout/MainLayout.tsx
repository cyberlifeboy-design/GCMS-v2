import { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { settingsApi } from '@/lib/api';
import { LayoutDashboard, Car, ArrowLeftRight, Wrench, Users, FileText, Settings, Menu, X, MapPin, Building2, UsersRound, Inbox, Calendar, Clock, Bell, UserCircle, Layers, ShieldAlert, UserPlus, LogOut } from 'lucide-react';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';
import { formatDate } from '@/lib/dateUtils';

function UserMenu() {
    const { user, logout } = useAuthStore();
    const [open, setOpen] = useState(false);
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onClick = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
        };
        document.addEventListener('mousedown', onClick);
        return () => document.removeEventListener('mousedown', onClick);
    }, [open]);

    if (!user) return null;
    const initials = user.name
        ? user.name.trim().split(/\s+/).slice(0, 2).map(n => n[0]).join('').toUpperCase()
        : '?';

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setOpen(o => !o)}
                className="flex items-center justify-center w-9 h-9 rounded-full bg-primary text-primary-foreground font-bold text-sm hover:opacity-90 transition-opacity"
                title={user.name}
            >
                {initials}
            </button>
            {open && (
                <div className="absolute right-0 mt-2 w-56 rounded-xl border bg-card shadow-lg z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
                    <div className="p-4 border-b">
                        <p className="font-medium truncate">{user.name}</p>
                        <div className="flex items-center gap-2 mt-1 flex-wrap">
                            <p className="text-xs text-muted-foreground">{user.role}</p>
                            {user.stadiumId && (
                                <p className="text-[10px] px-1 bg-muted rounded text-muted-foreground">Stadium ID: {user.stadiumId.slice(0, 8)}</p>
                            )}
                        </div>
                    </div>
                    <Link
                        to="/profile"
                        onClick={() => setOpen(false)}
                        className="flex items-center gap-2.5 px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-accent transition-colors"
                    >
                        <UserCircle className="w-4 h-4" /> Account Settings
                    </Link>
                    <button
                        onClick={logout}
                        className="flex items-center gap-2.5 w-full px-4 py-2.5 text-sm font-medium text-left text-destructive hover:bg-accent transition-colors"
                    >
                        <LogOut className="w-4 h-4" /> Logout
                    </button>
                </div>
            )}
        </div>
    );
}

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
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['SuperAdmin', 'Admin', 'Observer', 'FA', 'Contracts', 'MaintenanceTeam'], pageKey: null },
    { name: 'Fleet', href: '/fleet', icon: Car, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'fleet' },
    { name: 'Fleet Management', href: '/fleet-management', icon: UsersRound, roles: ['SuperAdmin', 'Admin', 'Contracts', 'MaintenanceTeam'], pageKey: 'fleet' },
    { name: 'Handover Management', href: '/handover', icon: ArrowLeftRight, roles: ['SuperAdmin', 'Admin', 'FA'], pageKey: 'handover' },
    { name: 'Bookings', href: '/bookings', icon: Layers, roles: ['SuperAdmin', 'Admin', 'FA', 'Observer'], pageKey: 'bookings' },
    { name: 'Usage History', href: '/usage-history', icon: Clock, roles: ['FA'], pageKey: null },
    { name: 'My Reports', href: '/my-reports', icon: FileText, roles: ['FA'], pageKey: null },
    { name: 'Maintenance', href: '/maintenance', icon: Wrench, roles: ['SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'], pageKey: 'maintenance' },
    { name: 'Requests', href: '/requests', icon: Inbox, roles: ['SuperAdmin', 'Admin', 'Observer'], pageKey: 'requests' },
    { name: 'Account Access', href: '/access-requests', icon: UserPlus, roles: ['SuperAdmin', 'Admin'], pageKey: 'access-requests' },
    { name: 'Incidents', href: '/incidents', icon: ShieldAlert, roles: ['SuperAdmin', 'Admin'], pageKey: 'incidents' },
    { name: 'Departments', href: '/departments', icon: Building2, roles: ['SuperAdmin', 'Admin'], pageKey: 'departments' },
    { name: 'Stadiums', href: '/stadiums', icon: MapPin, roles: ['SuperAdmin'], pageKey: 'stadiums' },
    { name: 'Reports', href: '/reports', icon: FileText, roles: ['SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam'], pageKey: 'reports' },
    { name: 'Notifications', href: '/notifications', icon: Bell, roles: ['SuperAdmin', 'Admin', 'Observer', 'Contracts', 'MaintenanceTeam', 'FA'], pageKey: 'notifications' },
    { name: 'Users', href: '/users', icon: Users, roles: ['SuperAdmin', 'Admin'], pageKey: 'users' },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['SuperAdmin', 'Admin'], pageKey: 'settings' },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
    const { user } = useAuthStore();
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
        // SuperAdmin, FA, Contracts, and MaintenanceTeam are never page-restricted
        if (user.role === 'SuperAdmin' || user.role === 'FA' || user.role === 'Contracts' || user.role === 'MaintenanceTeam') return true;
        // Dashboard and Account Settings are always accessible
        if (item.pageKey === null) return true;
        // If grantedPages is non-empty, restrict Admin/Observer to those pages only
        const granted = user.grantedPages;
        if (granted && (typeof granted === 'string' ? JSON.parse(granted).length > 0 : granted.length > 0)) {
            const grantedArray = typeof granted === 'string' ? JSON.parse(granted) : granted;
            return grantedArray.includes(item.pageKey);
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
                    <div className="relative bg-gradient-to-br from-primary via-primary to-primary/70 text-primary-foreground p-5">
                        <div className="flex items-center gap-3">
                            {branding.logoUrl ? (
                                <img
                                    src={branding.logoUrl}
                                    alt="Logo"
                                    className="w-12 h-12 object-contain flex-shrink-0 rounded bg-white/90 p-1"
                                />
                            ) : (
                                <div className="w-12 h-12 rounded bg-white/15 flex items-center justify-center flex-shrink-0">
                                    <Car className="w-6 h-6" />
                                </div>
                            )}
                            <div className="min-w-0">
                                <h1 className="text-sm font-bold leading-snug line-clamp-2">
                                    {branding.tournamentName || 'GCMS'}
                                </h1>
                                <p className="text-[11px] opacity-80 leading-tight truncate">Golf Cart Management System</p>
                            </div>
                        </div>
                        <button
                            className="lg:hidden absolute top-4 right-4 p-2 hover:bg-white/10 rounded-md"
                            onClick={() => setSidebarOpen(false)}
                        >
                            <X className="w-5 h-5" />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
                        {filteredNavItems.map((item) => {
                            const Icon = item.icon;
                            const isActive = location.pathname === item.href;
                            return (
                                <Link
                                    key={item.name}
                                    to={item.href}
                                    onClick={handleNavClick}
                                    className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'}`}
                                >
                                    <Icon className="w-5 h-5 flex-shrink-0" />
                                    {item.name}
                                </Link>
                            );
                        })}
                    </nav>

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
                            <UserMenu />
                        </div>
                    </header>

                    {/* Desktop top bar */}
                    <header className="hidden lg:flex items-center justify-between px-6 py-3 border-b bg-card">
                        <DateTimeDisplay />
                        <div className="flex items-center gap-2">
                            <NotificationCenter />
                            <UserMenu />
                        </div>
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