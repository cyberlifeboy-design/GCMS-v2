import { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Camera } from 'lucide-react';
import { toast } from 'sonner';

interface Props {
    onCapture: (file: File) => void;
    disabled?: boolean;
    label?: string;
}

// Opens the device camera (rear camera preferred on phones/tablets, whatever's
// available on desktop) in a live preview and snaps a still into a File — an
// alternative to picking an existing photo from the file input next to it.
export function CameraCaptureButton({ onCapture, disabled, label = 'Take Photo' }: Props) {
    const [open, setOpen] = useState(false);
    const [ready, setReady] = useState(false);
    const videoRef = useRef<HTMLVideoElement>(null);
    const streamRef = useRef<MediaStream | null>(null);

    const stopStream = () => {
        streamRef.current?.getTracks().forEach(t => t.stop());
        streamRef.current = null;
        setReady(false);
    };

    useEffect(() => {
        if (!open) { stopStream(); return; }
        if (!navigator.mediaDevices?.getUserMedia) {
            toast.error('This browser/device does not support camera capture');
            setOpen(false);
            return;
        }
        let cancelled = false;
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false })
            .catch(() => navigator.mediaDevices.getUserMedia({ video: true, audio: false }))
            .then(stream => {
                if (cancelled) { stream.getTracks().forEach(t => t.stop()); return; }
                streamRef.current = stream;
                if (videoRef.current) {
                    videoRef.current.srcObject = stream;
                    videoRef.current.play().catch(() => {});
                }
                setReady(true);
            })
            .catch(() => {
                toast.error('Could not access the camera — check browser/device permissions');
                setOpen(false);
            });
        return () => { cancelled = true; stopStream(); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open]);

    const capture = () => {
        const video = videoRef.current;
        if (!video || !video.videoWidth) return;
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(video, 0, 0);
        canvas.toBlob(blob => {
            if (!blob) return;
            onCapture(new File([blob], `photo_${Date.now()}.jpg`, { type: 'image/jpeg' }));
            setOpen(false);
        }, 'image/jpeg', 0.9);
    };

    return (
        <>
            <Button type="button" variant="outline" size="sm" disabled={disabled} onClick={() => setOpen(true)}>
                <Camera className="w-4 h-4 mr-2" /> {label}
            </Button>
            <Dialog open={open} onOpenChange={o => setOpen(o)}>
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2"><Camera className="w-4 h-4" /> Take Photo</DialogTitle>
                    </DialogHeader>
                    <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center">
                        <video ref={videoRef} muted playsInline className="w-full h-full object-contain" />
                        {!ready && <span className="absolute text-white text-xs">Starting camera…</span>}
                    </div>
                    <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                        <Button type="button" onClick={capture} disabled={!ready}>Capture</Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
