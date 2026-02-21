import { useState, useEffect } from 'react';
import { maintenanceApi, fleetApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Plus, Search, CheckCircle, UserCheck, History, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface MaintenanceLog {
    id: string;
    fleetId: string;
    fleet: {
        unitNumber: string;
        carType: string;
    };
    issueDescription: string;
    reportedBy: string;
    reporter?: {
        name: string;
    };
    reportedAt: string;
    contractorId?: string;
    contractor?: {
        name: string;
    };
    fixDescription?: string;
    fixedAt?: string;
    status: 'Pending' | 'InProgress' | 'Fixed';
}

interface Contractor {
    id: string;
    name: string;
}

const statusColors: Record<string, string> = {
    'Pending': 'bg-yellow-500',
    'InProgress': 'bg-blue-500',
    'Fixed': 'bg-green-500',
};

export function MaintenancePage() {
    const [tasks, setTasks] = useState<MaintenanceLog[]>([]);
    const [fleet, setFleet] = useState<any[]>([]);
    const [contractors, setContractors] = useState<Contractor[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const { user: currentUser } = useAuthStore();

    // Modal states
    const [isReportModalOpen, setIsReportModalOpen] = useState(false);
    const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
    const [isFixModalOpen, setIsFixModalOpen] = useState(false);
    const [isHistoryModalOpen, setIsHistoryModalOpen] = useState(false);
    const [selectedTask, setSelectedTask] = useState<MaintenanceLog | null>(null);
    const [selectedFleetHistory, setSelectedFleetHistory] = useState<MaintenanceLog[]>([]);
    const [submitting, setSubmitting] = useState(false);

    // Form states
    const [reportForm, setReportForm] = useState({
        fleetId: '',
        issueDescription: '',
    });
    const [assignForm, setAssignForm] = useState({
        contractorId: '',
    });
    const [fixForm, setFixForm] = useState({
        fixDescription: '',
    });

    const userRole = currentUser?.role;
    const isAdmin = userRole === 'Admin';
    const isContractor = userRole === 'Contractor';
    const isFocalPoint = userRole === 'FocalPoint';

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [tasksRes, fleetRes] = await Promise.all([
                maintenanceApi.getAll(),
                fleetApi.getAll(),
            ]);
            setTasks(tasksRes.data.data || []);
            setFleet(fleetRes.data.data || []);
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const loadContractors = async () => {
        try {
            const response = await usersApi.getAll();
            const contractorUsers = (response.data.data || []).filter((u: any) => u.role === 'Contractor');
            setContractors(contractorUsers);
        } catch (error) {
            console.error('Failed to load contractors:', error);
        }
    };

    const loadFleetHistory = async (fleetId: string) => {
        try {
            const response = await maintenanceApi.getHistoryByFleet(fleetId);
            setSelectedFleetHistory(response.data.data || []);
        } catch (error) {
            console.error('Failed to load history:', error);
        }
    };

    const filteredTasks = tasks.filter(t => {
        const matchesSearch =
            t.fleet?.unitNumber?.toLowerCase().includes(search.toLowerCase()) ||
            t.issueDescription?.toLowerCase().includes(search.toLowerCase()) ||
            t.contractor?.name?.toLowerCase().includes(search.toLowerCase());
        const matchesStatus = statusFilter === 'all' || t.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    const handleReportIssue = async (e: React.FormEvent) => {
        e.preventDefault();
        setSubmitting(true);
        try {
            await maintenanceApi.reportIssue(reportForm);
            setIsReportModalOpen(false);
            setReportForm({ fleetId: '', issueDescription: '' });
            loadData();
        } catch (error) {
            console.error('Failed to report issue:', error);
            alert('Failed to report issue. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleAssignContractor = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTask) return;
        setSubmitting(true);
        try {
            await maintenanceApi.assignContractor(selectedTask.id, assignForm.contractorId);
            setIsAssignModalOpen(false);
            setSelectedTask(null);
            setAssignForm({ contractorId: '' });
            loadData();
        } catch (error) {
            console.error('Failed to assign contractor:', error);
            alert('Failed to assign contractor. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleReportFix = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!selectedTask) return;
        setSubmitting(true);
        try {
            await maintenanceApi.reportFix(selectedTask.id, fixForm);
            setIsFixModalOpen(false);
            setSelectedTask(null);
            setFixForm({ fixDescription: '' });
            loadData();
        } catch (error) {
            console.error('Failed to report fix:', error);
            alert('Failed to report fix. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const openAssignModal = (task: MaintenanceLog) => {
        setSelectedTask(task);
        loadContractors();
        setIsAssignModalOpen(true);
    };

    const openFixModal = (task: MaintenanceLog) => {
        setSelectedTask(task);
        setIsFixModalOpen(true);
    };

    const openHistoryModal = async (task: MaintenanceLog) => {
        setSelectedTask(task);
        await loadFleetHistory(task.fleetId);
        setIsHistoryModalOpen(true);
    };

    const canReportIssue = isAdmin || isFocalPoint;
    const canAssignContractor = isAdmin;
    const canReportFix = isContractor || isAdmin;

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Maintenance Management</h1>
                {canReportIssue && (
                    <Button onClick={() => setIsReportModalOpen(true)}>
                        <Plus className="w-4 h-4 mr-2" />Report Issue
                    </Button>
                )}
            </div>

            <Card>
                <CardHeader>
                    <div className="flex gap-4">
                        <div className="relative flex-1">
                            <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                            <Input
                                placeholder="Search by vehicle, issue, or contractor..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                className="pl-10"
                            />
                        </div>
                        <Select value={statusFilter} onValueChange={setStatusFilter}>
                            <SelectTrigger className="w-40">
                                <SelectValue placeholder="All Status" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Status</SelectItem>
                                <SelectItem value="Pending">Pending</SelectItem>
                                <SelectItem value="InProgress">In Progress</SelectItem>
                                <SelectItem value="Fixed">Fixed</SelectItem>
                            </SelectContent>
                        </Select>
                    </div>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Vehicle</TableHead>
                                <TableHead>Issue Description</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Reported By</TableHead>
                                <TableHead>Reported At</TableHead>
                                <TableHead>Contractor</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {loading ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8">
                                        <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                    </TableCell>
                                </TableRow>
                            ) : filteredTasks.length === 0 ? (
                                <TableRow>
                                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                        No maintenance tasks found
                                    </TableCell>
                                </TableRow>
                            ) : (
                                filteredTasks.map((task) => (
                                    <TableRow key={task.id}>
                                        <TableCell className="font-medium">
                                            {task.fleet?.unitNumber} ({task.fleet?.carType})
                                        </TableCell>
                                        <TableCell className="max-w-xs truncate">
                                            {task.issueDescription}
                                        </TableCell>
                                        <TableCell>
                                            <Badge className={statusColors[task.status]}>
                                                {task.status}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>{task.reporter?.name || '-'}</TableCell>
                                        <TableCell>
                                            {new Date(task.reportedAt).toLocaleDateString()}
                                        </TableCell>
                                        <TableCell>{task.contractor?.name || '-'}</TableCell>
                                        <TableCell className="text-right">
                                            <div className="flex justify-end gap-2">
                                                {task.status === 'Pending' && canAssignContractor && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openAssignModal(task)}
                                                    >
                                                        <UserCheck className="w-4 h-4 mr-1" />
                                                        Assign
                                                    </Button>
                                                )}
                                                {task.status === 'InProgress' && canReportFix && (
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={() => openFixModal(task)}
                                                    >
                                                        <CheckCircle className="w-4 h-4 mr-1" />
                                                        Mark Fixed
                                                    </Button>
                                                )}
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={() => openHistoryModal(task)}
                                                >
                                                    <History className="w-4 h-4" />
                                                </Button>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            {/* Report Issue Modal */}
            <Dialog open={isReportModalOpen} onOpenChange={setIsReportModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Report Maintenance Issue</DialogTitle>
                        <DialogDescription>
                            Report a new issue for a vehicle.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleReportIssue} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="fleetId">Vehicle *</Label>
                            <Select
                                value={reportForm.fleetId}
                                onValueChange={(value) => setReportForm({ ...reportForm, fleetId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {fleet.filter(v => v.status !== 'Maintenance').map((v) => (
                                        <SelectItem key={v.id} value={v.id}>
                                            {v.unitNumber} ({v.carType}) - {v.status}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="issueDescription">Issue Description *</Label>
                            <textarea
                                id="issueDescription"
                                className="w-full min-h-[100px] p-3 border rounded-md"
                                value={reportForm.issueDescription}
                                onChange={(e) => setReportForm({ ...reportForm, issueDescription: e.target.value })}
                                placeholder="Describe the issue in detail..."
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsReportModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Report Issue
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Assign Contractor Modal */}
            <Dialog open={isAssignModalOpen} onOpenChange={setIsAssignModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Assign Contractor</DialogTitle>
                        <DialogDescription>
                            Assign a contractor to fix: {selectedTask?.issueDescription}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleAssignContractor} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="contractorId">Contractor *</Label>
                            <Select
                                value={assignForm.contractorId}
                                onValueChange={(value) => setAssignForm({ contractorId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select contractor" />
                                </SelectTrigger>
                                <SelectContent>
                                    {contractors.map((c) => (
                                        <SelectItem key={c.id} value={c.id}>
                                            {c.name}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsAssignModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Assign Contractor
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Report Fix Modal */}
            <Dialog open={isFixModalOpen} onOpenChange={setIsFixModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Report Fix</DialogTitle>
                        <DialogDescription>
                            Report the fix for: {selectedTask?.issueDescription}
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleReportFix} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="fixDescription">Fix Description *</Label>
                            <textarea
                                id="fixDescription"
                                className="w-full min-h-[100px] p-3 border rounded-md"
                                value={fixForm.fixDescription}
                                onChange={(e) => setFixForm({ fixDescription: e.target.value })}
                                placeholder="Describe what was fixed..."
                                required
                            />
                        </div>
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsFixModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Mark as Fixed
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* History Modal */}
            <Dialog open={isHistoryModalOpen} onOpenChange={setIsHistoryModalOpen}>
                <DialogContent className="max-w-2xl">
                    <DialogHeader>
                        <DialogTitle>Maintenance History</DialogTitle>
                        <DialogDescription>
                            Vehicle: {selectedTask?.fleet?.unitNumber}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="max-h-[400px] overflow-y-auto">
                        {selectedFleetHistory.length === 0 ? (
                            <p className="text-center py-4 text-muted-foreground">No maintenance history found</p>
                        ) : (
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Date</TableHead>
                                        <TableHead>Issue</TableHead>
                                        <TableHead>Status</TableHead>
                                        <TableHead>Fix</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedFleetHistory.map((log) => (
                                        <TableRow key={log.id}>
                                            <TableCell>
                                                {new Date(log.reportedAt).toLocaleDateString()}
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {log.issueDescription}
                                            </TableCell>
                                            <TableCell>
                                                <Badge className={statusColors[log.status]}>
                                                    {log.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="max-w-xs truncate">
                                                {log.fixDescription || '-'}
                                            </TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        )}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setIsHistoryModalOpen(false)}>
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </div>
    );
}
