import { useState, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Car, ArrowLeftRight, Wrench, Users, FileText, Settings, Menu, X, MapPin, Building2 } from 'lucide-react';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard, roles: ['SuperAdmin', 'Admin', 'Observer'] },
    { name: 'Fleet', href: '/fleet', icon: Car, roles: ['SuperAdmin', 'Admin', 'Observer'] },
    { name: 'Handover', href: '/handover', icon: ArrowLeftRight, roles: ['SuperAdmin', 'Admin', 'FA'] },
    { name: 'Maintenance', href: '/maintenance', icon: Wrench, roles: ['SuperAdmin', 'Admin', 'FA', 'Observer'] },
    { name: 'Users', href: '/users', icon: Users, roles: ['SuperAdmin', 'Admin'] },
    { name: 'Departments', href: '/departments', icon: Building2, roles: ['SuperAdmin', 'Admin'] },
    { name: 'Stadiums', href: '/stadiums', icon: MapPin, roles: ['SuperAdmin'] },
    { name: 'Reports', href: '/reports', icon: FileText, roles: ['SuperAdmin', 'Admin', 'Observer'] },
    { name: 'Settings', href: '/settings', icon: Settings, roles: ['SuperAdmin'] },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuthStore();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [branding, setBranding] = useState<{ tournamentName?: string; headerUrl?: string; footerUrl?: string }>({});

    useEffect(() => {
        const loadBranding = async () => {
            try {
                const res = await settingsApi.get();
                setBranding(res.data);
            } catch (e) {
                console.error('Failed to load branding', e);
            }
        };
        loadBranding();
    }, []);

    const handleNavClick = () => {
        setSidebarOpen(false);
    };

    const filteredNavItems = navItems.filter(item =>
        user && item.roles.includes(user.role)
    );

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
                    {/* Header */}
                    <div className="p-6 border-b flex items-center justify-between">
                        <div>
                            <h1 className="text-2xl font-bold">GCMS</h1>
                            <p className="text-sm text-muted-foreground">Fleet Management</p>
                        </div>
                        <button
                            className="lg:hidden p-2 hover:bg-accent rounded-md"
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
                        <h1 className="text-lg font-semibold">{branding.tournamentName || 'GCMS'}</h1>
                        <div className="w-10" /> {/* Spacer for centering */}
                    </header>

                    {/* Page content */}
                    <main className="flex-1 overflow-auto p-4 lg:p-6 flex flex-col">
                        <div className="flex-1">
                            {children}
                        </div>

                        {/* Footer Branding */}
                        {branding.footerUrl && (
                            <div className="mt-8 pt-4 border-t w-full">
                                <img src={branding.footerUrl} alt="Footer Branding" className="max-h-16 w-auto mx-auto object-contain" />
                            </div>
                        )}
                    </main>
                </div>
            </div>
        </div>
    );
}