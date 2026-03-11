import { useState, useEffect } from 'react';
import { settingsApi, usersApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload, Image, FileSpreadsheet, FileText, File } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface Settings {
    tournamentName?: string;
    logoUrl?: string;
    headerUrl?: string;
    footerUrl?: string;
}

export function SettingsPage() {
    const { user, updateExportFormat } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

    // User preferences
    const [exportFormat, setExportFormat] = useState<'xlsx' | 'pdf' | 'docx'>(user?.exportFormat || 'xlsx');
    const [savingPreferences, setSavingPreferences] = useState(false);
    const [preferencesSaved, setPreferencesSaved] = useState(false);

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

    useEffect(() => {
        // Set export format from user data
        if (user?.exportFormat) {
            setExportFormat(user.exportFormat as 'xlsx' | 'pdf' | 'docx');
        }
    }, [user?.exportFormat]);

    useEffect(() => {
        const load = async () => {
            try {
                const res = await settingsApi.get();
                const d: Settings = res.data;
                setTournamentName(d.tournamentName || '');
                setLogoPrev(d.logoUrl || '');
                setHeaderPrev(d.headerUrl || '');
                setFooterPrev(d.footerUrl || '');
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
            await usersApi.updatePreferences({ exportFormat });
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
                        <div className="flex items-center gap-4">
                            <Button type="submit" disabled={savingPreferences}>
                                {savingPreferences ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                Save Preferences
                            </Button>
                            {preferencesSaved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
                        </div>
                    </CardContent>
                </Card>
            </form>

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

                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Settings
                        </Button>
                        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
                    </div>
                </form>
            )}

            {!isSuperAdmin && (
                <p className="text-sm text-muted-foreground">
                    System settings can only be modified by SuperAdmin users.
                </p>
            )}
        </div>
    );
}