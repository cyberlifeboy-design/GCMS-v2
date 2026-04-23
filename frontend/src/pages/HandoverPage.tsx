import { useState, useEffect } from 'react';
import { handoverApi, usersApi, departmentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { LogOut, LogIn, History, Loader2, AlertTriangle, Car, Users, Building2, TrendingUp, Clock, ChevronUp, ChevronDown, Save, FileSignature, CheckCircle2, RotateCcw } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';
import { Pagination } from '@/components/shared/Pagination';
import { formatDateTime } from '@/lib/dateUtils';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

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
};

export function HandoverPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const isFA = role === 'FA';
    const isAdmin = role === 'Admin' || role === 'SuperAdmin';

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
    const [selectedCart, setSelectedCart] = useState<UserAssignedCart | null>(null);
    const [checkoutForm, setCheckoutForm] = useState({ conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] as File[] });

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

    useEffect(() => {
        loadPoolDashboard();
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

    const handleAcceptHandback = async (fleetId: string) => {
        setSubmitting(true);
        try {
            await handoverApi.acceptHandback(fleetId);
            toast.success('Handback accepted. Cart is now Available.');
            loadPoolDashboard();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Action failed');
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
                            {poolDashboard.userAssignedCarts.map(cart => (
                                <Card key={cart.id} className="overflow-hidden border-2 transition-all hover:shadow-lg border-muted/50">
                                    <div className={`h-2 w-full ${statusColors[cart.status].split(' ')[0]}`} />
                                    <CardHeader className="pb-4">
                                        <div className="flex justify-between items-start">
                                            <div>
                                                <CardTitle className="text-2xl font-black">{cart.carNumber}</CardTitle>
                                                <CardDescription className="font-medium">{cart.carType} · {cart.stadiumName}</CardDescription>
                                            </div>
                                            <Badge className={`${statusColors[cart.status]} border shadow-none px-3 py-1 text-[10px] font-bold uppercase tracking-wider`}>
                                                {cart.status}
                                            </Badge>
                                        </div>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="flex flex-col gap-1.5 p-3 rounded-xl bg-muted/30 border border-muted/20">
                                            <div className="flex justify-between text-xs">
                                                <span className="text-muted-foreground font-medium">Handover Signed:</span>
                                                <span className={cart.handoverSigned ? "text-green-600 font-bold" : "text-red-500 font-bold"}>
                                                    {cart.handoverSigned ? "YES" : "PENDING"}
                                                </span>
                                            </div>
                                            {cart.handoverSignedAt && (
                                                <div className="flex justify-between text-[10px] text-muted-foreground">
                                                    <span>Signed At:</span>
                                                    <span>{formatDateTime(cart.handoverSignedAt)}</span>
                                                </div>
                                            )}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="bg-muted/10 border-t p-4 flex gap-2">
                                        {!cart.handoverSigned ? (
                                            <Button className="w-full bg-purple-600 hover:bg-purple-700 h-11 rounded-xl font-bold" onClick={() => setSigningCart(cart)}>
                                                <FileSignature className="w-4 h-4 mr-2" /> Sign Handover Form
                                            </Button>
                                        ) : cart.status === 'Active' ? (
                                            <Button className="w-full bg-blue-600 hover:bg-blue-700 h-11 rounded-xl font-bold" onClick={() => handleCheckIn(cart.id)} disabled={submitting}>
                                                <LogIn className="w-4 h-4 mr-2" /> Start Usage (Check-In)
                                            </Button>
                                        ) : cart.status === 'Dispatched' ? (
                                            <Button className="w-full bg-amber-600 hover:bg-amber-700 h-11 rounded-xl font-bold text-white" onClick={() => { setSelectedCart(cart); setCheckoutOpen(true); }}>
                                                <LogOut className="w-4 h-4 mr-2" /> Finish Usage (Check-Out)
                                            </Button>
                                        ) : cart.status === 'Returned' ? (
                                            <Button className="w-full bg-indigo-600 hover:bg-indigo-700 h-11 rounded-xl font-bold" onClick={() => handleRequestHandback(cart.id)} disabled={submitting}>
                                                <RotateCcw className="w-4 h-4 mr-2" /> Handback to Admin
                                            </Button>
                                        ) : (
                                            <Button variant="secondary" className="w-full h-11 rounded-xl font-bold opacity-50 cursor-not-allowed" disabled>
                                                Waiting for Admin
                                            </Button>
                                        )}
                                    </CardFooter>
                                </Card>
                            ))}
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
                                    ) : (() => {
                                        // Scan venues for pending or returned carts that need release
                                        const pendingCarts: any[] = [];
                                        // This is a placeholder since the summary doesn't give us individual carts
                                        // In the real app, we'd fetch GET /handover/available/:stadiumId which includes Returned/HandbackPending
                                        return (
                                            <TableRow>
                                                <TableCell colSpan={4} className="text-center py-12 text-muted-foreground">
                                                    <div className="flex flex-col items-center gap-2">
                                                        <CheckCircle2 className="w-8 h-8 opacity-20" />
                                                        <p className="font-medium italic">Use the 'Venue Status' tab below to release carts by venue.</p>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })()}
                                </TableBody>
                            </Table>
                         </CardContent>
                    </Card>
                </div>
            )}

            {/* SHARED SECTION: RECENT ACTIVITY & HISTORY */}
            <Tabs defaultValue="activity" className="space-y-6">
                <TabsList className="bg-muted/50 p-1 rounded-xl">
                    <TabsTrigger value="activity" className="rounded-lg px-6 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Real-time Stream</TabsTrigger>
                    <TabsTrigger value="history" className="rounded-lg px-6 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Global Audit</TabsTrigger>
                    <TabsTrigger value="venues" className="rounded-lg px-6 font-bold uppercase tracking-wider text-[10px] data-[state=active]:bg-background data-[state=active]:shadow-sm">Venue Status</TabsTrigger>
                </TabsList>

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
            </Tabs>

            {/* HANDOVER SIGNING MODAL */}
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
