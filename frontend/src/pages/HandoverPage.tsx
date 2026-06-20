import { useState, useEffect } from 'react';
import { handoverApi, fleetApi, maintenanceApi, notificationsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { LogOut, LogIn, History, Loader2, AlertTriangle, Car, FileSignature, CheckCircle2, RotateCcw, ClipboardList, Lock, UserPlus, Trash2, Plus, Phone, Hash, Bell, Wrench, Clock } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { formatDateTime } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { publicSettingsApi } from '@/lib/api';
import { Separator } from '@/components/ui/separator';
import { Pagination } from '@/components/shared/Pagination';
import { HandoverFormModal } from '@/components/handover/HandoverFormModal';

interface HandoverLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string; stadium?: { name: string } };
    userId: string;
    user?: { id: string; name: string; email?: string; role?: string };
    action: string;
    createdAt: string;
    conditionNotes?: string;
    issueDescription?: string;
}

interface UserAssignedCart {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    stadiumId: string;
    stadiumName: string;
    departmentId?: string;
    departmentName?: string;
    handoverSigned: boolean;
    handoverSignedAt: string | null;
    handoverFormStatus: string | null;  // PENDING | ADMIN_SIGNED | COMPLETE | null
    handoverFormId: string | null;
}

interface PendingHandoverCart {
    id: string; carNumber: string; carType: string; status: string;
    stadium: { name: string; code: string };
    department?: { name: string; code: string } | null;
    assignedUser?: { name: string; email: string; phone?: string } | null;
}

interface HandoverFormRecord {
    id: string; fleetId: string; status: string;
    fleet: PendingHandoverCart;
    adminSignedByUser?: { name: string } | null;
    userSignedByUser?: { name: string } | null;
    updatedAt: string;
}

interface PoolStatusStadium {
    stadiumId: string;
    stadiumName: string;
    stadiumCode: string;
    total: number;
    available: number;
    assigned: number;
    active: number;
    dispatched: number;
    returned: number;
    handbackPending: number;
    underMaintenance: number;
    carTypeBreakdown?: Record<string, number>;
}

interface RecentActivity {
    id: string;
    action: string;
    carNumber: string;
    userName: string;
    timestamp: string;
    stadiumName: string;
}

interface PoolDashboard {
    stadiums: PoolStatusStadium[];
    userAssignedCarts?: UserAssignedCart[];
    recentActivity: RecentActivity[];
}

const actionColors: Record<string, string> = {
    'HandoverSigned': 'bg-purple-500 text-white',
    'CheckedIn': 'bg-blue-500 text-white',
    'CheckedOut': 'bg-amber-500 text-white',
    'HandbackRequested': 'bg-indigo-500 text-white',
    'HandbackAccepted': 'bg-green-500 text-white',
    'IssueReported': 'bg-red-500 text-white',
};

const actionLabels: Record<string, string> = {
    'HandoverSigned': 'Signed',
    'CheckedIn': 'Check-In',
    'CheckedOut': 'Check-Out',
    'HandbackRequested': 'Handback Req.',
    'HandbackAccepted': 'Released',
    'IssueReported': 'Issue',
};

const statusColors: Record<string, string> = {
    'Available': 'bg-green-100 text-green-800 border-green-200',
    'Assigned': 'bg-blue-100 text-blue-800 border-blue-200',
    'Active': 'bg-purple-100 text-purple-800 border-purple-200',
    'Dispatched': 'bg-amber-100 text-amber-800 border-amber-200',
    'Returned': 'bg-indigo-100 text-indigo-800 border-indigo-200',
    'HandbackPending': 'bg-slate-100 text-slate-800 border-slate-200',
    'Under Maintenance': 'bg-red-100 text-red-800 border-red-200',
    'Retired': 'bg-gray-100 text-gray-800 border-gray-200',
};

export function HandoverPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isFA = role === 'FA';
    const isAdmin = role === 'Admin' || role === 'SuperAdmin';

    const [activeTab, setActiveTab] = useState(isFA ? 'fa-history' : 'pending');
    const [poolDashboard, setPoolDashboard] = useState<PoolDashboard | null>(null);
    const [poolLoading, setPoolLoading] = useState(true);
    const [history, setHistory] = useState<HandoverLog[]>([]);
    const [histLoading, setHistLoading] = useState(true);
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('all');
    const [stadiumFilter, setStadiumFilter] = useState('all');

    const [submitting, setSubmitting] = useState(false);
    const [signingCart, setSigningCart] = useState<UserAssignedCart | null>(null);
    const [checkoutOpen, setCheckoutOpen] = useState(false);

    // Handover Form Modal
    const [formModal, setFormModal] = useState<{ open: boolean; fleetId: string; mode: 'admin' | 'user' | 'view' } | null>(null);
    const [pendingHandovers, setPendingHandovers] = useState<{ formsInProgress: HandoverFormRecord[]; cartsWithoutForm: PendingHandoverCart[] } | null>(null);
    const [pendingLoading, setPendingLoading] = useState(false);
    const [systemLogoUrl, setSystemLogoUrl] = useState<string | null>(null);

    // FA-specific: my reports + notifications
    const [myReports, setMyReports] = useState<any[]>([]);
    const [reportsLoading, setReportsLoading] = useState(false);
    const [notifications, setNotifications] = useState<any[]>([]);
    const [notifsLoading, setNotifsLoading] = useState(false);
    const [unreadCount, setUnreadCount] = useState(0);

    // Additional drivers modal
    const [driversModal, setDriversModal] = useState<{ open: boolean; fleetId: string; carNumber: string } | null>(null);
    const [driversList, setDriversList] = useState<Array<{ name: string; phone: string; accreditationNumber: string }>>([]);
    const [driversLoading, setDriversLoading] = useState(false);
    const [driversSaving, setDriversSaving] = useState(false);
    const EMPTY_DRIVER = { name: '', phone: '', accreditationNumber: '' };
    const [selectedCart, setSelectedCart] = useState<UserAssignedCart | null>(null);
    const [checkoutForm, setCheckoutForm] = useState({ conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] as File[] });

    const loadPendingHandovers = async () => {
        if (!isAdmin) return;
        try {
            setPendingLoading(true);
            const res = await handoverApi.getPendingHandovers();
            setPendingHandovers(res.data);
        } catch {
            console.error('Failed to load pending handovers');
        } finally {
            setPendingLoading(false);
        }
    };

    const loadPoolDashboard = async () => {
        try {
            setPoolLoading(true);
            const res = await handoverApi.getPoolDashboard();
            setPoolDashboard(res.data);
        } catch (e) {
            toast.error('Failed to load dashboard');
        } finally {
            setPoolLoading(false);
        }
    };

    const loadHistory = async () => {
        try {
            setHistLoading(true);
            const params = {
                ...(actionFilter !== 'all' && { action: actionFilter }),
                ...(stadiumFilter !== 'all' && { stadiumId: stadiumFilter }),
                page,
                limit: pagination.limit
            };
            const res = await handoverApi.getHistory(params);
            setHistory(res.data.data || []);
            setPagination(prev => ({ ...prev, ...res.data.pagination }));
        } catch (e) {
            console.error(e);
        } finally {
            setHistLoading(false);
        }
    };

    const loadMyReports = async () => {
        if (!isFA) return;
        setReportsLoading(true);
        try {
            const res = await maintenanceApi.getAll({ limit: 100 } as any);
            setMyReports(res.data.data || []);
        } catch { /* silent */ }
        finally { setReportsLoading(false); }
    };

    const loadNotifications = async () => {
        if (!isFA) return;
        setNotifsLoading(true);
        try {
            const res = await notificationsApi.getAll({ limit: 50 });
            setNotifications(res.data.data || []);
            setUnreadCount((res.data.data || []).filter((n: any) => !n.isRead).length);
        } catch { /* silent */ }
        finally { setNotifsLoading(false); }
    };

    const markNotifRead = async (id: string) => {
        try {
            await notificationsApi.markAsRead(id);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, isRead: true } : n));
            setUnreadCount(prev => Math.max(0, prev - 1));
        } catch { /* silent */ }
    };

    const openDriversModal = async (fleetId: string, carNumber: string) => {
        setDriversModal({ open: true, fleetId, carNumber });
        setDriversLoading(true);
        try {
            const res = await fleetApi.getDrivers(fleetId);
            setDriversList(res.data.additionalDrivers || []);
        } catch { setDriversList([]); }
        finally { setDriversLoading(false); }
    };

    const saveDrivers = async () => {
        if (!driversModal) return;
        setDriversSaving(true);
        try {
            await fleetApi.updateDrivers(driversModal.fleetId, driversList);
            toast.success('Drivers list saved');
            setDriversModal(null);
        } catch (e: any) {
            toast.error(e.response?.data?.error || 'Failed to save drivers');
        } finally { setDriversSaving(false); }
    };

    useEffect(() => {
        loadPoolDashboard();
        if (isAdmin) loadPendingHandovers();
        if (isFA) { loadMyReports(); loadNotifications(); }
        publicSettingsApi.getBranding().then(res => {
            if (res.data?.logoUrl) setSystemLogoUrl(res.data.logoUrl);
        }).catch(() => {});
    }, []);

    useEffect(() => {
        loadHistory();
    }, [page, actionFilter, stadiumFilter]);

    const handleSignHandover = async () => {
        if (!signingCart) return;
        setSubmitting(true);
        try {
            await handoverApi.signHandover(signingCart.id);
            toast.success('Handover form signed successfully. Cart is now active.');
            setSigningCart(null);
            loadPoolDashboard();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Signing failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckIn = async (fleetId: string) => {
        setSubmitting(true);
        try {
            await handoverApi.checkIn({ fleetId });
            toast.success('Check-in successful. Usage started.');
            loadPoolDashboard();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Check-in failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckOut = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedCart) return;
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('fleetId', selectedCart.id);
            fd.append('conditionNotes', checkoutForm.conditionNotes);
            fd.append('hasIssue', String(checkoutForm.hasIssue));
            if (checkoutForm.hasIssue) fd.append('issueDescription', checkoutForm.issueDescription);
            checkoutForm.photos.forEach(p => fd.append('photos', p));

            await handoverApi.checkOut(fd);
            toast.success('Check-out successful. Usage ended.');
            setCheckoutOpen(false);
            setSelectedCart(null);
            setCheckoutForm({ conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] });
            loadPoolDashboard();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleRequestHandback = async (fleetId: string) => {
        setSubmitting(true);
        try {
            await handoverApi.requestHandback(fleetId);
            toast.success('Handback requested. Please return keys to Admin.');
            loadPoolDashboard();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Request failed');
        } finally {
            setSubmitting(false);
        }
    };

    const filteredActivity = poolDashboard?.recentActivity.filter(a => 
        a.carNumber.toLowerCase().includes(search.toLowerCase()) ||
        a.userName.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="container mx-auto py-6 max-w-7xl space-y-8 animate-in fade-in duration-500">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-4xl font-extrabold tracking-tight">Handover Cycle</h1>
                    <p className="text-muted-foreground mt-1 text-lg">Manage car assignments, usage, and returns.</p>
                </div>
                {isAdmin && (
                    <div className="flex items-center gap-2 bg-muted/50 p-1.5 rounded-xl border border-muted-foreground/10">
                        <span className="text-xs font-bold px-3 text-muted-foreground uppercase tracking-widest">Venue Filter:</span>
                        <Select value={stadiumFilter} onValueChange={setStadiumFilter}>
                            <SelectTrigger className="w-[180px] bg-background border-none shadow-none h-9"><SelectValue /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Venues</SelectItem>
                                {poolDashboard?.stadiums.map(s => <SelectItem key={s.stadiumId} value={s.stadiumId}>{s.stadiumName}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                )}
            </div>

            {/* FA SECTION: USER'S CARS */}
            {isFA && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><Car className="text-primary w-6 h-6" /> Your Assigned Fleet</h2>
                    {poolLoading ? (
                         <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                            {[1,2,3].map(i => <Card key={i} className="h-48 animate-pulse bg-muted/20" />)}
                         </div>
                    ) : poolDashboard?.userAssignedCarts && poolDashboard.userAssignedCarts.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {poolDashboard.userAssignedCarts.map(cart => {
                                const handoverComplete = cart.handoverSigned && cart.handoverFormStatus === 'COMPLETE';
                                const awaitingAdminSign = !cart.handoverFormStatus || cart.handoverFormStatus === 'PENDING';
                                const readyForUserSign = cart.handoverFormStatus === 'ADMIN_SIGNED';
                                return (
                                <Card key={cart.id} className={`overflow-hidden border-2 transition-all ${handoverComplete ? 'hover:shadow-lg border-muted/50' : 'border-amber-300 opacity-80'}`}>
                                    <div className={`h-2 w-full ${statusColors[cart.status]?.split(' ')[0] ?? 'bg-muted'}`} />
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className={`text-2xl font-black ${!handoverComplete ? 'text-muted-foreground' : ''}`}>{cart.carNumber}</CardTitle>
                                                <CardDescription className="font-medium">{cart.carType} · {cart.stadiumName}</CardDescription>
                                            </div>
                                            <div className="flex flex-col items-end gap-1">
                                                <Badge className={`${statusColors[cart.status]} border shadow-none px-3 py-1 text-[10px] font-bold uppercase tracking-wider`}>
                                                    {cart.status}
                                                </Badge>
                                                {!handoverComplete && (
                                                    <Badge variant="outline" className="text-amber-700 border-amber-400 text-[9px] px-2">
                                                        <Lock className="w-2.5 h-2.5 mr-1" /> Handover Pending
                                                    </Badge>
                                                )}
                                            </div>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-3">
                                        {!handoverComplete && (
                                            <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-800 text-xs space-y-1">
                                                <p className="font-bold flex items-center gap-1"><Lock className="w-3 h-3" /> Cart locked until handover form is signed</p>
                                                {awaitingAdminSign && <p>Waiting for Admin to create &amp; sign the handover form</p>}
                                                {readyForUserSign && <p className="text-purple-700 font-semibold">Admin signed ✓ — your signature required</p>}
                                                <p className="text-[10px] opacity-70">You cannot check-in, add drivers, or report issues until both parties sign</p>
                                            </div>
                                        )}
                                        {handoverComplete && (
                                            <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-green-50 border border-green-200">
                                                <div className="flex justify-between text-xs">
                                                    <span className="text-green-700 font-bold flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Handover Signed</span>
                                                    {cart.handoverSignedAt && <span className="text-muted-foreground text-[10px]">{formatDateTime(cart.handoverSignedAt)}</span>}
                                                </div>
                                            </div>
                                        )}
                                    </CardContent>
                                    <CardFooter className="bg-muted/10 border-t p-4 flex flex-col gap-2">
                                        {readyForUserSign ? (
                                            <Button className="w-full bg-purple-600 hover:bg-purple-700 h-11 rounded-xl font-bold" onClick={() => setFormModal({ open: true, fleetId: cart.id, mode: 'user' })}>
                                                <FileSignature className="w-4 h-4 mr-2" /> Sign Handover Form
                                            </Button>
                                        ) : awaitingAdminSign ? (
                                            <Button variant="outline" className="w-full h-11 rounded-xl font-bold opacity-60" disabled>
                                                <Lock className="w-4 h-4 mr-2" /> Awaiting Admin Signature
                                            </Button>
                                        ) : handoverComplete && cart.status === 'Active' ? (
                                            <Button className="w-full bg-blue-600 hover:bg-blue-700 h-11 rounded-xl font-bold" onClick={() => handleCheckIn(cart.id)} disabled={submitting}>
                                                <LogIn className="w-4 h-4 mr-2" /> Start Usage (Check-In)
                                            </Button>
                                        ) : handoverComplete && cart.status === 'Dispatched' ? (
                                            <Button className="w-full bg-amber-600 hover:bg-amber-700 h-11 rounded-xl font-bold text-white" onClick={() => { setSelectedCart(cart); setCheckoutOpen(true); }}>
                                                <LogOut className="w-4 h-4 mr-2" /> Finish Usage (Check-Out)
                                            </Button>
                                        ) : handoverComplete && cart.status === 'Returned' ? (
                                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 rounded-xl font-bold" onClick={() => handleRequestHandback(cart.id)} disabled={submitting}>
                                                <RotateCcw className="w-4 h-4 mr-2" /> Handback to Admin
                                            </Button>
                                        ) : (
                                            <Button variant="secondary" className="w-full h-11 rounded-xl font-bold opacity-50 cursor-not-allowed" disabled>
                                                Waiting for Admin
                                            </Button>
                                        )}
                                        {cart.handoverFormStatus && (
                                            <Button variant="ghost" size="sm" className="w-full text-xs opacity-60" onClick={() => setFormModal({ open: true, fleetId: cart.id, mode: 'view' })}>
                                                <ClipboardList className="w-3 h-3 mr-1" /> View Handover Form
                                            </Button>
                                        )}
                                        {handoverComplete && (
                                            <Button variant="outline" size="sm" className="w-full text-xs border-blue-200 text-blue-700 hover:bg-blue-50" onClick={() => openDriversModal(cart.id, cart.carNumber)}>
                                                <UserPlus className="w-3 h-3 mr-1" /> Manage Additional Drivers
                                            </Button>
                                        )}
                                    </CardFooter>
                                </Card>
                                );
                            })}
                        </div>
                    ) : (
                        <Card className="border-dashed border-2 bg-muted/5 p-12 text-center">
                            <Car className="w-12 h-12 mx-auto text-muted-foreground/30 mb-4" />
                            <h3 className="text-xl font-bold text-muted-foreground">No assigned cars found</h3>
                            <p className="text-muted-foreground/60 text-sm max-w-xs mx-auto mt-2">Carts assigned to you by venue administrators will appear here.</p>
                        </Card>
                    )}
                </div>
            )}

            {/* ADMIN SECTION: HANDBACK MANAGEMENT */}
            {isAdmin && (
                <div className="space-y-6">
                    <h2 className="text-2xl font-bold flex items-center gap-2"><History className="text-primary w-6 h-6" /> Releases & Returns</h2>
                    <Card className="border-none shadow-md overflow-hidden">
                         <CardHeader className="bg-muted/10">
                            <CardTitle className="text-lg">Handback Requests</CardTitle>
                            <CardDescription>Carts that users have finished using and are ready to be returned to the general fleet.</CardDescription>
                         </CardHeader>
                         <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>Current Status</TableHead>
                                        <TableHead>Venue</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {poolLoading ? (
                                        <TableRow><TableCell colSpan={4} className="text-center py-8"><Loader2 className="w-6 h-6 animate-spin mx-auto" /></TableCell></TableRow>
                                    ) : !poolDashboard?.stadiums ? (
                                        <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">Error loading data</TableCell></TableRow>
                                    ) : (
                                        <TableRow>
                                            <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle2 className="w-8 h-8 opacity-20" />
                                                    <p className="font-medium italic">Use the 'Venue Status' tab below to release carts by venue.</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                         </CardContent>
                    </Card>
                </div>
            )}

            {/* TABS: Admin gets operational views, FA gets personal history/reports/notifications */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
                <TabsList className="bg-muted/50 p-1 rounded-xl flex-wrap">
                    {/* ── Admin tabs ── */}
                    {isAdmin && <>
                        <TabsTrigger value="pending" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <ClipboardList className="w-3 h-3 mr-1" /> Pending Handovers
                            {pendingHandovers && (pendingHandovers.formsInProgress.length + pendingHandovers.cartsWithoutForm.length) > 0 && (
                                <span className="ml-1.5 bg-amber-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5">{pendingHandovers.formsInProgress.length + pendingHandovers.cartsWithoutForm.length}</span>
                            )}
                        </TabsTrigger>
                        <TabsTrigger value="activity" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Real-time Stream</TabsTrigger>
                        <TabsTrigger value="history" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Global Audit</TabsTrigger>
                        <TabsTrigger value="venues" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Venue Status</TabsTrigger>
                    </>}
                    {/* ── FA-only tabs ── */}
                    {isFA && <>
                        <TabsTrigger value="fa-history" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Clock className="w-3 h-3 mr-1" /> Usage History
                        </TabsTrigger>
                        <TabsTrigger value="fa-reports" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Wrench className="w-3 h-3 mr-1" /> My Reports
                        </TabsTrigger>
                        <TabsTrigger value="fa-notifications" className="rounded-lg px-5 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">
                            <Bell className="w-3 h-3 mr-1" /> Notifications
                            {unreadCount > 0 && <span className="ml-1.5 bg-red-500 text-white text-[9px] font-black rounded-full px-1.5 py-0.5">{unreadCount}</span>}
                        </TabsTrigger>
                    </>}
                </TabsList>

                {/* ── Pending Handovers (Admin) ── */}
                {isAdmin && (
                <TabsContent value="pending" className="space-y-6">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-amber-50 border-b">
                            <CardTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-amber-600" /> Carts Awaiting Handover Form</CardTitle>
                            <CardDescription>Assigned carts that need a handover form to be created and/or signed before the user can operate them.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {pendingLoading ? (
                                <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                            ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>Type</TableHead>
                                        <TableHead>Assigned To</TableHead>
                                        <TableHead>Venue</TableHead>
                                        <TableHead>Form Status</TableHead>
                                        <TableHead className="text-right">Action</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {/* Carts without any form */}
                                    {pendingHandovers?.cartsWithoutForm.map(cart => (
                                        <TableRow key={cart.id} className="bg-red-50/30">
                                            <TableCell className="font-black font-mono text-primary">{cart.carNumber}</TableCell>
                                            <TableCell className="text-sm">{cart.carType}</TableCell>
                                            <TableCell>
                                                <div className="text-sm font-medium">{cart.assignedUser?.name ?? '—'}</div>
                                                <div className="text-[10px] text-muted-foreground">{cart.assignedUser?.email}</div>
                                            </TableCell>
                                            <TableCell><Badge variant="outline" className="font-mono text-xs">{cart.stadium.code}</Badge></TableCell>
                                            <TableCell><Badge className="bg-red-100 text-red-800 border-red-200 text-[9px]">No Form Created</Badge></TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" className="bg-red-900 hover:bg-red-800 text-white"
                                                    onClick={() => setFormModal({ open: true, fleetId: cart.id, mode: 'admin' })}>
                                                    <FileSignature className="w-3 h-3 mr-1" /> Create &amp; Sign Form
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {/* Forms in progress */}
                                    {pendingHandovers?.formsInProgress.map(record => (
                                        <TableRow key={record.id}>
                                            <TableCell className="font-black font-mono text-primary">{record.fleet.carNumber}</TableCell>
                                            <TableCell className="text-sm">{record.fleet.carType}</TableCell>
                                            <TableCell>
                                                <div className="text-sm font-medium">{record.fleet.assignedUser?.name ?? '—'}</div>
                                                <div className="text-[10px] text-muted-foreground">{record.fleet.assignedUser?.email}</div>
                                            </TableCell>
                                            <TableCell><Badge variant="outline" className="font-mono text-xs">{record.fleet.stadium.code}</Badge></TableCell>
                                            <TableCell>
                                                {record.status === 'PENDING' && <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[9px]">Admin Signature Needed</Badge>}
                                                {record.status === 'ADMIN_SIGNED' && <Badge className="bg-blue-100 text-blue-800 border-blue-200 text-[9px]">Awaiting User Signature</Badge>}
                                            </TableCell>
                                            <TableCell className="text-right">
                                                <Button size="sm" variant="outline"
                                                    onClick={() => setFormModal({ open: true, fleetId: record.fleetId, mode: record.status === 'PENDING' ? 'admin' : 'view' })}>
                                                    <ClipboardList className="w-3 h-3 mr-1" />
                                                    {record.status === 'PENDING' ? 'Sign Form' : 'View Form'}
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                    {!pendingLoading && !pendingHandovers?.cartsWithoutForm.length && !pendingHandovers?.formsInProgress.length && (
                                        <TableRow>
                                            <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                                                <div className="flex flex-col items-center gap-2">
                                                    <CheckCircle2 className="w-8 h-8 opacity-20" />
                                                    <p className="font-medium">All assigned carts have completed handover forms</p>
                                                </div>
                                            </TableCell>
                                        </TableRow>
                                    )}
                                </TableBody>
                            </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                )}

                <TabsContent value="activity">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-6 border-b bg-muted/5">
                            <div>
                                <CardTitle className="text-lg">System-wide Activity</CardTitle>
                                <CardDescription>Last 50 actions performed across the platform.</CardDescription>
                            </div>
                            <div className="relative w-64">
                                <Input 
                                    placeholder="Filter activity..." 
                                    value={search} 
                                    onChange={e => setSearch(e.target.value)}
                                    className="rounded-lg h-9"
                                />
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow className="hover:bg-transparent">
                                        <TableHead className="w-[100px]">Cart #</TableHead>
                                        <TableHead>Event</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Venue</TableHead>
                                        <TableHead className="text-right">Timestamp</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {poolLoading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin mx-auto text-muted-foreground/30" /></TableCell></TableRow>
                                    ) : !filteredActivity || filteredActivity.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground italic">No activity matching criteria</TableCell></TableRow>
                                    ) : filteredActivity.slice(0, 15).map(a => (
                                        <TableRow key={a.id} className="group hover:bg-muted/5 border-muted/50">
                                            <TableCell className="font-black text-primary font-mono">{a.carNumber}</TableCell>
                                            <TableCell>
                                                <Badge className={`${actionColors[a.action]} shadow-none border-none text-[9px] font-bold px-2 py-0.5`}>{actionLabels[a.action] || a.action}</Badge>
                                            </TableCell>
                                            <TableCell className="font-semibold text-sm">{a.userName}</TableCell>
                                            <TableCell className="text-muted-foreground text-xs">{a.stadiumName}</TableCell>
                                            <TableCell className="text-right text-[10px] font-mono text-muted-foreground">{formatDateTime(a.timestamp)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="history">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-muted/5 border-b pb-6">
                            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                <CardTitle className="text-lg">Historical Records</CardTitle>
                                <div className="flex gap-2">
                                    <Select value={actionFilter} onValueChange={setActionFilter}>
                                        <SelectTrigger className="w-[140px] h-9"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Events</SelectItem>
                                            <SelectItem value="HandoverSigned">Signing</SelectItem>
                                            <SelectItem value="CheckedIn">Check-In</SelectItem>
                                            <SelectItem value="CheckedOut">Check-Out</SelectItem>
                                            <SelectItem value="HandbackRequested">Handback</SelectItem>
                                            <SelectItem value="HandbackAccepted">Release</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {histLoading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-10"><Loader2 className="w-8 h-8 animate-spin mx-auto opacity-20" /></TableCell></TableRow>
                                    ) : history.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-10 text-muted-foreground">History is empty</TableCell></TableRow>
                                    ) : history.map(h => (
                                        <TableRow key={h.id}>
                                            <TableCell className="font-bold font-mono">{h.fleet?.carNumber}</TableCell>
                                            <TableCell className="text-sm">{h.user?.name}</TableCell>
                                            <TableCell><Badge className={`${actionColors[h.action]} border-none shadow-none text-[9px]`}>{actionLabels[h.action] || h.action}</Badge></TableCell>
                                            <TableCell className="text-xs text-muted-foreground">{formatDateTime(h.createdAt)}</TableCell>
                                            <TableCell className="text-xs max-w-[200px] truncate">{h.conditionNotes || '—'}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <div className="p-4 border-t">
                                <Pagination page={page} totalPages={pagination.totalPages} onPageChange={setPage} total={pagination.total} limit={pagination.limit} />
                            </div>
                        </CardContent>
                    </Card>
                </TabsContent>

                <TabsContent value="venues">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                        {poolDashboard?.stadiums.map(s => (
                            <Card key={s.stadiumId} className="border-none shadow-md overflow-hidden bg-card transition-all hover:ring-2 hover:ring-primary/20">
                                <CardHeader className="bg-primary/5 pb-6">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <CardTitle className="text-lg leading-none mb-1">{s.stadiumName}</CardTitle>
                                            <Badge variant="outline" className="text-[9px] uppercase font-black">{s.stadiumCode}</Badge>
                                        </div>
                                        <div className="text-right">
                                            <span className="text-2xl font-black block">{s.total}</span>
                                            <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-tighter">Total Units</span>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="p-6 space-y-4">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="p-2.5 rounded-xl bg-green-50 border border-green-100 flex flex-col items-center">
                                            <span className="text-lg font-black text-green-700">{s.available}</span>
                                            <span className="text-[9px] uppercase font-bold text-green-600">Available</span>
                                        </div>
                                        <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-100 flex flex-col items-center">
                                            <span className="text-lg font-black text-amber-700">{s.dispatched}</span>
                                            <span className="text-[9px] uppercase font-bold text-amber-600">In Use</span>
                                        </div>
                                    </div>
                                    <div className="space-y-1.5">
                                        <div className="flex justify-between text-[10px] font-bold text-muted-foreground uppercase px-1">
                                            <span>Utilization</span>
                                            <span>{s.total > 0 ? Math.round((s.dispatched/s.total)*100) : 0}%</span>
                                        </div>
                                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                                            <div className="h-full bg-primary" style={{ width: `${s.total > 0 ? (s.dispatched/s.total)*100 : 0}%` }} />
                                        </div>
                                    </div>
                                </CardContent>
                                <CardFooter className="px-6 py-4 bg-muted/10 border-t">
                                     <Button variant="ghost" size="sm" className="w-full text-xs font-bold" onClick={() => { setStadiumFilter(s.stadiumId); setActiveTab('history'); }}>Audit Venue Log</Button>
                                </CardFooter>
                            </Card>
                        ))}
                    </div>
                </TabsContent>

                {/* ── FA: Usage History ── */}
                {isFA && (
                <TabsContent value="fa-history" className="space-y-4">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-blue-50/50 to-transparent border-b py-4">
                            <CardTitle className="flex items-center gap-2 text-blue-800"><Clock className="w-5 h-5" /> My Usage History</CardTitle>
                            <CardDescription>All check-in / check-out activity for carts assigned to you.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {histLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead>Cart</TableHead>
                                            <TableHead>Action</TableHead>
                                            <TableHead>Venue</TableHead>
                                            <TableHead>Date &amp; Time</TableHead>
                                            <TableHead>Notes</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {history.length === 0 ? (
                                            <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No usage history yet</TableCell></TableRow>
                                        ) : history.map(log => (
                                            <TableRow key={log.id}>
                                                <TableCell className="font-bold font-mono text-primary">{log.fleet?.carNumber}</TableCell>
                                                <TableCell>
                                                    <Badge className={`${actionColors[log.action] ?? 'bg-muted text-muted-foreground'} text-[10px]`}>
                                                        {actionLabels[log.action] ?? log.action}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{log.fleet?.stadium?.name}</TableCell>
                                                <TableCell className="text-xs">{formatDateTime(log.createdAt)}</TableCell>
                                                <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{log.conditionNotes || log.issueDescription || '—'}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                )}

                {/* ── FA: My Reports ── */}
                {isFA && (
                <TabsContent value="fa-reports" className="space-y-4">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-red-50/50 to-transparent border-b py-4">
                            <CardTitle className="flex items-center gap-2 text-red-800"><Wrench className="w-5 h-5" /> My Reported Issues</CardTitle>
                            <CardDescription>Maintenance and incident reports you've submitted on assigned carts.</CardDescription>
                        </CardHeader>
                        <CardContent className="p-0">
                            {reportsLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                            ) : (
                                <Table>
                                    <TableHeader className="bg-muted/30">
                                        <TableRow>
                                            <TableHead>Cart</TableHead>
                                            <TableHead>Description</TableHead>
                                            <TableHead>Status</TableHead>
                                            <TableHead>Reported</TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {myReports.length === 0 ? (
                                            <TableRow><TableCell colSpan={4} className="text-center py-12 text-muted-foreground">No issues reported yet</TableCell></TableRow>
                                        ) : myReports.map((r: any) => (
                                            <TableRow key={r.id}>
                                                <TableCell className="font-bold font-mono text-primary">{r.fleet?.carNumber}</TableCell>
                                                <TableCell className="text-sm max-w-[300px] truncate">{r.issueDescription}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className={`text-[10px] ${
                                                        r.status === 'Resolved' ? 'border-green-300 text-green-700' :
                                                        r.status === 'Open' ? 'border-red-300 text-red-700' :
                                                        'border-amber-300 text-amber-700'
                                                    }`}>{r.status}</Badge>
                                                </TableCell>
                                                <TableCell className="text-xs text-muted-foreground">{formatDateTime(r.reportedAt)}</TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                )}

                {/* ── FA: Notifications ── */}
                {isFA && (
                <TabsContent value="fa-notifications" className="space-y-4">
                    <Card className="border-none shadow-md overflow-hidden">
                        <CardHeader className="bg-gradient-to-r from-purple-50/50 to-transparent border-b py-4 flex flex-row items-center justify-between">
                            <div>
                                <CardTitle className="flex items-center gap-2 text-purple-800"><Bell className="w-5 h-5" /> Notifications</CardTitle>
                                <CardDescription>Messages and alerts from the system and your administrators.</CardDescription>
                            </div>
                            {unreadCount > 0 && (
                                <Button variant="outline" size="sm" onClick={async () => {
                                    try { await notificationsApi.markAllAsRead(); setNotifications(prev => prev.map(n => ({ ...n, isRead: true }))); setUnreadCount(0); } catch { /* silent */ }
                                }}>Mark all read</Button>
                            )}
                        </CardHeader>
                        <CardContent className="p-0">
                            {notifsLoading ? (
                                <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                            ) : notifications.length === 0 ? (
                                <div className="text-center py-16 text-muted-foreground">
                                    <Bell className="w-10 h-10 mx-auto mb-3 opacity-20" />
                                    <p>No notifications yet</p>
                                </div>
                            ) : (
                                <div className="divide-y">
                                    {notifications.map((n: any) => (
                                        <div key={n.id} className={`flex items-start gap-4 px-5 py-4 cursor-pointer transition-colors hover:bg-muted/30 ${!n.isRead ? 'bg-purple-50/40' : ''}`}
                                            onClick={() => !n.isRead && markNotifRead(n.id)}>
                                            <div className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${!n.isRead ? 'bg-purple-500' : 'bg-muted-foreground/30'}`} />
                                            <div className="flex-1 min-w-0">
                                                <p className={`text-sm ${!n.isRead ? 'font-semibold text-foreground' : 'text-foreground/80'}`}>{n.title}</p>
                                                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.message}</p>
                                                <p className="text-[10px] text-muted-foreground/60 mt-1">{formatDateTime(n.createdAt)}</p>
                                            </div>
                                            <Badge variant="outline" className={`text-[9px] flex-shrink-0 ${
                                                n.type === 'warning' ? 'border-amber-300 text-amber-700' :
                                                n.type === 'success' ? 'border-green-300 text-green-700' :
                                                n.type === 'error' ? 'border-red-300 text-red-700' :
                                                'border-blue-200 text-blue-600'
                                            }`}>{n.type ?? 'info'}</Badge>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </TabsContent>
                )}

            </Tabs>

            {/* ADDITIONAL DRIVERS MODAL */}
            <Dialog open={!!driversModal} onOpenChange={open => !open && setDriversModal(null)}>
                <DialogContent className="max-w-lg rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-xl font-bold flex items-center gap-2">
                            <UserPlus className="w-5 h-5 text-blue-600" /> Additional Drivers
                        </DialogTitle>
                        <DialogDescription>
                            Drivers authorized to use cart <strong>{driversModal?.carNumber}</strong>. Requires handover completion.
                        </DialogDescription>
                    </DialogHeader>
                    {driversLoading ? (
                        <div className="flex justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="space-y-4">
                            {driversList.map((driver, idx) => (
                                <div key={idx} className="p-3 rounded-xl border bg-muted/20 space-y-2">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold uppercase text-muted-foreground">Driver {idx + 1}</span>
                                        <Button variant="ghost" size="icon" className="h-6 w-6 text-red-500 hover:bg-red-50" onClick={() => setDriversList(prev => prev.filter((_, i) => i !== idx))}>
                                            <Trash2 className="w-3.5 h-3.5" />
                                        </Button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-2">
                                        <div className="relative">
                                            <UserPlus className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                                            <Input className="pl-8 h-9 text-sm" placeholder="Full name *" value={driver.name}
                                                onChange={e => setDriversList(prev => prev.map((d, i) => i === idx ? { ...d, name: e.target.value } : d))} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="relative">
                                                <Phone className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                                                <Input className="pl-8 h-9 text-sm" placeholder="Phone" value={driver.phone}
                                                    onChange={e => setDriversList(prev => prev.map((d, i) => i === idx ? { ...d, phone: e.target.value } : d))} />
                                            </div>
                                            <div className="relative">
                                                <Hash className="absolute left-2.5 top-2.5 w-3.5 h-3.5 text-muted-foreground" />
                                                <Input className="pl-8 h-9 text-sm" placeholder="Accreditation #" value={driver.accreditationNumber}
                                                    onChange={e => setDriversList(prev => prev.map((d, i) => i === idx ? { ...d, accreditationNumber: e.target.value } : d))} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {driversList.length === 0 && (
                                <div className="text-center py-6 text-muted-foreground text-sm border-2 border-dashed rounded-xl">
                                    No additional drivers added yet
                                </div>
                            )}
                            <Button variant="outline" className="w-full" onClick={() => setDriversList(prev => [...prev, { ...EMPTY_DRIVER }])}>
                                <Plus className="w-4 h-4 mr-2" /> Add Driver
                            </Button>
                        </div>
                    )}
                    <DialogFooter>
                        <Button variant="ghost" onClick={() => setDriversModal(null)}>Cancel</Button>
                        <Button onClick={saveDrivers} disabled={driversSaving || driversLoading} className="min-w-[120px]">
                            {driversSaving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                            Save Drivers
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* HANDOVER FORM MODAL */}
            {formModal && (
                <HandoverFormModal
                    open={formModal.open}
                    onClose={() => setFormModal(null)}
                    mode={formModal.mode}
                    fleetId={formModal.fleetId}
                    currentUserName={currentUser?.name}
                    adminName={isAdmin ? currentUser?.name : undefined}
                    adminPhone={isAdmin ? currentUser?.phone : undefined}
                    logoUrl={systemLogoUrl ?? undefined}
                    onComplete={() => {
                        loadPoolDashboard();
                        if (isAdmin) loadPendingHandovers();
                    }}
                />
            )}

            {/* HANDOVER SIGNING MODAL (legacy — kept for backward compat) */}
            <Dialog open={!!signingCart} onOpenChange={open => !open && setSigningCart(null)}>
                <DialogContent className="max-w-lg overflow-hidden p-0 rounded-3xl border-none shadow-2xl animate-in zoom-in-95 duration-300">
                    <div className="bg-purple-600 p-8 text-white">
                        <div className="flex items-center gap-4 mb-4">
                            <div className="p-3 bg-white/20 rounded-2xl backdrop-blur-md">
                                <FileSignature className="w-8 h-8" />
                            </div>
                            <div>
                                <h2 className="text-2xl font-black">Handover Receipt</h2>
                                <p className="opacity-80 text-sm font-medium">Digital acknowledgment of unit responsibility.</p>
                            </div>
                        </div>
                    </div>
                    <div className="p-8 space-y-6">
                        <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-1">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Unit Identity</Label>
                                    <p className="text-xl font-black font-mono">{signingCart?.carNumber}</p>
                                </div>
                                <div className="space-y-1">
                                    <Label className="text-[10px] font-black uppercase text-muted-foreground">Unit Type</Label>
                                    <p className="font-bold">{signingCart?.carType}</p>
                                </div>
                            </div>
                            <Separator />
                            <div className="space-y-3">
                                <p className="text-sm font-medium leading-relaxed">
                                    I, <span className="font-bold text-primary">{currentUser?.name}</span>, hereby acknowledge receipt of the golf cart specified above in good operational condition. I accept full responsibility for this unit until it is returned and officially released by a venue administrator.
                                </p>
                                <div className="flex items-start gap-3 p-4 rounded-2xl bg-amber-50 border border-amber-100 text-amber-800 text-xs">
                                    <AlertTriangle className="w-5 h-5 shrink-0" />
                                    <p className="font-medium">Signing this form will activate your checkout privilege for this unit. You must check-in to start usage tracking.</p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-3">
                            <Button variant="ghost" className="flex-1 rounded-xl h-12 font-bold" onClick={() => setSigningCart(null)}>Decline</Button>
                            <Button className="flex-2 bg-purple-600 hover:bg-purple-700 text-white rounded-xl h-12 font-bold px-8 shadow-lg shadow-purple-200" onClick={handleSignHandover} disabled={submitting}>
                                {submitting ? <Loader2 className="w-5 h-5 animate-spin" /> : "I Accept & Sign"}
                            </Button>
                        </div>
                    </div>
                </DialogContent>
            </Dialog>

            {/* CHECK-OUT MODAL */}
            <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
                <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl border-none shadow-2xl">
                    <div className="bg-amber-600 p-6 text-white">
                        <CardTitle className="text-2xl font-black flex items-center gap-3">
                            <LogOut className="w-6 h-6" /> End Usage Session
                        </CardTitle>
                        <p className="opacity-80 text-xs font-medium mt-1">Please report any issues observed during your shift.</p>
                    </div>
                    <form onSubmit={handleCheckOut} className="p-6 space-y-6">
                        <div className="space-y-2">
                             <Label className="text-xs font-bold uppercase text-muted-foreground">Return Notes</Label>
                             <textarea 
                                className="w-full min-h-[100px] p-4 rounded-2xl border bg-muted/10 text-sm focus:ring-2 focus:ring-amber-500" 
                                value={checkoutForm.conditionNotes} 
                                onChange={e => setCheckoutForm(f => ({ ...f, conditionNotes: e.target.value }))}
                                placeholder="Any feedback on car performance..."
                             />
                        </div>
                        <div className="space-y-4">
                            <div className="flex items-center justify-between p-4 rounded-2xl border border-amber-100 bg-amber-50/30">
                                <div className="flex items-center gap-3">
                                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                                    <Label className="font-bold text-amber-900 cursor-pointer" htmlFor="maint-toggle">Report Damage/Issue</Label>
                                </div>
                                <Switch id="maint-toggle" checked={checkoutForm.hasIssue} onCheckedChange={v => setCheckoutForm(f => ({ ...f, hasIssue: v }))} />
                            </div>
                            {checkoutForm.hasIssue && (
                                <div className="space-y-4 animate-in slide-in-from-top-2 duration-300">
                                    <textarea 
                                        className="w-full min-h-[80px] p-4 rounded-2xl border border-red-100 bg-red-50/30 text-sm placeholder:text-red-400" 
                                        value={checkoutForm.issueDescription} 
                                        onChange={e => setCheckoutForm(f => ({ ...f, issueDescription: e.target.value }))}
                                        placeholder="Describe the issue in detail..."
                                        required
                                    />
                                    <Input type="file" multiple accept="image/*" onChange={e => {
                                        const files = Array.from(e.target.files || []);
                                        setCheckoutForm(f => ({ ...f, photos: files.slice(0,5) }));
                                    }} className="rounded-xl h-12" />
                                </div>
                            )}
                        </div>
                        <div className="flex gap-2">
                            <Button type="button" variant="ghost" className="flex-1 rounded-xl h-11" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
                            <Button type="submit" className="flex-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl h-11 font-bold px-6 shadow-md" disabled={submitting}>
                                {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : "Complete Check-Out"}
                            </Button>
                        </div>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
