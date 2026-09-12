import { useState, useEffect, useRef, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Printer, CheckCircle2, PenLine, X } from 'lucide-react';
import { incidentsApi, usersApi, publicSettingsApi } from '@/lib/api';
import { toast } from 'sonner';
import {
    INCIDENT_TYPES, DESIGNATIONS, TREATMENTS_RECEIVED, TREATMENT_PROVIDERS,
    REPORTED_TO_OPTIONS, COMPLETED_BY_OPTIONS, INVESTIGATION_CHECKLIST,
} from '@/lib/ticketCatalog';

interface Props {
    open: boolean;
    onClose: () => void;
    /** When set, opens an existing incident's report form (view/continue). Otherwise creates a new one. */
    incidentId?: string | null;
    subjectUserId?: string;
    fleetId?: string;
    stadiumId?: string;
    onSaved?: (incidentId: string) => void;
}

// Minimal signature pad — same behaviour as the handover form's canvas.
function SignaturePad({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const [isEmpty, setIsEmpty] = useState(!value);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
    }, []);

    const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const pt = 'touches' in e ? e.touches[0] : e;
        return { x: (pt.clientX - rect.left) * (canvas.width / rect.width), y: (pt.clientY - rect.top) * (canvas.height / rect.height) };
    };
    const start = (e: React.MouseEvent | React.TouchEvent) => {
        e.preventDefault();
        isDrawing.current = true;
        const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        const pos = getPos(e.nativeEvent, canvas);
        ctx.moveTo(pos.x, pos.y);
    };
    const move = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing.current) return;
        e.preventDefault();
        const canvas = canvasRef.current!, ctx = canvas.getContext('2d')!;
        ctx.strokeStyle = '#1a1a2e'; ctx.lineWidth = 2; ctx.lineCap = 'round';
        const pos = getPos(e.nativeEvent, canvas);
        ctx.lineTo(pos.x, pos.y); ctx.stroke();
        setIsEmpty(false);
    };
    const end = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) onChange(canvas.toDataURL());
    };
    const clear = () => {
        const canvas = canvasRef.current;
        const ctx = canvas?.getContext('2d');
        if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setIsEmpty(true);
        onChange('');
    };

    return (
        <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
            <div className="relative border-2 border-dashed rounded-lg overflow-hidden" style={{ height: 90 }}>
                <canvas ref={canvasRef} style={{ width: '100%', height: '100%', touchAction: 'none' }}
                    className="cursor-crosshair bg-white"
                    onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
                    onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
                {isEmpty && <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <span className="text-xs text-muted-foreground/60 flex items-center gap-1"><PenLine className="w-3 h-3" /> Sign here</span>
                </div>}
            </div>
            <button type="button" onClick={clear} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear</button>
        </div>
    );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <div className="border-b">
            <div className="bg-red-900 text-white px-3 py-1.5 font-bold text-xs uppercase tracking-wider">{title}</div>
            <div className="p-3 space-y-3">{children}</div>
        </div>
    );
}

function CheckRow({ options, value, onToggle }: { options: readonly string[]; value: string[]; onToggle: (v: string) => void }) {
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {options.map(o => (
                <label key={o} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="checkbox" className="w-4 h-4 accent-red-800" checked={value.includes(o)} onChange={() => onToggle(o)} />
                    <span>{o}</span>
                </label>
            ))}
        </div>
    );
}

function RadioRow({ name, options, value, onChange }: { name: string; options: readonly string[]; value: string; onChange: (v: string) => void }) {
    return (
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-sm">
            {options.map(o => (
                <label key={o} className="flex items-center gap-1.5 cursor-pointer">
                    <input type="radio" name={name} className="w-4 h-4 accent-red-800" checked={value === o} onChange={() => onChange(o)} />
                    <span>{o}</span>
                </label>
            ))}
        </div>
    );
}

const EMPTY_INJURY = { prefix: '', firstName: '', lastName: '', dob: '', contact: '', designation: '', designationOther: '', descriptionInjury: '', treatmentReceived: '', treatmentProvidedBy: '' };
const EMPTY_CHECKLIST: Record<string, string> = {};

export function IncidentReportFormModal({ open, onClose, incidentId, subjectUserId, fleetId, stadiumId, onSaved }: Props) {
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [logoUrl, setLogoUrl] = useState<string | undefined>();
    const [id, setId] = useState<string | null>(incidentId ?? null);
    const [users, setUsers] = useState<Array<{ id: string; name: string; accreditationNumber?: string | null }>>([]);
    const [status, setStatus] = useState('Open');

    // Basic incident fields
    const [subject, setSubject] = useState(subjectUserId ?? '');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [occurredAt, setOccurredAt] = useState(() => new Date().toISOString().slice(0, 16));
    const [photos, setPhotos] = useState<FileList | null>(null);

    // Template fields
    const [incidentTypes, setIncidentTypes] = useState<string[]>([]);
    const [venueLocationAddress, setVenueLocationAddress] = useState('');
    const [userFullNameFunction, setUserFullNameFunction] = useState('');
    const [userContact, setUserContact] = useState('');
    const [witnessFullNameFunction, setWitnessFullNameFunction] = useState('');
    const [witnessContact, setWitnessContact] = useState('');
    const [injury, setInjury] = useState({ ...EMPTY_INJURY });
    const [incidentReportedTo, setIncidentReportedTo] = useState<string[]>([]);
    const [reportCompletedBy, setReportCompletedBy] = useState('');
    const [reportCompletedByOther, setReportCompletedByOther] = useState('');
    const [reporterName, setReporterName] = useState('');
    const [reporterJobTitle, setReporterJobTitle] = useState('');
    const [reporterContact, setReporterContact] = useState('');
    const [otherInfo, setOtherInfo] = useState('');
    const [checklist, setChecklist] = useState<Record<string, string>>({ ...EMPTY_CHECKLIST });
    const [roadTestAbnormalities, setRoadTestAbnormalities] = useState('');
    const [signature, setSignature] = useState('');
    const [signed, setSigned] = useState(false);
    const [escalContracts, setEscalContracts] = useState(false);
    const [escalMaintenance, setEscalMaintenance] = useState(false);

    const toggle = (list: string[], setList: (v: string[]) => void, v: string) =>
        setList(list.includes(v) ? list.filter(x => x !== v) : [...list, v]);

    const reset = useCallback(() => {
        setId(incidentId ?? null);
        setSubject(subjectUserId ?? '');
        setTitle(''); setDescription('');
        setOccurredAt(new Date().toISOString().slice(0, 16));
        setPhotos(null);
        setIncidentTypes([]); setVenueLocationAddress('');
        setUserFullNameFunction(''); setUserContact('');
        setWitnessFullNameFunction(''); setWitnessContact('');
        setInjury({ ...EMPTY_INJURY });
        setIncidentReportedTo([]); setReportCompletedBy(''); setReportCompletedByOther('');
        setReporterName(''); setReporterJobTitle(''); setReporterContact(''); setOtherInfo('');
        setChecklist({ ...EMPTY_CHECKLIST }); setRoadTestAbnormalities('');
        setSignature(''); setSigned(false);
        setEscalContracts(false); setEscalMaintenance(false);
        setStatus('Open');
    }, [incidentId, subjectUserId]);

    const loadExisting = useCallback(async (existingId: string) => {
        setLoading(true);
        try {
            const res = await incidentsApi.get(existingId);
            const d = res.data.data;
            setTitle(d.title); setDescription(d.description);
            setOccurredAt(new Date(d.occurredAt).toISOString().slice(0, 16));
            setSubject(d.subjectUserId);
            setStatus(d.status);
            setEscalContracts(!!d.escalatedToContracts);
            setEscalMaintenance(!!d.escalatedToMaintenance);
            if (d.formSignatureData) { setSignature(d.formSignatureData); setSigned(true); }
            if (d.formData) {
                try {
                    const f = JSON.parse(d.formData);
                    setIncidentTypes(f.incidentTypes ?? []);
                    setVenueLocationAddress(f.venueLocationAddress ?? '');
                    setUserFullNameFunction(f.userFullNameFunction ?? '');
                    setUserContact(f.userContact ?? '');
                    setWitnessFullNameFunction(f.witnessFullNameFunction ?? '');
                    setWitnessContact(f.witnessContact ?? '');
                    setInjury({ ...EMPTY_INJURY, ...(f.injury ?? {}) });
                    setIncidentReportedTo(f.incidentReportedTo ?? []);
                    setReportCompletedBy(f.reportCompletedBy ?? '');
                    setReportCompletedByOther(f.reportCompletedByOther ?? '');
                    setReporterName(f.reporterName ?? '');
                    setReporterJobTitle(f.reporterJobTitle ?? '');
                    setReporterContact(f.reporterContact ?? '');
                    setOtherInfo(f.otherInfo ?? '');
                    setChecklist(f.checklist ?? {});
                    setRoadTestAbnormalities(f.checklist?.roadTestAbnormalities ?? '');
                } catch { /* malformed stored JSON — keep defaults */ }
            }
        } catch {
            toast.error('Failed to load incident report');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (!open) return;
        reset();
        publicSettingsApi.getBranding().then(res => { if (res.data?.logoUrl) setLogoUrl(res.data.logoUrl); }).catch(() => {});
        usersApi.getAll({ limit: 500 })
            .then(res => setUsers((res.data.data ?? res.data ?? []).map((u: any) => ({ id: u.id, name: u.name, accreditationNumber: u.accreditationNumber }))))
            .catch(() => setUsers([]));
        if (incidentId) loadExisting(incidentId);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, incidentId]);

    const buildFormData = () => ({
        incidentTypes, venueLocationAddress, userFullNameFunction, userContact,
        witnessFullNameFunction, witnessContact, injury,
        incidentReportedTo, reportCompletedBy, reportCompletedByOther,
        reporterName, reporterJobTitle, reporterContact, otherInfo,
        checklist: { ...checklist, roadTestAbnormalities },
    });

    const handleSave = async (thenSign: boolean) => {
        if (!subject || !title.trim() || !description.trim()) {
            toast.error('Subject, title and description are required');
            return;
        }
        setSaving(true);
        try {
            let currentId = id;
            if (!currentId) {
                const fd = new FormData();
                fd.append('subjectUserId', subject);
                fd.append('title', title.trim());
                fd.append('description', description.trim());
                fd.append('occurredAt', new Date(occurredAt).toISOString());
                if (fleetId) fd.append('fleetId', fleetId);
                if (stadiumId) fd.append('stadiumId', stadiumId);
                if (photos) Array.from(photos).slice(0, 5).forEach(p => fd.append('photos', p));
                const res = await incidentsApi.report(fd);
                currentId = res.data.data.id;
                setId(currentId);
            }
            await incidentsApi.saveForm(currentId!, buildFormData());
            if (thenSign) {
                if (!signature) { toast.error('Signature is required to sign the report'); setSaving(false); return; }
                await incidentsApi.signForm(currentId!, signature);
                setSigned(true);
            }
            toast.success(thenSign ? 'Incident report saved and signed' : 'Incident report saved');
            onSaved?.(currentId!);
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to save incident report');
        } finally {
            setSaving(false);
        }
    };

    const handleEscalate = async () => {
        if (!id) { toast.error('Save the report first'); return; }
        if (!escalContracts && !escalMaintenance) { toast.error('Pick at least one team to escalate to'); return; }
        setSaving(true);
        try {
            await incidentsApi.escalate(id, { contracts: escalContracts, maintenance: escalMaintenance });
            toast.success('Escalated for follow-up');
        } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to escalate');
        } finally {
            setSaving(false);
        }
    };

    const handlePrint = async () => {
        if (!id) { toast.error('Save the report first'); return; }
        try {
            const res = await incidentsApi.downloadPdf(id);
            const url = URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
            const a = document.createElement('a');
            a.href = url; a.download = `incident_${id.slice(-8)}.pdf`; a.click();
            URL.revokeObjectURL(url);
        } catch {
            toast.error('Could not download the PDF');
        }
    };

    return (
        <Dialog open={open} onOpenChange={o => { if (!o && !saving) onClose(); }}>
            <DialogContent className="max-w-4xl w-full max-h-[95vh] overflow-y-auto p-0 gap-0">
                {/* Header — same style as the Handover form */}
                <div className="bg-red-900 text-white p-4 flex items-center gap-4">
                    <div className="flex flex-col items-center min-w-[80px]">
                        {logoUrl ? (
                            <img src={logoUrl} alt="Organization Logo" className="h-14 w-auto object-contain bg-white rounded p-1" />
                        ) : (
                            <div className="h-14 w-14 rounded border border-white/30 flex items-center justify-center text-white/40 text-[8px] text-center leading-tight px-1">
                                <span>شعار اللجنة<br />المحلية</span>
                            </div>
                        )}
                        <span className="text-[8px] text-white/60 mt-0.5 text-center leading-tight">
                            شعار اللجنة المحلية المنظمة<br />Local Organizing Committee
                        </span>
                    </div>
                    <div className="flex-1 text-center">
                        <div className="text-sm font-semibold" dir="rtl">نموذج تقرير حادث عربة الجولف</div>
                        <div className="text-xl font-bold uppercase tracking-wider">Golf Cart/Utility Vehicle Incident Report Form</div>
                    </div>
                    <button type="button" className="text-white/70 hover:text-white self-start" onClick={onClose}><X className="w-5 h-5" /></button>
                </div>
                {id && (
                    <div className="bg-zinc-800 text-white/70 text-xs px-4 py-1.5">
                        Status: <span className="font-semibold text-white">{status}</span>
                    </div>
                )}

                {loading ? (
                    <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                ) : (
                    <div className="bg-white text-sm text-gray-900">
                        <Section title="Incident Type">
                            <CheckRow options={INCIDENT_TYPES} value={incidentTypes} onToggle={v => toggle(incidentTypes, setIncidentTypes, v)} />
                        </Section>

                        <Section title="Incident Date, Time & Location">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Date &amp; time of incident</label>
                                    <Input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Venue / Location / Address</label>
                                    <Input value={venueLocationAddress} onChange={e => setVenueLocationAddress(e.target.value)} placeholder="Venue / location / address" />
                                </div>
                            </div>
                        </Section>

                        <Section title="Description of the Incident">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Subject (person the incident is about)</label>
                                <Select value={subject} onValueChange={setSubject} disabled={!!subjectUserId || !!id}>
                                    <SelectTrigger><SelectValue placeholder="Select a user" /></SelectTrigger>
                                    <SelectContent>
                                        {users.map(u => (
                                            <SelectItem key={u.id} value={u.id}>{u.name}{u.accreditationNumber ? ` — FA ${u.accreditationNumber}` : ''}</SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Title</label>
                                <Input value={title} onChange={e => setTitle(e.target.value)} placeholder="Short summary" />
                            </div>
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold uppercase text-muted-foreground">Description — what happened and who witnessed it</label>
                                <Textarea rows={4} value={description} onChange={e => setDescription(e.target.value)} />
                            </div>
                            {!id && (
                                <div className="space-y-1">
                                    <label className="text-[10px] font-bold uppercase text-muted-foreground">Photos (optional, up to 5)</label>
                                    <input type="file" accept="image/*" multiple onChange={e => setPhotos(e.target.files)}
                                        className="block w-full text-sm text-muted-foreground file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5" />
                                </div>
                            )}
                        </Section>

                        <Section title="User of the Golf Cart / UTV When the Incident Happened">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input placeholder="Full name and function" value={userFullNameFunction} onChange={e => setUserFullNameFunction(e.target.value)} />
                                <Input placeholder="Contact number" value={userContact} onChange={e => setUserContact(e.target.value)} />
                            </div>
                        </Section>

                        <Section title="Witness of the Incident">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <Input placeholder="Full name and function" value={witnessFullNameFunction} onChange={e => setWitnessFullNameFunction(e.target.value)} />
                                <Input placeholder="Contact number" value={witnessContact} onChange={e => setWitnessContact(e.target.value)} />
                            </div>
                        </Section>

                        <Section title="Person's Injury / Illness and Treatment Details (if required)">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                                <Input placeholder="Prefix" value={injury.prefix} onChange={e => setInjury(p => ({ ...p, prefix: e.target.value }))} />
                                <Input placeholder="First name" value={injury.firstName} onChange={e => setInjury(p => ({ ...p, firstName: e.target.value }))} />
                                <Input placeholder="Last name" value={injury.lastName} onChange={e => setInjury(p => ({ ...p, lastName: e.target.value }))} />
                                <Input type="date" placeholder="DOB" value={injury.dob} onChange={e => setInjury(p => ({ ...p, dob: e.target.value }))} />
                            </div>
                            <Input placeholder="Contact number" value={injury.contact} onChange={e => setInjury(p => ({ ...p, contact: e.target.value }))} />
                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Designation</label>
                                <RadioRow name="designation" options={DESIGNATIONS} value={injury.designation} onChange={v => setInjury(p => ({ ...p, designation: v }))} />
                                {injury.designation === 'Other' && (
                                    <Input className="mt-1" placeholder="Specify" value={injury.designationOther} onChange={e => setInjury(p => ({ ...p, designationOther: e.target.value }))} />
                                )}
                            </div>
                            <Textarea rows={2} placeholder="Description of injury/illness, including body location" value={injury.descriptionInjury} onChange={e => setInjury(p => ({ ...p, descriptionInjury: e.target.value }))} />
                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Treatment received</label>
                                <RadioRow name="treatmentReceived" options={TREATMENTS_RECEIVED} value={injury.treatmentReceived} onChange={v => setInjury(p => ({ ...p, treatmentReceived: v }))} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">How was treatment provided</label>
                                <RadioRow name="treatmentProvidedBy" options={TREATMENT_PROVIDERS} value={injury.treatmentProvidedBy} onChange={v => setInjury(p => ({ ...p, treatmentProvidedBy: v }))} />
                            </div>
                        </Section>

                        <Section title="Incident Reported To / Report Completed By">
                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">Incident reported to</label>
                                <CheckRow options={REPORTED_TO_OPTIONS} value={incidentReportedTo} onToggle={v => toggle(incidentReportedTo, setIncidentReportedTo, v)} />
                            </div>
                            <div>
                                <label className="text-[10px] font-bold uppercase text-muted-foreground block mb-1">This report was completed by</label>
                                <RadioRow name="completedBy" options={COMPLETED_BY_OPTIONS} value={reportCompletedBy} onChange={setReportCompletedBy} />
                                {reportCompletedBy === 'Other' && (
                                    <Input className="mt-1" placeholder="Specify" value={reportCompletedByOther} onChange={e => setReportCompletedByOther(e.target.value)} />
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                <Input placeholder="Name" value={reporterName} onChange={e => setReporterName(e.target.value)} />
                                <Input placeholder="Job title" value={reporterJobTitle} onChange={e => setReporterJobTitle(e.target.value)} />
                                <Input placeholder="Contact no." value={reporterContact} onChange={e => setReporterContact(e.target.value)} />
                            </div>
                            <Textarea rows={2} placeholder="Any other relevant information" value={otherInfo} onChange={e => setOtherInfo(e.target.value)} />
                        </Section>

                        <Section title="Golf Cart/Utility Vehicle Investigation Checklist After Incident">
                            <div className="space-y-2">
                                {INVESTIGATION_CHECKLIST.map(item => (
                                    <div key={item.key} className="flex items-center justify-between gap-3 text-xs border-b pb-1.5">
                                        <span className="flex-1">{item.label}</span>
                                        <RadioRow name={item.key} options={['Yes', 'No'] as const} value={checklist[item.key] === 'yes' ? 'Yes' : checklist[item.key] === 'no' ? 'No' : ''}
                                            onChange={v => setChecklist(p => ({ ...p, [item.key]: v === 'Yes' ? 'yes' : 'no' }))} />
                                    </div>
                                ))}
                                <Textarea rows={2} placeholder="Road test — any abnormalities? If so, explain..." value={roadTestAbnormalities} onChange={e => setRoadTestAbnormalities(e.target.value)} />
                            </div>
                        </Section>

                        <Section title="Sign-off">
                            <div className="max-w-sm">
                                <SignaturePad label="Signature — Admin / SuperAdmin" value={signature} onChange={setSignature} />
                            </div>
                            {signed && <p className="text-xs text-green-700 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> Signed</p>}
                        </Section>

                        {id && (
                            <Section title="Escalate for Follow-up">
                                <div className="flex flex-wrap items-center gap-4 text-sm">
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 accent-red-800" checked={escalContracts} onChange={e => setEscalContracts(e.target.checked)} />
                                        Contracts team
                                    </label>
                                    <label className="flex items-center gap-1.5 cursor-pointer">
                                        <input type="checkbox" className="w-4 h-4 accent-red-800" checked={escalMaintenance} onChange={e => setEscalMaintenance(e.target.checked)} />
                                        Maintenance team
                                    </label>
                                    <Button size="sm" variant="outline" onClick={handleEscalate} disabled={saving}>Escalate</Button>
                                </div>
                            </Section>
                        )}

                        <div className="flex flex-wrap gap-3 p-4 bg-muted/10">
                            <Button variant="outline" onClick={onClose} disabled={saving}>Close</Button>
                            <div className="flex-1" />
                            {id && (
                                <Button variant="outline" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" /> Download PDF</Button>
                            )}
                            <Button variant="secondary" onClick={() => handleSave(false)} disabled={saving}>
                                {saving && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save
                            </Button>
                            <Button className="bg-red-900 hover:bg-red-800 text-white" onClick={() => handleSave(true)} disabled={saving}>
                                {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                Save &amp; Sign
                            </Button>
                        </div>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
