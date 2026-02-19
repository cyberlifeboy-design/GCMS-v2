import { Link, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';
import { Button } from '@/components/ui/button';
import { LayoutDashboard, Car, ArrowLeftRight, Wrench, Users, FileText } from 'lucide-react';

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
    

    return (
        <div className="flex h-screen">
            <aside className="w-64 bg-card border-r flex flex-col">
                <div className="p-6 border-b">
                    <h1 className="text-2xl font-bold">GCMS</h1>
                    <p className="text-sm text-muted-foreground">Fleet Management</p>
                </div>
                <nav className="flex-1 p-4 space-y-1">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive = location.pathname === item.href;
                        return (
                            <Link
                                key={item.name}
                                to={item.href}
                                className={`flex items-center gap-3 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                                    isActive ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-accent'
                                }`}
                            >
                                <Icon className="w-5 h-5" />
                                {item.name}
                            </Link>
                        );
                    })}
                </nav>
                <div className="p-4 border-t">
                    <div className="mb-4">
                        <p className="font-medium">{user?.name}</p>
                        <p className="text-xs text-muted-foreground">{user?.role}</p>
                    </div>
                    <Button onClick={logout} variant="outline" className="w-full">
                        Logout
                    </Button>
                </div>
            </aside>
            <main className="flex-1 overflow-auto p-6">
                {children}
            </main>
        </div>
    );
}
