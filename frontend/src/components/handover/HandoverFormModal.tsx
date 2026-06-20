import { useRef, useEffect, useState, useCallback } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, Printer, CheckCircle2, PenLine, X } from 'lucide-react';
import { handoverApi, publicSettingsApi } from '@/lib/api';
import { RichContent } from '@/components/ui/rich-editor';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface HandoverFormData {
    id?: string;
    fleetId: string;
    status: string; // PENDING | ADMIN_SIGNED | COMPLETE
    serialNumber?: string;
    faCode?: string;
    handoverDate?: string;
    approvedReturnDate?: string;
    handoverLocation?: string;
    receiverLicenseNo?: string;
    handoverBy?: string;
    handedOverTo?: string;
    handoverByContact?: string;
    receiverContact?: string;
    cartTypeData?: string;
    conditionData?: string;
    additionalDrivers?: string;
    issuesNotes?: string;
    tc1?: boolean; tc2?: boolean; tc3?: boolean; tcData?: string;
    finalName?: string;
    finalDate?: string;
    adminSignatureData?: string;
    userSignatureData?: string;
    finalSignatureData?: string;
    adminSignedAt?: string;
    userSignedAt?: string;
    adminSignedByUser?: { name: string };
    userSignedByUser?: { name: string };
    fleet?: {
        carNumber: string; carType: string;
        stadium?: { name: string; code: string };
        department?: { name: string; code: string };
        assignedUser?: { name: string; email: string; phone?: string; accreditationNumber?: string };
    };
}

interface CartTypeData { cargo: boolean; fourSeat: boolean; sixSeat: boolean; access: boolean; over18: string; licenseType: string; entity: string; }
interface ConditionRating { pre: string; aft: string; } // good | mod | poor | ''
type ConditionMap = Record<string, ConditionRating>;
interface AdditionalDriver { name: string; contact: string; entity: string; licenseNo: string; }

type TcCheckbox = { id: string; en: string; ar: string };

const DEFAULT_TC_CHECKBOXES: TcCheckbox[] = [
    { id: 'tc1', en: 'I confirm that I have read, understood and agree to comply with these Terms and Conditions.', ar: 'أؤكد أنني قرأت هذه الشروط والأحكام وفهمتها وأوافق على الامتثال لها.' },
    { id: 'tc2', en: 'I confirm that I have read, understood and agree to comply with the LOC Golf Cart Usage Policy & Procedure.', ar: 'أؤكد أنني قرأت سياسة وإجراءات استخدام عربة الجولف الخاصة بـ LOC وأوافق على الامتثال لها.' },
    { id: 'tc3', en: 'I confirm that I have completed the Venue specific Golf Cart familiarisation.', ar: 'أؤكد أنني أكملت التعريف بعربة الجولف الخاص بالمنشأة.' },
];

interface TcSettings {
    handoverTcEnTitle: string | null;
    handoverTcEnBody: string | null;
    handoverTcArTitle: string | null;
    handoverTcArBody: string | null;
    handoverTcCheckboxes: string | null;
}

interface Props {
    open: boolean;
    onClose: () => void;
    mode: 'admin' | 'user' | 'view';
    fleetId: string;
    preloadedForm?: HandoverFormData | null;
    currentUserName?: string;
    adminName?: string;
    adminPhone?: string;
    logoUrl?: string;
    onComplete?: () => void;
}

// ─── Signature Canvas ─────────────────────────────────────────────────────────

function SignatureCanvas({ value, onChange, disabled, label }: { value: string; onChange: (v: string) => void; disabled?: boolean; label: string; }) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const isDrawing = useRef(false);
    const [isEmpty, setIsEmpty] = useState(!value);

    const getCtx = () => canvasRef.current?.getContext('2d');

    const loadSignature = useCallback((dataUrl: string) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        if (!dataUrl) return;
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        img.src = dataUrl;
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        canvas.width = canvas.offsetWidth;
        canvas.height = canvas.offsetHeight;
        if (value) loadSignature(value);
    }, []);

    useEffect(() => { if (value) loadSignature(value); }, [value]);

    const getPos = (e: MouseEvent | TouchEvent, canvas: HTMLCanvasElement) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const pt = 'touches' in e ? e.touches[0] : e;
        return { x: (pt.clientX - rect.left) * scaleX, y: (pt.clientY - rect.top) * scaleY };
    };

    const startDraw = (e: React.MouseEvent | React.TouchEvent) => {
        if (disabled) return;
        e.preventDefault();
        isDrawing.current = true;
        const canvas = canvasRef.current!;
        const ctx = getCtx()!;
        ctx.beginPath();
        const pos = getPos(e.nativeEvent, canvas);
        ctx.moveTo(pos.x, pos.y);
    };

    const draw = (e: React.MouseEvent | React.TouchEvent) => {
        if (!isDrawing.current || disabled) return;
        e.preventDefault();
        const canvas = canvasRef.current!;
        const ctx = getCtx()!;
        ctx.strokeStyle = '#1a1a2e';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        const pos = getPos(e.nativeEvent, canvas);
        ctx.lineTo(pos.x, pos.y);
        ctx.stroke();
        setIsEmpty(false);
    };

    const endDraw = () => {
        if (!isDrawing.current) return;
        isDrawing.current = false;
        const canvas = canvasRef.current;
        if (canvas) onChange(canvas.toDataURL());
    };

    const clearCanvas = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
        setIsEmpty(true);
        onChange('');
    };

    return (
        <div className="space-y-1">
            <div className="text-[10px] font-bold uppercase text-muted-foreground">{label}</div>
            <div className="relative border-2 border-dashed rounded-lg overflow-hidden" style={{ height: 90 }}>
                <canvas
                    ref={canvasRef}
                    style={{ width: '100%', height: '100%', touchAction: 'none' }}
                    className={disabled ? 'cursor-default bg-muted/20' : 'cursor-crosshair bg-white'}
                    onMouseDown={startDraw} onMouseMove={draw} onMouseUp={endDraw} onMouseLeave={endDraw}
                    onTouchStart={startDraw} onTouchMove={draw} onTouchEnd={endDraw}
                />
                {isEmpty && !disabled && (
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                        <span className="text-xs text-muted-foreground/60 flex items-center gap-1"><PenLine className="w-3 h-3" /> Sign here</span>
                    </div>
                )}
            </div>
            {!disabled && <button type="button" onClick={clearCanvas} className="text-[10px] text-muted-foreground hover:text-foreground underline">Clear</button>}
        </div>
    );
}

// ─── Condition Table ──────────────────────────────────────────────────────────

const CONDITION_ITEMS = [
    { key: 'body', en: 'Body Condition', ar: 'حالة الهيكل الخارجي' },
    { key: 'lights', en: 'Lights', ar: 'الأضواء' },
    { key: 'indicators', en: 'Indicators', ar: 'إشارات الانعطاف' },
    { key: 'windshield', en: 'Windshield', ar: 'الزجاج الأمامي' },
    { key: 'mirrors', en: 'Mirrors', ar: 'المرايا' },
    { key: 'tires', en: 'Tires', ar: 'الإطارات' },
    { key: 'brake', en: 'Brake Pedal', ar: 'دواسة الفرامل' },
    { key: 'pkb', en: 'Parking Brake', ar: 'فرامل التوقف' },
    { key: 'battery', en: 'Battery', ar: 'البطارية والطاقة' },
    { key: 'charge', en: 'Battery Charge', ar: 'مستوى شحن البطارية' },
    { key: 'seats', en: 'Seats', ar: 'المقاعد' },
    { key: 'seatbelts', en: 'Seatbelts', ar: 'أحزمة الأمان' },
    { key: 'steering', en: 'Steering', ar: 'نظام التوجيه' },
    { key: 'horn', en: 'Horn', ar: 'البوق' },
];

function ConditionTable({ value, onChange, disabled }: { value: ConditionMap; onChange: (v: ConditionMap) => void; disabled: boolean; }) {
    const set = (key: string, side: 'pre' | 'aft', rating: string) => {
        onChange({ ...value, [key]: { ...(value[key] || { pre: '', aft: '' }), [side]: rating } });
    };
    const ratings = ['good', 'mod', 'poor'];

    return (
        <div className="border rounded-lg overflow-hidden text-xs">
            <div className="grid grid-cols-7 bg-primary text-white text-center font-bold uppercase">
                <div className="p-2 text-left col-span-1 bg-muted/80 text-foreground">Item</div>
                <div className="p-2 col-span-3 border-l border-white/20">Pre-Use</div>
                <div className="p-2 col-span-3 border-l border-white/20">After-Use</div>
            </div>
            <div className="grid grid-cols-7 bg-primary/80 text-white text-center text-[10px] font-semibold">
                <div className="col-span-1 bg-muted/50 text-foreground" />
                {['Good','Mod.','Poor','Good','Mod.','Poor'].map((r, i) => (
                    <div key={i} className="p-1 border-l border-white/20">{r}</div>
                ))}
            </div>
            {CONDITION_ITEMS.map((item, idx) => (
                <div key={item.key} className={`grid grid-cols-7 border-t ${idx % 2 === 1 ? 'bg-muted/20' : ''}`}>
                    <div className="col-span-1 p-2 font-medium">
                        <div>{item.en}</div>
                        <div className="text-muted-foreground text-[10px]">{item.ar}</div>
                    </div>
                    {ratings.map(r => (
                        <div key={`pre-${r}`} className="flex items-center justify-center border-l">
                            <input type="radio" name={`pre-${item.key}`} value={r} disabled={disabled}
                                checked={(value[item.key]?.pre ?? '') === r}
                                onChange={() => set(item.key, 'pre', r)}
                                className="w-4 h-4 accent-primary cursor-pointer"
                            />
                        </div>
                    ))}
                    {ratings.map(r => (
                        <div key={`aft-${r}`} className="flex items-center justify-center border-l">
                            <input type="radio" name={`aft-${item.key}`} value={r} disabled={disabled}
                                checked={(value[item.key]?.aft ?? '') === r}
                                onChange={() => set(item.key, 'aft', r)}
                                className="w-4 h-4 accent-primary cursor-pointer"
                            />
                        </div>
                    ))}
                </div>
            ))}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

// Map fleet carType string to checkbox state
function cartTypeFromString(carType: string): Partial<CartTypeData> {
    const t = carType.toLowerCase();
    return {
        cargo: t.includes('cargo'),
        fourSeat: t.includes('4') || t.includes('four'),
        sixSeat: t.includes('6') || t.includes('six'),
        access: t.includes('access'),
    };
}

export function HandoverFormModal({ open, onClose, mode, fleetId, preloadedForm, currentUserName, adminName, adminPhone, logoUrl, onComplete }: Props) {
    const [form, setForm] = useState<HandoverFormData | null>(null);
    const [loading, setLoading] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [tc, setTc] = useState<TcSettings>({ handoverTcEnTitle: null, handoverTcEnBody: null, handoverTcArTitle: null, handoverTcArBody: null, handoverTcCheckboxes: null });
    const [tcBoxes, setTcBoxes] = useState<TcCheckbox[]>(DEFAULT_TC_CHECKBOXES);
    const [tcChecked, setTcChecked] = useState<Record<string, boolean>>({});

    // Form state
    const [f, setF] = useState({
        serialNumber: '', faCode: '', handoverDate: '', approvedReturnDate: '',
        handoverLocation: '', receiverLicenseNo: '', handoverBy: '', handedOverTo: '',
        handoverByContact: '', receiverContact: '', issuesNotes: '',
        finalName: '', finalDate: new Date().toISOString().slice(0, 10),
    });
    const [cartType, setCartType] = useState<CartTypeData>({ cargo: false, fourSeat: false, sixSeat: false, access: false, over18: '', licenseType: '', entity: '' });
    const [condition, setCondition] = useState<ConditionMap>({});
    const [drivers, setDrivers] = useState<AdditionalDriver[]>([{ name: '', contact: '', entity: '', licenseNo: '' }, { name: '', contact: '', entity: '', licenseNo: '' }, { name: '', contact: '', entity: '', licenseNo: '' }]);
    const [adminSig, setAdminSig] = useState('');
    const [userSig, setUserSig] = useState('');
    const [finalSig, setFinalSig] = useState('');

    const isReadonly = mode === 'view' || (mode === 'user' && form?.status === 'COMPLETE');
    const today = new Date().toISOString().slice(0, 10);

    const loadForm = useCallback(async () => {
        setLoading(true);
        try {
            const [formRes, settingsRes] = await Promise.all([
                handoverApi.getHandoverForm(fleetId),
                publicSettingsApi.getBranding(),
            ]);
            const data: HandoverFormData | null = formRes.data;
            const s = settingsRes.data;
            setTc({ handoverTcEnTitle: s.handoverTcEnTitle, handoverTcEnBody: s.handoverTcEnBody, handoverTcArTitle: s.handoverTcArTitle, handoverTcArBody: s.handoverTcArBody, handoverTcCheckboxes: s.handoverTcCheckboxes });
            if (s.handoverTcCheckboxes) {
                try { setTcBoxes(JSON.parse(s.handoverTcCheckboxes)); } catch {}
            }
            setForm(data);

            if (data) {
                // Form exists — load saved values, fall back to system data
                setF({
                    serialNumber: data.serialNumber || data.fleet?.carNumber || '',
                    faCode: data.faCode || data.fleet?.assignedUser?.accreditationNumber || '',
                    handoverDate: data.handoverDate || today,
                    approvedReturnDate: data.approvedReturnDate || '',
                    handoverLocation: data.handoverLocation || data.fleet?.stadium?.code || '',
                    receiverLicenseNo: data.receiverLicenseNo || '',
                    handoverBy: data.handoverBy || adminName || '',
                    handedOverTo: data.handedOverTo || data.fleet?.assignedUser?.name || '',
                    handoverByContact: data.handoverByContact || adminPhone || '',
                    receiverContact: data.receiverContact || data.fleet?.assignedUser?.phone || '',
                    issuesNotes: data.issuesNotes || '',
                    finalName: data.finalName || (mode === 'user' ? (currentUserName || '') : ''),
                    finalDate: data.finalDate || today,
                });
                if (data.cartTypeData) {
                    try { setCartType(JSON.parse(data.cartTypeData)); } catch {}
                } else if (data.fleet?.carType) {
                    setCartType(prev => ({ ...prev, ...cartTypeFromString(data.fleet!.carType) }));
                }
                if (data.conditionData) try { setCondition(JSON.parse(data.conditionData)); } catch {}
                if (data.additionalDrivers) try { const d = JSON.parse(data.additionalDrivers); setDrivers(d.length >= 3 ? d : [...d, ...Array(3-d.length).fill({ name: '', contact: '', entity: '', licenseNo: '' })]); } catch {}
                // Load checked state — tcData (dynamic) takes priority, fall back to tc1/tc2/tc3
                if (data.tcData) {
                    try { setTcChecked(JSON.parse(data.tcData)); } catch {}
                } else {
                    setTcChecked({ tc1: !!data.tc1, tc2: !!data.tc2, tc3: !!data.tc3 });
                }
                if (data.adminSignatureData) setAdminSig(data.adminSignatureData);
                if (data.userSignatureData) setUserSig(data.userSignatureData);
                if (data.finalSignatureData) setFinalSig(data.finalSignatureData);
            } else if (mode === 'admin') {
                // No form yet — auto-fill everything from system data
                const pf = preloadedForm;
                const fleet = pf?.fleet;
                setF(prev => ({
                    ...prev,
                    serialNumber: fleet?.carNumber || pf?.serialNumber || '',
                    faCode: fleet?.assignedUser?.accreditationNumber || '',
                    handoverDate: today,
                    handoverLocation: fleet?.stadium?.code || '',
                    handoverBy: adminName || '',
                    handedOverTo: fleet?.assignedUser?.name || '',
                    handoverByContact: adminPhone || '',
                    receiverContact: fleet?.assignedUser?.phone || '',
                }));
                if (fleet?.carType) {
                    setCartType(prev => ({ ...prev, ...cartTypeFromString(fleet.carType) }));
                }
            }
        } catch {
            toast.error('Failed to load handover form');
        } finally {
            setLoading(false);
        }
    }, [fleetId, mode, today, adminName, adminPhone]);

    useEffect(() => { if (open) loadForm(); }, [open]);

    const allTcChecked = tcBoxes.every(cb => !!tcChecked[cb.id]);

    const handleAdminSubmit = async () => {
        if (!adminSig) { toast.error('Admin signature is required'); return; }
        setSubmitting(true);
        try {
            await handoverApi.createHandoverForm({
                fleetId,
                ...f,
                cartTypeData: JSON.stringify(cartType),
                conditionData: JSON.stringify(condition),
                additionalDrivers: JSON.stringify(drivers),
                tc1: !!tcChecked['tc1'], tc2: !!tcChecked['tc2'], tc3: !!tcChecked['tc3'],
                tcData: JSON.stringify(tcChecked),
                adminSignatureData: adminSig,
                finalSignatureData: finalSig,
            });
            toast.success('Handover form saved and signed. Waiting for user signature.');
            onComplete?.();
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Failed to save form');
        } finally {
            setSubmitting(false);
        }
    };

    const handleUserSubmit = async () => {
        if (!allTcChecked) { toast.error('Please confirm all Terms & Conditions checkboxes'); return; }
        if (!userSig) { toast.error('Your signature is required'); return; }
        setSubmitting(true);
        try {
            await handoverApi.userSignHandoverForm({
                fleetId,
                userSignatureData: userSig,
                tc1: !!tcChecked['tc1'], tc2: !!tcChecked['tc2'], tc3: !!tcChecked['tc3'],
                tcData: JSON.stringify(tcChecked),
                finalName: f.finalName,
                finalDate: f.finalDate,
                finalSignatureData: finalSig || userSig,
            });
            toast.success('Handover form signed! Your cart is now active.');
            onComplete?.();
            onClose();
        } catch (err: any) {
            toast.error(err.response?.data?.error || 'Signing failed');
        } finally {
            setSubmitting(false);
        }
    };

    const handlePrint = () => window.print();

    const setDriver = (i: number, field: keyof AdditionalDriver, val: string) => {
        setDrivers(prev => { const d = [...prev]; d[i] = { ...d[i], [field]: val }; return d; });
    };

    const isAdminReadonly = mode !== 'admin';
    const isComplete = form?.status === 'COMPLETE';

    return (
        <Dialog open={open} onOpenChange={o => { if (!o && !submitting) onClose(); }}>
            <DialogContent className="max-w-4xl w-full max-h-[95vh] overflow-y-auto p-0 gap-0 print:max-w-full print:max-h-none print:overflow-visible">

                {/* ── Print Styles ── */}
                <style>{`
                    @media print {
                        body > *:not(.print-form-root) { display: none !important; }
                        .print-form-root { display: block !important; }
                        .no-print { display: none !important; }
                    }
                `}</style>

                <div className="print-form-root">
                    {/* ── Header ── */}
                    <div className="bg-red-900 text-white p-4 flex items-center gap-4">
                        {/* Logo — left side */}
                        <div className="flex flex-col items-center min-w-[80px]">
                            {logoUrl ? (
                                <img src={logoUrl} alt="Organization Logo" className="h-14 w-auto object-contain bg-white rounded p-1" />
                            ) : (
                                <div className="h-14 w-14 rounded border border-white/30 flex items-center justify-center text-white/40 text-[8px] text-center leading-tight px-1">
                                    <span>شعار اللجنة<br/>المحلية</span>
                                </div>
                            )}
                            <span className="text-[8px] text-white/60 mt-0.5 text-center leading-tight">
                                شعار اللجنة المحلية المنظمة<br/>Local Organizing Committee
                            </span>
                        </div>

                        {/* Title — center */}
                        <div className="flex-1 text-center">
                            <div className="text-sm font-semibold" dir="rtl">نموذج تسليم واستلام عربة جولف</div>
                            <div className="text-xl font-bold uppercase tracking-wider">Golf Cart Handover &amp; Return Form</div>
                        </div>

                        {/* Close button — right */}
                        <button type="button" className="no-print text-white/70 hover:text-white self-start" onClick={onClose}><X className="w-5 h-5" /></button>
                    </div>

                    {/* Status bar */}
                    <div className="bg-zinc-800 text-white px-4 py-2 flex items-center justify-between gap-3 no-print">
                        <div className="flex items-center gap-3">
                            {isComplete
                                ? <Badge className="bg-green-600 text-white">Fully Signed</Badge>
                                : form?.status === 'ADMIN_SIGNED'
                                ? <Badge className="bg-amber-500 text-white">Awaiting User Signature</Badge>
                                : <Badge className="bg-slate-500 text-white">Pending Admin Signature</Badge>
                            }
                            {form?.adminSignedAt && <span className="text-xs text-zinc-400">Admin signed: {new Date(form.adminSignedAt).toLocaleDateString()}</span>}
                            {form?.userSignedAt && <span className="text-xs text-zinc-400">User signed: {new Date(form.userSignedAt).toLocaleDateString()}</span>}
                        </div>
                        {isComplete && <Button variant="secondary" size="sm" className="no-print" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" /> Save PDF</Button>}
                    </div>

                    {loading ? (
                        <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-muted-foreground" /></div>
                    ) : (
                        <div className="bg-white text-sm text-gray-900">

                            {/* Serial + FA Code bars */}
                            <div className="bg-zinc-800 text-white px-4 py-2 flex items-center gap-4">
                                <span className="text-xs font-bold uppercase">Golf Cart Serial Number:</span>
                                <input className="bg-white/10 border border-white/30 text-white rounded px-3 py-1 text-sm flex-1 max-w-xs placeholder:text-white/40"
                                    placeholder="Serial number..." value={f.serialNumber} readOnly={isAdminReadonly}
                                    onChange={e => setF(p => ({ ...p, serialNumber: e.target.value }))} />
                            </div>
                            <div className="bg-zinc-700 text-white px-4 py-2 flex items-center gap-4">
                                <span className="text-xs font-bold uppercase">FA Code:</span>
                                <input className="bg-white/10 border border-white/30 text-white rounded px-3 py-1 text-sm flex-1 max-w-xs placeholder:text-white/40"
                                    placeholder="FA code..." value={f.faCode} readOnly={isAdminReadonly}
                                    onChange={e => setF(p => ({ ...p, faCode: e.target.value }))} />
                            </div>

                            {/* ── Section 1: Handover Details ── */}
                            <SectionHeader title="Handover Details" ar="تفاصيل التسليم" />
                            <div className="grid grid-cols-2 divide-x border-b">
                                <FormField label="Handover Date" ar="تاريخ التسليم">
                                    <input type="date" value={f.handoverDate} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, handoverDate: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Approved Return Date" ar="تاريخ الإرجاع المعتمد">
                                    <input type="date" value={f.approvedReturnDate} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, approvedReturnDate: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Handover At (Site Location)" ar="تم التسليم في">
                                    <input type="text" value={f.handoverLocation} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, handoverLocation: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Receiver Driver License No." ar="رقم رخصة قيادة المستلم">
                                    <input type="text" value={f.receiverLicenseNo} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, receiverLicenseNo: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Handover By (Venue Logistics Rep)" ar="تم التسليم بواسطة">
                                    <input type="text" value={f.handoverBy} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, handoverBy: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Handed Over To (Name, Project/Function)" ar="تم التسليم إلى">
                                    <input type="text" value={f.handedOverTo} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, handedOverTo: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Contact Number (Logistics Rep)" ar="رقم التواصل">
                                    <input type="text" value={f.handoverByContact} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, handoverByContact: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>
                                <FormField label="Contact Number (Receiver)" ar="رقم التواصل">
                                    <input type="text" value={f.receiverContact} readOnly={isAdminReadonly}
                                        onChange={e => setF(p => ({ ...p, receiverContact: e.target.value }))} className="w-full px-3 py-2 text-sm outline-none" />
                                </FormField>

                                {/* Signatures row */}
                                <div className="p-3 border-r border-b">
                                    <SignatureCanvas
                                        label="Signature — Venue Logistics Rep / التوقيع — الممثل اللوجستي"
                                        value={adminSig}
                                        onChange={setAdminSig}
                                        disabled={isAdminReadonly}
                                    />
                                    {form?.adminSignedByUser && <p className="text-[10px] text-muted-foreground mt-1">Signed by: {form.adminSignedByUser.name}</p>}
                                </div>
                                <div className="p-3 border-b">
                                    <SignatureCanvas
                                        label="Signature — Receiver / التوقيع — المستلم"
                                        value={userSig}
                                        onChange={setUserSig}
                                        disabled={mode === 'admin' || isReadonly || form?.status !== 'ADMIN_SIGNED'}
                                    />
                                    {form?.userSignedByUser && <p className="text-[10px] text-muted-foreground mt-1">Signed by: {form.userSignedByUser.name}</p>}
                                </div>
                            </div>

                            {/* ── Section 2: Golf Cart Information ── */}
                            <SectionHeader title="Golf Cart Information" ar="معلومات عربة الجولف" />
                            <div className="border-b divide-y">
                                <TypeRow label="Type of Golf Cart" ar="نوع عربة الجولف">
                                    {/* Auto-filled from system — read-only display */}
                                    {(['cargo','fourSeat','sixSeat','access'] as const).map((k, i) => (
                                        <label key={k} className="flex items-center gap-1.5">
                                            <input type="checkbox" checked={cartType[k]} disabled
                                                readOnly
                                                className="w-4 h-4 accent-red-800 cursor-default"
                                            />
                                            <span className={cartType[k] ? 'font-semibold text-red-900' : 'text-muted-foreground'}>
                                                {['CARGO','4-SEATER','6-SEATER','ACCESSIBILITY'][i]}
                                            </span>
                                        </label>
                                    ))}
                                </TypeRow>
                                <TypeRow label="Confirm Driver is Over 18 Years Old" ar="تأكيد أن السائق يبلغ أكثر من 18 عاماً">
                                    {['yes','no'].map(v => (
                                        <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" name="over18" value={v} checked={cartType.over18 === v} disabled={isAdminReadonly}
                                                onChange={() => setCartType(p => ({ ...p, over18: v }))} className="w-4 h-4 accent-red-800" />
                                            <span className="uppercase">{v}</span>
                                        </label>
                                    ))}
                                </TypeRow>
                                <TypeRow label="Driver's License Type" ar="نوع رخصة القيادة">
                                    {[['qatari','Qatari License'],['intl','International License']].map(([v, label]) => (
                                        <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" name="licType" value={v} checked={cartType.licenseType === v} disabled={isAdminReadonly}
                                                onChange={() => setCartType(p => ({ ...p, licenseType: v }))} className="w-4 h-4 accent-red-800" />
                                            <span>{label}</span>
                                        </label>
                                    ))}
                                </TypeRow>
                                <TypeRow label="Entity the Driver is Linked To" ar="الجهة التابع لها السائق">
                                    {[['loc','LOC'],['qsl','QSL / QFA'],['ssoc','SSOC']].map(([v, label]) => (
                                        <label key={v} className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="radio" name="entity" value={v} checked={cartType.entity === v} disabled={isAdminReadonly}
                                                onChange={() => setCartType(p => ({ ...p, entity: v }))} className="w-4 h-4 accent-red-800" />
                                            <span>{label}</span>
                                        </label>
                                    ))}
                                </TypeRow>
                            </div>

                            {/* ── Section 3: Condition Inspection ── */}
                            <SectionHeader title="Vehicle Condition Inspection" ar="فحص حالة المركبة" />
                            <div className="p-3 border-b">
                                <ConditionTable value={condition} onChange={setCondition} disabled={isAdminReadonly} />
                            </div>

                            {/* ── Section 4: Additional Drivers ── */}
                            <SectionHeader title="Additional Authorized Drivers" ar="السائقون الإضافيون المصرح لهم" />
                            <div className="border-b">
                                <div className="p-2 text-xs bg-muted/30 font-medium">Additional Drivers Authorized by FA to Drive the Golf Cart</div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-red-900 text-white">
                                                <th className="p-2 text-left font-semibold w-28"></th>
                                                <th className="p-2 text-center font-semibold border-l border-white/20">Driver 1</th>
                                                <th className="p-2 text-center font-semibold border-l border-white/20">Driver 2</th>
                                                <th className="p-2 text-center font-semibold border-l border-white/20">Driver 3</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {(['Name','Contact No.','Entity','Driver Licence No.'] as const).map((field, fi) => (
                                                <tr key={field} className={fi % 2 === 0 ? 'bg-muted/10' : ''}>
                                                    <td className="p-2 font-semibold bg-muted/30 border-r text-[11px]">{field}</td>
                                                    {drivers.map((d, di) => (
                                                        <td key={di} className="border-l border-b">
                                                            <input
                                                                className="w-full px-2 py-1.5 outline-none bg-transparent text-xs"
                                                                value={d[(['name','contact','entity','licenseNo'] as (keyof AdditionalDriver)[])[fi]]}
                                                                readOnly={isAdminReadonly}
                                                                onChange={e => setDriver(di, (['name','contact','entity','licenseNo'] as (keyof AdditionalDriver)[])[fi], e.target.value)}
                                                            />
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>

                            {/* ── Section 5: Issues ── */}
                            <SectionHeader title="Summary of Issues / Incidents" ar="ملخص أي مشاكل / حوادث" />
                            <div className="border-b">
                                <div className="px-3 py-1 text-[10px] text-red-700 bg-red-50 border-b">
                                    NOTE: IN THE CASE OF AN INCIDENT, KINDLY INFORM THE VENUE LOGISTICS TEAM
                                </div>
                                <textarea
                                    className="w-full px-3 py-2 text-sm outline-none resize-none min-h-[70px]"
                                    placeholder="Describe any pre-existing issues..."
                                    value={f.issuesNotes}
                                    readOnly={isAdminReadonly}
                                    onChange={e => setF(p => ({ ...p, issuesNotes: e.target.value }))}
                                />
                            </div>

                            {/* ── Section 7: Terms & Conditions ── */}
                            <SectionHeader title="Terms & Conditions" ar="الشروط والأحكام" />
                            <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x border-b">
                                {/* English */}
                                <div className="p-4 text-xs leading-relaxed space-y-2">
                                    <h3 className="font-bold text-red-900 uppercase text-sm">
                                        {tc.handoverTcEnTitle || 'USE OF GOLF CART — TERMS AND CONDITIONS'}
                                    </h3>
                                    {tc.handoverTcEnBody ? (
                                        <RichContent html={tc.handoverTcEnBody} dir="ltr" />
                                    ) : (
                                        <>
                                            <p className="font-semibold">Golf Cart Users Responsibilities</p>
                                            <p>By operating a Golf Cart, I hereby confirm that I am eighteen (18) years of age or older; have a valid driving license in accordance with applicable laws in Qatar; am a staff member or designated contractor assigned to act on behalf of LOC; agree to operate the Golf Cart in accordance with LOC's H&S instructions; agree to not engage in speeding (max 15 km/h), joy riding, or unreasonable use; will limit occupants to the number of seats; will not drive on public roads; will keep keys with me; acknowledge that costs related to damage will be borne by my Function Area; and will operate in accordance with Law no. (19) of 2007 Regarding the Traffic Law.</p>
                                            <p className="font-semibold">Waiver, Liability and Indemnity</p>
                                            <p>By operating a Golf Cart, to the fullest extent permitted by law, I unconditionally agree to indemnify and hold harmless LOC from any liability, costs, expenses, demands, loss and/or damage.</p>
                                        </>
                                    )}
                                    {/* Dynamic confirmation checkboxes — English labels */}
                                    <div className="space-y-2 mt-3">
                                        {tcBoxes.map(cb => (
                                            <label key={cb.id} className="flex items-start gap-2 cursor-pointer">
                                                <Checkbox
                                                    checked={!!tcChecked[cb.id]}
                                                    onCheckedChange={v => setTcChecked(p => ({ ...p, [cb.id]: !!v }))}
                                                    disabled={mode === 'admin' || isReadonly}
                                                    className="mt-0.5"
                                                />
                                                <span>{cb.en}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                {/* Arabic */}
                                <div className="p-4 text-xs leading-relaxed space-y-2" dir="rtl">
                                    <h3 className="font-bold text-red-900 text-sm">
                                        {tc.handoverTcArTitle || 'شروط وأحكام استخدام عربة الجولف'}
                                    </h3>
                                    {tc.handoverTcArBody ? (
                                        <RichContent html={tc.handoverTcArBody} dir="rtl" />
                                    ) : (
                                        <>
                                            <p className="font-semibold">مسؤوليات مستخدمي عربة الجولف</p>
                                            <p>من خلال تشغيل عربة الجولف، أقر بأنني أبلغ من العمر 18 عاماً أو أكثر؛ ولدي رخصة قيادة سارية؛ وأوافق على تشغيل العربة وفقاً لتعليمات الصحة والسلامة؛ وعدم تجاوز السرعة (الحد الأقصى 15 كم/ساعة)؛ وتحديد عدد الركاب بعدد المقاعد؛ وعدم القيادة على الطرق العامة؛ والإقرار بتحمّل FA تكاليف الأضرار.</p>
                                        </>
                                    )}
                                    {/* Dynamic confirmation checkboxes — Arabic labels */}
                                    <div className="space-y-2 mt-3" dir="rtl">
                                        {tcBoxes.map(cb => (
                                            <label key={cb.id} className="flex items-start gap-2 cursor-pointer">
                                                <Checkbox
                                                    checked={!!tcChecked[cb.id]}
                                                    onCheckedChange={v => setTcChecked(p => ({ ...p, [cb.id]: !!v }))}
                                                    disabled={mode === 'admin' || isReadonly}
                                                    className="mt-0.5"
                                                />
                                                <span>{cb.ar}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Final Signature */}
                            <div className="grid grid-cols-3 gap-4 p-4 bg-muted/20 border-b">
                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold uppercase text-muted-foreground">Name / الاسم</label>
                                        <Input value={f.finalName} readOnly={mode === 'admin' || isReadonly}
                                            onChange={e => setF(p => ({ ...p, finalName: e.target.value }))}
                                            className="mt-1 text-sm" />
                                    </div>
                                    <div>
                                        <label className="text-xs font-bold uppercase text-muted-foreground">Date / التاريخ</label>
                                        <Input type="date" value={f.finalDate} readOnly={mode === 'admin' || isReadonly}
                                            onChange={e => setF(p => ({ ...p, finalDate: e.target.value }))}
                                            className="mt-1 text-sm" />
                                    </div>
                                </div>
                                <div className="col-span-2">
                                    <SignatureCanvas
                                        label="Signature / التوقيع"
                                        value={mode === 'admin' ? adminSig : (finalSig || userSig)}
                                        onChange={mode === 'admin' ? setAdminSig : (v => { setFinalSig(v); setUserSig(v); })}
                                        disabled={isReadonly || (mode === 'user' && form?.status !== 'ADMIN_SIGNED')}
                                    />
                                </div>
                            </div>

                            {/* ── Action Buttons ── */}
                            {!isReadonly && (
                                <div className="flex gap-3 p-4 bg-muted/10 border-t no-print">
                                    <Button variant="outline" onClick={onClose} disabled={submitting}>Cancel</Button>
                                    <div className="flex-1" />
                                    {mode === 'admin' && (
                                        <Button className="bg-red-900 hover:bg-red-800 text-white px-8" onClick={handleAdminSubmit} disabled={submitting}>
                                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                            Save & Sign as Admin
                                        </Button>
                                    )}
                                    {mode === 'user' && form?.status === 'ADMIN_SIGNED' && (
                                        <Button className="bg-purple-700 hover:bg-purple-600 text-white px-8" onClick={handleUserSubmit} disabled={submitting}>
                                            {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
                                            I Accept &amp; Sign
                                        </Button>
                                    )}
                                </div>
                            )}
                            {isComplete && (
                                <div className="flex items-center gap-3 p-4 bg-green-50 border-t text-green-800 no-print">
                                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                                    <span className="font-semibold text-sm">Handover complete. Both parties have signed.</span>
                                    <div className="flex-1" />
                                    <Button variant="outline" size="sm" onClick={handlePrint}><Printer className="w-4 h-4 mr-2" /> Print / Save PDF</Button>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}

// ─── Helper sub-components ────────────────────────────────────────────────────

function SectionHeader({ title, ar }: { title: string; ar: string }) {
    return (
        <div className="bg-red-900 text-white px-3 py-1.5 flex items-center justify-between">
            <span className="font-bold text-xs uppercase tracking-wider">{title}</span>
            <span className="text-xs opacity-70 font-medium" dir="rtl">{ar}</span>
        </div>
    );
}

function FormField({ label, ar, children }: { label: string; ar: string; children: React.ReactNode }) {
    return (
        <div className="border-b">
            <div className="px-3 py-1 bg-muted/30">
                <div className="text-[10px] text-muted-foreground" dir="rtl">{ar}</div>
                <div className="text-[11px] font-bold uppercase">{label}</div>
            </div>
            {children}
        </div>
    );
}

function TypeRow({ label, ar, children }: { label: string; ar: string; children: React.ReactNode }) {
    return (
        <div className="flex items-center">
            <div className="w-52 shrink-0 px-3 py-2 bg-muted/30 border-r self-stretch flex flex-col justify-center">
                <div className="text-[10px] text-muted-foreground" dir="rtl">{ar}</div>
                <div className="text-[11px] font-bold uppercase">{label}</div>
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1.5 px-4 py-2 text-sm">
                {children}
            </div>
        </div>
    );
}
