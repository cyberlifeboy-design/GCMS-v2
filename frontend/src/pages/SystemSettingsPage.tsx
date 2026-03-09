import { useState, useEffect } from 'react';
import { settingsApi } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Upload, Image } from 'lucide-react';
import { useAuthStore } from '@/stores/authStore';

interface Settings {
    tournamentName?: string;
    logoUrl?: string;
    headerImageUrl?: string;
    footerImageUrl?: string;
}

export function SystemSettingsPage() {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';

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
        const load = async () => {
            try {
                const res = await settingsApi.get();
                const d: Settings = res.data;
                setTournamentName(d.tournamentName || '');
                setLogoPrev(d.logoUrl || '');
                setHeaderPrev(d.headerImageUrl || '');
                setFooterPrev(d.footerImageUrl || '');
            } catch (e) {
                console.error(e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!isSuperAdmin) return;
        setSaving(true);
        setSaved(false);
        try {
            const fd = new FormData();
            fd.append('tournamentName', tournamentName);
            if (logoFile) fd.append('logo', logoFile);
            if (headerFile) fd.append('headerImage', headerFile);
            if (footerFile) fd.append('footerImage', footerFile);
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
                <h1 className="text-3xl font-bold">System Settings</h1>
                <p className="text-muted-foreground mt-1">Tournament configuration and branding assets.</p>
                {!isSuperAdmin && (
                    <p className="mt-2 text-sm text-amber-600 bg-amber-50 border border-amber-200 rounded p-2">
                        You have read-only access. Only SuperAdmin can modify settings.
                    </p>
                )}
            </div>

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
                                disabled={!isSuperAdmin}
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

                {isSuperAdmin && (
                    <div className="flex items-center gap-4">
                        <Button type="submit" disabled={saving}>
                            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                            Save Settings
                        </Button>
                        {saved && <span className="text-sm text-green-600 font-medium">✓ Saved successfully</span>}
                    </div>
                )}
            </form>
        </div>
    );
}
