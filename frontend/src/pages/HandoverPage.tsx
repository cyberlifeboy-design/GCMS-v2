import { useState, useEffect, useRef } from 'react';
import { handoverApi, fleetApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ArrowRightLeft, LogOut, LogIn, History, Loader2, MapPin } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface HandoverLog {
    id: string;
    fleetId: string;
    fleet: {
        unitNumber: string;
        carType: string;
    };
    userId: string;
    user?: {
        name: string;
        faTrigram?: string;
    };
    action: 'CheckOut' | 'CheckIn';
    timestamp: string;
    latitude?: number;
    longitude?: number;
    conditionNotes?: string;
    signatureUrl?: string;
}

interface FleetVehicle {
    id: string;
    unitNumber: string;
    carType: string;
    status: string;
}

const actionColors: Record<string, string> = {
    'CheckOut': 'bg-blue-500',
    'CheckIn': 'bg-green-500',
};

export function HandoverPage() {
    const [history, setHistory] = useState<HandoverLog[]>([]);
    const [availableFleet, setAvailableFleet] = useState<FleetVehicle[]>([]);
    const [inUseFleet, setInUseFleet] = useState<FleetVehicle[]>([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const { user: currentUser } = useAuthStore();

    // Modal states
    const [isCheckoutModalOpen, setIsCheckoutModalOpen] = useState(false);
    const [isCheckinModalOpen, setIsCheckinModalOpen] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [locationError, setLocationError] = useState('');

    // Signature canvas ref
    const checkoutSigRef = useRef<HTMLCanvasElement>(null);
    const checkinSigRef = useRef<HTMLCanvasElement>(null);

    // Form states
    const [checkoutForm, setCheckoutForm] = useState({
        fleetId: '',
        latitude: null as number | null,
        longitude: null as number | null,
        conditionNotes: '',
        hasSignature: false,
    });

    const [checkinForm, setCheckinForm] = useState({
        fleetId: '',
        latitude: null as number | null,
        longitude: null as number | null,
        conditionNotes: '',
        isMaintenanceRequired: false,
        hasSignature: false,
    });

    const userRole = currentUser?.role;
    const isAdmin = userRole === 'Admin';
    const isFocalPoint = userRole === 'FocalPoint';
    const canHandover = isAdmin || isFocalPoint;

    useEffect(() => {
        loadData();
    }, []);

    const loadData = async () => {
        try {
            setLoading(true);
            const [historyRes, fleetRes] = await Promise.all([
                handoverApi.getHistory(),
                fleetApi.getAll(),
            ]);
            setHistory(historyRes.data);
            const allFleet = fleetRes.data;
            setAvailableFleet(allFleet.filter((v: FleetVehicle) => v.status === 'Ready'));
            setInUseFleet(allFleet.filter((v: FleetVehicle) => v.status === 'In-Use'));
        } catch (error) {
            console.error('Failed to load data:', error);
        } finally {
            setLoading(false);
        }
    };

    const getCurrentLocation = async (): Promise<{ latitude: number; longitude: number } | null> => {
        return new Promise((resolve) => {
            if (!navigator.geolocation) {
                setLocationError('Geolocation is not supported by your browser');
                resolve(null);
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        latitude: position.coords.latitude,
                        longitude: position.coords.longitude,
                    });
                },
                (error) => {
                    setLocationError('Unable to retrieve your location: ' + error.message);
                    resolve(null);
                },
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
            );
        });
    };

    const captureSignature = (canvasRef: React.RefObject<HTMLCanvasElement>): string | null => {
        const canvas = canvasRef.current;
        if (!canvas) return null;

        // Check if canvas has any drawing (simple check - not empty)
        const context = canvas.getContext('2d');
        if (!context) return null;

        // Get image data and check if it's mostly empty
        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        let isEmpty = true;

        // Check if there's any non-white pixel
        for (let i = 3; i < data.length; i += 4) {
            if (data[i] !== 0) {
                isEmpty = false;
                break;
            }
        }

        if (isEmpty) return null;
        return canvas.toDataURL('image/png');
    };

    const clearSignature = (canvasRef: React.RefObject<HTMLCanvasElement | null>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const context = canvas.getContext('2d');
        if (context) {
            context.clearRect(0, 0, canvas.width, canvas.height);
        }
    };

    const handleCheckout = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkoutForm.fleetId) {
            alert('Please select a vehicle');
            return;
        }

        const signature = captureSignature(checkoutSigRef);
        if (!signature) {
            alert('Please provide a signature');
            return;
        }

        setSubmitting(true);
        setLocationError('');

        try {
            const location = await getCurrentLocation();

            await handoverApi.checkOut({
                fleetId: checkoutForm.fleetId,
                latitude: location?.latitude,
                longitude: location?.longitude,
                conditionNotes: checkoutForm.conditionNotes,
                signatureBase64: signature,
            });

            setIsCheckoutModalOpen(false);
            resetCheckoutForm();
            loadData();
            alert('Vehicle checked out successfully!');
        } catch (error: any) {
            console.error('Failed to check out:', error);
            alert(error.response?.data?.error || 'Failed to check out vehicle. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleCheckin = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!checkinForm.fleetId) {
            alert('Please select a vehicle');
            return;
        }

        const signature = captureSignature(checkinSigRef);
        if (!signature) {
            alert('Please provide a signature');
            return;
        }

        setSubmitting(true);
        setLocationError('');

        try {
            const location = await getCurrentLocation();

            await handoverApi.checkIn({
                fleetId: checkinForm.fleetId,
                latitude: location?.latitude,
                longitude: location?.longitude,
                conditionNotes: checkinForm.conditionNotes,
                isMaintenanceRequired: checkinForm.isMaintenanceRequired,
                signatureBase64: signature,
            });

            setIsCheckinModalOpen(false);
            resetCheckinForm();
            loadData();
            alert('Vehicle checked in successfully!');
        } catch (error: any) {
            console.error('Failed to check in:', error);
            alert(error.response?.data?.error || 'Failed to check in vehicle. Please try again.');
        } finally {
            setSubmitting(false);
        }
    };

    const resetCheckoutForm = () => {
        setCheckoutForm({
            fleetId: '',
            latitude: null,
            longitude: null,
            conditionNotes: '',
            hasSignature: false,
        });
        clearSignature(checkoutSigRef);
        setLocationError('');
    };

    const resetCheckinForm = () => {
        setCheckinForm({
            fleetId: '',
            latitude: null,
            longitude: null,
            conditionNotes: '',
            isMaintenanceRequired: false,
            hasSignature: false,
        });
        clearSignature(checkinSigRef);
        setLocationError('');
    };

    const openCheckoutModal = () => {
        resetCheckoutForm();
        setIsCheckoutModalOpen(true);
    };

    const openCheckinModal = () => {
        resetCheckinForm();
        setIsCheckinModalOpen(true);
    };

    // Initialize signature pads
    const initSignaturePad = (canvasRef: React.RefObject<HTMLCanvasElement | null>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Make canvas responsive
        const container = canvas.parentElement;
        if (container) {
            const rect = container.getBoundingClientRect();
            canvas.width = rect.width - 8; // Account for padding
            canvas.height = 150;
        }

        // Set up canvas for drawing
        ctx.strokeStyle = 'black';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        let isDrawing = false;
        let lastX = 0;
        let lastY = 0;

        const getCoordinates = (e: MouseEvent | TouchEvent) => {
            const rect = canvas.getBoundingClientRect();
            const clientX = 'touches' in e ? e.touches[0].clientX : (e as MouseEvent).clientX;
            const clientY = 'touches' in e ? e.touches[0].clientY : (e as MouseEvent).clientY;
            return {
                x: clientX - rect.left,
                y: clientY - rect.top
            };
        };

        const startDrawing = (e: MouseEvent | TouchEvent) => {
            isDrawing = true;
            const coords = getCoordinates(e);
            lastX = coords.x;
            lastY = coords.y;
        };

        const draw = (e: MouseEvent | TouchEvent) => {
            if (!isDrawing) return;
            e.preventDefault();
            const coords = getCoordinates(e);

            ctx.beginPath();
            ctx.moveTo(lastX, lastY);
            ctx.lineTo(coords.x, coords.y);
            ctx.stroke();

            lastX = coords.x;
            lastY = coords.y;
        };

        const stopDrawing = () => {
            isDrawing = false;
        };

        // Mouse events
        canvas.addEventListener('mousedown', startDrawing);
        canvas.addEventListener('mousemove', draw);
        canvas.addEventListener('mouseup', stopDrawing);
        canvas.addEventListener('mouseout', stopDrawing);

        // Touch events
        canvas.addEventListener('touchstart', startDrawing, { passive: false });
        canvas.addEventListener('touchmove', draw, { passive: false });
        canvas.addEventListener('touchend', stopDrawing);

        return () => {
            canvas.removeEventListener('mousedown', startDrawing);
            canvas.removeEventListener('mousemove', draw);
            canvas.removeEventListener('mouseup', stopDrawing);
            canvas.removeEventListener('mouseout', stopDrawing);
            canvas.removeEventListener('touchstart', startDrawing);
            canvas.removeEventListener('touchmove', draw);
            canvas.removeEventListener('touchend', stopDrawing);
        };
    };

    useEffect(() => {
        if (isCheckoutModalOpen) {
            setTimeout(() => initSignaturePad(checkoutSigRef), 100);
        }
    }, [isCheckoutModalOpen]);

    useEffect(() => {
        if (isCheckinModalOpen) {
            setTimeout(() => initSignaturePad(checkinSigRef), 100);
        }
    }, [isCheckinModalOpen]);

    const filteredHistory = history.filter(h =>
        h.fleet?.unitNumber?.toLowerCase().includes(search.toLowerCase()) ||
        h.user?.name?.toLowerCase().includes(search.toLowerCase()) ||
        h.action?.toLowerCase().includes(search.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex justify-between items-center">
                <h1 className="text-3xl font-bold">Handover Management</h1>
                {canHandover && (
                    <div className="flex gap-2">
                        <Button variant="outline" onClick={openCheckinModal}>
                            <LogIn className="w-4 h-4 mr-2" />Check In
                        </Button>
                        <Button onClick={openCheckoutModal}>
                            <LogOut className="w-4 h-4 mr-2" />Check Out
                        </Button>
                    </div>
                )}
            </div>

            <Tabs defaultValue="history">
                <TabsList>
                    <TabsTrigger value="history">
                        <History className="w-4 h-4 mr-2" />Handover History
                    </TabsTrigger>
                    {canHandover && (
                        <>
                            <TabsTrigger value="available">
                                <ArrowRightLeft className="w-4 h-4 mr-2" />Available Vehicles
                            </TabsTrigger>
                            <TabsTrigger value="inuse">
                                <LogOut className="w-4 h-4 mr-2" />In-Use Vehicles
                            </TabsTrigger>
                        </>
                    )}
                </TabsList>

                <TabsContent value="history">
                    <Card>
                        <CardHeader>
                            <div className="relative">
                                <History className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                                <Input
                                    placeholder="Search handover history..."
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                    className="pl-10"
                                />
                            </div>
                        </CardHeader>
                        <CardContent>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Vehicle</TableHead>
                                        <TableHead>Action</TableHead>
                                        <TableHead>User</TableHead>
                                        <TableHead>FA</TableHead>
                                        <TableHead>Timestamp</TableHead>
                                        <TableHead>Location</TableHead>
                                        <TableHead>Notes</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {loading ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8">
                                                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
                                            </TableCell>
                                        </TableRow>
                                    ) : filteredHistory.length === 0 ? (
                                        <TableRow>
                                            <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                                                No handover history found
                                            </TableCell>
                                        </TableRow>
                                    ) : (
                                        filteredHistory.map((log) => (
                                            <TableRow key={log.id}>
                                                <TableCell className="font-medium">
                                                    {log.fleet?.unitNumber}
                                                </TableCell>
                                                <TableCell>
                                                    <Badge className={actionColors[log.action]}>
                                                        {log.action === 'CheckOut' ? 'Check Out' : 'Check In'}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell>{log.user?.name}</TableCell>
                                                <TableCell>{log.user?.faTrigram || '-'}</TableCell>
                                                <TableCell>
                                                    {new Date(log.timestamp).toLocaleString()}
                                                </TableCell>
                                                <TableCell>
                                                    {log.latitude && log.longitude ? (
                                                        <span className="text-xs text-muted-foreground">
                                                            {log.latitude.toFixed(4)}, {log.longitude.toFixed(4)}
                                                        </span>
                                                    ) : (
                                                        '-'
                                                    )}
                                                </TableCell>
                                                <TableCell className="max-w-xs truncate">
                                                    {log.conditionNotes || '-'}
                                                </TableCell>
                                            </TableRow>
                                        ))
                                    )}
                                </TableBody>
                            </Table>
                        </CardContent>
                    </Card>
                </TabsContent>

                {canHandover && (
                    <>
                        <TabsContent value="available">
                            <Card>
                                <CardHeader>
                                    <h3 className="text-lg font-semibold">Available Vehicles (Ready for Check Out)</h3>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Unit Number</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {availableFleet.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                        No vehicles available for check out
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                availableFleet.map((v) => (
                                                    <TableRow key={v.id}>
                                                        <TableCell className="font-medium">{v.unitNumber}</TableCell>
                                                        <TableCell>{v.carType}</TableCell>
                                                        <TableCell>
                                                            <Badge className="bg-green-500">{v.status}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                size="sm"
                                                                onClick={() => {
                                                                    setCheckoutForm({ ...checkoutForm, fleetId: v.id });
                                                                    openCheckoutModal();
                                                                }}
                                                            >
                                                                <LogOut className="w-4 h-4 mr-1" />Check Out
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>

                        <TabsContent value="inuse">
                            <Card>
                                <CardHeader>
                                    <h3 className="text-lg font-semibold">In-Use Vehicles (Ready for Check In)</h3>
                                </CardHeader>
                                <CardContent>
                                    <Table>
                                        <TableHeader>
                                            <TableRow>
                                                <TableHead>Unit Number</TableHead>
                                                <TableHead>Type</TableHead>
                                                <TableHead>Status</TableHead>
                                                <TableHead className="text-right">Action</TableHead>
                                            </TableRow>
                                        </TableHeader>
                                        <TableBody>
                                            {inUseFleet.length === 0 ? (
                                                <TableRow>
                                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                                                        No vehicles currently in use
                                                    </TableCell>
                                                </TableRow>
                                            ) : (
                                                inUseFleet.map((v) => (
                                                    <TableRow key={v.id}>
                                                        <TableCell className="font-medium">{v.unitNumber}</TableCell>
                                                        <TableCell>{v.carType}</TableCell>
                                                        <TableCell>
                                                            <Badge className="bg-blue-500">{v.status}</Badge>
                                                        </TableCell>
                                                        <TableCell className="text-right">
                                                            <Button
                                                                size="sm"
                                                                variant="outline"
                                                                onClick={() => {
                                                                    setCheckinForm({ ...checkinForm, fleetId: v.id });
                                                                    openCheckinModal();
                                                                }}
                                                            >
                                                                <LogIn className="w-4 h-4 mr-1" />Check In
                                                            </Button>
                                                        </TableCell>
                                                    </TableRow>
                                                ))
                                            )}
                                        </TableBody>
                                    </Table>
                                </CardContent>
                            </Card>
                        </TabsContent>
                    </>
                )}
            </Tabs>

            {/* Checkout Modal */}
            <Dialog open={isCheckoutModalOpen} onOpenChange={setIsCheckoutModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check Out Vehicle</DialogTitle>
                        <DialogDescription>
                            Select a vehicle and sign to confirm check out.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckout} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="checkout-fleet">Vehicle *</Label>
                            <Select
                                value={checkoutForm.fleetId}
                                onValueChange={(value) => setCheckoutForm({ ...checkoutForm, fleetId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {availableFleet.map((v) => (
                                        <SelectItem key={v.id} value={v.id}>
                                            {v.unitNumber} ({v.carType})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="checkout-notes">Condition Notes</Label>
                            <textarea
                                id="checkout-notes"
                                className="w-full min-h-[60px] p-3 border rounded-md"
                                value={checkoutForm.conditionNotes}
                                onChange={(e) => setCheckoutForm({ ...checkoutForm, conditionNotes: e.target.value })}
                                placeholder="Any existing damage or notes..."
                            />
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Signature *</Label>
                                <Button type="button" variant="ghost" size="sm" onClick={() => clearSignature(checkoutSigRef)}>
                                    Clear
                                </Button>
                            </div>
                            <div className="border rounded-md p-1 bg-gray-50">
                                <canvas
                                    ref={checkoutSigRef}
                                    className="w-full h-[150px] border border-gray-300 rounded bg-white cursor-crosshair touch-none"
                                />
                            </div>
                        </div>
                        {locationError && (
                            <div className="flex items-center gap-2 text-amber-600 text-sm">
                                <MapPin className="w-4 h-4" />
                                {locationError}
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsCheckoutModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Check Out
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>

            {/* Checkin Modal */}
            <Dialog open={isCheckinModalOpen} onOpenChange={setIsCheckinModalOpen}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Check In Vehicle</DialogTitle>
                        <DialogDescription>
                            Return a vehicle and sign to confirm check in.
                        </DialogDescription>
                    </DialogHeader>
                    <form onSubmit={handleCheckin} className="space-y-4">
                        <div className="space-y-2">
                            <Label htmlFor="checkin-fleet">Vehicle *</Label>
                            <Select
                                value={checkinForm.fleetId}
                                onValueChange={(value) => setCheckinForm({ ...checkinForm, fleetId: value })}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select vehicle" />
                                </SelectTrigger>
                                <SelectContent>
                                    {inUseFleet.map((v) => (
                                        <SelectItem key={v.id} value={v.id}>
                                            {v.unitNumber} ({v.carType})
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-2">
                            <Label htmlFor="checkin-notes">Condition Notes</Label>
                            <textarea
                                id="checkin-notes"
                                className="w-full min-h-[60px] p-3 border rounded-md"
                                value={checkinForm.conditionNotes}
                                onChange={(e) => setCheckinForm({ ...checkinForm, conditionNotes: e.target.value })}
                                placeholder="Any new damage or issues to report..."
                            />
                        </div>
                        <div className="flex items-center space-x-2">
                            <input
                                type="checkbox"
                                id="maintenance"
                                checked={checkinForm.isMaintenanceRequired}
                                onChange={(e) => setCheckinForm({ ...checkinForm, isMaintenanceRequired: e.target.checked })}
                                className="w-4 h-4 rounded border-gray-300"
                            />
                            <Label htmlFor="maintenance" className="text-sm cursor-pointer">
                                Maintenance Required
                            </Label>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center justify-between">
                                <Label>Signature *</Label>
                                <Button type="button" variant="ghost" size="sm" onClick={() => clearSignature(checkinSigRef)}>
                                    Clear
                                </Button>
                            </div>
                            <div className="border rounded-md p-1 bg-gray-50">
                                <canvas
                                    ref={checkinSigRef}
                                    className="w-full h-[150px] border border-gray-300 rounded bg-white cursor-crosshair touch-none"
                                />
                            </div>
                        </div>
                        {locationError && (
                            <div className="flex items-center gap-2 text-amber-600 text-sm">
                                <MapPin className="w-4 h-4" />
                                {locationError}
                            </div>
                        )}
                        <DialogFooter>
                            <Button type="button" variant="outline" onClick={() => setIsCheckinModalOpen(false)}>
                                Cancel
                            </Button>
                            <Button type="submit" disabled={submitting}>
                                {submitting && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                                Check In
                            </Button>
                        </DialogFooter>
                    </form>
                </DialogContent>
            </Dialog>
        </div>
    );
}
