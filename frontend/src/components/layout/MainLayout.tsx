import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Car, ArrowLeftRight, Wrench, Users, FileText, Menu, X } from 'lucide-react';

const navItems = [
    { name: 'Dashboard', href: '/', icon: LayoutDashboard },
    { name: 'Fleet', href: '/fleet', icon: Car },
    { name: 'Handover', href: '/handover', icon: ArrowLeftRight },
    { name: 'Maintenance', href: '/maintenance', icon: Wrench },
    { name: 'Users', href: '/users', icon: Users },
    { name: 'Reports', href: '/reports', icon: FileText },
];

export function MainLayout({ children }: { children: React.ReactNode }) {
    const { user, logout } = useAuthStore();
    const location = useLocation();
    const [sidebarOpen, setSidebarOpen] = useState(false);

    const handleNavClick = () => {
        setSidebarOpen(false);
    };

    return (
        <div className="flex h-screen overflow-hidden">
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
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                onClick={handleNavClick}
                                className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
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
                        <p className="text-xs text-muted-foreground">{user?.role}</p>
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
                    <h1 className="text-lg font-semibold">GCMS</h1>
                    <div className="w-10" /> {/* Spacer for centering */}
                </header>

                {/* Page content */}
                <main className="flex-1 overflow-auto p-4 lg:p-6">
                    {children}
                </main>
            </div>
        </div>
    );
}