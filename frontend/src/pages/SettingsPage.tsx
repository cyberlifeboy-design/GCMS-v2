import { useState, useEffect } from 'react';
import { settingsApi, usersApi, stadiumsApi, departmentsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload, Image, FileSpreadsheet, FileText, File, Link, Copy, Check, Bell, Clock, ToggleLeft, ToggleRight, Megaphone, Mail, Sun, Moon, Monitor, ChevronDown, ChevronUp } from 'lucide-react';
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
    maintenanceNotificationEmails?: string;
    handoverTimeoutMinutes?: number;
    defaultStadiumId?: string;
    enableMaintenanceReports?: boolean;
    enableHandoverPhotos?: boolean;
    systemAnnouncement?: string;
    announcementExpiry?: string;
    theme?: 'light' | 'dark' | 'system';
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

    // Stadiums for request link generator
    const [stadiums, setStadiums] = useState<Stadium[]>([]);

    // New settings (SuperAdmin only)
    const [maintenanceNotificationEmails, setMaintenanceNotificationEmails] = useState('');
    const [handoverTimeoutMinutes, setHandoverTimeoutMinutes] = useState(120);
    const [defaultStadiumId, setDefaultStadiumId] = useState('');
    const [enableMaintenanceReports, setEnableMaintenanceReports] = useState(true);
    const [enableHandoverPhotos, setEnableHandoverPhotos] = useState(true);
    const [systemAnnouncement, setSystemAnnouncement] = useState('');
    const [announcementExpiry, setAnnouncementExpiry] = useState('');

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
                // New settings
                setMaintenanceNotificationEmails(d.maintenanceNotificationEmails || '');
                setHandoverTimeoutMinutes(d.handoverTimeoutMinutes ?? 120);
                setDefaultStadiumId(d.defaultStadiumId || '');
                setEnableMaintenanceReports(d.enableMaintenanceReports ?? true);
                setEnableHandoverPhotos(d.enableHandoverPhotos ?? true);
                setSystemAnnouncement(d.systemAnnouncement || '');
                setAnnouncementExpiry(d.announcementExpiry ? d.announcementExpiry.slice(0, 16) : '');
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
                emailNotifications
            });
            updateExportFormat(exportFormat);
            setPreferencesSaved(true);
            setTimeout(() => setPreferencesSaved(false), 3000);
        } catch (err: any) {
            alert(err.response?.data?.error || 'Failed to save preferences');
        } finally {
            setSavingPreferences(false);
        }
    };

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
            // New settings
            fd.append('maintenanceNotificationEmails', maintenanceNotificationEmails);
            fd.append('handoverTimeoutMinutes', String(handoverTimeoutMinutes));
            fd.append('defaultStadiumId', defaultStadiumId || '');
            fd.append('enableMaintenanceReports', String(enableMaintenanceReports));
            fd.append('enableHandoverPhotos', String(enableHandoverPhotos));
            fd.append('systemAnnouncement', systemAnnouncement);
            fd.append('announcementExpiry', announcementExpiry ? new Date(announcementExpiry).toISOString() : '');
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
                                onClick={() => setTheme('light')}
                                className="flex-1 justify-start"
                            >
                                <Sun className="w-4 h-4 mr-2" />
                                Light
                            </Button>
                            <Button
                                variant={theme === 'dark' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTheme('dark')}
                                className="flex-1 justify-start"
                            >
                                <Moon className="w-4 h-4 mr-2" />
                                Dark
                            </Button>
                            <Button
                                variant={theme === 'system' ? 'default' : 'outline'}
                                size="sm"
                                onClick={() => setTheme('system')}
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

                    {/* Handover Settings Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Clock className="w-5 h-5" />
                                Handover Settings
                            </CardTitle>
                            <CardDescription>Configure handover status timeout and defaults</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="handoverTimeoutMinutes">Handover Timeout (minutes)</Label>
                                    <Input
                                        id="handoverTimeoutMinutes"
                                        type="number"
                                        min={1}
                                        value={handoverTimeoutMinutes}
                                        onChange={e => setHandoverTimeoutMinutes(parseInt(e.target.value) || 120)}
                                        placeholder="120"
                                    />
                                    <p className="text-xs text-muted-foreground">
                                        Time before handover status automatically times out
                                    </p>
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="defaultStadiumId">Default Stadium for New Users</Label>
                                    <Select value={defaultStadiumId || '__none__'} onValueChange={v => setDefaultStadiumId(v === '__none__' ? '' : v)}>
                                        <SelectTrigger>
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
                            </div>
                        </CardContent>
                    </Card>

                    {/* Feature Toggles Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                {enableMaintenanceReports && enableHandoverPhotos ? (
                                    <ToggleRight className="w-5 h-5" />
                                ) : (
                                    <ToggleLeft className="w-5 h-5" />
                                )}
                                Feature Toggles
                            </CardTitle>
                            <CardDescription>Enable or disable system features</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableMaintenanceReports">Enable Maintenance Reports</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Allow users to create and manage maintenance reports
                                    </p>
                                </div>
                                <Switch
                                    id="enableMaintenanceReports"
                                    checked={enableMaintenanceReports}
                                    onCheckedChange={setEnableMaintenanceReports}
                                />
                            </div>
                            <div className="flex items-center justify-between">
                                <div className="space-y-0.5">
                                    <Label htmlFor="enableHandoverPhotos">Enable Handover Photos</Label>
                                    <p className="text-xs text-muted-foreground">
                                        Allow photo uploads during handover check-in/out
                                    </p>
                                </div>
                                <Switch
                                    id="enableHandoverPhotos"
                                    checked={enableHandoverPhotos}
                                    onCheckedChange={setEnableHandoverPhotos}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    {/* Announcements Section */}
                    <Card>
                        <CardHeader>
                            <CardTitle className="flex items-center gap-2">
                                <Megaphone className="w-5 h-5" />
                                System Announcement
                            </CardTitle>
                            <CardDescription>Display a system-wide announcement to all users</CardDescription>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="systemAnnouncement">Announcement Text</Label>
                                <Textarea
                                    id="systemAnnouncement"
                                    value={systemAnnouncement}
                                    onChange={e => setSystemAnnouncement(e.target.value)}
                                    placeholder="Enter system-wide announcement (optional)"
                                    rows={3}
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="announcementExpiry">Announcement Expiry</Label>
                                <Input
                                    id="announcementExpiry"
                                    type="datetime-local"
                                    value={announcementExpiry}
                                    onChange={e => setAnnouncementExpiry(e.target.value)}
                                />
                                <p className="text-xs text-muted-foreground">
                                    Announcement will automatically hide after this time (optional)
                                </p>
                            </div>
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