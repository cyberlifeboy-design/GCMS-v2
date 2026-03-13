import { useState, useEffect } from 'react';
import { settingsApi, usersApi, stadiumsApi, departmentsApi, announcementsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload, Image, FileSpreadsheet, FileText, File, Link, Copy, Check, Bell, Clock, ToggleLeft, ToggleRight, Megaphone, Mail, Sun, Moon, Monitor, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { useAuthStore, ExportPreferences } from '@/stores/authStore';
import { useThemeStore } from '@/stores/themeStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';

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
        fleet: true,
        handover: true,
        maintenance: true,
        request: true,
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
                // Handover duration settings
                const settings = settingsRes.data.data as Settings & {
                    handoverDefaultDurationDays?: number;
                    handoverEventStartDate?: string;
                    handoverEventEndDate?: string;
                    enableHandoverReminder?: boolean;
                    handoverReminderHoursBefore?: number;
                    timezone?: string;
                };
                setHandoverDefaultDurationDays(settings.handoverDefaultDurationDays ?? 1);
                setHandoverDefaultDurationHours(0); // Not stored separately yet, default 0
                setHandoverEventStartDate(settings.handoverEventStartDate ? settings.handoverEventStartDate.slice(0, 16) : '');
                setHandoverEventEndDate(settings.handoverEventEndDate ? settings.handoverEventEndDate.slice(0, 16) : '');
                setEnableHandoverReminder(settings.enableHandoverReminder ?? true);
                setHandoverReminderHoursBefore(settings.handoverReminderHoursBefore ?? 1);
                setTimezone(settings.timezone || 'UTC');
                setStadiums(stadiumsRes.data.data || []);
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSavePreferences = async (e: React.FormEvent) => {
        e.preventDefault();
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
            // Update local authStore with new preferences
            useAuthStore.getState().updateExportPreferences(exportPrefs);
            setPreferencesSaved(true);
            setTimeout(() => setPreferencesSaved(false), 3000);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save preferences');
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
        {
            key: 'department', label: 'Department Report', fields: [
                { key: 'includeName', label: 'Name' },
                { key: 'includeCode', label: 'Code' },
                { key: 'includeStadium', label: 'Stadium' },
                { key: 'includeFocalPoint', label: 'Focal Point' },
            ]
        },
        {
            key: 'stadium', label: 'Stadium Report', fields: [
                { key: 'includeName', label: 'Name' },
                { key: 'includeCode', label: 'Code' },
                { key: 'includeLocation', label: 'Location' },
                { key: 'includeStatus', label: 'Status' },
            ]
        },
    ];

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isSuperAdmin) return;
        setSaving(true);
        setSaved(false);
        try {
            const fd = new FormData();
            fd.append('tournamentName', tournamentName);
            if (logoFile) fd.append('logo', logoFile);
            if (headerFile) fd.append('header', headerFile);
            if (footerFile) fd.append('footer', footerFile);
            fd.append('footerText', footerText);
            // Notification settings
            fd.append('maintenanceNotificationEmails', maintenanceNotificationEmails);
            const computedTimeoutMinutes = handoverTimeoutDays * 24 * 60 + handoverTimeoutHoursField * 60;
            fd.append('handoverTimeoutMinutes', String(computedTimeoutMinutes));
            fd.append('defaultStadiumId', defaultStadiumId || '');
            // Feature toggles
            fd.append('enableMaintenanceReports', String(enableMaintenanceReports));
            fd.append('enableHandoverPhotos', String(enableHandoverPhotos));
            fd.append('enableFleetManagement', String(enableFleetManagement));
            fd.append('enableCarRequests', String(enableCarRequests));
            fd.append('enableUserImport', String(enableUserImport));
            fd.append('enableBulkOperations', String(enableBulkOperations));
            fd.append('enableAdvancedReports', String(enableAdvancedReports));
            fd.append('enableAssignmentMatrix', String(enableAssignmentMatrix));
            // Legacy system announcement
            fd.append('systemAnnouncement', systemAnnouncement);
            fd.append('announcementExpiry', announcementExpiry ? new Date(announcementExpiry).toISOString() : '');
            // Handover duration settings
            fd.append('handoverDefaultDurationDays', String(handoverDefaultDurationDays));
            fd.append('handoverEventStartDate', handoverEventStartDate ? new Date(handoverEventStartDate).toISOString() : '');
            fd.append('handoverEventEndDate', handoverEventEndDate ? new Date(handoverEventEndDate).toISOString() : '');
            fd.append('enableHandoverReminder', String(enableHandoverReminder));
            fd.append('handoverReminderHoursBefore', String(handoverReminderHoursBefore));
            fd.append('timezone', timezone || 'UTC');
            await settingsApi.update(fd);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save settings');
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
            <Label>{label}</Label>
            {currentUrl && (
                <div className="border rounded-md overflow-hidden bg-muted h-32 flex items-center justify-center">
                    <img src={currentUrl} alt={label} className="max-h-full max-w-full object-contain" />
                </div>
            )}
            {!currentUrl && (
                <div className="border rounded-md h-32 flex items-center justify-center bg-muted text-muted-foreground">
                    <Image className="w-8 h-8" />
                </div>
            )}
            {isSuperAdmin && (
                <label className="flex items-center gap-2 cursor-pointer">
                    <Button type="button" variant="outline" size="sm" asChild>
                        <span><Upload className="w-4 h-4 mr-2" />Choose File</span>
                    </Button>
                    <input
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
                    <span className="text-sm text-muted-foreground">PNG, JPG up to 5MB</span>
                </label>
            )}
        </div>
    );

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-muted-foreground" />
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-2xl">
            <div>
                <h1 className="text-3xl font-bold">Settings</h1>
                <p className="text-muted-foreground mt-1">Manage your preferences and system configuration.</p>
            </div>

            {/* User Preferences */}
            <form onSubmit={handleSavePreferences} className="space-y-6">
                <Card>
                    <CardHeader><h2 className="font-semibold">Export Preferences</h2></CardHeader>
                    <CardContent className="space-y-4">
                        <p className="text-sm text-muted-foreground">
                            Choose your default format for exporting reports.
                        </p>
                        <div className="space-y-2">
                            <Label htmlFor="exportFormat">Default Export Format</Label>
                            <Select value={exportFormat} onValueChange={(v) => setExportFormat(v as 'xlsx' | 'pdf' | 'docx')}>
                                <SelectTrigger className="w-full sm:w-64">
                                    <SelectValue placeholder="Select format" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="xlsx">
                                        <div className="flex items-center gap-2">
                                            <FileSpreadsheet className="w-4 h-4" />
                                            <span>Excel (.xlsx)</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="pdf">
                                        <div className="flex items-center gap-2">
                                            <FileText className="w-4 h-4" />
                                            <span>PDF (.pdf)</span>
                                        </div>
                                    </SelectItem>
                                    <SelectItem value="docx">
                                        <div className="flex items-center gap-2">
                                            <File className="w-4 h-4" />
                                            <span>Word (.docx)</span>
                                        </div>
                                    </SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </CardContent>
                </Card>

                {/* Granular Export Preferences */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <FileSpreadsheet className="w-5 h-5" />
                            Report Export Options
                        </CardTitle>
                        <CardDescription>
                            Customize what to include in each report type when exporting
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-3">
                            {reportTypes.map((report) => (
                                <div key={report.key} className="border rounded-lg">
                                    <div
                                        className="flex items-center justify-between p-3 cursor-pointer hover:bg-muted/50"
                                        onClick={() => toggleSection(report.key)}
                                    >
                                        <div className="flex items-center gap-3">
                                            <Checkbox
                                                id={`${report.key}-enabled`}
                                                checked={(exportPrefs[report.key] as any)?.enabled ?? true}
                                                onCheckedChange={(checked) =>
                                                    selectAllInReport(report.key as any, checked as boolean)
                                                }
                                                onClick={(e) => e.stopPropagation()}
                                            />
                                            <Label htmlFor={`${report.key}-enabled`} className="font-medium cursor-pointer">
                                                {report.label}
                                            </Label>
                                        </div>
                                        {expandedSections[report.key] ? (
                                            <ChevronUp className="w-4 h-4 text-muted-foreground" />
                                        ) : (
                                            <ChevronDown className="w-4 h-4 text-muted-foreground" />
                                        )}
                                    </div>
                                    {expandedSections[report.key] && (
                                        <div className="px-3 pb-3 pt-0 border-t">
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 pt-2">
                                                {report.fields.map((field) => (
                                                    <div key={field.key} className="flex items-center gap-2">
                                                        <Checkbox
                                                            id={`${report.key}-${field.key}`}
                                                            checked={(exportPrefs[report.key] as any)?.[field.key] ?? true}
                                                            onCheckedChange={(checked) =>
                                                                updateExportPref(report.key as any, field.key, checked as boolean)
                                                            }
                                                        />
                                                        <Label
                                                            htmlFor={`${report.key}-${field.key}`}
                                                            className="text-sm font-normal cursor-pointer"
                                                        >
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
                    </CardContent>
                </Card>

                {/* Notification Preferences */}
                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Mail className="w-5 h-5" />
                            Email Notification Preferences
                        </CardTitle>
                        <CardDescription>
                            Choose which notifications you want to receive via email
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="maintenanceNotifications">Maintenance Notifications</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Receive emails when new maintenance issues are reported
                                    </p>
                                </div>
                                <Switch
                                    id="maintenanceNotifications"
                                    checked={emailNotifications.maintenance}
                                    onCheckedChange={(checked) =>
                                        setEmailNotifications(prev => ({ ...prev, maintenance: checked }))
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="handoverNotifications">Handover Notifications</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Receive emails for check-in and check-out events
                                    </p>
                                </div>
                                <Switch
                                    id="handoverNotifications"
                                    checked={emailNotifications.handover}
                                    onCheckedChange={(checked) =>
                                        setEmailNotifications(prev => ({ ...prev, handover: checked }))
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="requestNotifications">Request Notifications</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Receive emails for car request approvals and rejections
                                    </p>
                                </div>
                                <Switch
                                    id="requestNotifications"
                                    checked={emailNotifications.requests}
                                    onCheckedChange={(checked) =>
                                        setEmailNotifications(prev => ({ ...prev, requests: checked }))
                                    }
                                />
                            </div>

                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="assignmentNotifications">Assignment Notifications</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Receive emails when cart assignments change
                                    </p>
                                </div>
                                <Switch
                                    id="assignmentNotifications"
                                    checked={emailNotifications.assignments}
                                    onCheckedChange={(checked) =>
                                        setEmailNotifications(prev => ({ ...prev, assignments: checked }))
                                    }
                                />
                            </div>
                        </div>

                        <div className="flex items-center gap-4 pt-2">
                            <Button type="submit" disabled={savingPreferences}>
                                {savingPreferences ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Preferences
                            </Button>
                            {preferencesSaved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
                        </div>
                    </CardContent>
                </Card>
            </form>

            {/* Appearance - Theme Settings */}
            <Card>
                <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                        <Sun className="w-5 h-5" />
                        Appearance
                    </CardTitle>
                    <CardDescription>Customize your visual theme</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-3">
                        <Label>Theme</Label>
                        <p className="text-sm text-muted-foreground">
                            Choose between light and dark mode, or use your system preference.
                        </p>
                        <div className="flex gap-2">
                            <Button
                                variant={theme === 'light' ? 'default' : 'outline'}
                                size="sm"
                                onClick={async () => {
                                    setTheme('light');
                                    try {
                                        await usersApi.updatePreferences({
                                            exportPreferences: { ...exportPrefs, theme: 'light' }
                                        });
                                    } catch (err) {
                                        console.error('Failed to sync theme preference', err);
                                    }
                                }}
                                className="flex-1 justify-start"
                            >
                                <Sun className="w-4 h-4 mr-2" />
                                Light
                            </Button>
                            <Button
                                variant={theme === 'dark' ? 'default' : 'outline'}
                                size="sm"
                                onClick={async () => {
                                    setTheme('dark');
                                    try {
                                        await usersApi.updatePreferences({
                                            exportPreferences: { ...exportPrefs, theme: 'dark' }
                                        });
                                    } catch (err) {
                                        console.error('Failed to sync theme preference', err);
                                    }
                                }}
                                className="flex-1 justify-start"
                            >
                                <Moon className="w-4 h-4 mr-2" />
                                Dark
                            </Button>
                            <Button
                                variant={theme === 'system' ? 'default' : 'outline'}
                                size="sm"
                                onClick={async () => {
                                    setTheme('system');
                                    try {
                                        await usersApi.updatePreferences({
                                            exportPreferences: { ...exportPrefs, theme: 'system' }
                                        });
                                    } catch (err) {
                                        console.error('Failed to sync theme preference', err);
                                    }
                                }}
                                className="flex-1 justify-start"
                            >
                                <Monitor className="w-4 h-4 mr-2" />
                                System
                            </Button>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* System Settings (SuperAdmin only) */}
            {isSuperAdmin && (
                <form onSubmit={handleSave} className="space-y-6">
                    <Card>
                        <CardHeader><h2 className="font-semibold">Tournament Information</h2></CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="tournamentName">Tournament Name</Label>
                                <Input
                                    id="tournamentName"
                                    value={tournamentName}
                                    onChange={e => setTournamentName(e.target.value)}
                                    placeholder="e.g. Asian Games 2026"
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader><h2 className="font-semibold">Branding Assets</h2></CardHeader>
                        <CardContent className="space-y-6">
                            <ImageField
                                label="Logo"
                                currentUrl={logoPrev}
                                onPreview={setLogoPrev}
                                onFileChange={setLogoFile}
                            />
                            <ImageField
                                label="Header Image"
                                currentUrl={headerPrev}
                                onPreview={setHeaderPrev}
                                onFileChange={setHeaderFile}
                            />
                            <ImageField
                                label="Footer Image"
                                currentUrl={footerPrev}
                                onPreview={setFooterPrev}
                                onFileChange={setFooterFile}
                            />
                            <div className="space-y-2">
                                <Label htmlFor="footerText">Footer Text</Label>
                                <Input
                                    id="footerText"
                                    value={footerText}
                                    onChange={e => setFooterText(e.target.value)}
                                    placeholder="e.g. © 2026 GCMS Fleet Management. All rights reserved."
                                />
                                <p className="text-xs text-muted-foreground">
                                    Text displayed below the footer image (optional)
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Notifications Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Bell className="w-5 h-5" />
                                Notifications
                            </CardTitle>
                            <CardDescription>Configure maintenance alert notifications</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="maintenanceNotificationEmails">Maintenance Notification Emails</Label>
                                <Textarea
                                    id="maintenanceNotificationEmails"
                                    value={maintenanceNotificationEmails}
                                    onChange={e => setMaintenanceNotificationEmails(e.target.value)}
                                    placeholder="Enter comma-separated email addresses for maintenance alerts"
                                    rows={3}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Email addresses that will receive maintenance alerts (comma-separated)
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Handover Settings Section - consolidated */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                Handover Settings
                            </CardTitle>
                            <CardDescription>Configure handover timeout, duration limits, and reminder notifications</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Timeout */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium">Handover Timeout</h4>
                                <p className="text-xs text-muted-foreground">Time before handover status automatically times out</p>
                                <div className="grid grid-cols-2 gap-4 max-w-xs">
                                    <div className="space-y-2">
                                        <Label htmlFor="handoverTimeoutDays">Days</Label>
                                        <Input
                                            id="handoverTimeoutDays"
                                            type="number"
                                            min={0}
                                            value={handoverTimeoutDays}
                                            onChange={e => setHandoverTimeoutDays(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="handoverTimeoutHoursField">Hours</Label>
                                        <Input
                                            id="handoverTimeoutHoursField"
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={handoverTimeoutHoursField}
                                            onChange={e => setHandoverTimeoutHoursField(Math.min(23, parseInt(e.target.value) || 0))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Default Stadium */}
                            <div className="space-y-2">
                                <Label htmlFor="defaultStadiumId">Default Stadium for New Users</Label>
                                <Select value={defaultStadiumId || '__none__'} onValueChange={v => setDefaultStadiumId(v === '__none__' ? '' : v)}>
                                    <SelectTrigger className="max-w-xs">
                                        <SelectValue placeholder="Select default stadium" />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="__none__">No default</SelectItem>
                                        {stadiums.map(s => (
                                            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>

                            {/* Default Duration */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium">Default Handover Duration</h4>
                                <p className="text-xs text-muted-foreground">Maximum duration a cart can be checked out</p>
                                <div className="grid grid-cols-2 gap-4 max-w-xs">
                                    <div className="space-y-2">
                                        <Label htmlFor="handoverDefaultDurationDays">Days</Label>
                                        <Input
                                            id="handoverDefaultDurationDays"
                                            type="number"
                                            min={0}
                                            value={handoverDefaultDurationDays}
                                            onChange={e => setHandoverDefaultDurationDays(parseInt(e.target.value) || 0)}
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="handoverDefaultDurationHours">Hours</Label>
                                        <Input
                                            id="handoverDefaultDurationHours"
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={handoverDefaultDurationHours}
                                            onChange={e => setHandoverDefaultDurationHours(Math.min(23, parseInt(e.target.value) || 0))}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Event/Tournament Date Range */}
                            <div className="space-y-3">
                                <h4 className="text-sm font-medium">Event/Tournament Date Range</h4>
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
                                            Send notifications when handover timeout is approaching
                                        </p>
                                    </div>
                                    <Switch
                                        id="enableHandoverReminder"
                                        checked={enableHandoverReminder}
                                        onCheckedChange={setEnableHandoverReminder}
                                    />
                                </div>
                                {enableHandoverReminder && (
                                    <div className="space-y-2 max-w-xs">
                                        <Label htmlFor="handoverReminderHoursBefore">Hours Before Timeout</Label>
                                        <Input
                                            id="handoverReminderHoursBefore"
                                            type="number"
                                            min={1}
                                            value={handoverReminderHoursBefore}
                                            onChange={e => setHandoverReminderHoursBefore(parseInt(e.target.value) || 1)}
                                        />
                                    </div>
                                )}
                            </div>
                        </CardContent>
                    </Card>

                    {/* System Time & Timezone Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                System Time & Timezone
                            </CardTitle>
                            <CardDescription>Configure system timezone and time display settings</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Current System Time Display */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-medium">Current System Time</h4>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                        <Label>Server Time (UTC)</Label>
                                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                            <span className="font-mono text-sm" suppressHydrationWarning>
                                                {new Date().toISOString().replace('T', ' ').slice(0, 19)} UTC
                                            </span>
                                        </div>
                                    </div>
                                    <div className="space-y-2">
                                        <Label>Local Time ({timezone || 'UTC'})</Label>
                                        <div className="flex items-center gap-2 p-2 bg-muted rounded-md">
                                            <Clock className="w-4 h-4 text-muted-foreground" />
                                            <span className="font-mono text-sm" suppressHydrationWarning>
                                                {new Date().toLocaleString('en-US', {
                                                    timeZone: timezone || 'UTC',
                                                    year: 'numeric',
                                                    month: '2-digit',
                                                    day: '2-digit',
                                                    hour: '2-digit',
                                                    minute: '2-digit',
                                                    second: '2-digit',
                                                    hour12: false
                                                })}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Timezone Selector */}
                            <div className="space-y-4">
                                <h4 className="text-sm font-medium">Timezone Configuration</h4>
                                <div className="space-y-2">
                                    <Label htmlFor="timezone">System Timezone</Label>
                                    <Select value={timezone} onValueChange={setTimezone}>
                                        <SelectTrigger className="w-full">
                                            <SelectValue placeholder="Select timezone" />
                                        </SelectTrigger>
                                        <SelectContent className="max-h-[300px]">
                                            <SelectItem value="UTC">UTC (Coordinated Universal Time)</SelectItem>
                                            <SelectItem value="America/New_York">America/New_York (Eastern Time)</SelectItem>
                                            <SelectItem value="America/Chicago">America/Chicago (Central Time)</SelectItem>
                                            <SelectItem value="America/Denver">America/Denver (Mountain Time)</SelectItem>
                                            <SelectItem value="America/Los_Angeles">America/Los_Angeles (Pacific Time)</SelectItem>
                                            <SelectItem value="America/Anchorage">America/Anchorage (Alaska Time)</SelectItem>
                                            <SelectItem value="Pacific/Honolulu">Pacific/Honolulu (Hawaii Time)</SelectItem>
                                            <SelectItem value="Europe/London">Europe/London (GMT/BST)</SelectItem>
                                            <SelectItem value="Europe/Paris">Europe/Paris (CET/CEST)</SelectItem>
                                            <SelectItem value="Europe/Berlin">Europe/Berlin (CET/CEST)</SelectItem>
                                            <SelectItem value="Europe/Moscow">Europe/Moscow (MSK)</SelectItem>
                                            <SelectItem value="Asia/Dubai">Asia/Dubai (GST)</SelectItem>
                                            <SelectItem value="Asia/Qatar">Asia/Qatar (Qatar Time, UTC+3)</SelectItem>
                                            <SelectItem value="Asia/Karachi">Asia/Karachi (PKT)</SelectItem>
                                            <SelectItem value="Asia/Kolkata">Asia/Kolkata (IST)</SelectItem>
                                            <SelectItem value="Asia/Bangkok">Asia/Bangkok (ICT)</SelectItem>
                                            <SelectItem value="Asia/Singapore">Asia/Singapore (SGT)</SelectItem>
                                            <SelectItem value="Asia/Hong_Kong">Asia/Hong_Kong (HKT)</SelectItem>
                                            <SelectItem value="Asia/Shanghai">Asia/Shanghai (CST)</SelectItem>
                                            <SelectItem value="Asia/Tokyo">Asia/Tokyo (JST)</SelectItem>
                                            <SelectItem value="Asia/Seoul">Asia/Seoul (KST)</SelectItem>
                                            <SelectItem value="Asia/Jakarta">Asia/Jakarta (WIB)</SelectItem>
                                            <SelectItem value="Asia/Manila">Asia/Manila (PHT)</SelectItem>
                                            <SelectItem value="Australia/Perth">Australia/Perth (AWST)</SelectItem>
                                            <SelectItem value="Australia/Sydney">Australia/Sydney (AEST/AEDT)</SelectItem>
                                            <SelectItem value="Australia/Brisbane">Australia/Brisbane (AEST)</SelectItem>
                                            <SelectItem value="Australia/Adelaide">Australia/Adelaide (ACST/ACDT)</SelectItem>
                                            <SelectItem value="Australia/Melbourne">Australia/Melbourne (AEST/AEDT)</SelectItem>
                                            <SelectItem value="Pacific/Auckland">Pacific/Auckland (NZST/NZDT)</SelectItem>
                                            <SelectItem value="Pacific/Fiji">Pacific/Fiji (FJT)</SelectItem>
                                            <SelectItem value="Atlantic/Reykjavik">Atlantic/Reykjavik (GMT)</SelectItem>
                                            <SelectItem value="Africa/Cairo">Africa/Cairo (EET)</SelectItem>
                                            <SelectItem value="Africa/Johannesburg">Africa/Johannesburg (SAST)</SelectItem>
                                            <SelectItem value="Africa/Lagos">Africa/Lagos (WAT)</SelectItem>
                                            <SelectItem value="America/Sao_Paulo">America/Sao_Paulo (BRT)</SelectItem>
                                            <SelectItem value="America/Buenos_Aires">America/Buenos_Aires (ART)</SelectItem>
                                            <SelectItem value="America/Toronto">America/Toronto (Eastern Time)</SelectItem>
                                            <SelectItem value="America/Vancouver">America/Vancouver (Pacific Time)</SelectItem>
                                            <SelectItem value="America/Mexico_City">America/Mexico_City (CST)</SelectItem>
                                        </SelectContent>
                                    </Select>
                                    <p className="text-xs text-muted-foreground">
                                        Set the system timezone for displaying dates and times throughout the application.
                                        Times stored in UTC will be converted to this timezone for display.
                                    </p>
                                </div>
                            </div>

                            {/* Time Format Info */}
                            <div className="p-4 bg-muted/50 rounded-lg">
                                <h4 className="text-sm font-medium mb-2">Time Format Information</h4>
                                <ul className="text-xs text-muted-foreground space-y-1">
                                    <li>• All times are stored in UTC in the database</li>
                                    <li>• Times are displayed in the selected timezone throughout the application</li>
                                    <li>• Daylight Saving Time (DST) is automatically handled by the timezone selection</li>
                                    <li>• If your region observes DST, times will adjust automatically</li>
                                </ul>
                            </div>
                        </CardContent>
                    </Card>

                    {/* Feature Toggles Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {enableMaintenanceReports && enableHandoverPhotos && enableFleetManagement ? (
                                    <ToggleRight className="w-5 h-5" />
                                ) : (
                                    <ToggleLeft className="w-5 h-5" />
                                )}
                                Feature Toggles
                            </CardTitle>
                            <CardDescription>Enable or disable system features and specify which user types have access</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {[
                                { id: 'enableMaintenanceReports', label: 'Enable Maintenance Reports', desc: 'Allow users to create and manage maintenance reports', value: enableMaintenanceReports, setter: setEnableMaintenanceReports },
                                { id: 'enableHandoverPhotos', label: 'Enable Handover Photos', desc: 'Allow photo uploads during handover check-in/out', value: enableHandoverPhotos, setter: setEnableHandoverPhotos },
                                { id: 'enableFleetManagement', label: 'Enable Fleet Management', desc: 'Allow cart assignment and management features', value: enableFleetManagement, setter: setEnableFleetManagement },
                                { id: 'enableCarRequests', label: 'Enable Car Requests', desc: 'Allow public car request submissions', value: enableCarRequests, setter: setEnableCarRequests },
                                { id: 'enableUserImport', label: 'Enable User Import', desc: 'Allow bulk user import from requests', value: enableUserImport, setter: setEnableUserImport },
                                { id: 'enableBulkOperations', label: 'Enable Bulk Operations', desc: 'Allow bulk checkout/checkin operations', value: enableBulkOperations, setter: setEnableBulkOperations },
                                { id: 'enableAdvancedReports', label: 'Enable Advanced Reports', desc: 'Allow export to PDF and advanced report generation', value: enableAdvancedReports, setter: setEnableAdvancedReports },
                                { id: 'enableAssignmentMatrix', label: 'Enable Assignment Matrix', desc: 'Show fleet assignment matrix view', value: enableAssignmentMatrix, setter: setEnableAssignmentMatrix },
                            ].map(toggle => (
                                <div key={toggle.id} className="flex items-center justify-between gap-4">
                                    <div className="flex-1 space-y-0.5">
                                        <Label htmlFor={toggle.id}>{toggle.label}</Label>
                                        <p className="text-xs text-muted-foreground">{toggle.desc}</p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        <Select
                                            value={featureToggleTargets[toggle.id] || 'all'}
                                            onValueChange={v => setFeatureToggleTargets(prev => ({ ...prev, [toggle.id]: v as 'all' | 'system' | 'fa' }))}
                                        >
                                            <SelectTrigger className="w-36 h-8 text-xs">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="all">All Users</SelectItem>
                                                <SelectItem value="system">System Users</SelectItem>
                                                <SelectItem value="fa">FA Users Only</SelectItem>
                                            </SelectContent>
                                        </Select>
                                        <Switch
                                            id={toggle.id}
                                            checked={toggle.value}
                                            onCheckedChange={toggle.setter}
                                        />
                                    </div>
                                </div>
                            ))}
                        </CardContent>
                    </Card>

                    {/* Announcements Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Megaphone className="w-5 h-5" />
                                System Announcement
                            </CardTitle>
                            <CardDescription>Push a system-wide announcement to targeted users</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="systemAnnouncement">Announcement Text</Label>
                                <Textarea
                                    id="systemAnnouncement"
                                    value={systemAnnouncement}
                                    onChange={e => setSystemAnnouncement(e.target.value)}
                                    placeholder="Enter announcement message..."
                                    rows={3}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label>Target Audience</Label>
                                    <Select value={announcementTarget} onValueChange={v => setAnnouncementTarget(v as 'all' | 'system' | 'fa')}>
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="all">All Users</SelectItem>
                                            <SelectItem value="system">System Users Only</SelectItem>
                                            <SelectItem value="fa">FA Department Users Only</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="announcementExpiry">Expiry (Optional)</Label>
                                    <Input
                                        id="announcementExpiry"
                                        type="datetime-local"
                                        value={announcementExpiry}
                                        onChange={e => setAnnouncementExpiry(e.target.value)}
                                    />
                                </div>
                            </div>
                            <Button
                                type="button"
                                variant="outline"
                                disabled={!systemAnnouncement.trim() || pushingAnnouncement}
                                onClick={async () => {
                                    if (!systemAnnouncement.trim()) return;
                                    setPushingAnnouncement(true);
                                    try {
                                        const res = await announcementsApi.create({
                                            title: 'System Announcement',
                                            message: systemAnnouncement,
                                            type: 'info',
                                            targetType: announcementTarget === 'system' ? 'users' : announcementTarget === 'fa' ? 'fas' : 'all',
                                            expiresAt: announcementExpiry ? new Date(announcementExpiry).toISOString() : undefined,
                                        });
                                        await announcementsApi.sendNow(res.data.data.id);
                                        setSystemAnnouncement('');
                                        alert('Announcement pushed successfully!');
                                    } catch (err: any) {
                                        alert(err.response?.data?.error || 'Failed to push announcement');
                                    } finally {
                                        setPushingAnnouncement(false);
                                    }
                                }}
                            >
                                {pushingAnnouncement ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Megaphone className="w-4 h-4 mr-2" />}
                                Push Now
                            </Button>
                        </CardContent>
                    </Card>

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Settings
                        </Button>
                        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
                    </div>
                </form>
            )}

            {/* Request Link Generator (SuperAdmin only) */}
            {isSuperAdmin && (
                <RequestLinkGenerator stadiums={stadiums} />
            )}

            {/* User Page Access Control (SuperAdmin only) */}
            {isSuperAdmin && (
                <UserAccessControl />
            )}

            {!isSuperAdmin && (
                <p className="text-sm text-muted-foreground">
                    System settings can only be modified by SuperAdmin users.
                </p>
            )}
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

    // Load departments when stadium is selected
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
                console.error('Failed to load departments:', err);
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
        if (selectedDepartmentId) {
            link += `&department=${selectedDepartmentId}`;
        }
        setGeneratedLink(link);
        setCopied(false);
    };

    const copyLink = async () => {
        if (!generatedLink) return;
        try {
            await navigator.clipboard.writeText(generatedLink);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        } catch (err) {
            console.error('Failed to copy:', err);
        }
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Link className="w-5 h-5" />
                    Car Request Link Generator
                </CardTitle>
                <CardDescription>
                    Generate shareable links for department leads to request cars
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <Label>Select Stadium</Label>
                        <Select value={selectedStadiumId} onValueChange={(v) => { setSelectedStadiumId(v); setSelectedDepartmentId(''); setGeneratedLink(''); }}>
                            <SelectTrigger>
                                <SelectValue placeholder="Choose a stadium" />
                            </SelectTrigger>
                            <SelectContent>
                                {stadiums.map((s) => (
                                    <SelectItem key={s.id} value={s.id}>
                                        {s.name}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>
                    <div className="space-y-2">
                        <Label>Department (Optional)</Label>
                        <Select
                            value={selectedDepartmentId || '__all__'}
                            onValueChange={(v) => { setSelectedDepartmentId(v === '__all__' ? '' : v); setGeneratedLink(''); }}
                            disabled={!selectedStadiumId}
                        >
                            <SelectTrigger>
                                <SelectValue placeholder={selectedStadiumId ? "All departments" : "Select stadium first"} />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__all__">All Departments</SelectItem>
                                {loadingDepartments ? (
                                    <SelectItem value="__loading__" disabled>Loading...</SelectItem>
                                ) : (
                                    departments.map((dept) => (
                                        <SelectItem key={dept.id} value={dept.id}>
                                            {dept.name}
                                        </SelectItem>
                                    ))
                                )}
                            </SelectContent>
                        </Select>
                    </div>
                </div>

                <Button onClick={generateLink} disabled={!selectedStadiumId}>
                    <Link className="w-4 h-4 mr-2" />
                    Generate Link
                </Button>

                {generatedLink && (
                    <div className="space-y-2">
                        <Label>Shareable Link</Label>
                        <div className="flex gap-2">
                            <Input
                                value={generatedLink}
                                readOnly
                                className="flex-1 font-mono text-sm"
                            />
                            <Button variant="outline" onClick={copyLink}>
                                {copied ? (
                                    <>
                                        <Check className="w-4 h-4 mr-2" />
                                        Copied
                                    </>
                                ) : (
                                    <>
                                        <Copy className="w-4 h-4 mr-2" />
                                        Copy
                                    </>
                                )}
                            </Button>
                        </div>
                        <p className="text-sm text-muted-foreground">
                            Share this link with department leads. They can fill out the form without logging in.
                        </p>
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
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    User Page Access Control
                </CardTitle>
                <CardDescription>
                    Grant Admin and Observer users access to specific pages and configure venue report access
                </CardDescription>
            </CardHeader>
            <CardContent>
                {loading ? (
                    <div className="flex justify-center py-4"><Loader2 className="w-6 h-6 animate-spin" /></div>
                ) : users.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No Admin or Observer users found.</p>
                ) : (
                    <div className="space-y-6">
                        {users.map(u => (
                            <div key={u.id} className="border rounded-lg p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <p className="font-medium">{u.name}</p>
                                        <p className="text-sm text-muted-foreground">{u.email} · {u.role}</p>
                                    </div>
                                    {saving[u.id] && <Loader2 className="w-4 h-4 animate-spin" />}
                                </div>
                                <div>
                                    <p className="text-xs font-medium text-muted-foreground mb-2">Page Access</p>
                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                                        {AVAILABLE_PAGES.map(page => {
                                            const granted = (u.grantedPages || []).includes(page.key);
                                            return (
                                                <label key={page.key} className="flex items-center gap-2 text-sm cursor-pointer">
                                                    <Checkbox
                                                        checked={granted}
                                                        onCheckedChange={() => handleTogglePage(u.id, page.key, u.grantedPages || [])}
                                                    />
                                                    {page.label}
                                                </label>
                                            );
                                        })}
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <p className="text-xs font-medium text-muted-foreground">Venue Report Access:</p>
                                    <Select
                                        value={u.venueReportAccess || 'assigned'}
                                        onValueChange={v => handleVenueAccess(u.id, v)}
                                    >
                                        <SelectTrigger className="w-48 h-8 text-xs">
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="assigned">Assigned Venue Only</SelectItem>
                                            <SelectItem value="all">All Venues</SelectItem>
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
