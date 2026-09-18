import { useEffect, useRef, useState } from 'react';
import { notificationTemplatesApi } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Loader2, ChevronDown, ChevronUp, Save, RotateCcw, Mail, Bell, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface Template {
    id: string;
    key: string;
    name: string;
    category: string;
    description: string | null;
    variables: string[];
    emailEnabled: boolean;
    emailSubject: string | null;
    emailBody: string | null;
    pushEnabled: boolean;
    pushTitle: string | null;
    pushMessage: string | null;
    updatedAt: string;
}

const CATEGORY_ORDER = ['System', 'Requests', 'Bookings', 'Accounts', 'Access Requests', 'Incidents', 'Handover'];

/** "venueName" -> "Venue Name" — a readable stand-in for {{var}} in the preview, no example data needed per template. */
function humanizeVar(v: string): string {
    return v.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, c => c.toUpperCase());
}

function previewText(text: string): string {
    return text.replace(/\{\{(\w+)\}\}/g, (_match, name) => `[${humanizeVar(name)}]`);
}

export function NotificationTemplatesPanel() {
    const [loading, setLoading] = useState(true);
    const [templates, setTemplates] = useState<Template[]>([]);
    const [expanded, setExpanded] = useState<string | null>(null);
    const [drafts, setDrafts] = useState<Record<string, Template>>({});
    const [saving, setSaving] = useState<string | null>(null);
    const [resetting, setResetting] = useState<string | null>(null);
    const [previewOpen, setPreviewOpen] = useState<Record<string, boolean>>({});

    type EditableField = 'emailSubject' | 'emailBody' | 'pushTitle' | 'pushMessage';
    const lastFocused = useRef<Record<string, EditableField>>({});
    const fieldRefs = useRef<Record<string, HTMLInputElement | HTMLTextAreaElement | null>>({});

    const insertVariable = (key: string, varName: string) => {
        const field = lastFocused.current[key] || 'emailBody';
        const el = fieldRefs.current[`${key}:${field}`];
        const draft = drafts[key];
        if (!draft) return;
        const current = draft[field] || '';
        const start = el?.selectionStart ?? current.length;
        const end = el?.selectionEnd ?? start;
        const insertion = `{{${varName}}}`;
        updateDraft(key, { [field]: current.slice(0, start) + insertion + current.slice(end) });
        requestAnimationFrame(() => {
            if (!el) return;
            el.focus();
            const pos = start + insertion.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const load = () => {
        setLoading(true);
        notificationTemplatesApi
            .list()
            .then((res) => {
                const data: Template[] = res.data.data || [];
                setTemplates(data);
                setDrafts(Object.fromEntries(data.map((t) => [t.key, t])));
            })
            .catch(() => toast.error('Failed to load notification templates'))
            .finally(() => setLoading(false));
    };

    useEffect(load, []);

    const toggle = (key: string) => setExpanded((cur) => (cur === key ? null : key));

    const updateDraft = (key: string, patch: Partial<Template>) =>
        setDrafts((d) => ({ ...d, [key]: { ...d[key]!, ...patch } }));

    const save = async (key: string) => {
        const draft = drafts[key];
        if (!draft) return;
        setSaving(key);
        try {
            await notificationTemplatesApi.update(key, {
                emailEnabled: draft.emailEnabled,
                emailSubject: draft.emailSubject,
                emailBody: draft.emailBody,
                pushEnabled: draft.pushEnabled,
                pushTitle: draft.pushTitle,
                pushMessage: draft.pushMessage,
            });
            toast.success(`${draft.name} saved`);
            load();
        } catch {
            toast.error('Failed to save template');
        } finally {
            setSaving(null);
        }
    };

    const reset = async (key: string) => {
        if (!confirm('Reset this template back to its built-in default content? Your edits will be lost.')) return;
        setResetting(key);
        try {
            await notificationTemplatesApi.reset(key);
            toast.success('Reset to default');
            load();
        } catch {
            toast.error('Failed to reset template');
        } finally {
            setResetting(null);
        }
    };

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            </div>
        );
    }

    const grouped = CATEGORY_ORDER.map((cat) => ({
        category: cat,
        items: templates.filter((t) => t.category === cat),
    })).filter((g) => g.items.length > 0);

    return (
        <div className="space-y-8">
            {grouped.map((group) => (
                <div key={group.category} className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground">{group.category}</h3>
                    <div className="space-y-3">
                        {group.items.map((t) => {
                            const draft = drafts[t.key] || t;
                            const isOpen = expanded === t.key;
                            return (
                                <Card key={t.key} className="border-none shadow-sm overflow-hidden">
                                    <div
                                        className="flex items-center justify-between p-4 cursor-pointer hover:bg-muted/10"
                                        onClick={() => toggle(t.key)}
                                    >
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="flex gap-1.5 shrink-0">
                                                {t.emailEnabled && (
                                                    <span className="p-1.5 rounded-lg bg-primary/10 text-primary" title="Email enabled">
                                                        <Mail className="w-3.5 h-3.5" />
                                                    </span>
                                                )}
                                                {t.pushEnabled && (
                                                    <span className="p-1.5 rounded-lg bg-amber-500/10 text-amber-600" title="Push/in-app enabled">
                                                        <Bell className="w-3.5 h-3.5" />
                                                    </span>
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-sm truncate">{t.name}</p>
                                                {t.description && <p className="text-xs text-muted-foreground truncate">{t.description}</p>}
                                            </div>
                                        </div>
                                        {isOpen ? <ChevronUp className="w-5 h-5 text-muted-foreground shrink-0" /> : <ChevronDown className="w-5 h-5 text-muted-foreground shrink-0" />}
                                    </div>

                                    {isOpen && (
                                        <CardContent className="p-6 pt-0 border-t space-y-6 animate-in slide-in-from-top-2 duration-200">
                                            <div className="flex items-center justify-between pt-4">
                                                {t.variables.length > 0 ? (
                                                    <div className="flex flex-wrap gap-1.5">
                                                        <span className="text-xs text-muted-foreground mr-1 self-center">Click to insert:</span>
                                                        {t.variables.map((v) => (
                                                            <Badge
                                                                key={v}
                                                                variant="outline"
                                                                className="font-mono text-[10px] cursor-pointer hover:bg-primary/10 hover:border-primary"
                                                                onClick={() => insertVariable(t.key, v)}
                                                                title={`Insert into ${humanizeVar(lastFocused.current[t.key] || 'emailBody')}`}
                                                            >
                                                                {`{{${v}}}`}
                                                            </Badge>
                                                        ))}
                                                    </div>
                                                ) : <span />}
                                                <Button
                                                    type="button" variant="ghost" size="sm"
                                                    onClick={() => setPreviewOpen((p) => ({ ...p, [t.key]: !p[t.key] }))}
                                                >
                                                    {previewOpen[t.key] ? <EyeOff className="w-4 h-4 mr-1.5" /> : <Eye className="w-4 h-4 mr-1.5" />}
                                                    {previewOpen[t.key] ? 'Hide preview' : 'Preview'}
                                                </Button>
                                            </div>

                                            {/* Email */}
                                            <div className="space-y-3 rounded-2xl border bg-muted/5 p-4">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-sm font-bold flex items-center gap-2"><Mail className="w-4 h-4" /> Email</Label>
                                                    <Switch
                                                        checked={draft.emailEnabled}
                                                        onCheckedChange={(v) => updateDraft(t.key, { emailEnabled: v })}
                                                        disabled={t.emailSubject === null && t.emailBody === null}
                                                    />
                                                </div>
                                                {(t.emailSubject !== null || t.emailBody !== null) ? (
                                                    <>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs">Subject</Label>
                                                            <Input
                                                                ref={(el) => { fieldRefs.current[`${t.key}:emailSubject`] = el; }}
                                                                value={draft.emailSubject || ''}
                                                                onChange={(e) => updateDraft(t.key, { emailSubject: e.target.value })}
                                                                onFocus={() => { lastFocused.current[t.key] = 'emailSubject'; }}
                                                                disabled={!draft.emailEnabled}
                                                            />
                                                            {previewOpen[t.key] && (
                                                                <p className="text-sm italic text-muted-foreground border rounded-lg px-3 py-2 bg-background">{previewText(draft.emailSubject || '')}</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs">Body</Label>
                                                            <Textarea
                                                                ref={(el) => { fieldRefs.current[`${t.key}:emailBody`] = el; }}
                                                                value={draft.emailBody || ''}
                                                                onChange={(e) => updateDraft(t.key, { emailBody: e.target.value })}
                                                                onFocus={() => { lastFocused.current[t.key] = 'emailBody'; }}
                                                                disabled={!draft.emailEnabled}
                                                                rows={6}
                                                                className="font-mono text-sm"
                                                            />
                                                            {previewOpen[t.key] && (
                                                                <p className="text-sm whitespace-pre-wrap border rounded-lg px-3 py-2 bg-background">{previewText(draft.emailBody || '')}</p>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">This event doesn't send an email.</p>
                                                )}
                                            </div>

                                            {/* Push */}
                                            <div className="space-y-3 rounded-2xl border bg-muted/5 p-4">
                                                <div className="flex items-center justify-between">
                                                    <Label className="text-sm font-bold flex items-center gap-2"><Bell className="w-4 h-4" /> Push / In-App Notification</Label>
                                                    <Switch
                                                        checked={draft.pushEnabled}
                                                        onCheckedChange={(v) => updateDraft(t.key, { pushEnabled: v })}
                                                        disabled={t.pushTitle === null && t.pushMessage === null}
                                                    />
                                                </div>
                                                {(t.pushTitle !== null || t.pushMessage !== null) ? (
                                                    <>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs">Title</Label>
                                                            <Input
                                                                ref={(el) => { fieldRefs.current[`${t.key}:pushTitle`] = el; }}
                                                                value={draft.pushTitle || ''}
                                                                onChange={(e) => updateDraft(t.key, { pushTitle: e.target.value })}
                                                                onFocus={() => { lastFocused.current[t.key] = 'pushTitle'; }}
                                                                disabled={!draft.pushEnabled}
                                                            />
                                                            {previewOpen[t.key] && (
                                                                <p className="text-sm italic text-muted-foreground border rounded-lg px-3 py-2 bg-background">{previewText(draft.pushTitle || '')}</p>
                                                            )}
                                                        </div>
                                                        <div className="space-y-1.5">
                                                            <Label className="text-xs">Message</Label>
                                                            <Textarea
                                                                ref={(el) => { fieldRefs.current[`${t.key}:pushMessage`] = el; }}
                                                                value={draft.pushMessage || ''}
                                                                onChange={(e) => updateDraft(t.key, { pushMessage: e.target.value })}
                                                                onFocus={() => { lastFocused.current[t.key] = 'pushMessage'; }}
                                                                disabled={!draft.pushEnabled}
                                                                rows={3}
                                                                className="font-mono text-sm"
                                                            />
                                                            {previewOpen[t.key] && (
                                                                <p className="text-sm whitespace-pre-wrap border rounded-lg px-3 py-2 bg-background">{previewText(draft.pushMessage || '')}</p>
                                                            )}
                                                        </div>
                                                    </>
                                                ) : (
                                                    <p className="text-xs text-muted-foreground">This event doesn't send a push/in-app notification.</p>
                                                )}
                                            </div>

                                            <div className="flex justify-end gap-3 pt-1">
                                                <Button type="button" variant="outline" size="sm" disabled={resetting === t.key} onClick={() => reset(t.key)}>
                                                    {resetting === t.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RotateCcw className="w-4 h-4 mr-2" />}
                                                    Reset to Default
                                                </Button>
                                                <Button type="button" size="sm" disabled={saving === t.key} onClick={() => save(t.key)}>
                                                    {saving === t.key ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                                                    Save Template
                                                </Button>
                                            </div>
                                        </CardContent>
                                    )}
                                </Card>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}
