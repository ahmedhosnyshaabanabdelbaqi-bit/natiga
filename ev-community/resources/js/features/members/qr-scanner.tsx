// integration: replace with @/components/shared/qr-scanner once the UI kit ships one.
import { Camera, CameraOff } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type ScannerInstance = {
    isScanning: boolean;
    stop: () => Promise<void>;
    clear: () => void;
};

type Props = {
    /** Called once per decoded code; the camera stops after a successful read. */
    onScan: (text: string) => void;
    disabled?: boolean;
    className?: string;
};

/**
 * Camera QR reader (html5-qrcode, loaded on demand so it never weighs on other pages).
 * Falls back to an explanatory message when no camera is available or permission is denied;
 * the caller always offers manual token entry next to it.
 */
export function QrScanner({ onScan, disabled = false, className }: Props) {
    const regionId = `qr-region-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const scannerRef = useRef<ScannerInstance | null>(null);
    const onScanRef = useRef(onScan);
    const [active, setActive] = useState(false);
    const [starting, setStarting] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        onScanRef.current = onScan;
    }, [onScan]);

    const stop = async () => {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        setActive(false);
        if (scanner?.isScanning) {
            try {
                await scanner.stop();
            } catch {
                // Already stopped (e.g. the tab lost the camera); nothing else to release.
            }
        }
        scanner?.clear();
    };

    const start = async () => {
        setError(null);
        if (
            typeof navigator === 'undefined' ||
            !navigator.mediaDevices?.getUserMedia
        ) {
            setError(t('members.admin.scan.camera_unavailable'));
            return;
        }
        setStarting(true);
        try {
            const { Html5Qrcode, Html5QrcodeSupportedFormats } =
                await import('html5-qrcode');
            const scanner = new Html5Qrcode(regionId, {
                formatsToSupport: [Html5QrcodeSupportedFormats.QR_CODE],
                verbose: false,
                useBarCodeDetectorIfSupported: true,
            });
            scannerRef.current = scanner;
            await scanner.start(
                { facingMode: 'environment' },
                {
                    fps: 10,
                    qrbox: (width: number, height: number) => ({
                        width: Math.floor(Math.min(width, height) * 0.7),
                        height: Math.floor(Math.min(width, height) * 0.7),
                    }),
                },
                (decoded: string) => {
                    void stop();
                    onScanRef.current(decoded);
                },
                () => {
                    // Frames without a readable code are expected while aiming; ignore them.
                },
            );
            setActive(true);
        } catch {
            scannerRef.current = null;
            setError(t('members.admin.scan.camera_unavailable'));
        } finally {
            setStarting(false);
        }
    };

    useEffect(
        () => () => {
            const scanner = scannerRef.current;
            scannerRef.current = null;
            if (scanner?.isScanning) {
                void scanner
                    .stop()
                    .then(() => scanner.clear())
                    .catch(() => undefined);
            }
        },
        [],
    );

    return (
        <div className={cn('grid gap-3', className)}>
            <div
                id={regionId}
                aria-label={t('members.admin.scan.camera_hint')}
                className={cn(
                    'overflow-hidden rounded-xl border bg-muted/40',
                    active ? 'min-h-64' : 'hidden',
                )}
            />
            {!active ? (
                <p className="text-sm text-muted-foreground">
                    {t('members.admin.scan.camera_hint')}
                </p>
            ) : null}
            {error ? <InlineAlert tone="warning">{error}</InlineAlert> : null}
            <div>
                {active ? (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void stop()}
                    >
                        <CameraOff className="size-4" aria-hidden="true" />
                        {t('members.admin.scan.stop_camera')}
                    </Button>
                ) : (
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => void start()}
                        disabled={disabled || starting}
                    >
                        <Camera className="size-4" aria-hidden="true" />
                        {t('members.admin.scan.start_camera')}
                    </Button>
                )}
            </div>
        </div>
    );
}
