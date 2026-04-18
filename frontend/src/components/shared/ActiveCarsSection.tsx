import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { reportsApi, stadiumsApi, departmentsApi } from '@/lib/api';
import { Loader2, Car, Search } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface ActiveCar {
    id: string;
    carNumber: string;
    carType: string;
    status: string;
    faName: string;
    faContact: string | null;
    faDepartment: string | null;
    stadium: { id: string; name: string };
    checkOutTime: string;
}

interface ActiveCarsSectionProps {
    refreshKey?: number;
}

export function ActiveCarsSection({ refreshKey }: ActiveCarsSectionProps) {
    const { user } = useAuthStore();
    const [activeCars, setActiveCars] = useState<ActiveCar[]>([]);
    const [stadiums, setStadiums] = useState<Array<{ id: string; name: string }>>([]);
    const [departments, setDepartments] = useState<Array<{ id: string; name: string }>>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterStadium, setFilterStadium] = useState<string>('');
    const [filterDepartment, setFilterDepartment] = useState<string>('');
    const [filterCarType, setFilterCarType] = useState<string>('');

    // Load stadiums and departments for filters
    useEffect(() => {
        const loadFilters = async () => {
            try {
                const [stadiumsRes, departmentsRes] = await Promise.all([
                    stadiumsApi.getAll(),
                    departmentsApi.getAll(),
                ]);
                const stadiumData = stadiumsRes.data?.data || stadiumsRes.data;
                setStadiums(Array.isArray(stadiumData) ? stadiumData : []);
                const deptData = departmentsRes.data?.data || departmentsRes.data;
                setDepartments(Array.isArray(deptData) ? deptData : []);
            } catch (e) {
                console.error('Failed to load filter options:', e);
            }
        };
        loadFilters();
    }, []);

    // Load active cars
    useEffect(() => {
        const loadActiveCars = async () => {
            try {
                setLoading(true);
                const params: Record<string, string> = {};
                if (filterStadium) params.stadiumId = filterStadium;
                if (filterDepartment) params.departmentId = filterDepartment;
                if (filterCarType) params.carType = filterCarType;
                if (searchTerm) params.search = searchTerm;

                const res = await reportsApi.getActiveCarsUsage(params);
                setActiveCars(res.data || []);
            } catch (e) {
                console.error('Failed to load active cars:', e);
            } finally {
                setLoading(false);
            }
        };
        loadActiveCars();
    }, [refreshKey, filterStadium, filterDepartment, filterCarType, searchTerm]);

    // Format time since checkout
    const formatDuration = (checkOutTime: string) => {
        const checkout = new Date(checkOutTime);
        const now = new Date();
        const diffMs = now.getTime() - checkout.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        const diffHours = Math.floor(diffMins / 60);
        const diffDays = Math.floor(diffHours / 24);

        if (diffDays > 0) return `${diffDays}d ${diffHours % 24}h`;
        if (diffHours > 0) return `${diffHours}h ${diffMins % 60}m`;
        return `${diffMins}m`;
    };

    // Check if Admin should see stadium filter (they're scoped to one stadium)
    const showStadiumFilter = user?.role === 'SuperAdmin' || user?.role === 'Observer';

    return (
        <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Car className="w-5 h-5 text-amber-500" /> Active Cars in Use
                </CardTitle>
                <Badge variant="secondary">{activeCars.length} cars</Badge>
            </CardHeader>
            <CardContent className="pt-4">
                {/* Filters */}
                <div className="flex flex-wrap gap-3 mb-4">
                    {/* Search */}
                    <div className="relative flex-1 min-w-[200px]">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <Input
                            placeholder="Search car # or FA name..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-9"
                        />
                    </div>

                    {/* Stadium Filter */}
                    {showStadiumFilter && (
                        <Select value={filterStadium || 'all'} onValueChange={(v) => setFilterStadium(v === 'all' ? '' : v)}>
                            <SelectTrigger className="w-[180px]">
                                <SelectValue placeholder="All Stadiums" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="all">All Stadiums</SelectItem>
                                {stadiums.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}

                    {/* Department Filter */}
                    <Select value={filterDepartment || 'all'} onValueChange={(v) => setFilterDepartment(v === 'all' ? '' : v)}>
                        <SelectTrigger className="w-[180px]">
                            <SelectValue placeholder="All Departments" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Departments</SelectItem>
                            {departments.map((d) => (
                                <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                            ))}
                        </SelectContent>
                    </Select>

                    {/* Car Type Filter */}
                    <Select value={filterCarType || 'all'} onValueChange={(v) => setFilterCarType(v === 'all' ? '' : v)}>
                        <SelectTrigger className="w-[150px]">
                            <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Types</SelectItem>
                            <SelectItem value="4-Seater">4-Seater</SelectItem>
                            <SelectItem value="6-Seater">6-Seater</SelectItem>
                            <SelectItem value="Cargo">Cargo</SelectItem>
                            <SelectItem value="Accessibility">Accessibility</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {/* Active Cars Table */}
                {loading ? (
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
                    </div>
                ) : activeCars.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                        <Car className="w-12 h-12 mx-auto mb-2 opacity-50" />
                        <p>No cars currently in use</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead>
                                <tr className="border-b">
                                    <th className="text-left py-2 px-3 font-medium text-sm">Car Number</th>
                                    <th className="text-left py-2 px-3 font-medium text-sm">Type</th>
                                    <th className="text-left py-2 px-3 font-medium text-sm">FA Name</th>
                                    <th className="text-left py-2 px-3 font-medium text-sm">Contact</th>
                                    <th className="text-left py-2 px-3 font-medium text-sm">Department</th>
                                    <th className="text-left py-2 px-3 font-medium text-sm">Stadium</th>
                                    <th className="text-left py-2 px-3 font-medium text-sm">Duration</th>
                                </tr>
                            </thead>
                            <tbody>
                                {activeCars.map((car) => (
                                    <tr key={car.id} className="border-b hover:bg-muted/50 transition-colors">
                                        <td className="py-2 px-3">
                                            <span className="font-medium">{car.carNumber}</span>
                                        </td>
                                        <td className="py-2 px-3">
                                            <Badge variant="outline">{car.carType}</Badge>
                                        </td>
                                        <td className="py-2 px-3">{car.faName}</td>
                                        <td className="py-2 px-3 text-sm text-muted-foreground">
                                            {car.faContact || '—'}
                                        </td>
                                        <td className="py-2 px-3 text-sm">
                                            {car.faDepartment || '—'}
                                        </td>
                                        <td className="py-2 px-3 text-sm">{car.stadium.name}</td>
                                        <td className="py-2 px-3">
                                            <Badge variant="secondary" className="font-mono">
                                                {formatDuration(car.checkOutTime)}
                                            </Badge>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}