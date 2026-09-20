import { useState, useEffect } from 'react';
import { documentsApi } from '@/lib/api';
import { useAuthStore } from '@/stores/authStore';
import { useSettingsStore } from '@/stores/settingsStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Loader2, Upload, FileText, Presentation, FileType2, Eye, Download, Trash2, Plus } from 'lucide-react';
import { toast } from 'sonner';

interface ResourceDoc {
    id: string;
    title: string;
    description?: string | null;
    originalName: string;
    mimeType: string;
    fileSize: number;
    createdAt: string;
}

function iconFor(mimeType: string) {
    if (mimeType === 'application/pdf') return FileText;
    if (mimeType.includes('presentation') || mimeType.includes('powerpoint')) return Presentation;
    return FileType2;
}

function formatSize(bytes: number) {
    if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

interface DocumentsLibraryPageProps {
    category: 'training' | 'policy';
    title: string;
    description: string;
    /** Renders a smaller heading with no outer page spacing — for embedding inside another page (e.g. Settings). */
    compact?: boolean;
}

export function DocumentsLibraryPage({ category, title, description, compact = false }: DocumentsLibraryPageProps) {
    const { user } = useAuthStore();
    const isSuperAdmin = user?.role === 'SuperAdmin';
    const allowDownloads = useSettingsStore(s => s.allowDocumentDownloads);
    const canDownload = isSuperAdmin || allowDownloads;
    const [docs, setDocs] = useState<ResourceDoc[]>([]);
    const [loading, setLoading] = useState(true);
    const [uploadOpen, setUploadOpen] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [form, setForm] = useState<{ title: string; description: string; files: File[] }>({ title: '', description: '', files: [] });

    const load = async () => {
        setLoading(true);
        try {
            const res = await documentsApi.list(category);
            setDocs(res.data.data || []);
        } catch {
            toast.error('Failed to load documents');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, [category]);

    const handleUpload = async (e: React.FormEvent) => {
        e.preventDefault();
        if (form.files.length === 0 || (form.files.length === 1 && !form.title.trim())) {
            toast.error(form.files.length === 0 ? 'At least one file is required' : 'Title is required');
            return;
        }
        setUploading(true);
        try {
            const fd = new FormData();
            fd.append('category', category);
            if (form.files.length === 1) fd.append('title', form.title);
            fd.append('description', form.description);
            form.files.forEach(f => fd.append('files', f));
            await documentsApi.upload(fd);
            toast.success(form.files.length > 1 ? `${form.files.length} documents uploaded` : 'Document uploaded');
            setUploadOpen(false);
            setForm({ title: '', description: '', files: [] });
            load();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Upload failed');
        } finally {
            setUploading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm('Delete this document? This cannot be undone.')) return;
        try {
            await documentsApi.delete(id);
            toast.success('Document deleted');
            setDocs(prev => prev.filter(d => d.id !== id));
        } catch {
            toast.error('Failed to delete document');
        }
    };

    const handleView = (doc: ResourceDoc) => {
        const token = localStorage.getItem('accessToken');
        window.open(`${documentsApi.getViewUrl(doc.id)}?token=${token}`, '_blank');
    };

    const handleDownload = async (doc: ResourceDoc) => {
        try {
            const res = await documentsApi.download(doc.id);
            const url = URL.createObjectURL(res.data);
            const a = document.createElement('a');
            a.href = url;
            a.download = doc.originalName;
            a.click();
            URL.revokeObjectURL(url);
        } catch (err: any) {
            // responseType: 'blob' means an error body also arrives as a Blob, not parsed JSON.
            let message = 'Download failed';
            const data = err?.response?.data;
            if (data instanceof Blob) {
                try { message = JSON.parse(await data.text()).error || message; } catch { /* non-JSON error body */ }
            } else if (data?.error) {
                message = data.error;
            }
            toast.error(message);
        }
    };

    return (
        <div className={compact ? 'space-y-4' : 'space-y-6'}>
            <div className="flex flex-wrap justify-between items-center gap-3">
                <div>
                    {compact
                        ? <h3 className="text-lg font-bold">{title}</h3>
                        : <h1 className="text-3xl font-bold">{title}</h1>}
                    <p className="text-muted-foreground text-sm mt-1">{description}</p>
                </div>
                {isSuperAdmin && (
                    <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
                        <DialogTrigger asChild>
                            <Button><Plus className="w-4 h-4 mr-2" />Upload Document</Button>
                        </DialogTrigger>
                        <DialogContent>
                            <DialogHeader><DialogTitle>Upload Document{form.files.length > 1 ? 's' : ''}</DialogTitle></DialogHeader>
                            <form onSubmit={handleUpload} className="space-y-4">
                                <div className="space-y-2">
                                    <Label>Files (PowerPoint, PDF, or Word — up to 25MB each, up to 10 at once)</Label>
                                    <Input
                                        type="file"
                                        accept=".pdf,.ppt,.pptx,.doc,.docx"
                                        multiple
                                        onChange={e => setForm(f => ({ ...f, files: Array.from(e.target.files || []) }))}
                                        required
                                    />
                                    {form.files.length > 1 && (
                                        <p className="text-xs text-muted-foreground">
                                            {form.files.length} files selected — each will be titled from its own filename.
                                        </p>
                                    )}
                                </div>
                                {form.files.length <= 1 && (
                                    <div className="space-y-2">
                                        <Label>Title</Label>
                                        <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} required />
                                    </div>
                                )}
                                <div className="space-y-2">
                                    <Label>Description (optional)</Label>
                                    <Textarea value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
                                </div>
                                <DialogFooter>
                                    <Button type="submit" disabled={uploading}>
                                        {uploading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                                        Upload
                                    </Button>
                                </DialogFooter>
                            </form>
                        </DialogContent>
                    </Dialog>
                )}
            </div>

            {loading ? (
                <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
            ) : docs.length === 0 ? (
                <Card>
                    <CardContent className="py-16 text-center text-muted-foreground">
                        <FileText className="w-10 h-10 mx-auto mb-3 opacity-40" />
                        No documents have been uploaded yet.
                    </CardContent>
                </Card>
            ) : (
                <div className={`grid grid-cols-1 sm:grid-cols-2 gap-4 ${compact ? '' : 'lg:grid-cols-3'}`}>
                    {docs.map(doc => {
                        const Icon = iconFor(doc.mimeType);
                        return (
                            <Card key={doc.id} className="flex flex-col">
                                <CardHeader className="pb-3">
                                    <div className="flex items-start gap-3">
                                        <div className="p-2 rounded-lg bg-muted text-muted-foreground shrink-0"><Icon className="w-5 h-5" /></div>
                                        <div className="min-w-0">
                                            <CardTitle className="text-base leading-snug break-words">{doc.title}</CardTitle>
                                            <CardDescription className="text-xs mt-1">
                                                {formatSize(doc.fileSize)} · {new Date(doc.createdAt).toLocaleDateString()}
                                            </CardDescription>
                                        </div>
                                    </div>
                                </CardHeader>
                                <CardContent className="pt-0 mt-auto space-y-3">
                                    {doc.description && <p className="text-sm text-muted-foreground line-clamp-2">{doc.description}</p>}
                                    <div className="flex flex-wrap gap-2">
                                        <Button size="sm" variant="outline" onClick={() => handleView(doc)}><Eye className="w-3.5 h-3.5 mr-1.5" />View</Button>
                                        {canDownload && (
                                            <Button size="sm" variant="outline" onClick={() => handleDownload(doc)}><Download className="w-3.5 h-3.5 mr-1.5" />Download</Button>
                                        )}
                                        {isSuperAdmin && (
                                            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => handleDelete(doc.id)}>
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
