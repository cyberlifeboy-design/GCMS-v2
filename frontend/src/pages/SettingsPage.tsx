import { useState, useEffect, useRef } from 'react';
import { settingsApi, usersApi, stadiumsApi, departmentsApi, announcementsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { 
    Loader2, Save, Upload, Image, FileSpreadsheet, FileText, 
    File, Link as LinkIcon, Copy, Check, Bell, Clock, ToggleLeft, 
    ToggleRight, Megaphone, Mail, Sun, Moon, Monitor, 
    ChevronDown, ChevronUp, Users, User, Settings as SettingsIcon,
    Palette, ShieldCheck, Wrench, Globe, HelpCircle, Calendar
} from 'lucide-react';
import { useAuthStore, ExportPreferences } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';

interface Settings {
    tournamentName?: string;
    logoUrl?: string;
    headerUrl?: string;
    footerUrl?: string;
    footerText?: string;
    maintenanceNotificationEmails?: string;
    handoverTimeoutMinutes?: number;
    defaultStadiumId?: string;
    // Feature toggles
    enableMaintenanceReports?: boolean;
    enableHandoverPhotos?: boolean;
    enableFleetManagement?: boolean;
    enableCarRequests?: boolean;
    enableUserImport?: boolean;
    enableBulkOperations?: boolean;
    enableAdvancedReports?: boolean;
    enableAssignmentMatrix?: boolean;
    // Legacy system announcement
    systemAnnouncement?: string;
    announcementExpiry?: string;
    theme?: 'light' | 'dark' | 'system';
    // Handover duration settings
    handoverDefaultDurationDays?: number;
    handoverEventStartDate?: string;
    handoverEventEndDate?: string;
    enableHandoverReminder?: boolean;
    handoverReminderHoursBefore?: number;
    // Timezone settings
    timezone?: string;
}

interface Stadium {
    id: string;
    name: string;
    code: string;
}

interface Department {
    id: string;
    name: string;
    code?: string;
    stadiumId: string;
}

export function SettingsPage() {
    const { user, updateExportFormat } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

    const [activeTab, setActiveTab] = useState('profile');

    // User preferences
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf' | 'docx'>(user?.exportFormat || 'xlsx');
    const [savingPreferences, setSavingPreferences] = useState(false);
    const [preferencesSaved, setPreferencesSaved] = useState(false);

    // Theme
    const { theme, setTheme } = useThemeStore();

    // Notification preferences (for email notifications)
    const [emailNotifications, setEmailNotifications] = useState({
        maintenance: true,
        handover: true,
        requests: true,
        assignments: true,
    });

    // Granular export preferences
    const defaultExportPrefs: ExportPreferences = {
        fleet: { enabled: true, includeCarNumber: true, includeStatus: true, includeAssignment: true, includeStadium: true, includeDepartment: true },
        handover: { enabled: true, includeCarNumber: true, includeUser: true, includeAction: true, includeTimestamp: true, includeNotes: true },
        maintenance: { enabled: true, includeCarNumber: true, includeIssue: true, includeStatus: true, includeReporter: true, includeDates: true },
        request: { enabled: true, includeRequester: true, includeDepartment: true, includeStadium: true, includeQuantities: true, includeStatus: true, includeNotes: true },
        users: { enabled: true, includeName: true, includeEmail: true, includeRole: true, includeStadium: true, includeDepartment: true, includeStatus: true },
        department: { enabled: true, includeName: true, includeCode: true, includeStadium: true, includeFocalPoint: true },
        stadium: { enabled: true, includeName: true, includeCode: true, includeLocation: true, includeStatus: true },
    };

    const [exportPrefs, setExportPrefs] = useState<ExportPreferences>(() => {
        if (user?.exportPreferences) {
            try {
                const prefs = typeof user.exportPreferences === 'string'
                    ? JSON.parse(user.exportPreferences)
                    : user.exportPreferences;
                return { ...defaultExportPrefs, ...prefs };
            } catch {
                return defaultExportPrefs;
            }
        }
        return defaultExportPrefs;
    });

    // Expanded states for collapsible sections
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        fleet: false,
        handover: false,
        maintenance: false,
        request: false,
        users: false,
        department: false,
        stadium: false,
    });

    // System settings
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const [tournamentName, setTournamentName] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [headerFile, setHeaderFile] = useState<File | null>(null);
    const [footerFile, setFooterFile] = useState<File | null>(null);

    const [logoPrev, setLogoPrev] = useState('');
    const [headerPrev, setHeaderPrev] = useState('');
    const [footerPrev, setFooterPrev] = useState('');
    const [footerText, setFooterText] = useState('');

    // Stadiums for request link generator
    const [stadiums, setStadiums] = useState<Stadium[]>([]);

    // New settings (SuperAdmin only)
    const [maintenanceNotificationEmails, setMaintenanceNotificationEmails] = useState('');
    // Timeout in days+hours for display
    const [handoverTimeoutDays, setHandoverTimeoutDays] = useState(0);
    const [handoverTimeoutHoursField, setHandoverTimeoutHoursField] = useState(2);
    const [defaultStadiumId, setDefaultStadiumId] = useState('');
    // Feature toggles
    const [enableMaintenanceReports, setEnableMaintenanceReports] = useState(true);
    const [enableHandoverPhotos, setEnableHandoverPhotos] = useState(true);
    const [enableFleetManagement, setEnableFleetManagement] = useState(true);
    const [enableCarRequests, setEnableCarRequests] = useState(true);
    const [enableUserImport, setEnableUserImport] = useState(true);
    const [enableBulkOperations, setEnableBulkOperations] = useState(true);
    const [enableAdvancedReports, setEnableAdvancedReports] = useState(true);
    const [enableAssignmentMatrix, setEnableAssignmentMatrix] = useState(true);
    // Feature toggle targets: key → 'all' | 'system' | 'fa'
    const [featureToggleTargets, setFeatureToggleTargets] = useState<Record<string, 'all' | 'system' | 'fa'>>({});
    // Legacy system announcement
    const [systemAnnouncement, setSystemAnnouncement] = useState('');
    const [announcementExpiry, setAnnouncementExpiry] = useState('');
    const [announcementTarget, setAnnouncementTarget] = useState<'all' | 'system' | 'fa'>('all');
    const [pushingAnnouncement, setPushingAnnouncement] = useState(false);
    // Handover duration settings
    const [handoverDefaultDurationDays, setHandoverDefaultDurationDays] = useState(1);
    const [handoverDefaultDurationHours, setHandoverDefaultDurationHours] = useState(0);
    const [handoverEventStartDate, setHandoverEventStartDate] = useState('');
    const [handoverEventEndDate, setHandoverEventEndDate] = useState('');
    const [enableHandoverReminder, setEnableHandoverReminder] = useState(true);
    const [handoverReminderHoursBefore, setHandoverReminderHoursBefore] = useState(1);

    // Timezone settings
    const [timezone, setTimezone] = useState('UTC');

    useEffect(() => {
        // Set export format from user data
        if (user?.exportFormat) {
            setExportFormat(user.exportFormat as 'xlsx' | 'pdf' | 'docx');
        }
        // Load notification preferences from user data if available
        if (user?.exportPreferences) {
            try {
                const prefs = typeof user.exportPreferences === 'string'
                    ? JSON.parse(user.exportPreferences)
                    : user.exportPreferences;
                if (prefs.emailNotifications) {
                    setEmailNotifications(prefs.emailNotifications);
                }
            } catch (e) {
                console.error('Failed to parse notification preferences', e);
            }
        }
    }, [user?.exportFormat, user?.exportPreferences]);

    useEffect(() => {
        const load = async () => {
            try {
                const [settingsRes, stadiumsRes] = await Promise.all([
                    settingsApi.get(),
                    stadiumsApi.getAll(),
                ]);
                const d: Settings = settingsRes.data.data || {};
                setTournamentName(d.tournamentName || '');
                setLogoPrev(d.logoUrl || '');
                setHeaderPrev(d.headerUrl || '');
                setFooterPrev(d.footerUrl || '');
                setFooterText(d.footerText || '');
                // New settings
                setMaintenanceNotificationEmails(d.maintenanceNotificationEmails || '');
                const rawMinutes = d.handoverTimeoutMinutes ?? 120;
                setHandoverTimeoutDays(Math.floor(rawMinutes / (24 * 60)));
                setHandoverTimeoutHoursField(Math.floor((rawMinutes % (24 * 60)) / 60));
                setDefaultStadiumId(d.defaultStadiumId || '');
                // Feature toggles
                setEnableMaintenanceReports(d.enableMaintenanceReports ?? true);
                setEnableHandoverPhotos(d.enableHandoverPhotos ?? true);
                setEnableFleetManagement(d.enableFleetManagement ?? true);
                setEnableCarRequests(d.enableCarRequests ?? true);
                setEnableUserImport(d.enableUserImport ?? true);
                setEnableBulkOperations(d.enableBulkOperations ?? true);
                setEnableAdvancedReports(d.enableAdvancedReports ?? true);
                setEnableAssignmentMatrix(d.enableAssignmentMatrix ?? true);
                // Legacy system announcement
                setSystemAnnouncement(d.systemAnnouncement || '');
                setAnnouncementExpiry(d.announcementExpiry ? d.announcementExpiry.slice(0, 16) : '');
                
                setHandoverDefaultDurationDays(d.handoverDefaultDurationDays ?? 1);
                setHandoverDefaultDurationHours(0);
                setHandoverEventStartDate(d.handoverEventStartDate ? d.handoverEventStartDate.slice(0, 16) : '');
                setHandoverEventEndDate(d.handoverEventEndDate ? d.handoverEventEndDate.slice(0, 16) : '');
                setEnableHandoverReminder(d.enableHandoverReminder ?? true);
                setHandoverReminderHoursBefore(d.handoverReminderHoursBefore ?? 1);
                setTimezone(d.timezone || 'UTC');
                setStadiums(stadiumsRes.data.data || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSavePreferences = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSavingPreferences(true);
        setPreferencesSaved(false);
        try {
            await usersApi.updatePreferences({
                exportFormat,
                exportPreferences: {
                    ...exportPrefs,
                    emailNotifications
                } as Record<string, unknown>,
            });
            updateExportFormat(exportFormat);
            useAuthStore.getState().updateExportPreferences({
                ...exportPrefs,
                emailNotifications
            });
            setPreferencesSaved(true);
            toast.success('Profile preferences saved successfully');
            setTimeout(() => setPreferencesSaved(false), 3000);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save preferences');
        } finally {
            setSavingPreferences(false);
        }
    };

    const toggleSection = (section: string) => {
        setExpandedSections(prev => ({ ...prev, [section]: !prev[section] }));
    };

    const updateExportPref = (
        reportType: keyof Omit<ExportPreferences, 'theme'>,
        field: string,
        value: boolean
    ) => {
        setExportPrefs(prev => ({
            ...prev,
            [reportType]: {
                ...(prev[reportType] as any),
                [field]: value,
            },
        }));
    };

    const selectAllInReport = (reportType: keyof Omit<ExportPreferences, 'theme'>, checked: boolean) => {
        const report = exportPrefs[reportType] as any;
        if (!report) return;
        const fields = Object.keys(report).filter(k => k !== 'enabled') as string[];
        const updates: Record<string, boolean> = { enabled: checked };
        fields.forEach(f => { updates[f] = checked; });
        setExportPrefs(prev => ({
            ...prev,
            [reportType]: updates,
        }));
    };

    const reportTypes: { key: keyof ExportPreferences; label: string; fields: { key: string; label: string }[] }[] = [
        {
            key: 'fleet', label: 'Fleet Report', fields: [
                { key: 'includeCarNumber', label: 'Car Number' },
                { key: 'includeStatus', label: 'Status' },
                { key: 'includeAssignment', label: 'Assignment' },
                { key: 'includeStadium', label: 'Stadium' },
                { key: 'includeDepartment', label: 'Department' },
            ]
        },
        {
            key: 'handover', label: 'Handover Report', fields: [
                { key: 'includeCarNumber', label: 'Car Number' },
                { key: 'includeUser', label: 'User' },
                { key: 'includeAction', label: 'Action' },
                { key: 'includeTimestamp', label: 'Timestamp' },
                { key: 'includeNotes', label: 'Notes' },
            ]
        },
        {
            key: 'maintenance', label: 'Maintenance Report', fields: [
                { key: 'includeCarNumber', label: 'Car Number' },
                { key: 'includeIssue', label: 'Issue Description' },
                { key: 'includeStatus', label: 'Status' },
                { key: 'includeReporter', label: 'Reporter' },
                { key: 'includeDates', label: 'Dates' },
            ]
        },
        {
            key: 'request', label: 'Request Report', fields: [
                { key: 'includeRequester', label: 'Requester' },
                { key: 'includeDepartment', label: 'Department' },
                { key: 'includeStadium', label: 'Stadium' },
                { key: 'includeQuantities', label: 'Quantities' },
                { key: 'includeStatus', label: 'Status' },
                { key: 'includeNotes', label: 'Notes' },
            ]
        },
        {
            key: 'users', label: 'Users Report', fields: [
                { key: 'includeName', label: 'Name' },
                { key: 'includeEmail', label: 'Email' },
                { key: 'includeRole', label: 'Role' },
                { key: 'includeStadium', label: 'Stadium' },
                { key: 'includeDepartment', label: 'Department' },
                { key: 'includeStatus', label: 'Status' },
            ]
        },
    ];

    const handleSaveSystem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isSuperAdmin) return;

        // Email validation for maintenance emails
        if (maintenanceNotificationEmails) {
            const emails = maintenanceNotificationEmails.split(',').map(e => e.trim());
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            const invalidEmails = emails.filter(e => e && !emailRegex.test(e));
            if (invalidEmails.length > 0) {
                toast.error(`Invalid email format: ${invalidEmails.join(', ')}`);
                return;
            }
        }

        setSaving(true);
        setSaved(false);
        try {
            const fd = new FormData();
            fd.append('tournamentName', tournamentName);
            if (logoFile) fd.append('logo', logoFile);
            if (headerFile) fd.append('header', headerFile);
            if (footerFile) fd.append('footer', footerFile);
            fd.append('footerText', footerText);
            
            fd.append('maintenanceNotificationEmails', maintenanceNotificationEmails);
            const computedTimeoutMinutes = handoverTimeoutDays * 24 * 60 + handoverTimeoutHoursField * 60;
            fd.append('handoverTimeoutMinutes', String(computedTimeoutMinutes));
            fd.append('defaultStadiumId', defaultStadiumId || '');
            
            fd.append('enableMaintenanceReports', String(enableMaintenanceReports));
            fd.append('enableHandoverPhotos', String(enableHandoverPhotos));
            fd.append('enableFleetManagement', String(enableFleetManagement));
            fd.append('enableCarRequests', String(enableCarRequests));
            fd.append('enableUserImport', String(enableUserImport));
            fd.append('enableBulkOperations', String(enableBulkOperations));
            fd.append('enableAdvancedReports', String(enableAdvancedReports));
            fd.append('enableAssignmentMatrix', String(enableAssignmentMatrix));
            
            fd.append('systemAnnouncement', systemAnnouncement);
            fd.append('announcementExpiry', announcementExpiry ? new Date(announcementExpiry).toISOString() : '');
            
            fd.append('handoverDefaultDurationDays', String(handoverDefaultDurationDays));
            fd.append('handoverEventStartDate', handoverEventStartDate ? new Date(handoverEventStartDate).toISOString() : '');
            fd.append('handoverEventEndDate', handoverEventEndDate ? new Date(handoverEventEndDate).toISOString() : '');
            fd.append('enableHandoverReminder', String(enableHandoverReminder));
            fd.append('handoverReminderHoursBefore', String(handoverReminderHoursBefore));
            fd.append('timezone', timezone || 'UTC');
            
            await settingsApi.update(fd);
            toast.success('System settings updated successfully');
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const ImageField = ({
        label,
        currentUrl,
        onPreview,
        onFileChange,
    }: {
        label: string;
        currentUrl: string;
        onPreview: (url: string) => void;
        onFileChange: (file: File | null) => void;
    }) => (
        <div className="space-y-3">
            <Label className="text-sm font-semibold">{label}</Label>
            {currentUrl ? (
                <div className="relative group border rounded-xl overflow-hidden bg-muted/30 aspect-video flex items-center justify-center">
                    <img src={currentUrl} alt={label} className="max-h-full max-w-full object-contain p-2" />
                    {isSuperAdmin && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <Button type="button" variant="secondary" size="sm" onClick={() => {
                                const input = document.getElementById(`file-${label.toLowerCase()}`);
                                input?.click();
                             }}>
                                <Upload className="w-4 h-4 mr-2" /> Change
                             </Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="border border-dashed rounded-xl aspect-video flex flex-col items-center justify-center bg-muted/20 text-muted-foreground">
                    <Image className="w-8 h-8 mb-2 opacity-40" />
                    <span className="text-xs">No {label.toLowerCase()} uploaded</span>
                </div>
            )}
            {isSuperAdmin && (
                <div className="flex items-center gap-2">
                    <Input
                        id={`file-${label.toLowerCase()}`}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={e => {
                            const f = e.target.files?.[0] || null;
                            onFileChange(f);
                            if (f) {
                                const url = URL.createObjectURL(f);
                                onPreview(url);
                            }
                        }}
                    />
                    {!currentUrl && (
                        <Button type="button" variant="outline" size="sm" onClick={() => document.getElementById(`file-${label.toLowerCase()}`)?.click()} className="w-full">
                            <Upload className="w-4 h-4 mr-2" />Upload Image
                        </Button>
                    )}
                </div>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center h-[60vh] gap-4">
                <Loader2 className="w-10 h-10 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground animate-pulse">Loading settings...</p>
            </div>
        );
    }

    return (
        <div className="container mx-auto py-6 max-w-5xl animate-in fade-in duration-500">
            <div className="mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
                <p className="text-muted-foreground text-lg mt-1">Configure your profile and manage system-wide parameters.</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-8">
                <TabsList className="md:flex-col h-auto md:w-64 bg-transparent gap-2 p-0">
                    <TabsTrigger value="profile" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                        <User className="w-5 h-5 mr-3" />
                        My Profile
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                        <Palette className="w-5 h-5 mr-3" />
                        Appearance
                    </TabsTrigger>
                    {isSuperAdmin && (
                        <>
                            <Separator className="my-2" />
                            <TabsTrigger value="system" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                                <Globe className="w-5 h-5 mr-3" />
                                System Info
                            </TabsTrigger>
                            <TabsTrigger value="branding" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                                <Image className="w-5 h-5 mr-3" />
                                Branding
                            </TabsTrigger>
                            <TabsTrigger value="workflow" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                                <Clock className="w-5 h-5 mr-3" />
                                Workflow
                            </TabsTrigger>
                            <TabsTrigger value="access" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                                <ShieldCheck className="w-5 h-5 mr-3" />
                                Access Control
                            </TabsTrigger>
                            <TabsTrigger value="tools" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                                <Wrench className="w-5 h-5 mr-3" />
                                Tools
                            </TabsTrigger>
                        </>
                    )}
                </TabsList>

                <div className="flex-1 min-w-0">
                    {/* My Profile Tab */}
                    <TabsContent value="profile" className="mt-0 space-y-6">
                        <Card className="border-none shadow-sm bg-card">
                            <CardHeader>
                                <CardTitle className="text-xl">Export Preferences</CardTitle>
                                <CardDescription>Configure how your data is exported when using the reports module.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-3">
                                    <Label htmlFor="exportFormat" className="font-semibold">Default File Format</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {[
                                            { id: 'xlsx', label: 'Excel (.xlsx)', icon: FileSpreadsheet, color: 'text-green-600' },
                                            { id: 'pdf', label: 'PDF (.pdf)', icon: FileText, color: 'text-red-600' },
                                            { id: 'docx', label: 'Word (.docx)', icon: File, color: 'text-blue-600' }
                                        ].map(format => (
                                            <div 
                                                key={format.id}
                                                onClick={() => setExportFormat(format.id as any)}
                                                className={`
                                                    cursor-pointer flex items-center gap-3 p-3 rounded-xl border-2 transition-all
                                                    ${exportFormat === format.id ? 'border-primary bg-primary/5 ring-4 ring-primary/5' : 'border-muted hover:border-muted-foreground/30'}
                                                `}
                                            >
                                                <format.icon className={`w-6 h-6 ${format.color}`} />
                                                <span className="font-medium text-sm">{format.label}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-4">
                                    <Label className="font-semibold">Granular Report Fields</Label>
                                    <div className="space-y-3">
                                        {reportTypes.map((report) => (
                                            <div key={report.key} className="border rounded-xl bg-muted/10 overflow-hidden">
                                                <div
                                                    className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/30"
                                                    onClick={() => toggleSection(report.key)}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <Checkbox
                                                            id={`${report.key}-enabled`}
                                                            checked={(exportPrefs[report.key] as any)?.enabled ?? true}
                                                            onCheckedChange={(checked) => selectAllInReport(report.key as any, checked as boolean)}
                                                            onClick={(e) => e.stopPropagation()}
                                                        />
                                                        <Label htmlFor={`${report.key}-enabled`} className="font-semibold cursor-pointer">
                                                            {report.label}
                                                        </Label>
                                                    </div>
                                                    {expandedSections[report.key] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </div>
                                                {expandedSections[report.key] && (
                                                    <div className="p-4 pt-0 border-t bg-background/50 animate-in slide-in-from-top-2 duration-200">
                                                        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 pt-4">
                                                            {report.fields.map((field) => (
                                                                <div key={field.key} className="flex items-center gap-2 hover:bg-muted/50 p-1 rounded transition-colors">
                                                                    <Checkbox
                                                                        id={`${report.key}-${field.key}`}
                                                                        checked={(exportPrefs[report.key] as any)?.[field.key] ?? true}
                                                                        onCheckedChange={(checked) => updateExportPref(report.key as any, field.key, checked as boolean)}
                                                                    />
                                                                    <Label htmlFor={`${report.key}-${field.key}`} className="text-xs font-normal cursor-pointer leading-none">
                                                                        {field.label}
                                                                    </Label>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="bg-muted/20 border-t p-4 flex justify-between items-center rounded-b-xl">
                                <p className="text-xs text-muted-foreground">These settings apply only to your account.</p>
                                <div className="flex items-center gap-3">
                                    {preferencesSaved && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 py-1">Saved Successfully</Badge>}
                                    <Button onClick={() => handleSavePreferences()} disabled={savingPreferences} size="sm">
                                        {savingPreferences ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                        Save Profile Preferences
                                    </Button>
                                </div>
                            </CardFooter>
                        </Card>

                        <Card className="border-none shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl">Notifications</CardTitle>
                                <CardDescription>Decide which alerts you want to receive via email.</CardDescription>
                            </CardHeader>
                            <CardContent className="space-y-4">
                                {[
                                    { id: 'maint', label: 'Maintenance Alerts', desc: 'New issues reported or status changes.', value: emailNotifications.maintenance, key: 'maintenance' },
                                    { id: 'hand', label: 'Handover Updates', desc: 'Checkout and checkin activity for carts.', value: emailNotifications.handover, key: 'handover' },
                                    { id: 'req', label: 'Request Status', desc: 'Approvals or rejections of car requests.', value: emailNotifications.requests, key: 'requests' },
                                    { id: 'assign', label: 'Assignment Changes', desc: 'When you are assigned or unassigned from a cart.', value: emailNotifications.assignments, key: 'assignments' }
                                ].map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-3 rounded-xl border border-muted/50 hover:bg-muted/20 transition-colors">
                                        <div className="space-y-0.5">
                                            <Label htmlFor={item.id} className="font-semibold">{item.label}</Label>
                                            <p className="text-xs text-muted-foreground">{item.desc}</p>
                                        </div>
                                        <Switch
                                            id={item.id}
                                            checked={item.value}
                                            onCheckedChange={(checked) => setEmailNotifications(prev => ({ ...prev, [item.key]: checked }))}
                                        />
                                    </div>
                                ))}
                            </CardContent>
                            <CardFooter className="justify-end border-t p-4 bg-muted/20">
                                <Button variant="outline" size="sm" onClick={() => handleSavePreferences()}>Update Notifications</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    {/* Appearance Tab */}
                    <TabsContent value="appearance" className="mt-0 space-y-6">
                        <Card className="border-none shadow-sm">
                            <CardHeader>
                                <CardTitle className="text-xl">Theme Selection</CardTitle>
                                <CardDescription>Change the visual style of the application.</CardDescription>
                            </CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                    {[
                                        { id: 'light', label: 'Light', icon: Sun, desc: 'Clean and bright' },
                                        { id: 'dark', label: 'Dark', icon: Moon, desc: 'Easy on the eyes' },
                                        { id: 'system', label: 'System', icon: Monitor, desc: 'Sync with OS' }
                                    ].map(t => (
                                        <div 
                                            key={t.id}
                                            onClick={() => setTheme(t.id as any)}
                                            className={`
                                                cursor-pointer flex flex-col items-center gap-3 p-6 rounded-2xl border-2 transition-all
                                                ${theme === t.id ? 'border-primary bg-primary/5 shadow-md ring-2 ring-primary/10' : 'border-muted hover:border-muted-foreground/30'}
                                            `}
                                        >
                                            <t.icon className={`w-8 h-8 ${theme === t.id ? 'text-primary' : 'text-muted-foreground'}`} />
                                            <div className="text-center">
                                                <p className="font-bold">{t.label}</p>
                                                <p className="text-[10px] text-muted-foreground">{t.desc}</p>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {/* SuperAdmin Tabs Content */}
                    {isSuperAdmin && (
                        <>
                            {/* System Info Tab */}
                            <TabsContent value="system" className="mt-0 space-y-6">
                                <form onSubmit={handleSaveSystem} className="space-y-6">
                                    <Card className="border-none shadow-sm">
                                        <CardHeader>
                                            <CardTitle className="text-xl">Tournament Information</CardTitle>
                                            <CardDescription>System-wide branding and naming.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-2">
                                                <Label htmlFor="tournamentName" className="font-semibold text-sm">Tournament Name</Label>
                                                <Input
                                                    id="tournamentName"
                                                    value={tournamentName}
                                                    onChange={e => setTournamentName(e.target.value)}
                                                    placeholder="e.g. Asian Games 2026"
                                                    className="h-11 rounded-lg"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="font-semibold text-sm">System Timezone</Label>
                                                <Select value={timezone} onValueChange={setTimezone}>
                                                    <SelectTrigger className="h-11 rounded-lg">
                                                        <SelectValue placeholder="Select timezone" />
                                                    </SelectTrigger>
                                                    <SelectContent className="max-h-[300px]">
                                                        <SelectItem value="UTC">UTC (Global Standard)</SelectItem>
                                                        <SelectItem value="Asia/Qatar">Asia/Qatar (UTC+3)</SelectItem>
                                                        <SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem>
                                                        <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                                                        <SelectItem value="America/New_York">US Eastern Time</SelectItem>
                                                        <SelectItem value="America/Los_Angeles">US Pacific Time</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-none shadow-sm">
                                        <CardHeader>
                                            <CardTitle className="text-xl">Feature Control</CardTitle>
                                            <CardDescription>Enable or disable modules across the entire platform.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="space-y-6">
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                                    <Wrench className="w-4 h-4" /> Operational Features
                                                </h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {[
                                                        { id: 'enableFleetManagement', label: 'Fleet Management', value: enableFleetManagement, setter: setEnableFleetManagement },
                                                        { id: 'enableCarRequests', label: 'Car Requests', value: enableCarRequests, setter: setEnableCarRequests },
                                                        { id: 'enableHandoverPhotos', label: 'Handover Photos', value: enableHandoverPhotos, setter: setEnableHandoverPhotos },
                                                        { id: 'enableBulkOperations', label: 'Bulk Operations', value: enableBulkOperations, setter: setEnableBulkOperations },
                                                    ].map(toggle => (
                                                        <div key={toggle.id} className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                                                            <Label htmlFor={toggle.id} className="font-medium text-sm">{toggle.label}</Label>
                                                            <Switch id={toggle.id} checked={toggle.value} onCheckedChange={toggle.setter} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>

                                            <Separator />

                                            <div className="space-y-4">
                                                <h4 className="text-sm font-bold text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                                                    <FileText className="w-4 h-4" /> Reporting & Management
                                                </h4>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    {[
                                                        { id: 'enableMaintenanceReports', label: 'Maintenance Reports', value: enableMaintenanceReports, setter: setEnableMaintenanceReports },
                                                        { id: 'enableAdvancedReports', label: 'Advanced Reports', value: enableAdvancedReports, setter: setEnableAdvancedReports },
                                                        { id: 'enableUserImport', label: 'User Import', value: enableUserImport, setter: setEnableUserImport },
                                                        { id: 'enableAssignmentMatrix', label: 'Assignment Matrix', value: enableAssignmentMatrix, setter: setEnableAssignmentMatrix },
                                                    ].map(toggle => (
                                                        <div key={toggle.id} className="flex items-center justify-between p-3 rounded-xl border bg-muted/20">
                                                            <Label htmlFor={toggle.id} className="font-medium text-sm">{toggle.label}</Label>
                                                            <Switch id={toggle.id} checked={toggle.value} onCheckedChange={toggle.setter} />
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </CardContent>
                                        <CardFooter className="justify-end border-t p-4 bg-muted/20">
                                            <Button type="submit" disabled={saving}>
                                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                Save System Info
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                </form>
                            </TabsContent>

                            {/* Branding Tab */}
                            <TabsContent value="branding" className="mt-0 space-y-6">
                                <Card className="border-none shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-xl">Visual Branding</CardTitle>
                                        <CardDescription>Upload assets to customize the application layout.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <ImageField label="Logo" currentUrl={logoPrev} onPreview={setLogoPrev} onFileChange={setLogoFile} />
                                            <ImageField label="Header Image" currentUrl={headerPrev} onPreview={setHeaderPrev} onFileChange={setHeaderFile} />
                                            <ImageField label="Footer Image" currentUrl={footerPrev} onPreview={setFooterPrev} onFileChange={setFooterFile} />
                                            <div className="space-y-4">
                                                <div className="space-y-2">
                                                    <Label htmlFor="footerText" className="font-semibold">Footer Text</Label>
                                                    <Textarea
                                                        id="footerText"
                                                        value={footerText}
                                                        onChange={e => setFooterText(e.target.value)}
                                                        placeholder="Copyright notice, etc."
                                                        rows={4}
                                                    />
                                                </div>
                                                <Button className="w-full" onClick={handleSaveSystem} disabled={saving}>
                                                    {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Check className="w-4 h-4 mr-2" />}
                                                    Apply Branding
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            {/* Workflow Tab */}
                            <TabsContent value="workflow" className="mt-0 space-y-6">
                                <Card className="border-none shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-xl flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />Handover Lifecycle</CardTitle>
                                        <CardDescription>Configure timeouts and event duration limits.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-bold flex items-center gap-2"><Clock className="w-4 h-4" />Handover Timeout</h4>
                                                <p className="text-xs text-muted-foreground">Automatic timeout for checkouts.</p>
                                                <div className="flex gap-4">
                                                    <div className="flex-1 space-y-2">
                                                        <Label>Days</Label>
                                                        <Input type="number" min={0} value={handoverTimeoutDays} onChange={e => setHandoverTimeoutDays(parseInt(e.target.value) || 0)} />
                                                    </div>
                                                    <div className="flex-1 space-y-2">
                                                        <Label>Hours</Label>
                                                        <Input type="number" min={0} max={23} value={handoverTimeoutHoursField} onChange={e => setHandoverTimeoutHoursField(parseInt(e.target.value) || 0)} />
                                                    </div>
                                                </div>
                                            </div>
                                            <div className="space-y-4">
                                                <h4 className="text-sm font-bold flex items-center gap-2"><SettingsIcon className="w-4 h-4" />Event Dates</h4>
                                                <div className="space-y-2">
                                                    <Label>Start Date</Label>
                                                    <Input type="datetime-local" value={handoverEventStartDate} onChange={e => setHandoverEventStartDate(e.target.value)} />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label>End Date</Label>
                                                    <Input type="datetime-local" value={handoverEventEndDate} onChange={e => setHandoverEventEndDate(e.target.value)} />
                                                </div>
                                            </div>
                                        </div>
                                        <Separator />
                                        <div className="space-y-4">
                                             <div className="flex items-center justify-between">
                                                <div className="space-y-1">
                                                    <Label className="font-bold">Proactive Reminders</Label>
                                                    <p className="text-xs text-muted-foreground">Notify users before their handover times out.</p>
                                                </div>
                                                <Switch checked={enableHandoverReminder} onCheckedChange={setEnableHandoverReminder} />
                                             </div>
                                             {enableHandoverReminder && (
                                                <div className="flex items-center gap-3 animate-in fade-in slide-in-from-left-2">
                                                    <Label className="text-sm">Remind</Label>
                                                    <Input className="w-20" type="number" value={handoverReminderHoursBefore} onChange={e => setHandoverReminderHoursBefore(parseInt(e.target.value) || 1)} />
                                                    <span className="text-sm">hours before timeout.</span>
                                                </div>
                                             )}
                                        </div>
                                    </CardContent>
                                    <CardFooter className="bg-muted/20 border-t p-4 flex justify-between">
                                        <div className="flex items-center text-xs text-muted-foreground"><HelpCircle className="w-3 h-3 mr-1" /> These settings affects all stadiums globally.</div>
                                        <Button onClick={handleSaveSystem} size="sm">Save Workflow</Button>
                                    </CardFooter>
                                </Card>

                                <Card className="border-none shadow-sm">
                                    <CardHeader>
                                        <CardTitle className="text-xl flex items-center gap-2"><Bell className="w-5 h-5 text-primary" />Alert Management</CardTitle>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <div className="space-y-2">
                                            <Label className="font-semibold">Maintenance Escalation Emails</Label>
                                            <Textarea 
                                                value={maintenanceNotificationEmails} 
                                                onChange={e => setMaintenanceNotificationEmails(e.target.value)} 
                                                placeholder="maint@venue.com, supervisor@gcms.com"
                                                rows={3}
                                            />
                                            <p className="text-[10px] text-muted-foreground">Separate multiple addresses with commas. All listed will receive high-priority alerts.</p>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end bg-muted/20 border-t p-4">
                                        <Button onClick={handleSaveSystem} variant="secondary" size="sm">Update Email List</Button>
                                    </CardFooter>
                                </Card>
                            </TabsContent>

                            {/* Access Control Tab */}
                            <TabsContent value="access" className="mt-0 space-y-6">
                                <UserAccessControl />
                            </TabsContent>

                            {/* Tools Tab */}
                            <TabsContent value="tools" className="mt-0 space-y-6">
                                <RequestLinkGenerator stadiums={stadiums} />
                                
                                <Card className="border-none shadow-sm bg-gradient-to-br from-indigo-50 to-blue-50 dark:from-indigo-950/20 dark:to-blue-950/20 border-indigo-200/50">
                                    <CardHeader>
                                        <CardTitle className="flex items-center gap-2 text-indigo-800 dark:text-indigo-300">
                                            <Megaphone className="w-5 h-5" />
                                            System-Wide Push Announcement
                                        </CardTitle>
                                        <CardDescription>Blast an important message to all or targeted user groups instantly.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="space-y-4">
                                        <Textarea
                                            value={systemAnnouncement}
                                            onChange={e => setSystemAnnouncement(e.target.value)}
                                            placeholder="ATTENTION: Main venue is currently over capacity..."
                                            className="bg-background/80"
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-2">
                                                <Label className="text-xs">Audience</Label>
                                                <Select value={announcementTarget} onValueChange={v => setAnnouncementTarget(v as any)}>
                                                    <SelectTrigger className="bg-background/80"><SelectValue /></SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">Everyone</SelectItem>
                                                        <SelectItem value="system">Admins Only</SelectItem>
                                                        <SelectItem value="fa">FA Department</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs">Self-Destruct (Expiry)</Label>
                                                <Input type="datetime-local" value={announcementExpiry} onChange={e => setAnnouncementExpiry(e.target.value)} className="bg-background/80" />
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t border-indigo-100/50 p-4">
                                        <Button
                                            className="bg-indigo-600 hover:bg-indigo-700"
                                            disabled={!systemAnnouncement.trim() || pushingAnnouncement}
                                            onClick={async () => {
                                                setPushingAnnouncement(true);
                                                try {
                                                    const res = await announcementsApi.create({
                                                        title: 'System Alert',
                                                        message: systemAnnouncement,
                                                        type: 'warning',
                                                        targetType: announcementTarget === 'system' ? 'users' : announcementTarget === 'fa' ? 'fas' : 'all',
                                                        expiresAt: announcementExpiry ? new Date(announcementExpiry).toISOString() : undefined,
                                                    });
                                                    await announcementsApi.sendNow(res.data.data.id);
                                                    setSystemAnnouncement('');
                                                    toast.success('Announcement broadcasted successfully!');
                                                } catch (err: any) {
                                                    toast.error(err.response?.data?.error || 'Broadcast failed');
                                                } finally {
                                                    setPushingAnnouncement(false);
                                                }
                                            }}
                                        >
                                            {pushingAnnouncement ? <Loader2 className="animate-spin w-4 h-4 mr-2" /> : <Megaphone className="w-4 h-4 mr-2" />}
                                            Broadcast Message
                                        </Button>
                                    </CardFooter>
                                </Card>
                            </TabsContent>
                        </>
                    )}
                </div>
            </Tabs>
        </div>
    );
}

function RequestLinkGenerator({ stadiums }: { stadiums: Stadium[] }) {
    const [selectedStadiumId, setSelectedStadiumId] = useState('');
    const [selectedDepartmentId, setSelectedDepartmentId] = useState('');
    const [generatedLink, setGeneratedLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [departments, setDepartments] = useState<Department[]>([]);
    const [loadingDepartments, setLoadingDepartments] = useState(false);

    const baseUrl = window.location.origin;

    useEffect(() => {
        const loadDepartments = async () => {
            if (!selectedStadiumId) {
                setDepartments([]);
                return;
            }
            setLoadingDepartments(true);
            try {
                const res = await departmentsApi.getAll({ stadiumId: selectedStadiumId });
                setDepartments(res.data.data || []);
            } catch (err) {
                setDepartments([]);
            } finally {
                setLoadingDepartments(false);
            }
        };
        loadDepartments();
    }, [selectedStadiumId]);

    const generateLink = () => {
        if (!selectedStadiumId) return;
        let link = `${baseUrl}/request?stadium=${selectedStadiumId}`;
        if (selectedDepartmentId) link += `&department=${selectedDepartmentId}`;
        setGeneratedLink(link);
        setCopied(false);
    };

    const copyLink = async () => {
        if (!generatedLink) return;
        try {
            await navigator.clipboard.writeText(generatedLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {}
    };

    return (
        <Card className="border-none shadow-sm border-l-4 border-l-blue-500">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><LinkIcon className="w-5 h-5 text-blue-500" />Public Request Link Generator</CardTitle>
                <CardDescription>Generate shareable links for department leads to request carts without logging in.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold">Venue / Stadium</Label>
                        <Select value={selectedStadiumId} onValueChange={(v) => { setSelectedStadiumId(v); setSelectedDepartmentId(''); setGeneratedLink(''); }}>
                            <SelectTrigger><SelectValue placeholder="Choose a venue" /></SelectTrigger>
                            <SelectContent>{stadiums.map((s) => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold">Department (Pre-select)</Label>
                        <Select
                            value={selectedDepartmentId || '__all__'}
                            onValueChange={(v) => { setSelectedDepartmentId(v === '__all__' ? '' : v); setGeneratedLink(''); }}
                            disabled={!selectedStadiumId}
                        >
                            <SelectTrigger><SelectValue placeholder={selectedStadiumId ? "All departments" : "Select venue first"} /></SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">General Request (All Depts)</SelectItem>
                                {loadingDepartments ? <SelectItem value="l" disabled>Loading...</SelectItem> : departments.map((dept) => <SelectItem key={dept.id} value={dept.id}>{dept.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Button onClick={generateLink} disabled={!selectedStadiumId} variant="outline" className="w-full md:w-auto">
                    <LinkIcon className="w-4 h-4 mr-2" />Generate Link
                </Button>

                {generatedLink && (
                    <div className="space-y-2 pt-2 animate-in slide-in-from-top-2">
                        <Label className="text-xs text-blue-600 font-bold uppercase tracking-wider">Your Generated URL</Label>
                        <div className="flex gap-2">
                            <Input value={generatedLink} readOnly className="flex-1 font-mono text-xs bg-muted" />
                            <Button variant="default" onClick={copyLink} className={copied ? 'bg-green-600' : ''}>
                                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

const AVAILABLE_PAGES = [
    { key: 'fleet', label: 'Fleet Management' },
    { key: 'handover', label: 'Handover' },
    { key: 'maintenance', label: 'Maintenance' },
    { key: 'reports', label: 'Reports' },
    { key: 'requests', label: 'Car Requests' },
    { key: 'users', label: 'User Management' },
    { key: 'departments', label: 'Departments' },
    { key: 'stadiums', label: 'Stadiums' },
    { key: 'notifications', label: 'Notifications' },
];

function UserAccessControl() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        usersApi.getAll({ role: 'Admin,Observer', limit: 100 }).then(res => {
            setUsers(res.data.data || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const handleTogglePage = async (userId: string, page: string, currentPages: string[]) => {
        const newPages = currentPages.includes(page)
            ? currentPages.filter(p => p !== page)
            : [...currentPages, page];
        setSaving(prev => ({ ...prev, [userId]: true }));
        try {
            await usersApi.update(userId, { grantedPages: newPages });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, grantedPages: newPages } : u));
        } catch (err) {
            console.error('Failed to update page access', err);
        } finally {
            setSaving(prev => ({ ...prev, [userId]: false }));
        }
    };

    const handleVenueAccess = async (userId: string, value: string) => {
        setSaving(prev => ({ ...prev, [userId]: true }));
        try {
            await usersApi.update(userId, { venueReportAccess: value });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, venueReportAccess: value } : u));
        } catch (err) {
            console.error('Failed to update venue access', err);
        } finally {
            setSaving(prev => ({ ...prev, [userId]: false }));
        }
    };

    return (
        <Card className="border-none shadow-sm">
            <CardHeader>
                <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Access Matrix</CardTitle>
                <CardDescription>Configure specific module access for venue admins and observers.</CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center py-8"><Loader2 className="w-8 h-8 animate-spin" /></div>
                ) : users.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No restricted users found.</p>
                ) : (
                    <div className="space-y-4">
                        {users.map(u => (
                            <div key={u.id} className="border rounded-xl p-5 space-y-4 bg-muted/5">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center font-bold text-primary">{u.name.charAt(0)}</div>
                                        <div>
                                            <p className="font-bold">{u.name}</p>
                                            <p className="text-xs text-muted-foreground">{u.email} · <Badge variant="secondary" className="text-[9px] py-0">{u.role}</Badge></p>
                                        </div>
                                    </div>
                                    {saving[u.id] && <Loader2 className="w-4 h-4 animate-spin text-primary" />}
                                </div>
                                <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 bg-background p-4 rounded-lg border border-muted/50">
                                    {AVAILABLE_PAGES.map(page => {
                                        const granted = (u.grantedPages || []).includes(page.key);
                                        return (
                                            <label key={page.key} className="flex items-center gap-2 text-xs font-medium cursor-pointer hover:bg-muted/30 p-1 rounded transition-colors">
                                                <Checkbox
                                                    checked={granted}
                                                    onCheckedChange={() => handleTogglePage(u.id, page.key, u.grantedPages || [])}
                                                />
                                                {page.label}
                                            </label>
                                        );
                                    })}
                                </div>
                                <div className="flex items-center gap-3 pt-2">
                                    <Label className="text-xs font-bold uppercase tracking-wider">Report Scope:</Label>
                                    <Select value={u.venueReportAccess || 'assigned'} onValueChange={v => handleVenueAccess(u.id, v)}>
                                        <SelectTrigger className="w-48 h-9 text-xs"><SelectValue /></SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="assigned">Local (Assigned Venue)</SelectItem>
                                            <SelectItem value="all">Global (All Venues)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
