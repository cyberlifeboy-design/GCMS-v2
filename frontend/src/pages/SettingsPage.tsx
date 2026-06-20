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
    ChevronDown, ChevronUp, User, Plus, Trash2, GripVertical,
    Palette, ShieldCheck, Wrench, Globe, Users
} from 'lucide-react';
import { RichEditor } from '@/components/ui/rich-editor';
import { useAuthStore, ExportPreferences } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { Separator } from '@/components/ui/separator';

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
    handoverTcEnTitle?: string;
    handoverTcEnBody?: string;
    handoverTcArTitle?: string;
    handoverTcArBody?: string;
    handoverTcCheckboxes?: string;
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

    // Notification preferences
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

    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({
        fleet: false, handover: false, maintenance: false, request: false, users: false, department: false, stadium: false,
    });

    // System settings
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

    // SuperAdmin only settings
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
    const [tcEnTitle, setTcEnTitle] = useState('');
    const [tcEnBody, setTcEnBody] = useState('');
    const [tcArTitle, setTcArTitle] = useState('');
    const [tcArBody, setTcArBody] = useState('');

    type TcCheckbox = { id: string; en: string; ar: string };
    const DEFAULT_TC_CHECKBOXES: TcCheckbox[] = [
        { id: 'tc1', en: 'I confirm that I have read, understood and agree to comply with these Terms and Conditions.', ar: 'أؤكد أنني قرأت هذه الشروط والأحكام وفهمتها وأوافق على الامتثال لها.' },
        { id: 'tc2', en: 'I confirm that I have read, understood and agree to comply with the LOC Golf Cart Usage Policy & Procedure.', ar: 'أؤكد أنني قرأت سياسة وإجراءات استخدام عربة الجولف الخاصة بـ LOC وأوافق على الامتثال لها.' },
        { id: 'tc3', en: 'I confirm that I have completed the Venue specific Golf Cart familiarisation.', ar: 'أؤكد أنني أكملت التعريف بعربة الجولف الخاص بالمنشأة.' },
    ];
    const [tcCheckboxes, setTcCheckboxes] = useState<TcCheckbox[]>(DEFAULT_TC_CHECKBOXES);

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
                setTcEnTitle(d.handoverTcEnTitle || '');
                setTcEnBody(d.handoverTcEnBody || '');
                setTcArTitle(d.handoverTcArTitle || '');
                setTcArBody(d.handoverTcArBody || '');
                if (d.handoverTcCheckboxes) {
                    try { setTcCheckboxes(JSON.parse(d.handoverTcCheckboxes)); } catch {}
                }
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
            await usersApi.updatePreferences({
                exportFormat,
                exportPreferences: { ...exportPrefs, emailNotifications } as any,
            });
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
                toast.error('Invalid email format detected');
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
            fd.append('handoverTcEnTitle', tcEnTitle);
            fd.append('handoverTcEnBody', tcEnBody);
            fd.append('handoverTcArTitle', tcArTitle);
            fd.append('handoverTcArBody', tcArBody);
            fd.append('handoverTcCheckboxes', JSON.stringify(tcCheckboxes));
            await settingsApi.update(fd);
            toast.success('System settings saved');
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save system settings');
        } finally {
            setSaving(false);
        }
    };

    const ImageField = ({ label, currentUrl, onPreview, onFileChange }: { label: string; currentUrl: string; onPreview: (url: string) => void; onFileChange: (file: File | null) => void }) => {
        const inputId = `file-${label.replace(/\s+/g, '-')}`;
        const triggerUpload = () => document.getElementById(inputId)?.click();
        return (
            <div className="space-y-2">
                <Label className="text-sm font-semibold">{label}</Label>
                {currentUrl ? (
                    <div className="relative group border rounded-lg overflow-hidden bg-muted/30 aspect-video flex items-center justify-center">
                        <img src={currentUrl} alt={label} className="max-h-full max-w-full object-contain p-2" />
                        {isSuperAdmin && (
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                                <Button type="button" variant="secondary" size="sm" onClick={triggerUpload}>
                                    <Upload className="w-4 h-4 mr-2" /> Change
                                </Button>
                                <Button type="button" variant="destructive" size="sm" onClick={() => { onFileChange(null); onPreview(''); }}>
                                    Remove
                                </Button>
                            </div>
                        )}
                    </div>
                ) : (
                    <div
                        onClick={isSuperAdmin ? triggerUpload : undefined}
                        className={`border-2 border-dashed rounded-lg aspect-video flex flex-col items-center justify-center bg-muted/20 text-muted-foreground transition-colors ${isSuperAdmin ? 'cursor-pointer hover:border-primary/50 hover:bg-primary/5' : ''}`}
                    >
                        <Upload className="w-8 h-8 mb-2 opacity-40" />
                        <span className="text-sm font-medium">{isSuperAdmin ? `Click to upload ${label}` : `No ${label.toLowerCase()}`}</span>
                        {isSuperAdmin && <span className="text-[10px] text-muted-foreground/60 mt-1">PNG, JPG, SVG up to 5MB</span>}
                    </div>
                )}
                {isSuperAdmin && (
                    <Input
                        id={inputId}
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
    };

    if (loading) return <div className="flex flex-col items-center justify-center h-[60vh] gap-4"><Loader2 className="w-10 h-10 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Loading settings...</p></div>;

    return (
        <div className="container mx-auto py-6 max-w-6xl animate-in fade-in duration-500">
            <div className="mb-8">
                <h1 className="text-4xl font-extrabold tracking-tight">Settings</h1>
                <p className="text-muted-foreground text-lg mt-1">Configure GCMS parameters and your personal preferences.</p>
            </div>

            <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col lg:flex-row gap-10">
                <TabsList className="lg:flex-col h-auto lg:w-72 bg-transparent gap-2 p-0">
                    <TabsTrigger value="profile" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                        <User className="w-5 h-5 mr-3" /> My Profile
                    </TabsTrigger>
                    <TabsTrigger value="appearance" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                        <Palette className="w-5 h-5 mr-3" /> Appearance
                    </TabsTrigger>
                    {isSuperAdmin && (
                        <div className="flex flex-col gap-2 w-full mt-4">
                            <div className="px-5 py-2">
                                <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/60">System Administration</span>
                            </div>
                            <TabsTrigger value="system" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                                <Globe className="w-5 h-5 mr-3" /> System Info
                            </TabsTrigger>
                            <TabsTrigger value="branding" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                                <Image className="w-5 h-5 mr-3" /> Branding
                            </TabsTrigger>
                            <TabsTrigger value="workflow" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                                <Clock className="w-5 h-5 mr-3" /> Workflow
                            </TabsTrigger>
                            <TabsTrigger value="handover-tc" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                                <FileText className="w-5 h-5 mr-3" /> Handover T&amp;C
                            </TabsTrigger>
                            <TabsTrigger value="access" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                                <ShieldCheck className="w-5 h-5 mr-3" /> Access Control
                            </TabsTrigger>
                            <TabsTrigger value="tools" className="w-full justify-start rounded-xl px-5 py-3.5 data-[state=active]:bg-primary/10 data-[state=active]:text-primary border border-transparent data-[state=active]:border-primary/20 transition-all font-medium">
                                <Wrench className="w-5 h-5 mr-3" /> Tools
                            </TabsTrigger>
                        </div>
                    )}
                </TabsList>

                <div className="flex-1 min-w-0 space-y-8">
                    <TabsContent value="profile" className="mt-0 space-y-8">
                        <Card className="border-none shadow-md overflow-hidden">
                            <CardHeader className="bg-muted/10">
                                <CardTitle className="text-2xl">Export Preferences</CardTitle>
                                <CardDescription>Customize how your reports are generated and formatted.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8 space-y-8">
                                <div className="space-y-4">
                                    <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Default File Format</Label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                                        {[
                                            { id: 'xlsx', icon: FileSpreadsheet, color: 'text-green-600', label: 'Excel Spreadsheet' },
                                            { id: 'pdf', icon: FileText, color: 'text-red-600', label: 'PDF Document' },
                                            { id: 'docx', icon: File, color: 'text-blue-600', label: 'Word Document' }
                                        ].map(format => (
                                            <div 
                                                key={format.id} 
                                                onClick={() => setExportFormat(format.id as any)} 
                                                className={`cursor-pointer flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 ${exportFormat === format.id ? 'border-primary bg-primary/5 shadow-inner' : 'border-muted hover:border-muted-foreground/20 hover:bg-muted/5'}`}
                                            >
                                                <format.icon className={`w-8 h-8 ${format.color}`} />
                                                <div className="text-center">
                                                    <span className="font-bold text-sm block">{format.id.toUpperCase()}</span>
                                                    <span className="text-[10px] text-muted-foreground">{format.label}</span>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <Separator />

                                <div className="space-y-5">
                                    <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Granular Report Fields</Label>
                                    <div className="grid grid-cols-1 gap-4">
                                        {reportTypes.map((report) => (
                                            <div key={report.key} className="border rounded-2xl bg-muted/5 overflow-hidden transition-all border-muted/50">
                                                <div className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/10" onClick={() => toggleSection(report.key)}>
                                                    <div className="flex items-center gap-4">
                                                        <Checkbox 
                                                            checked={(exportPrefs[report.key] as any)?.enabled ?? true} 
                                                            onCheckedChange={(checked) => selectAllInReport(report.key as any, !!checked)} 
                                                            onClick={(e) => e.stopPropagation()} 
                                                        />
                                                        <span className="font-bold text-base">{report.label}</span>
                                                    </div>
                                                    {expandedSections[report.key] ? <ChevronUp className="w-5 h-5 text-muted-foreground" /> : <ChevronDown className="w-5 h-5 text-muted-foreground" />}
                                                </div>
                                                {expandedSections[report.key] && (
                                                    <div className="p-6 pt-0 border-t border-muted/30 bg-background/50 animate-in slide-in-from-top-2 duration-300">
                                                        <div className="grid grid-cols-2 md:grid-cols-3 gap-y-4 gap-x-6 pt-5">
                                                            {report.fields.map((field) => (
                                                                <div key={field.key} className="flex items-center gap-3 p-1 rounded-lg hover:bg-muted/20 transition-colors">
                                                                    <Checkbox 
                                                                        id={`${report.key}-${field.key}`}
                                                                        checked={(exportPrefs[report.key] as any)?.[field.key] ?? true} 
                                                                        onCheckedChange={(checked) => updateExportPref(report.key as any, field.key, !!checked)} 
                                                                    />
                                                                    <Label htmlFor={`${report.key}-${field.key}`} className="text-sm font-medium cursor-pointer leading-tight">{field.label}</Label>
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
                            <CardFooter className="justify-end border-t p-5 bg-muted/5 gap-4">
                                {preferencesSaved && <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200 animate-in fade-in zoom-in-95">Settings Saved</Badge>}
                                <Button onClick={() => handleSavePreferences()} disabled={savingPreferences} className="rounded-xl px-6">
                                    {savingPreferences ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                    Save Profile Preferences
                                </Button>
                            </CardFooter>
                        </Card>

                        <Card className="border-none shadow-md overflow-hidden">
                            <CardHeader className="bg-muted/10">
                                <CardTitle className="text-2xl">Email Notifications</CardTitle>
                                <CardDescription>Manage which events trigger an email alert to your registered address.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8 grid grid-cols-1 md:grid-cols-2 gap-4">
                                {[
                                    { id: 'maint', label: 'Maintenance Alerts', val: emailNotifications.maintenance, k: 'maintenance', icon: Wrench },
                                    { id: 'hand', label: 'Handover Updates', val: emailNotifications.handover, k: 'handover', icon: Clock },
                                    { id: 'req', label: 'Request Status', val: emailNotifications.requests, k: 'requests', icon: FileText },
                                    { id: 'assign', label: 'Assignment Changes', val: emailNotifications.assignments, k: 'assignments', icon: ShieldCheck }
                                ].map(item => (
                                    <div key={item.id} className="flex items-center justify-between p-4 rounded-2xl border border-muted/50 hover:border-primary/30 transition-all bg-card shadow-sm">
                                        <div className="flex items-center gap-3">
                                            <div className="p-2 rounded-lg bg-primary/10 text-primary">
                                                <item.icon className="w-4 h-4" />
                                            </div>
                                            <Label htmlFor={item.id} className="text-sm font-bold cursor-pointer">{item.label}</Label>
                                        </div>
                                        <Switch 
                                            id={item.id} 
                                            checked={item.val} 
                                            onCheckedChange={(checked) => setEmailNotifications(prev => ({ ...prev, [item.k]: checked }))} 
                                        />
                                    </div>
                                ))}
                            </CardContent>
                            <CardFooter className="justify-end border-t p-5 bg-muted/5">
                                <Button variant="outline" onClick={() => handleSavePreferences()} className="rounded-xl">Update Notification Settings</Button>
                            </CardFooter>
                        </Card>
                    </TabsContent>

                    <TabsContent value="appearance" className="mt-0">
                        <Card className="border-none shadow-md overflow-hidden">
                            <CardHeader className="bg-muted/10">
                                <CardTitle className="text-2xl">Visual Theme</CardTitle>
                                <CardDescription>Select your preferred appearance for the application.</CardDescription>
                            </CardHeader>
                            <CardContent className="p-8">
                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                                    {[
                                        { id: 'light', label: 'Light', icon: Sun, desc: 'Clean, high-contrast look' },
                                        { id: 'dark', label: 'Dark', icon: Moon, desc: 'Easier on the eyes at night' },
                                        { id: 'system', label: 'System', icon: Monitor, desc: 'Matches your OS settings' }
                                    ].map(t => (
                                        <div 
                                            key={t.id} 
                                            onClick={() => setTheme(t.id as any)} 
                                            className={`cursor-pointer flex flex-col items-center gap-4 p-8 rounded-3xl border-2 transition-all duration-300 ${theme === t.id ? 'border-primary bg-primary/5 shadow-lg' : 'border-muted hover:border-muted-foreground/20 hover:bg-muted/5'}`}
                                        >
                                            <div className={`p-4 rounded-2xl ${theme === t.id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                                                <t.icon className="w-8 h-8" />
                                            </div>
                                            <div className="text-center">
                                                <span className="font-bold text-lg block">{t.label}</span>
                                                <span className="text-xs text-muted-foreground">{t.desc}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    </TabsContent>

                    {isSuperAdmin && (
                        <>
                            <TabsContent value="system" className="mt-0 space-y-8">
                                <form onSubmit={handleSaveSystem} className="space-y-8">
                                    <Card className="border-none shadow-md">
                                        <CardHeader><CardTitle className="text-2xl">System Identity</CardTitle></CardHeader>
                                        <CardContent className="p-8 space-y-6">
                                            <div className="space-y-2">
                                                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Tournament Name</Label>
                                                <Input value={tournamentName} onChange={e => setTournamentName(e.target.value)} className="h-12 rounded-xl text-lg font-medium" placeholder="Enter tournament name" />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Global Timezone</Label>
                                                <Select value={timezone} onValueChange={setTimezone}>
                                                    <SelectTrigger className="h-12 rounded-xl">
                                                        <SelectValue placeholder="Select timezone" />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="UTC">UTC (Universal Time Coordinated)</SelectItem>
                                                        <SelectItem value="Asia/Qatar">Asia/Qatar (UTC+3)</SelectItem>
                                                        <SelectItem value="Asia/Dubai">Asia/Dubai (UTC+4)</SelectItem>
                                                        <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                        </CardContent>
                                    </Card>

                                    <Card className="border-none shadow-md overflow-hidden">
                                        <CardHeader className="bg-muted/10">
                                            <CardTitle className="text-2xl">Module Configuration</CardTitle>
                                            <CardDescription>Enable or disable major features across the platform.</CardDescription>
                                        </CardHeader>
                                        <CardContent className="p-8">
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                {[
                                                    { label: 'Fleet Management', val: enableFleetManagement, set: setEnableFleetManagement, icon: Wrench },
                                                    { label: 'Car Requests', val: enableCarRequests, set: setEnableCarRequests, icon: FileText },
                                                    { label: 'Handover Photos', val: enableHandoverPhotos, set: setEnableHandoverPhotos, icon: Image },
                                                    { label: 'Maintenance Reports', val: enableMaintenanceReports, set: setEnableMaintenanceReports, icon: Bell },
                                                    { label: 'User Import', val: enableUserImport, set: setEnableUserImport, icon: User },
                                                    { label: 'Bulk Operations', val: enableBulkOperations, set: setEnableBulkOperations, icon: Check },
                                                    { label: 'Advanced Reports', val: enableAdvancedReports, set: setEnableAdvancedReports, icon: FileSpreadsheet },
                                                    { label: 'Assignment Matrix', val: enableAssignmentMatrix, set: setEnableAssignmentMatrix, icon: ShieldCheck },
                                                ].map((f, i) => (
                                                    <div key={i} className="flex items-center justify-between p-4 rounded-2xl border bg-muted/10 border-muted/50 hover:bg-muted/20 transition-all">
                                                        <div className="flex items-center gap-3">
                                                            <div className="p-2 rounded-lg bg-background text-muted-foreground">
                                                                <f.icon className="w-4 h-4" />
                                                            </div>
                                                            <Label className="text-sm font-bold">{f.label}</Label>
                                                        </div>
                                                        <Switch checked={f.val} onCheckedChange={f.set} />
                                                    </div>
                                                ))}
                                            </div>
                                        </CardContent>
                                        <CardFooter className="justify-end border-t p-5 bg-muted/5">
                                            <Button type="submit" disabled={saving} className="rounded-xl px-8 h-12">
                                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                Update Global Settings
                                            </Button>
                                        </CardFooter>
                                    </Card>
                                </form>
                            </TabsContent>

                            <TabsContent value="branding" className="mt-0">
                                <Card className="border-none shadow-md">
                                    <CardHeader><CardTitle className="text-2xl">Branding Assets</CardTitle></CardHeader>
                                    <CardContent className="p-8 space-y-8">
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                                            <div className="space-y-8">
                                                <ImageField label="Logo" currentUrl={logoPrev} onPreview={setLogoPrev} onFileChange={setLogoFile} />
                                                <ImageField label="Header Background" currentUrl={headerPrev} onPreview={setHeaderPrev} onFileChange={setHeaderFile} />
                                                <ImageField label="Footer Background" currentUrl={footerPrev} onPreview={setFooterPrev} onFileChange={setFooterFile} />
                                            </div>
                                            <div className="space-y-6">
                                                <div className="space-y-2">
                                                    <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Footer Copyright Text</Label>
                                                    <Textarea value={footerText} onChange={e => setFooterText(e.target.value)} rows={8} className="rounded-2xl p-4 bg-muted/5" placeholder="Enter copyright notice or footer notes..." />
                                                </div>
                                                <Button className="w-full h-12 rounded-xl text-lg font-bold" onClick={handleSaveSystem} disabled={saving}>
                                                    <Upload className="w-5 h-5 mr-2" /> Apply All Branding
                                                </Button>
                                            </div>
                                        </div>
                                    </CardContent>
                                </Card>
                            </TabsContent>

                            <TabsContent value="workflow" className="mt-0 space-y-8">
                                <Card className="border-none shadow-md overflow-hidden">
                                    <CardHeader className="bg-muted/10">
                                        <CardTitle className="text-2xl">Workflow Parameters</CardTitle>
                                        <CardDescription>Configure the underlying logic for handovers and maintenance escalation.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-8">
                                        <div className="space-y-4">
                                            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Handover Timeout Duration</Label>
                                            <div className="grid grid-cols-2 gap-6">
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-medium">Days</Label>
                                                    <Input type="number" value={handoverTimeoutDays} onChange={e => setHandoverTimeoutDays(parseInt(e.target.value) || 0)} className="h-12 rounded-xl" />
                                                </div>
                                                <div className="space-y-2">
                                                    <Label className="text-xs font-medium">Hours</Label>
                                                    <Input type="number" value={handoverTimeoutHoursField} onChange={e => setHandoverTimeoutHoursField(parseInt(e.target.value) || 0)} className="h-12 rounded-xl" />
                                                </div>
                                            </div>
                                            <p className="text-xs text-muted-foreground">Carts not returned within this timeframe will be marked as 'Timed Out'.</p>
                                        </div>

                                        <Separator />

                                        <div className="space-y-4">
                                            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Maintenance Escalation</Label>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">Distribution Emails (Comma-separated)</Label>
                                                <Textarea value={maintenanceNotificationEmails} onChange={e => setMaintenanceNotificationEmails(e.target.value)} placeholder="maint@tournament.com, support@gcms.com" className="rounded-2xl p-4 bg-muted/5 min-h-[120px]" />
                                                <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Bell className="w-3 h-3" /> High-priority maintenance reports will be sent to these addresses.</p>
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t p-5 bg-muted/5">
                                        <Button onClick={handleSaveSystem} className="rounded-xl px-8 h-11">Save Workflow Configuration</Button>
                                    </CardFooter>
                                </Card>
                            </TabsContent>

                            <TabsContent value="handover-tc" className="mt-0 space-y-6">
                                {/* ── T&C Body Editor ── */}
                                <Card className="border-none shadow-md overflow-hidden">
                                    <CardHeader className="bg-muted/10">
                                        <CardTitle className="text-2xl">Handover Form — Terms &amp; Conditions</CardTitle>
                                        <CardDescription>
                                            Rich text displayed on every handover form. Leave blank to use the built-in default text.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-8">
                                        {/* English */}
                                        <div className="space-y-4">
                                            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">English</Label>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">Section Title</Label>
                                                <Input
                                                    value={tcEnTitle}
                                                    onChange={e => setTcEnTitle(e.target.value)}
                                                    placeholder="USE OF GOLF CART — TERMS AND CONDITIONS"
                                                    className="h-12 rounded-xl"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">Body Content</Label>
                                                <RichEditor
                                                    value={tcEnBody}
                                                    onChange={setTcEnBody}
                                                    placeholder="Enter English terms and conditions..."
                                                    dir="ltr"
                                                    minHeight={200}
                                                />
                                            </div>
                                        </div>

                                        <Separator />

                                        {/* Arabic */}
                                        <div className="space-y-4">
                                            <Label className="text-sm font-bold uppercase tracking-wider text-muted-foreground">Arabic / عربي</Label>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">عنوان القسم / Section Title</Label>
                                                <Input
                                                    value={tcArTitle}
                                                    onChange={e => setTcArTitle(e.target.value)}
                                                    placeholder="شروط وأحكام استخدام عربة الجولف"
                                                    className="h-12 rounded-xl"
                                                    dir="rtl"
                                                />
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-medium">نص الشروط / Body Content</Label>
                                                <RichEditor
                                                    value={tcArBody}
                                                    onChange={setTcArBody}
                                                    placeholder="أدخل الشروط والأحكام باللغة العربية..."
                                                    dir="rtl"
                                                    minHeight={200}
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t p-5 bg-muted/5">
                                        <Button onClick={handleSaveSystem} className="rounded-xl px-8 h-11">Save T&amp;C Text</Button>
                                    </CardFooter>
                                </Card>

                                {/* ── Confirmation Checkboxes Manager ── */}
                                <Card className="border-none shadow-md overflow-hidden">
                                    <CardHeader className="bg-muted/10">
                                        <CardTitle className="text-xl">Confirmation Checkboxes</CardTitle>
                                        <CardDescription>
                                            The user must tick all of these before they can sign the handover form. Drag to reorder.
                                        </CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-6 space-y-3">
                                        {tcCheckboxes.map((cb, i) => (
                                            <div key={cb.id} className="border rounded-xl p-4 space-y-3 bg-muted/5">
                                                <div className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 text-muted-foreground">
                                                        <GripVertical className="w-4 h-4" />
                                                        <span className="text-xs font-bold uppercase tracking-wider">Checkbox {i + 1}</span>
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setTcCheckboxes(prev => prev.filter((_, idx) => idx !== i))}
                                                        className="text-red-500 hover:text-red-700 transition-colors p-1 rounded"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </button>
                                                </div>
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground uppercase font-bold">English Text</Label>
                                                        <Textarea
                                                            value={cb.en}
                                                            onChange={e => setTcCheckboxes(prev => prev.map((c, idx) => idx === i ? { ...c, en: e.target.value } : c))}
                                                            className="rounded-lg text-xs min-h-[60px] resize-none"
                                                            placeholder="Confirmation statement in English..."
                                                        />
                                                    </div>
                                                    <div className="space-y-1">
                                                        <Label className="text-[10px] text-muted-foreground uppercase font-bold">Arabic Text / النص العربي</Label>
                                                        <Textarea
                                                            value={cb.ar}
                                                            onChange={e => setTcCheckboxes(prev => prev.map((c, idx) => idx === i ? { ...c, ar: e.target.value } : c))}
                                                            className="rounded-lg text-xs min-h-[60px] resize-none"
                                                            placeholder="جملة التأكيد بالعربية..."
                                                            dir="rtl"
                                                        />
                                                    </div>
                                                </div>
                                            </div>
                                        ))}

                                        <button
                                            type="button"
                                            onClick={() => setTcCheckboxes(prev => [...prev, { id: `tc_${Date.now()}`, en: '', ar: '' }])}
                                            className="w-full border-2 border-dashed border-muted-foreground/30 rounded-xl py-3 text-sm text-muted-foreground hover:border-primary/50 hover:text-primary transition-colors flex items-center justify-center gap-2"
                                        >
                                            <Plus className="w-4 h-4" /> Add Confirmation Checkbox
                                        </button>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t p-5 bg-muted/5">
                                        <Button onClick={handleSaveSystem} className="rounded-xl px-8 h-11">Save Checkboxes</Button>
                                    </CardFooter>
                                </Card>
                            </TabsContent>

                            <TabsContent value="access" className="mt-0">
                                <UserAccessControl />
                            </TabsContent>

                            <TabsContent value="tools" className="mt-0 space-y-8">
                                <RequestLinkGenerator stadiums={stadiums} />
                                
                                <Card className="border-none shadow-md overflow-hidden bg-gradient-to-br from-indigo-50/50 to-blue-50/50 dark:from-indigo-950/10 dark:to-blue-950/10">
                                    <CardHeader className="bg-indigo-500/10 border-b border-indigo-500/10">
                                        <CardTitle className="text-2xl text-indigo-700 dark:text-indigo-300 flex items-center gap-3">
                                            <Megaphone className="w-6 h-6" /> System Push Announcement
                                        </CardTitle>
                                        <CardDescription className="text-indigo-600/70 dark:text-indigo-400/70 font-medium">Send an urgent broadcast to all users or specific groups.</CardDescription>
                                    </CardHeader>
                                    <CardContent className="p-8 space-y-6">
                                        <div className="space-y-2">
                                            <Label className="text-sm font-bold uppercase tracking-wider text-indigo-700/80 dark:text-indigo-300/80">Announcement Message</Label>
                                            <Textarea 
                                                value={systemAnnouncement} 
                                                onChange={e => setSystemAnnouncement(e.target.value)} 
                                                placeholder="Enter the alert message here..." 
                                                className="rounded-2xl p-4 bg-background/80 min-h-[120px] text-lg border-indigo-200 dark:border-indigo-800 focus:ring-indigo-500" 
                                            />
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Target Audience</Label>
                                                <Select value={announcementTarget} onValueChange={v => setAnnouncementTarget(v as any)}>
                                                    <SelectTrigger className="h-12 rounded-xl bg-background/80 border-indigo-200 dark:border-indigo-800">
                                                        <SelectValue />
                                                    </SelectTrigger>
                                                    <SelectContent>
                                                        <SelectItem value="all">Global (All Users)</SelectItem>
                                                        <SelectItem value="system">Administrative (Admins Only)</SelectItem>
                                                        <SelectItem value="fa">Operational (FA Team)</SelectItem>
                                                    </SelectContent>
                                                </Select>
                                            </div>
                                            <div className="space-y-2">
                                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Auto-Expiry Date & Time</Label>
                                                <Input 
                                                    type="datetime-local" 
                                                    value={announcementExpiry} 
                                                    onChange={e => setAnnouncementExpiry(e.target.value)} 
                                                    className="h-12 rounded-xl bg-background/80 border-indigo-200 dark:border-indigo-800" 
                                                />
                                            </div>
                                        </div>
                                    </CardContent>
                                    <CardFooter className="justify-end border-t border-indigo-500/10 p-6 bg-indigo-500/5">
                                        <Button 
                                            className="bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl px-10 h-12 font-bold shadow-lg shadow-indigo-200 dark:shadow-none transition-all active:scale-95" 
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
                                                    toast.error('Failed to send broadcast');
                                                } finally {
                                                    setPushingAnnouncement(false);
                                                }
                                            }}
                                        >
                                            {pushingAnnouncement ? <Loader2 className="animate-spin w-5 h-5 mr-2" /> : <Megaphone className="w-5 h-5 mr-2" />}
                                            Broadcast Urgent Message
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
        try {
            await navigator.clipboard.writeText(link);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
            toast.success('Link copied to clipboard!');
        } catch (err) {
            toast.error('Failed to copy link');
        }
    };

    return (
        <Card className="border-none shadow-md overflow-hidden border-l-4 border-l-blue-600">
            <CardHeader className="bg-blue-50/50 dark:bg-blue-950/10">
                <CardTitle className="text-2xl text-blue-700 dark:text-blue-400 flex items-center gap-3">
                    <LinkIcon className="w-6 h-6" /> Public Request Link Generator
                </CardTitle>
                <CardDescription className="text-blue-600/70 dark:text-blue-400/70 font-medium">Create and share direct links for car requests by venue and department.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Target Venue</Label>
                        <Select value={stadiumId} onValueChange={v => { setStadiumId(v); setDeptId(''); setLink(''); }}>
                            <SelectTrigger className="h-12 rounded-xl border-blue-100 dark:border-blue-900 bg-background/50">
                                <SelectValue placeholder="Choose a venue..." />
                            </SelectTrigger>
                            <SelectContent>
                                {stadiums.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Select Target Department</Label>
                        <Select value={deptId || '__all__'} onValueChange={v => { setDeptId(v === '__all__' ? '' : v); setLink(''); }} disabled={!stadiumId}>
                            <SelectTrigger className="h-12 rounded-xl border-blue-100 dark:border-blue-900 bg-background/50">
                                <SelectValue placeholder="All Departments" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">General Request (No pre-selected Dept)</SelectItem>
                                {loading ? <SelectItem value="l" disabled>Loading departments...</SelectItem> : depts.map(d => <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Button 
                    onClick={() => setLink(`${window.location.origin}/request?stadium=${stadiumId}${deptId ? `&department=${deptId}` : ''}`)} 
                    disabled={!stadiumId} 
                    variant="outline" 
                    className="w-full h-11 rounded-xl border-2 hover:bg-blue-50 dark:hover:bg-blue-950 font-bold border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 transition-all"
                >
                    <Globe className="w-4 h-4 mr-2" /> Generate Request Link
                </Button>

                {link && (
                    <div className="p-6 rounded-2xl bg-muted/30 border border-muted/50 space-y-3 animate-in slide-in-from-top-4 duration-500">
                        <Label className="text-[10px] font-bold uppercase tracking-widest text-blue-600 dark:text-blue-400">Generated URL</Label>
                        <div className="flex gap-3">
                            <Input value={link} readOnly className="h-12 rounded-xl font-mono text-xs bg-background border-muted/50" />
                            <Button 
                                onClick={copyLink} 
                                className={`h-12 rounded-xl px-6 transition-all duration-300 ${copied ? 'bg-green-600 hover:bg-green-700' : 'bg-blue-600 hover:bg-blue-700'}`}
                            >
                                {copied ? <Check className="w-5 h-5" /> : <Copy className="w-5 h-5" />}
                            </Button>
                        </div>
                    </div>
                )}
            </CardContent>
        </Card>
    );
}

function UserAccessControl() {
    const [users, setUsers] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState<Record<string, boolean>>({});

    useEffect(() => {
        usersApi.getAll({ role: 'Admin,Observer', limit: 100 }).then(res => {
            setUsers(res.data.data || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, []);

    const handleToggle = async (userId: string, page: string, current: string[]) => {
        const next = current.includes(page) ? current.filter(p => p !== page) : [...current, page];
        setSaving(prev => ({ ...prev, [userId]: true }));
        try {
            await usersApi.update(userId, { grantedPages: next });
            setUsers(prev => prev.map(u => u.id === userId ? { ...u, grantedPages: next } : u));
            toast.success('Access updated');
        } catch (e) {
            toast.error('Failed to update access');
        } finally {
            setSaving(prev => ({ ...prev, [userId]: false }));
        }
    };

    if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-10 h-10 animate-spin text-primary/40" /></div>;

    return (
        <Card className="border-none shadow-md overflow-hidden">
            <CardHeader className="bg-muted/10">
                <CardTitle className="text-2xl flex items-center gap-3">
                    <ShieldCheck className="w-6 h-6 text-primary" /> Permission Access Matrix
                </CardTitle>
                <CardDescription>Grant or revoke module-level access for Venue Admins and Observers.</CardDescription>
            </CardHeader>
            <CardContent className="p-8 space-y-6">
                {users.length === 0 ? (
                    <div className="text-center py-10 bg-muted/5 rounded-3xl border border-dashed border-muted/50">
                        <Users className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
                        <p className="text-muted-foreground font-medium">No restricted role users found.</p>
                    </div>
                ) : (
                    <div className="space-y-6">
                        {users.map(u => (
                            <div key={u.id} className="border rounded-2xl p-6 space-y-6 bg-card shadow-sm hover:shadow-md transition-shadow">
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-4">
                                        <div className="w-12 h-12 rounded-2xl bg-primary/10 flex items-center justify-center font-bold text-primary text-xl">
                                            {u.name.charAt(0)}
                                        </div>
                                        <div>
                                            <h4 className="font-extrabold text-lg leading-tight">{u.name}</h4>
                                            <div className="flex items-center gap-2 mt-1">
                                                <Badge variant="secondary" className="px-2 py-0 h-5 text-[9px] uppercase tracking-tighter font-bold">{u.role}</Badge>
                                                <span className="text-xs text-muted-foreground">{u.email}</span>
                                            </div>
                                        </div>
                                    </div>
                                    {saving[u.id] && <Loader2 className="w-5 h-5 animate-spin text-primary" />}
                                </div>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-3 p-5 rounded-2xl bg-muted/5 border border-muted/30">
                                    {['fleet', 'handover', 'maintenance', 'reports', 'requests', 'users', 'departments', 'stadiums', 'notifications'].map(page => {
                                        const isGranted = (u.grantedPages || []).includes(page);
                                        return (
                                            <div key={page} className="flex items-center gap-2.5 p-2 rounded-xl hover:bg-muted/10 transition-colors">
                                                <Checkbox 
                                                    id={`access-${u.id}-${page}`}
                                                    checked={isGranted} 
                                                    onCheckedChange={() => handleToggle(u.id, page, u.grantedPages || [])} 
                                                />
                                                <Label htmlFor={`access-${u.id}-${page}`} className="text-xs font-bold cursor-pointer capitalize">{page}</Label>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
