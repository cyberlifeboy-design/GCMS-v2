import { useState, useEffect } from 'react';
import { handoverApi, fleetApi, settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { LogOut, LogIn, History, Loader2, AlertTriangle, Car, Users, Building2, TrendingUp } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { carTypeColors } from '@/lib/constants';
import { Pagination } from '@/components/shared/Pagination';

interface HandoverLog {
    id: string;
    fleetId: string;
    fleet: { carNumber: string; carType: string; stadium?: { name: string } };
    userId: string;
    user?: { id: string; name: string; email?: string; role?: string };
    action: 'CheckedIn' | 'CheckedOut' | 'IssueReported';
    createdAt: string;
    conditionNotes?: string;
    issueDescription?: string;
}

interface FleetCart {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    stadiumId: string;
    stadium?: { id: string; name: string };
    department?: { id: string; name: string };
    assignedUser?: {
        id: string;
        name: string;
        phone?: string;
        email?: string;
        role?: string;
    };
}

interface PoolStatusStadium {
    stadiumId: string;
    stadiumName: string;
    stadiumCode: string;
    total: number;
    available: number;
    assigned: number;
    dispatched: number;
    underMaintenance: number;
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
    'CheckedIn': 'bg-blue-500 text-white',
    'CheckedOut': 'bg-green-500 text-white',
    'IssueReported': 'bg-red-500 text-white',
};

const actionLabels: Record<string, string> = {
    'CheckedIn': 'Check-In',
    'CheckedOut': 'Check-Out',
    'IssueReported': 'Issue',
};

const statusColors: Record<string, string> = {
    'Available': 'bg-green-100 text-green-800 border-green-300',
    'Assigned': 'bg-blue-100 text-blue-800 border-blue-300',
    'Dispatched': 'bg-amber-100 text-amber-800 border-amber-300',
    'Under Maintenance': 'bg-red-100 text-red-800 border-red-300',
};

export function HandoverPage() {
    const { user: currentUser } = useAuthStore();
    const role = currentUser?.role;
    const canHandover = role === 'FA' || role === 'Admin' || role === 'SuperAdmin';

    const [history, setHistory] = useState<HandoverLog[]>([]);
    const [availableFleet, setAvailableFleet] = useState<FleetCart[]>([]);
    const [dispatchedFleet, setDispatchedFleet] = useState<FleetCart[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [actionFilter, setActionFilter] = useState('all');

    // Pool dashboard state
    const [poolDashboard, setPoolDashboard] = useState<PoolDashboard | null>(null);
    const [poolLoading, setPoolLoading] = useState(true);

    // Pagination state
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 0, limit: 10 });

    const [checkinOpen, setCheckinOpen] = useState(false);
    const [checkoutOpen, setCheckoutOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const [checkinForm, setCheckinForm] = useState({ fleetId: '', conditionNotes: '' });
    const [checkoutForm, setCheckoutForm] = useState<{
        fleetId: string;
        conditionNotes: string;
        hasIssue: boolean;
        issueDescription: string;
        photos: File[];
    }>({
        fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '', photos: []
    });

    // Bulk selection state
    const [selectedAvailable, setSelectedAvailable] = useState<string[]>([]);
    const [selectedDispatched, setSelectedDispatched] = useState<string[]>([]);

    // Handover duration settings state
    const [settingsExpanded, setSettingsExpanded] = useState(false);
    const [settingsLoading, setSettingsLoading] = useState(false);
    const [settingsSaving, setSettingsSaving] = useState(false);
    const [settingsSaved, setSettingsSaved] = useState(false);
    const [handoverDefaultDurationDays, setHandoverDefaultDurationDays] = useState(1);
    const [handoverEventStartDate, setHandoverEventStartDate] = useState('');
    const [handoverEventEndDate, setHandoverEventEndDate] = useState('');
    const [enableHandoverReminder, setEnableHandoverReminder] = useState(true);
    const [handoverReminderHoursBefore, setHandoverReminderHoursBefore] = useState(1);

    const loadPoolDashboard = async () => {
        try {
            setPoolLoading(true);
            const res = await handoverApi.getPoolDashboard();
            setPoolDashboard(res.data);
        } catch (e) {
            console.error('Failed to load pool dashboard:', e);
        } finally {
            setPoolLoading(false);
        }
    };

    const loadData = async () => {
        try {
            setLoading(true);
            const params = {
                ...(actionFilter !== 'all' && { action: actionFilter }),
                page,
                limit: pagination.limit
            };
            const [histRes, fleetRes] = await Promise.all([
                handoverApi.getHistory(params),
                fleetApi.getAll(),
            ]);
            setHistory(histRes.data.data || []);
            if (histRes.data.pagination) {
                setPagination(prev => ({ ...prev, ...histRes.data.pagination }));
            }
            const all: FleetCart[] = fleetRes.data.data || [];
            setAvailableFleet(all.filter(v => v.status === 'Available' || v.status === 'Assigned'));
            setDispatchedFleet(all.filter(v => v.status === 'Dispatched'));
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        loadPoolDashboard();
    }, []);

    useEffect(() => { loadData(); }, [actionFilter, page]);

    const handleCheckin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkinForm.fleetId) { alert('Select a cart'); return; }
        setSubmitting(true);
        try {
            await handoverApi.checkIn({ fleetId: checkinForm.fleetId, conditionNotes: checkinForm.conditionNotes });
            setCheckinOpen(false);
            setCheckinForm({ fleetId: '', conditionNotes: '' });
            loadData();
            loadPoolDashboard();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Check-in failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkoutForm.fleetId) { alert('Select a cart'); return; }
        setSubmitting(true);
        try {
            const fd = new FormData();
            fd.append('fleetId', checkoutForm.fleetId);
            fd.append('conditionNotes', checkoutForm.conditionNotes);
            fd.append('hasIssue', String(checkoutForm.hasIssue));
            if (checkoutForm.hasIssue && checkoutForm.issueDescription) {
                fd.append('issueDescription', checkoutForm.issueDescription);
            }
            checkoutForm.photos.forEach(p => fd.append('photos', p));

            await handoverApi.checkOut(fd);
            setCheckoutOpen(false);
            setCheckoutForm({ fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] });
            loadData();
            loadPoolDashboard();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const toggleAvailableSelection = (id: string) => {
        setSelectedAvailable(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleDispatchedSelection = (id: string) => {
        setSelectedDispatched(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]);
    };

    const toggleAllAvailable = () => {
        if (selectedAvailable.length === availableFleet.length) setSelectedAvailable([]);
        else setSelectedAvailable(availableFleet.map(v => v.id));
    };

    const toggleAllDispatched = () => {
        if (selectedDispatched.length === dispatchedFleet.length) setSelectedDispatched([]);
        else setSelectedDispatched(dispatchedFleet.map(v => v.id));
    };

    const handleBulkCheckin = async () => {
        if (selectedAvailable.length === 0) return;
        if (!confirm(`Check out ${selectedAvailable.length} selected cart(s)?`)) return;
        setSubmitting(true);
        try {
            await handoverApi.bulkCheckIn({ fleetIds: selectedAvailable });
            setSelectedAvailable([]);
            loadData();
            loadPoolDashboard();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Bulk check-out failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handleBulkCheckout = async () => {
        if (selectedDispatched.length === 0) return;
        if (!confirm(`Return ${selectedDispatched.length} selected cart(s)?`)) return;
        setSubmitting(true);
        try {
            await handoverApi.bulkCheckOut({ fleetIds: selectedDispatched });
            setSelectedDispatched([]);
            loadData();
            loadPoolDashboard();
        } catch (err: any) {
            alert(err.response?.data?.error || 'Bulk return failed');
        } finally {
            setSubmitting(false);
        }
    };

    const filtered = history.filter(h => {
        const matchSearch =
            h.fleet?.carNumber?.toLowerCase().includes(search.toLowerCase()) ||
            h.user?.name?.toLowerCase().includes(search.toLowerCase());
        return matchSearch;
    });

    // Pool stats summary
    const totalCarts = poolDashboard?.stadiums?.reduce((sum, s) => sum + s.total, 0) || 0;
    const totalAvailable = poolDashboard?.stadiums?.reduce((sum, s) => sum + s.available, 0) || 0;
    const totalAssigned = poolDashboard?.stadiums?.reduce((sum, s) => sum + s.assigned, 0) || 0;
    const totalDispatched = poolDashboard?.stadiums?.reduce((sum, s) => sum + s.dispatched, 0) || 0;
    const totalMaintenance = poolDashboard?.stadiums?.reduce((sum, s) => sum + s.underMaintenance, 0) || 0;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Handover Management</h1>
                {canHandover && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={() => { setCheckinForm({ fleetId: '', conditionNotes: '' }); setCheckinOpen(true); }}>
                            <LogIn className="w-4 h-4 mr-2" />Check Out
                        </Button>
                        <Button onClick={() => { setCheckoutForm({ fleetId: '', conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] }); setCheckoutOpen(true); }}>
                            <LogOut className="w-4 h-4 mr-2" />Return
                        </Button>
                    </div>
                )}
            </div>

            {/* Pool Dashboard */}
            {!poolLoading && poolDashboard && (
                <div className="space-y-4">
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <Car className="w-5 h-5 text-gray-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Total Carts</p>
                                        <p className="text-2xl font-bold">{totalCarts}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-green-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Available</p>
                                        <p className="text-2xl font-bold text-green-600">{totalAvailable}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-blue-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Assigned</p>
                                        <p className="text-2xl font-bold text-blue-600">{totalAssigned}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-amber-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">In Use</p>
                                        <p className="text-2xl font-bold text-amber-600">{totalDispatched}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                        <Card>
                            <CardContent className="pt-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full bg-red-500" />
                                    <div>
                                        <p className="text-xs text-muted-foreground">Maintenance</p>
                                        <p className="text-2xl font-bold text-red-600">{totalMaintenance}</p>
                                    </div>
                                </div>
                            </CardContent>
                        </Card>
                    </div>

                    {/* Handover Duration Settings (SuperAdmin only) */}
                    {currentUser?.role === 'SuperAdmin' && (
                        <Card>
                            <CardHeader 
                                className="cursor-pointer select-none" 
                                onClick={() => setSettingsExpanded(!settingsExpanded)}
                            >
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Clock className="w-5 h-5" />
                                        <div>
                                            <CardTitle className="text-lg">Handover Duration Settings</CardTitle>
                                            <CardDescription>
                                                Configure timeout and notification settings
                                            </CardDescription>
                                        </div>
                                    </div>
                                    {settingsExpanded ? <ChevronUp className="w-5 h-5" /> : <ChevronDown className="w-5 h-5" />}
                                </div>
                            </CardHeader>
                            {settingsExpanded && (
                                <CardContent>
                                    {settingsLoading ? (
                                        <div className="flex items-center justify-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin" />
                                        </div>
                                    ) : (
                                        <form onSubmit={handleSaveSettings} className="space-y-6">
                                            {/* Default Duration */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-medium">Default Handover Duration</h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="handoverDefaultDurationDays">Maximum Duration (days)</Label>
                                                        <Input
                                                            id="handoverDefaultDurationDays"
                                                            type="number"
                                                            min={1}
                                                            value={handoverDefaultDurationDays}
                                                            onChange={e => setHandoverDefaultDurationDays(parseInt(e.target.value) || 1)}
                                                            placeholder="1"
                                                        />
                                                        <p className="text-xs text-muted-foreground">
                                                            Default maximum number of days a cart can be checked out
                                                        </p>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Event/Tournament Date Range */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-medium">Event/Tournament Date Range</h4>
                                                <p className="text-xs text-muted-foreground">
                                                    Set specific dates for tournaments where handover duration limits may differ
                                                </p>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="space-y-2">
                                                        <Label htmlFor="handoverEventStartDate">Event Start Date</Label>
                                                        <Input
                                                            id="handoverEventStartDate"
                                                            type="datetime-local"
                                                            value={handoverEventStartDate}
                                                            onChange={e => setHandoverEventStartDate(e.target.value)}
                                                        />
                                                    </div>
                                                    <div className="space-y-2">
                                                        <Label htmlFor="handoverEventEndDate">Event End Date</Label>
                                                        <Input
                                                            id="handoverEventEndDate"
                                                            type="datetime-local"
                                                            value={handoverEventEndDate}
                                                            onChange={e => setHandoverEventEndDate(e.target.value)}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Reminder Notifications */}
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-medium">Reminder Notifications</h4>
                                                <div className="flex items-center justify-between">
                                                    <div className="space-y-0.5">
                                                        <Label htmlFor="enableHandoverReminder">Enable Reminder Notifications</Label>
                                                        <p className="text-xs text-muted-foreground">
                                                            Send notifications to users when handover timeout is approaching
                                                        </p>
                                                    </div>
                                                    <Switch
                                                        id="enableHandoverReminder"
                                                        checked={enableHandoverReminder}
                                                        onCheckedChange={setEnableHandoverReminder}
                                                    />
                                                </div>
                                                {enableHandoverReminder && (
                                                    <div className="space-y-2">
                                                        <Label htmlFor="handoverReminderHoursBefore">Hours Before Timeout</Label>
                                                        <Input
                                                            id="handoverReminderHoursBefore"
                                                            type="number"
                                                            min={1}
                                                            value={handoverReminderHoursBefore}
                                                            onChange={e => setHandoverReminderHoursBefore(parseInt(e.target.value) || 1)}
                                                            placeholder="1"
                                                        />
                                                        <p className="text-xs text-muted-foreground">
                                                            Hours before handover timeout to send reminder notification
                                                        </p>
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center gap-4 pt-2">
                                                <Button type="submit" disabled={settingsSaving}>
                                                    {settingsSaving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                    Save Settings
                                                </Button>
                                                {settingsSaved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
                                            </div>
                                        </form>
                                    )}
                                </CardContent>
                            )}
                        </Card>
                    )}
                </div>
            )}

            {/* Pool Dashboard */}
            {!poolLoading && poolDashboard && (
                <div className="space-y-4">
                    {/* FA User's Assigned Carts */}
                    {role === 'FA' && poolDashboard.userAssignedCarts && poolDashboard.userAssignedCarts.length > 0 && (
                        <Card>
                            <CardHeader className="pb-2">
                                <CardTitle className="text-lg flex items-center gap-2">
                                    <Users className="w-5 h-5" />
                                    Your Assigned Carts
                                </CardTitle>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                                    {poolDashboard.userAssignedCarts.map(cart => (
                                        <div key={cart.id} className="flex items-center justify-between p-3 rounded-lg border bg-slate-50">
                                            <div>
                                                <p className="font-mono font-semibold">{cart.carNumber}</p>
                                                <p className="text-xs text-muted-foreground">{cart.stadiumName}</p>
                                            </div>
                                            <Badge className={statusColors[cart.status] || 'bg-gray-100 text-gray-800'}>
                                                {cart.status}
                                            </Badge>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )}

                    {/* Pool Status by Stadium */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <Building2 className="w-5 h-5" />
                                Pool Status by Stadium
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Stadium</TableHead>
                                        <TableHead className="text-center">Total</TableHead>
                                        <TableHead className="text-center">Available</TableHead>
                                        <TableHead className="text-center">Assigned</TableHead>
                                        <TableHead className="text-center">In Use</TableHead>
                                        <TableHead className="text-center">Maintenance</TableHead>
                                        <TableHead className="text-center">Utilization</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {poolDashboard.stadiums.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                No stadiums found
                                            </TableCell>
                                        </TableRow>
                                    ) : poolDashboard.stadiums.map(stadium => {
                                        const utilization = stadium.total > 0 
                                            ? Math.round((stadium.dispatched / stadium.total) * 100) 
                                            : 0;
                                        return (
                                            <TableRow key={stadium.stadiumId}>
                                                <TableCell className="font-medium">{stadium.stadiumName}</TableCell>
                                                <TableCell className="text-center font-semibold">{stadium.total}</TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                                                        {stadium.available}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                                                        {stadium.assigned}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                                                        {stadium.dispatched}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
                                                        {stadium.underMaintenance}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden">
                                                            <div 
                                                                className="h-full bg-amber-500 rounded-full"
                                                                style={{ width: `${utilization}%` }}
                                                            />
                                                        </div>
                                                        <span className="text-xs text-muted-foreground">{utilization}%</span>
                                                    </div>
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>

                    {/* Recent Activity */}
                    <Card>
                        <CardHeader className="pb-2">
                            <CardTitle className="text-lg flex items-center gap-2">
                                <TrendingUp className="w-5 h-5" />
                                Recent Activity
                            </CardTitle>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>Stadium</TableHead>
                                        <TableHead>Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {poolDashboard.recentActivity.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                                                No recent activity
                                            </TableCell>
                                        </TableRow>
                                    ) : poolDashboard.recentActivity.slice(0, 10).map(activity => (
                                        <TableRow key={activity.id}>
                                            <TableCell className="font-mono font-semibold">{activity.carNumber}</TableCell>
                                            <TableCell>
                                                <Badge className={actionColors[activity.action]}>
                                                    {actionLabels[activity.action]}
                                                </Badge>
                                            </TableCell>
                                            <TableCell>{activity.userName}</TableCell>
                                            <TableCell className="text-sm">{activity.stadiumName}</TableCell>
                                            <TableCell className="text-sm text-muted-foreground">
                                                {new Date(activity.timestamp).toLocaleString()}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </div>
            )}

            <Tabs defaultValue="history">
                <TabsList>
                    <TabsTrigger value="history"><History className="w-4 h-4 mr-2" />History</TabsTrigger>
                    {canHandover && (
                        <>
                            <TabsTrigger value="available">Available ({availableFleet.length})</TabsTrigger>
                            <TabsTrigger value="dispatched">Dispatched ({dispatchedFleet.length})</TabsTrigger>
                        </>
                    )}
                </TabsList>

                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <div className="flex gap-4">
                                <div className="relative flex-1">
                                    <Input
                                        placeholder="Search by cart or user…"
                                        value={search}
                                        onChange={e => setSearch(e.target.value)}
                                    />
                                </div>
                                <Select value={actionFilter} onValueChange={v => { setActionFilter(v); setPage(1); }}>
                                    <SelectTrigger className="w-44">
                                        <SelectValue placeholder="All Actions" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="all">All Actions</SelectItem>
                                        <SelectItem value="CheckedIn">Check-In</SelectItem>
                                        <SelectItem value="CheckedOut">Check-Out</SelectItem>
                                        <SelectItem value="IssueReported">Issue Reported</SelectItem>
                                    </SelectContent>
                                </Select>
                            </div>
                        </CardHeader>
                        <CardContent className="p-0">
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Cart #</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>FA Name</TableHead>
                                        <TableHead>Date/Time</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8">
                                            <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                        </TableCell></TableRow>
                                    ) : filtered.length === 0 ? (
                                        <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No handover history</TableCell></TableRow>
                                    ) : filtered.map(log => (
                                        <TableRow key={log.id}>
                                            <TableCell className="font-mono font-semibold">{log.fleet?.carNumber}</TableCell>
                                            <TableCell>
                                                <Badge className={actionColors[log.action]}>{actionLabels[log.action]}</Badge>
                                            </TableCell>
                                            <TableCell>{log.user?.name}</TableCell>
                                            <TableCell className="text-sm">{new Date(log.createdAt).toLocaleString()}</TableCell>
                                            <TableCell className="max-w-xs truncate text-sm text-muted-foreground">
                                                {log.issueDescription || log.conditionNotes || '—'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                            <Pagination
                                page={page}
                                totalPages={pagination.totalPages}
                                onPageChange={setPage}
                                total={pagination.total}
                                limit={pagination.limit}
                            />
                        </CardContent>
                    </Card>
                </TabsContent>

                {canHandover && (
                    <>
                        <TabsContent value="available">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-semibold">Available / Assigned Carts</h3>
                                            <p className="text-xs text-muted-foreground">Check out a cart for use (marks as Dispatched)</p>
                                        </div>
                                        {selectedAvailable.length > 0 && (
                                            <Button size="sm" onClick={handleBulkCheckin} disabled={submitting}>
                                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                <LogIn className="w-4 h-4 mr-1" /> Check Out ({selectedAvailable.length})
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12"><Checkbox checked={availableFleet.length > 0 && selectedAvailable.length === availableFleet.length} onCheckedChange={toggleAllAvailable} /></TableHead>
                                                <TableHead>Cart #</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {availableFleet.length === 0 ? (
                                                <TableRow><TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No available carts</TableCell></TableRow>
                                            ) : availableFleet.map(v => (
                                                <TableRow key={v.id} className={selectedAvailable.includes(v.id) ? 'bg-blue-50' : ''}>
                                                    <TableCell><Checkbox checked={selectedAvailable.includes(v.id)} onCheckedChange={() => toggleAvailableSelection(v.id)} /></TableCell>
                                                    <TableCell className="font-mono font-semibold">{v.carNumber}</TableCell>
                                                    <TableCell><Badge className={carTypeColors[v.carType] || 'bg-gray-500 text-white'} variant="secondary">{v.carType}</Badge></TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" onClick={() => { setCheckinForm({ fleetId: v.id, conditionNotes: '' }); setCheckinOpen(true); }}><LogIn className="w-4 h-4 mr-1" />Check Out</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="dispatched">
                            <Card>
                                <CardHeader>
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="font-semibold">Dispatched (In Use) Carts</h3>
                                            <p className="text-xs text-muted-foreground">Return a cart (marks as Available or Maintenance if issue)</p>
                                        </div>
                                        {selectedDispatched.length > 0 && (
                                            <Button size="sm" variant="outline" onClick={handleBulkCheckout} disabled={submitting}>
                                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                                <LogOut className="w-4 h-4 mr-1" /> Return ({selectedDispatched.length})
                                            </Button>
                                        )}
                                    </div>
                                </CardHeader>
                                <CardContent className="p-0">
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead className="w-12"><Checkbox checked={dispatchedFleet.length > 0 && selectedDispatched.length === dispatchedFleet.length} onCheckedChange={toggleAllDispatched} /></TableHead>
                                                <TableHead>Cart #</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Checked Out By</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {dispatchedFleet.length === 0 ? (
                                                <TableRow><TableCell colSpan={5} className="text-center py-8 text-muted-foreground">No dispatched carts</TableCell></TableRow>
                                            ) : dispatchedFleet.map(v => (
                                                <TableRow key={v.id} className={selectedDispatched.includes(v.id) ? 'bg-green-50' : ''}>
                                                    <TableCell><Checkbox checked={selectedDispatched.includes(v.id)} onCheckedChange={() => toggleDispatchedSelection(v.id)} /></TableCell>
                                                    <TableCell className="font-mono font-semibold">{v.carNumber}</TableCell>
                                                    <TableCell><Badge className={carTypeColors[v.carType] || 'bg-gray-500 text-white'} variant="secondary">{v.carType}</Badge></TableCell>
                                                    <TableCell>{v.assignedUser?.name || <span className="text-muted-foreground">—</span>}</TableCell>
                                                    <TableCell className="text-right">
                                                        <Button size="sm" variant="outline" onClick={() => { setCheckoutForm({ fleetId: v.id, conditionNotes: '', hasIssue: false, issueDescription: '', photos: [] }); setCheckoutOpen(true); }}><LogOut className="w-4 h-4 mr-1" />Return</Button>
                                                    </TableCell>
                                                </TableRow>
                                            ))}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </>
                )}
            </Tabs>

            {/* Check-In Modal */}
            <Dialog open={checkinOpen} onOpenChange={setCheckinOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check Out Cart</DialogTitle>
                        <DialogDescription>Select a cart to check out. This marks it as "Dispatched".</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckin} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={checkinForm.fleetId} onValueChange={v => setCheckinForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>
                                    {availableFleet.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label>Condition Notes</Label>
                            <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={checkinForm.conditionNotes} onChange={e => setCheckinForm(f => ({ ...f, conditionNotes: e.target.value }))} placeholder="Any existing damage or observations…" />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCheckinOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Check Out</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Check-Out Modal */}
            <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Return Cart</DialogTitle>
                        <DialogDescription>Return a cart. If there's an issue, it will be marked for maintenance.</DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckout} className="space-y-4">
                        <div className="space-y-2">
                            <Label>Cart *</Label>
                            <Select value={checkoutForm.fleetId} onValueChange={v => setCheckoutForm(f => ({ ...f, fleetId: v }))}>
                                <SelectTrigger><SelectValue placeholder="Select cart" /></SelectTrigger>
                                <SelectContent>
                                    {dispatchedFleet.map(v => (
                                        <SelectItem key={v.id} value={v.id}>{v.carNumber} ({v.carType})</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                            {checkoutForm.fleetId && (() => {
                                const selectedCart = dispatchedFleet.find(v => v.id === checkoutForm.fleetId);
                                if (selectedCart?.assignedUser) {
                                    return (
                                        <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded-md text-sm">
                                            <span className="text-blue-700 font-medium">Previously checked out by: </span>
                                            <span className="text-blue-900 font-semibold">{selectedCart.assignedUser.name}</span>
                                            {selectedCart.assignedUser.phone && (
                                                <span className="text-blue-600 ml-2">({selectedCart.assignedUser.phone})</span>
                                            )}
                                        </div>
                                    );
                                }
                                return null;
                            })()}
                        </div>
                        <div className="space-y-2">
                            <Label>Condition Notes</Label>
                            <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={checkoutForm.conditionNotes} onChange={e => setCheckoutForm(f => ({ ...f, conditionNotes: e.target.value }))} placeholder="Return condition observations…" />
                        </div>
                        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-md">
                            <input type="checkbox" id="hasIssue" checked={checkoutForm.hasIssue} onChange={e => setCheckoutForm(f => ({ ...f, hasIssue: e.target.checked }))} className="w-4 h-4 rounded" />
                            <Label htmlFor="hasIssue" className="cursor-pointer flex items-center gap-2 text-amber-800">
                                <AlertTriangle className="w-4 h-4" />Report an Issue (will set cart to Maintenance)
                            </Label>
                        </div>
                        {checkoutForm.hasIssue && (
                            <>
                                <div className="space-y-2">
                                    <Label>Issue Description *</Label>
                                    <textarea className="w-full min-h-[80px] p-3 border rounded-md text-sm" value={checkoutForm.issueDescription} onChange={e => setCheckoutForm(f => ({ ...f, issueDescription: e.target.value }))} placeholder="Describe the issue in detail…" required={checkoutForm.hasIssue} />
                                </div>
                                <div className="space-y-2">
                                    <Label>Photos (optional, max 5)</Label>
                                    <Input type="file" accept="image/*" multiple onChange={e => { const files = Array.from(e.target.files || []); setCheckoutForm(f => ({ ...f, photos: files.slice(0, 5) })); }} />
                                    {checkoutForm.photos.length > 0 && <p className="text-xs text-muted-foreground">{checkoutForm.photos.length} files selected</p>}
                                </div>
                            </>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setCheckoutOpen(false)}>Cancel</Button>
                            <Button type="submit" disabled={submitting}>{submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Return Cart</Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}