import { useState, useEffect } from 'react';
import { settingsApi, usersApi, stadiumsApi, departmentsApi, announcementsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { 
    Loader2, Save, Upload, Image, FileSpreadsheet, FileText, 
    File, Link as LinkIcon, Copy, Check, Bell, Clock,
    Megaphone, Sun, Moon, Monitor, 
    ChevronDown, ChevronUp, User, Settings as SettingsIcon,
    Palette, ShieldCheck, Wrench, Globe, HelpCircle
} from 'lucide-react';
import { useAuthStore, ExportPreferences } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
    enableMaintenanceReports?: boolean;
    enableHandoverPhotos?: boolean;
    enableFleetManagement?: boolean;
    enableCarRequests?: boolean;
    enableUserImport?: boolean;
    enableBulkOperations?: boolean;
    enableAdvancedReports?: boolean;
    enableAssignmentMatrix?: boolean;
    systemAnnouncement?: string;
    announcementExpiry?: string;
    theme?: 'light' | 'dark' | 'system';
    handoverDefaultDurationDays?: number;
    handoverEventStartDate?: string;
    handoverEventEndDate?: string;
    enableHandoverReminder?: boolean;
    handoverReminderHoursBefore?: number;
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
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf' | 'docx'>(user?.exportFormat || 'xlsx');
    const [savingPreferences, setSavingPreferences] = useState(false);
    const [preferencesSaved, setPreferencesSaved] = useState(false);
    const { theme, setTheme } = useThemeStore();
    const [emailNotifications, setEmailNotifications] = useState({
        maintenance: true,
        handover: true,
        requests: true,
        assignments: true,
    });

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
                const prefs = typeof user.exportPreferences === 'string' ? JSON.parse(user.exportPreferences) : user.exportPreferences;
                return { ...defaultExportPrefs, ...prefs };
            } catch { return defaultExportPrefs; }
        }
        return defaultExportPrefs;
    });

    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        fleet: false, handover: false, maintenance: false, request: false, users: false, department: false, stadium: false,
    });

    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [tournamentName, setTournamentName] = useState('');
    const [logoFile, setLogoFile] = useState<File | null>(null);
    const [headerFile, setHeaderFile] = useState<File | null>(null);
    const [footerFile, setFooterFile] = useState<File | null>(null);
    const [logoPrev, setLogoPrev] = useState('');
    const [headerPrev, setHeaderPrev] = useState('');
    const [footerPrev, setFooterPrev] = useState('');
    const [footerText, setFooterText] = useState('');
    const [stadiums, setStadiums] = useState<Stadium[]>([]);
    const [maintenanceNotificationEmails, setMaintenanceNotificationEmails] = useState('');
    const [handoverTimeoutDays, setHandoverTimeoutDays] = useState(0);
    const [handoverTimeoutHoursField, setHandoverTimeoutHoursField] = useState(2);
    const [defaultStadiumId, setDefaultStadiumId] = useState('');
    const [enableMaintenanceReports, setEnableMaintenanceReports] = useState(true);
    const [enableHandoverPhotos, setEnableHandoverPhotos] = useState(true);
    const [enableFleetManagement, setEnableFleetManagement] = useState(true);
    const [enableCarRequests, setEnableCarRequests] = useState(true);
    const [enableUserImport, setEnableUserImport] = useState(true);
    const [enableBulkOperations, setEnableBulkOperations] = useState(true);
    const [enableAdvancedReports, setEnableAdvancedReports] = useState(true);
    const [enableAssignmentMatrix, setEnableAssignmentMatrix] = useState(true);
    const [systemAnnouncement, setSystemAnnouncement] = useState('');
    const [announcementExpiry, setAnnouncementExpiry] = useState('');
    const [announcementTarget, setAnnouncementTarget] = useState<'all' | 'system' | 'fa'>('all');
    const [pushingAnnouncement, setPushingAnnouncement] = useState(false);
    const [handoverDefaultDurationDays, setHandoverDefaultDurationDays] = useState(1);
    const [handoverEventStartDate, setHandoverEventStartDate] = useState('');
    const [handoverEventEndDate, setHandoverEventEndDate] = useState('');
    const [enableHandoverReminder, setEnableHandoverReminder] = useState(true);
    const [handoverReminderHoursBefore, setHandoverReminderHoursBefore] = useState(1);
    const [timezone, setTimezone] = useState('UTC');

    useEffect(() => {
        if (user?.exportFormat) setExportFormat(user.exportFormat as any);
        if (user?.exportPreferences) {
            try {
                const prefs = typeof user.exportPreferences === 'string' ? JSON.parse(user.exportPreferences) : user.exportPreferences;
                if (prefs.emailNotifications) setEmailNotifications(prefs.emailNotifications);
            } catch (e) { console.error(e); }
        }
    }, [user?.exportFormat, user?.exportPreferences]);

    useEffect(() => {
        const load = async () => {
            try {
                const [settingsRes, stadiumsRes] = await Promise.all([settingsApi.get(), stadiumsApi.getAll()]);
                const d: Settings = settingsRes.data.data || {};
                setTournamentName(d.tournamentName || '');
                setLogoPrev(d.logoUrl || '');
                setHeaderPrev(d.headerUrl || '');
                setFooterPrev(d.footerUrl || '');
                setFooterText(d.footerText || '');
                setMaintenanceNotificationEmails(d.maintenanceNotificationEmails || '');
                const rawMinutes = d.handoverTimeoutMinutes ?? 120;
                setHandoverTimeoutDays(Math.floor(rawMinutes / (24 * 60)));
                setHandoverTimeoutHoursField(Math.floor((rawMinutes % (24 * 60)) / 60));
                setDefaultStadiumId(d.defaultStadiumId || '');
                setEnableMaintenanceReports(d.enableMaintenanceReports ?? true);
                setEnableHandoverPhotos(d.enableHandoverPhotos ?? true);
                setEnableFleetManagement(d.enableFleetManagement ?? true);
                setEnableCarRequests(d.enableCarRequests ?? true);
                setEnableUserImport(d.enableUserImport ?? true);
                setEnableBulkOperations(d.enableBulkOperations ?? true);
                setEnableAdvancedReports(d.enableAdvancedReports ?? true);
                setEnableAssignmentMatrix(d.enableAssignmentMatrix ?? true);
                setSystemAnnouncement(d.systemAnnouncement || '');
                setAnnouncementExpiry(d.announcementExpiry ? d.announcementExpiry.slice(0, 16) : '');
                setHandoverDefaultDurationDays(d.handoverDefaultDurationDays ?? 1);
                setHandoverEventStartDate(d.handoverEventStartDate ? d.handoverEventStartDate.slice(0, 16) : '');
                setHandoverEventEndDate(d.handoverEventEndDate ? d.handoverEventEndDate.slice(0, 16) : '');
                setEnableHandoverReminder(d.enableHandoverReminder ?? true);
                setHandoverReminderHoursBefore(d.handoverReminderHoursBefore ?? 1);
                setTimezone(d.timezone || 'UTC');
                setStadiums(stadiumsRes.data.data || []);
            } catch (e) { console.error(e); } finally { setLoading(false); }
        };
        load();
    }, []);
    const handleSavePreferences = async (e?: React.FormEvent) => {
        if (e) e.preventDefault();
        setSavingPreferences(true);
        setPreferencesSaved(false);
        try {
            await usersApi.updatePreferences({ exportFormat, exportPreferences: { ...exportPrefs, emailNotifications } as any });
            updateExportFormat(exportFormat);
            useAuthStore.getState().updateExportPreferences({ ...exportPrefs, emailNotifications });
            setPreferencesSaved(true);
            toast.success('Profile preferences saved');
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

    const updateExportPref = (reportType: keyof Omit<ExportPreferences, 'theme'>, field: string, value: boolean) => {
        setExportPrefs(prev => ({ ...prev, [reportType]: { ...(prev[reportType] as any), [field]: value } }));
    };

    const selectAllInReport = (reportType: keyof Omit<ExportPreferences, 'theme'>, checked: boolean) => {
        const report = exportPrefs[reportType] as any;
        if (!report) return;
        const updates: any = { enabled: checked };
        Object.keys(report).filter(k => k !== 'enabled').forEach(f => { updates[f] = checked; });
        setExportPrefs(prev => ({ ...prev, [reportType]: updates }));
    };

    const reportTypes: { key: keyof ExportPreferences; label: string; fields: { key: string; label: string }[] }[] = [
        { key: 'fleet', label: 'Fleet Report', fields: [{ key: 'includeCarNumber', label: 'Car Number' }, { key: 'includeStatus', label: 'Status' }, { key: 'includeAssignment', label: 'Assignment' }, { key: 'includeStadium', label: 'Stadium' }, { key: 'includeDepartment', label: 'Department' }] },
        { key: 'handover', label: 'Handover Report', fields: [{ key: 'includeCarNumber', label: 'Car Number' }, { key: 'includeUser', label: 'User' }, { key: 'includeAction', label: 'Action' }, { key: 'includeTimestamp', label: 'Timestamp' }, { key: 'includeNotes', label: 'Notes' }] },
        { key: 'maintenance', label: 'Maintenance Report', fields: [{ key: 'includeCarNumber', label: 'Car Number' }, { key: 'includeIssue', label: 'Issue' }, { key: 'includeStatus', label: 'Status' }, { key: 'includeReporter', label: 'Reporter' }, { key: 'includeDates', label: 'Dates' }] },
        { key: 'request', label: 'Request Report', fields: [{ key: 'includeRequester', label: 'Requester' }, { key: 'includeDepartment', label: 'Department' }, { key: 'includeStadium', label: 'Stadium' }, { key: 'includeQuantities', label: 'Quantities' }, { key: 'includeStatus', label: 'Status' }, { key: 'includeNotes', label: 'Notes' }] },
        { key: 'users', label: 'Users Report', fields: [{ key: 'includeName', label: 'Name' }, { key: 'includeEmail', label: 'Email' }, { key: 'includeRole', label: 'Role' }, { key: 'includeStadium', label: 'Stadium' }, { key: 'includeDepartment', label: 'Department' }, { key: 'includeStatus', label: 'Status' }] },
    ];

    const handleSaveSystem = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isSuperAdmin) return;
        if (maintenanceNotificationEmails) {
            const emails = maintenanceNotificationEmails.split(',').map(e => e.trim());
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (emails.some(e => e && !emailRegex.test(e))) {
                toast.error('Invalid email format');
                return;
            }
        }
        setSaving(true);
        try {
            const fd = new FormData();
            fd.append('tournamentName', tournamentName);
            if (logoFile) fd.append('logo', logoFile);
            if (headerFile) fd.append('header', headerFile);
            if (footerFile) fd.append('footer', footerFile);
            fd.append('footerText', footerText);
            fd.append('maintenanceNotificationEmails', maintenanceNotificationEmails);
            fd.append('handoverTimeoutMinutes', String(handoverTimeoutDays * 1440 + handoverTimeoutHoursField * 60));
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
            toast.success('System settings saved');
        } catch (err: any) {
            toast.error('Failed to save settings');
        } finally {
            setSaving(false);
        }
    };

    const ImageField = ({ label, currentUrl, onPreview, onFileChange }: any) => (
        <div className="space-y-2">
            <Label className="text-sm font-semibold">{label}</Label>
            {currentUrl ? (
                <div className="relative group border rounded-lg overflow-hidden bg-muted/30 aspect-video flex items-center justify-center">
                    <img src={currentUrl} alt={label} className="max-h-full max-w-full object-contain p-2" />
                    {isSuperAdmin && (
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                             <Button type="button" variant="secondary" size="sm" onClick={() => document.getElementById(`file-${label.replace(/\s+/g, '-')}`)?.click()}>Change</Button>
                        </div>
                    )}
                </div>
            ) : (
                <div className="border border-dashed rounded-lg aspect-video flex flex-col items-center justify-center bg-muted/20 text-muted-foreground">
                    <Image className="w-8 h-8 mb-1 opacity-40" />
                    <span className="text-[10px]">No {label.toLowerCase()}</span>
                </div>
            )}
            {isSuperAdmin && (
                <Input
                    id={`file-${label.replace(/\s+/g, '-')}`}
                    type="file" accept="image/*" className="hidden"
                    onChange={e => {
                        const f = e.target.files?.[0] || null;
                        onFileChange(f);
                        if (f) onPreview(URL.createObjectURL(f));
                    }}
                />
            )}
        </div>
    );

    if (loading) return <div className="flex flex-col items-center justify-center h-[60vh] gap-4"><Loader2 className="w-10 h-10 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading...</p></div>;

    return (
        <div className="container mx-auto py-6 max-w-5xl animate-in fade-in duration-500">
            <div className="mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
                <p className="text-muted-foreground text-lg mt-1">Configure GCMS parameters.</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col md:flex-row gap-8">
                <TabsList className="md:flex-col h-auto md:w-64 bg-transparent gap-2 p-0">
                    <TabsTrigger value="profile" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                        <User className="w-5 h-5 mr-3" /> My Profile
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20">
                        <Palette className="w-5 h-5 mr-3" /> Appearance
                    </TabsTrigger>
                    {isSuperAdmin && (
                        <div className="flex flex-col gap-2 w-full">
                            <div className="my-2 h-px bg-border w-full" />
                            <TabsTrigger value="system" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"><Globe className="w-5 h-5 mr-3" /> System Info</TabsTrigger>
                            <TabsTrigger value="branding" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"><Image className="w-5 h-5 mr-3" /> Branding</TabsTrigger>
                            <TabsTrigger value="workflow" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"><Clock className="w-5 h-5 mr-3" /> Workflow</TabsTrigger>
                            <TabsTrigger value="access" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"><ShieldCheck className="w-5 h-5 mr-3" /> Access Control</TabsTrigger>
                            <TabsTrigger value="tools" className="w-full justify-start rounded-lg px-4 py-3 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20"><Wrench className="w-5 h-5 mr-3" /> Tools</TabsTrigger>
                        </div>
                    )}
                </TabsList>

                <div className="flex-1 min-w-0 space-y-6">
                    <TabsContent value="profile" className="mt-0 space-y-6">
                        <Card className="border-none shadow-sm">
                            <CardHeader><CardTitle className="text-xl">Export Preferences</CardTitle></CardHeader>
                            <CardContent className="space-y-6">
                                <div className="space-y-3">
                                    <Label className="font-semibold">Default File Format</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {[{ id: 'xlsx', icon: FileSpreadsheet, color: 'text-green-600' }, { id: 'pdf', icon: FileText, color: 'text-red-600' }, { id: 'docx', icon: File, color: 'text-blue-600' }].map(format => (
                                            <div key={format.id} onClick={() => setExportFormat(format.id as any)} className={`cursor-pointer flex items-center gap-3 p-3 rounded-xl border-2 transition-all ${exportFormat === format.id ? 'border-primary bg-primary/5' : 'border-muted hover:border-muted-foreground/30'}`}><format.icon className={`w-5 h-5 ${format.color}`} /><span className="font-medium text-sm">{format.id.toUpperCase()}</span></div>
                                        ))}
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <Label className="font-semibold">Granular Report Fields</Label>
                                    <div className="space-y-3">
                                        {reportTypes.map((report) => (
                                            <div key={report.key} className="border rounded-xl bg-muted/5 overflow-hidden">
                                                <div className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/10" onClick={() => toggleSection(report.key)}>
                                                    <div className="flex items-center gap-3"><Checkbox checked={(exportPrefs[report.key] as any)?.enabled ?? true} onCheckedChange={(checked) => selectAllInReport(report.key as any, !!checked)} onClick={(e) => e.stopPropagation()} /><span className="font-semibold text-sm">{report.label}</span></div>
                                                    {expandedSections[report.key] ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                                                </div>
                                                {expandedSections[report.key] && (
                                                    <div className="p-3 pt-0 border-t bg-background/50 grid grid-cols-2 gap-2 pt-3">
                                                        {report.fields.map((field) => (
                                                            <div key={field.key} className="flex items-center gap-2 hover:bg-muted/50 p-1 rounded transition-colors"><Checkbox checked={(exportPrefs[report.key] as any)?.[field.key] ?? true} onCheckedChange={(checked) => updateExportPref(report.key as any, field.key, !!checked)} /><span className="text-[10px]">{field.label}</span></div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </CardContent>
                            <CardFooter className="justify-end border-t p-4 bg-muted/10">
                                {preferencesSaved && <Badge variant="outline" className="mr-3 bg-green-50 text-green-700 border-green-200">Saved</Badge>}
                                <Button onClick={() => handleSavePreferences()} disabled={savingPreferences} size="sm">{savingPreferences ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Save Preferences</Button>
                            </CardFooter>
                        </Card>
                        <Card className="border-none shadow-sm">
                            <CardHeader><CardTitle className="text-xl">Email Notifications</CardTitle></CardHeader>
                            <CardContent className="space-y-3">
                                {[{ id: 'maint', label: 'Maintenance Alerts', val: emailNotifications.maintenance, k: 'maintenance' }, { id: 'hand', label: 'Handover Updates', val: emailNotifications.handover, k: 'handover' }, { id: 'req', label: 'Request Status', val: emailNotifications.requests, k: 'requests' }, { id: 'assign', label: 'Assignment Changes', val: emailNotifications.assignments, k: 'assignments' }].map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-2 rounded-lg border border-muted/50"><Label htmlFor={item.id} className="text-sm font-medium">{item.label}</Label><Switch id={item.id} checked={item.val} onCheckedChange={(checked) => setEmailNotifications(prev => ({ ...prev, [item.k]: checked }))} /></div>
                                ))}
                            </CardContent>
                            <CardFooter className="justify-end border-t p-4 bg-muted/10"><Button variant="outline" size="sm" onClick={() => handleSavePreferences()}>Update Notifications</Button></CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="appearance" className="mt-0">
                        <Card className="border-none shadow-sm">
                            <CardHeader><CardTitle>Theme</CardTitle></CardHeader>
                            <CardContent>
                                <div className="grid grid-cols-3 gap-4">
                                    {[{ id: 'light', label: 'Light', icon: Sun }, { id: 'dark', label: 'Dark', icon: Moon }, { id: 'system', label: 'System', icon: Monitor }].map(t => (
                                        <div key={t.id} onClick={() => setTheme(t.id as any)} className={`cursor-pointer flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${theme === t.id ? 'border-primary bg-primary/5 shadow-sm' : 'border-muted hover:border-muted-foreground/30'}`}><t.icon className={`w-6 h-6 ${theme === t.id ? 'text-primary' : 'text-muted-foreground'}`} /><span className="font-bold text-xs">{t.label}</span></div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {isSuperAdmin && (
                        <>
                            <TabsContent value="system" className="mt-0 space-y-6">
                                <form onSubmit={handleSaveSystem} className="space-y-6">
                                    <Card className="border-none shadow-sm">
                                        <CardHeader><CardTitle>System Identity</CardTitle></CardHeader>
                                        <CardContent className="space-y-4">
                                            <div className="space-y-2"><Label className="text-xs font-bold">Tournament Name</Label><Input value={tournamentName} onChange={e => setTournamentName(e.target.value)} className="h-10" /></div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold">Timezone</Label>
                                                <Select value={timezone} onValueChange={setTimezone}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="UTC">UTC</SelectItem><SelectItem value="Asia/Qatar">Asia/Qatar</SelectItem></SelectContent></Select>
                                            </div>
                                        </CardContent>
                                    </Card>
                                    <Card className="border-none shadow-sm">
                                        <CardHeader><CardTitle>Module Control</CardTitle></CardHeader>
                                        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[{ label: 'Fleet Management', val: enableFleetManagement, set: setEnableFleetManagement }, { label: 'Car Requests', val: enableCarRequests, set: setEnableCarRequests }, { label: 'Handover Photos', val: enableHandoverPhotos, set: setEnableHandoverPhotos }, { label: 'Maintenance Reports', val: enableMaintenanceReports, set: setEnableMaintenanceReports }, { label: 'User Import', val: enableUserImport, set: setEnableUserImport }, { label: 'Bulk Operations', val: enableBulkOperations, set: setEnableBulkOperations }, { label: 'Advanced Reports', val: enableAdvancedReports, set: setEnableAdvancedReports }, { label: 'Assignment Matrix', val: enableAssignmentMatrix, set: setEnableAssignmentMatrix }].map((f, i) => (
                                                <div key={i} className="flex items-center justify-between p-3 rounded-lg border bg-muted/10"><Label className="text-sm font-medium">{f.label}</Label><Switch checked={f.val} onCheckedChange={f.set} /></div>
                                            ))}
                                        </CardContent>
                                        <CardFooter className="justify-end border-t p-4 bg-muted/10"><Button type="submit" disabled={saving}>{saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}Save System</Button></CardFooter>
                                    </Card>
                                </form>
                            </TabsContent>
                            <TabsContent value="branding" className="mt-0 space-y-6">
                                <Card className="border-none shadow-sm">
                                    <CardHeader><CardTitle>Visual Assets</CardTitle></CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <ImageField label="Logo" currentUrl={logoPrev} onPreview={setLogoPrev} onFileChange={setLogoFile} />
                                            <ImageField label="Header Image" currentUrl={headerPrev} onPreview={setHeaderPrev} onFileChange={setHeaderFile} />
                                            <ImageField label="Footer Image" currentUrl={footerPrev} onPreview={setFooterPrev} onFileChange={setFooterFile} />
                                            <div className="space-y-2"><Label className="text-xs font-bold">Footer Text</Label><Textarea value={footerText} onChange={e => setFooterText(e.target.value)} rows={5} /><Button className="w-full mt-2" onClick={handleSaveSystem} disabled={saving}>Apply Branding</Button></div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>
                            <TabsContent value="workflow" className="mt-0 space-y-6">
                                <Card className="border-none shadow-sm">
                                    <CardHeader><CardTitle>Handover Logic</CardTitle></CardHeader>
                                    <CardContent className="space-y-6">
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1"><Label className="text-[10px] font-bold uppercase">Timeout Days</Label><Input type="number" value={handoverTimeoutDays} onChange={e => setHandoverTimeoutDays(parseInt(e.target.value) || 0)} /></div>
                                            <div className="space-y-1"><Label className="text-[10px] font-bold uppercase">Timeout Hours</Label><Input type="number" value={handoverTimeoutHoursField} onChange={e => setHandoverTimeoutHoursField(parseInt(e.target.value) || 0)} /></div>
                                        </div>
                                        <div className="space-y-2"><Label className="text-xs font-bold">Escalation Emails</Label><Textarea value={maintenanceNotificationEmails} onChange={e => setMaintenanceNotificationEmails(e.target.value)} placeholder="email@test.com" /><p className="text-[9px] text-muted-foreground">Comma-separated email addresses.</p></div>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t p-4 bg-muted/10"><Button onClick={handleSaveSystem} size="sm">Save Workflow</Button></CardFooter>
                                </Card>
                            </TabsContent>
                            <TabsContent value="access" className="mt-0">
                                <UserAccessControl />
                            </TabsContent>
                            <TabsContent value="tools" className="mt-0 space-y-6">
                                <RequestLinkGenerator stadiums={stadiums} />
                                <Card className="border-none shadow-sm bg-indigo-50/30 dark:bg-indigo-950/10">
                                    <CardHeader><CardTitle className="text-indigo-700">Push Announcement</CardTitle></CardHeader>
                                    <CardContent className="space-y-4">
                                        <Textarea value={systemAnnouncement} onChange={e => setSystemAnnouncement(e.target.value)} placeholder="Type message..." />
                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold uppercase">Target</Label>
                                                <Select value={announcementTarget} onValueChange={v => setAnnouncementTarget(v as any)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Everyone</SelectItem><SelectItem value="system">Admins</SelectItem><SelectItem value="fa">FA Team</SelectItem></SelectContent></Select>
                                            </div>
                                            <div className="space-y-1">
                                                <Label className="text-[10px] font-bold uppercase">Expiry</Label>
                                                <Input type="datetime-local" value={announcementExpiry} onChange={e => setAnnouncementExpiry(e.target.value)} />
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t p-4"><Button className="bg-indigo-600 hover:bg-indigo-700" disabled={!systemAnnouncement.trim() || pushingAnnouncement} onClick={async () => { setPushingAnnouncement(true); try { const res = await announcementsApi.create({ title: 'Alert', message: systemAnnouncement, type: 'warning', targetType: announcementTarget === 'system' ? 'users' : announcementTarget === 'fa' ? 'fas' : 'all', expiresAt: announcementExpiry ? new Date(announcementExpiry).toISOString() : undefined }); await announcementsApi.sendNow(res.data.data.id); setSystemAnnouncement(''); toast.success('Broadcast sent'); } catch (err: any) { toast.error('Broadcast failed'); } finally { setPushingAnnouncement(false); } }}>Broadcast Now</Button></CardFooter>
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
    const [stadiumId, setStadiumId] = useState('');
    const [deptId, setDeptId] = useState('');
    const [link, setLink] = useState('');
    const [copied, setCopied] = useState(false);
    const [depts, setDepts] = useState<Department[]>([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!stadiumId) { setDepts([]); return; }
        setLoading(true);
        departmentsApi.getAll({ stadiumId }).then(res => setDepts(res.data.data || [])).catch(() => setDepts([])).finally(() => setLoading(false));
    }, [stadiumId]);

    const copyLink = async () => {
        if (!link) return;
        try { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); toast.success('Copied'); } catch (err) {}
    };

    return (
        <Card className="border-none shadow-sm border-l-4 border-l-blue-500">
            <CardHeader><CardTitle className="text-blue-700">Public Request Link</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-1"><Label className="text-[10px] font-bold uppercase">Venue</Label><Select value={stadiumId} onValueChange={v => { setStadiumId(v); setDeptId(''); setLink(''); }}><SelectTrigger><SelectValue placeholder="Select venue" /></SelectTrigger><SelectContent>{stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}</SelectContent></Select></div>
                    <div className="space-y-1"><Label className="text-[10px] font-bold uppercase">Department</Label><Select value={deptId || '__all__'} onValueChange={v => { setDeptId(v === '__all__' ? '' : v); setLink(''); }} disabled={!stadiumId}><SelectTrigger><SelectValue placeholder="All" /></SelectTrigger><SelectContent><SelectItem value="__all__">General (All)</SelectItem>{departments.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}</SelectContent></Select></div>
                </div>
                <Button onClick={() => setLink(`${window.location.origin}/request?stadium=${stadiumId}${deptId && deptId !== '__all__' ? `&department=${deptId}` : ''}`)} disabled={!stadiumId} variant="outline" className="w-full">Generate</Button>
                {link && <div className="flex gap-2 animate-in slide-in-from-top-2 pt-2"><Input value={link} readOnly className="text-[10px] font-mono" /><Button onClick={copyLink}>{copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}</Button></div>}
            </CardContent>
        </Card>
    );
}

function UserAccessControl() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        usersApi.getAll({ role: 'Admin,Observer', limit: 100 }).then(res => { setUsers(res.data.data || []); }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const handleToggle = async (userId: string, page: string, current: string[]) => {
        const next = current.includes(page) ? current.filter(p => p !== page) : [...current, page];
        setSaving(prev => ({ ...prev, [userId]: true }));
        try { await usersApi.update(userId, { grantedPages: next }); setUsers(prev => prev.map(u => u.id === userId ? { ...u, grantedPages: next } : u)); } catch (e) { toast.error('Update failed'); } finally { setSaving(prev => ({ ...prev, [userId]: false })); }
    };

    if (loading) return <div className="flex justify-center p-8"><Loader2 className="animate-spin" /></div>;

    return (
        <Card className="border-none shadow-sm">
            <CardHeader><CardTitle>Access Matrix</CardTitle></CardHeader>
            <CardContent className="space-y-4">
                {users.map(u => (
                    <div key={u.id} className="border rounded-lg p-4 space-y-3 bg-muted/5">
                        <div className="flex justify-between items-center"><span className="font-bold text-sm">{u.name} ({u.role})</span>{saving[u.id] && <Loader2 className="w-4 h-4 animate-spin text-primary" />}</div>
                        <div className="grid grid-cols-3 gap-2">
                            {['fleet', 'handover', 'maintenance', 'reports', 'requests', 'users', 'departments', 'stadiums', 'notifications'].map(page => (
                                <label key={page} className="flex items-center gap-1 text-[10px] cursor-pointer"><Checkbox checked={(u.grantedPages || []).includes(page)} onCheckedChange={() => handleToggle(u.id, page, u.grantedPages || [])} />{page.charAt(0).toUpperCase() + page.slice(1)}</label>
                            ))}
                        </div>
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}
