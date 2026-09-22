import type { CameraDevice, Html5Qrcode } from 'html5-qrcode';
import {
    Camera,
    CameraOff,
    Flashlight,
    FlashlightOff,
    RotateCcw,
    ScanLine,
} from 'lucide-react';
import type { FormEvent } from 'react';
import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type ScannerModule = typeof import('html5-qrcode');

type Status =
    | 'loading'
    | 'starting'
    | 'scanning'
    | 'stopped'
    | 'permission_denied'
    | 'unsupported'
    | 'insecure'
    | 'error';

export type QrScannerProps = {
    /** Called with the decoded text. The same code is not emitted again within `dedupeMs`. */
    onScan: (text: string) => void;
    /** Freeze scanning (e.g. while the parent processes a result). The camera stays on. */
    paused?: boolean;
    /** Show the manual code entry fallback (default true). */
    manualEntry?: boolean;
    /** Window in ms during which a repeated identical code is ignored (default 3000). */
    dedupeMs?: number;
    /** Start the camera on mount (default true). */
    autoStart?: boolean;
    className?: string;
};

export const QR_DEDUPE_MS = 3000;

function environmentProblem(): 'insecure' | 'unsupported' | null {
    if (typeof window === 'undefined') {
        return 'unsupported';
    }
    if (!window.isSecureContext) {
        return 'insecure';
    }
    if (
        !navigator.mediaDevices ||
        typeof navigator.mediaDevices.getUserMedia !== 'function'
    ) {
        return 'unsupported';
    }
    return null;
}

/** html5-qrcode rejects with strings such as "Error getting userMedia, error = NotAllowedError: Permission denied". */
function classifyError(error: unknown): Status {
    const text =
        error instanceof Error
            ? `${error.name} ${error.message}`
            : String(error);
    if (
        /NotAllowedError|PermissionDenied|Permission denied|SecurityError/i.test(
            text,
        )
    ) {
        return 'permission_denied';
    }
    if (
        /NotFoundError|DevicesNotFound|OverconstrainedError|Requested device not found/i.test(
            text,
        )
    ) {
        return 'unsupported';
    }
    return 'error';
}

async function safeStop(instance: Html5Qrcode): Promise<void> {
    try {
        if (instance.isScanning) {
            await instance.stop();
        }
    } catch {
        // Already stopped or the stream is gone.
    }
    try {
        instance.clear();
    } catch {
        // The element may already be detached.
    }
}

/**
 * Camera QR scanner with rear camera by default (`facingMode: environment`, works on iOS Safari),
 * camera switch, torch toggle when the track supports it, and a manual-entry fallback.
 * `html5-qrcode` is imported dynamically, so it is not part of any page's initial bundle.
 */
export function QrScanner({
    onScan,
    paused = false,
    manualEntry = true,
    dedupeMs = QR_DEDUPE_MS,
    autoStart = true,
    className,
}: QrScannerProps) {
    const rawId = useId();
    const regionId = `qr-region-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
    const manualId = `${regionId}-manual`;

    const moduleRef = useRef<ScannerModule | null>(null);
    const scannerRef = useRef<Html5Qrcode | null>(null);
    const lifecycle = useRef<Promise<void>>(Promise.resolve());
    const lastScan = useRef<{ text: string; at: number } | null>(null);
    const onScanRef = useRef(onScan);
    const pausedRef = useRef(paused);
    const dedupeRef = useRef(dedupeMs);

    const [running, setRunning] = useState(autoStart);
    const [attempt, setAttempt] = useState(0);
    const [status, setStatus] = useState<Status>(
        autoStart ? 'loading' : 'stopped',
    );
    const [cameras, setCameras] = useState<CameraDevice[]>([]);
    const [cameraId, setCameraId] = useState<string | null>(null);
    const [activeCameraId, setActiveCameraId] = useState<string | null>(null);
    const [torch, setTorch] = useState<{ supported: boolean; on: boolean }>({
        supported: false,
        on: false,
    });
    const [announcement, setAnnouncement] = useState('');
    const [manualCode, setManualCode] = useState('');

    useEffect(() => {
        onScanRef.current = onScan;
        dedupeRef.current = dedupeMs;
    }, [onScan, dedupeMs]);

    // Start / restart the camera. Runs are chained on `lifecycle` so a restart (camera switch,
    // StrictMode double mount) never attaches two scanners to the same element.
    useEffect(() => {
        if (!running) {
            return;
        }
        const problem = environmentProblem();
        if (problem) {
            setStatus(problem);
            return;
        }

        let cancelled = false;
        let instance: Html5Qrcode | null = null;

        const handleDecoded = (text: string) => {
            if (cancelled || pausedRef.current) {
                return;
            }
            const now = Date.now();
            const last = lastScan.current;
            if (
                last &&
                last.text === text &&
                now - last.at < dedupeRef.current
            ) {
                return;
            }
            lastScan.current = { text, at: now };
            setAnnouncement(
                `${t('ui.qr.scanned')} ${new Date(now).toLocaleTimeString()}`,
            );
            onScanRef.current(text);
        };

        const run = async () => {
            if (cancelled) {
                return;
            }
            setStatus('loading');
            try {
                const mod = moduleRef.current ?? (await import('html5-qrcode'));
                moduleRef.current = mod;
                if (cancelled) {
                    return;
                }
                instance = new mod.Html5Qrcode(regionId, {
                    verbose: false,
                    formatsToSupport: [mod.Html5QrcodeSupportedFormats.QR_CODE],
                });
                scannerRef.current = instance;
                setStatus('starting');
                await instance.start(
                    cameraId ?? { facingMode: 'environment' },
                    {
                        fps: 10,
                        aspectRatio: 1,
                        qrbox: (width: number, height: number) => {
                            const size = Math.max(
                                120,
                                Math.floor(Math.min(width, height) * 0.7),
                            );
                            return { width: size, height: size };
                        },
                    },
                    handleDecoded,
                    () => undefined,
                );
                if (cancelled) {
                    return;
                }
                if (pausedRef.current) {
                    instance.pause(true);
                }
                setStatus('scanning');

                try {
                    setActiveCameraId(
                        instance.getRunningTrackSettings().deviceId ?? null,
                    );
                    setTorch({
                        supported: instance
                            .getRunningTrackCameraCapabilities()
                            .torchFeature()
                            .isSupported(),
                        on: false,
                    });
                } catch {
                    setTorch({ supported: false, on: false });
                }
                try {
                    const list = await mod.Html5Qrcode.getCameras();
                    if (!cancelled) {
                        setCameras(list);
                    }
                } catch {
                    // Keep the default camera; the switcher simply stays hidden.
                }
            } catch (error) {
                if (!cancelled) {
                    setStatus(classifyError(error));
                }
            }
        };

        lifecycle.current = lifecycle.current.then(run);

        return () => {
            cancelled = true;
            lifecycle.current = lifecycle.current.then(async () => {
                if (instance) {
                    await safeStop(instance);
                    if (scannerRef.current === instance) {
                        scannerRef.current = null;
                    }
                }
            });
        };
    }, [running, cameraId, attempt, regionId]);

    // Pause/resume without releasing the camera.
    useEffect(() => {
        pausedRef.current = paused;
        const instance = scannerRef.current;
        const mod = moduleRef.current;
        if (!instance || !mod || status !== 'scanning') {
            return;
        }
        try {
            const state = instance.getState();
            if (paused && state === mod.Html5QrcodeScannerState.SCANNING) {
                instance.pause(true);
            } else if (
                !paused &&
                state === mod.Html5QrcodeScannerState.PAUSED
            ) {
                instance.resume();
            }
        } catch {
            // State changed underneath us (camera stopping); nothing to do.
        }
    }, [paused, status]);

    const toggleTorch = async () => {
        const instance = scannerRef.current;
        if (!instance) {
            return;
        }
        try {
            const feature = instance
                .getRunningTrackCameraCapabilities()
                .torchFeature();
            await feature.apply(!torch.on);
            setTorch({ supported: true, on: !torch.on });
        } catch {
            setTorch({ supported: false, on: false });
        }
    };

    const stopCamera = () => {
        setRunning(false);
        setStatus('stopped');
        setTorch({ supported: false, on: false });
    };

    const startCamera = () => {
        setRunning(true);
        setAttempt((value) => value + 1);
    };

    const submitManual = (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const code = manualCode.trim();
        if (code === '') {
            return;
        }
        setManualCode('');
        onScanRef.current(code);
    };

    const busy = status === 'loading' || status === 'starting';
    const failed =
        status === 'permission_denied' ||
        status === 'unsupported' ||
        status === 'insecure' ||
        status === 'error';
    const canRetry = status === 'permission_denied' || status === 'error';
    const selectedCamera = cameraId ?? activeCameraId ?? undefined;

    return (
        <div className={cn('grid gap-4', className)} data-slot="qr-scanner">
            <div
                role="region"
                aria-label={t('ui.qr.region')}
                aria-busy={busy || undefined}
                className="relative mx-auto aspect-square w-full max-w-sm overflow-hidden rounded-xl border bg-neutral-950"
            >
                <div
                    id={regionId}
                    className="size-full [&_video]:size-full! [&_video]:object-cover"
                />

                {busy ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-white/90">
                        <Spinner className="size-6" />
                        <span>
                            {status === 'loading'
                                ? t('ui.qr.loading')
                                : t('ui.qr.starting')}
                        </span>
                    </div>
                ) : null}

                {status === 'scanning' && paused ? (
                    <div className="absolute inset-0 flex items-center justify-center bg-neutral-950/70 text-sm font-medium text-white">
                        {t('ui.qr.paused')}
                    </div>
                ) : null}

                {status === 'stopped' ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white/90">
                        <CameraOff className="size-8" aria-hidden="true" />
                        <Button
                            type="button"
                            variant="secondary"
                            onClick={startCamera}
                        >
                            <Camera className="size-4" aria-hidden="true" />
                            {t('ui.qr.start')}
                        </Button>
                    </div>
                ) : null}

                {failed ? (
                    <div
                        role="alert"
                        className="absolute inset-0 flex flex-col items-center justify-center gap-3 p-6 text-center text-sm text-white"
                    >
                        <CameraOff
                            className="size-8 text-white/80"
                            aria-hidden="true"
                        />
                        <p className="max-w-xs">{t(`ui.qr.${status}`)}</p>
                        {canRetry ? (
                            <Button
                                type="button"
                                variant="secondary"
                                size="sm"
                                onClick={startCamera}
                            >
                                <RotateCcw
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('ui.qr.retry')}
                            </Button>
                        ) : null}
                    </div>
                ) : null}
            </div>

            {status === 'scanning' ? (
                <div className="mx-auto flex w-full max-w-sm flex-wrap items-center justify-center gap-2">
                    <p className="flex w-full items-center justify-center gap-1.5 text-sm text-muted-foreground">
                        <ScanLine className="size-4" aria-hidden="true" />
                        {t('ui.qr.viewfinder')}
                    </p>
                    {cameras.length > 1 ? (
                        <Select
                            value={selectedCamera ?? ''}
                            onValueChange={(value) => setCameraId(value)}
                        >
                            <SelectTrigger
                                size="sm"
                                className="w-full min-w-0 sm:w-56"
                                aria-label={t('ui.qr.camera')}
                            >
                                <SelectValue placeholder={t('ui.qr.camera')} />
                            </SelectTrigger>
                            <SelectContent>
                                {cameras.map((camera, index) => (
                                    <SelectItem
                                        key={camera.id}
                                        value={camera.id}
                                    >
                                        {camera.label ||
                                            t('ui.qr.camera_n', {
                                                number: index + 1,
                                            })}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    ) : null}
                    {torch.supported ? (
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void toggleTorch()}
                            aria-pressed={torch.on}
                        >
                            {torch.on ? (
                                <FlashlightOff
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            ) : (
                                <Flashlight
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            )}
                            {torch.on
                                ? t('ui.qr.torch_off')
                                : t('ui.qr.torch_on')}
                        </Button>
                    ) : null}
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={stopCamera}
                    >
                        <CameraOff className="size-4" aria-hidden="true" />
                        {t('ui.qr.stop')}
                    </Button>
                </div>
            ) : null}

            <p className="sr-only" aria-live="polite">
                {announcement}
            </p>

            {manualEntry ? (
                <form
                    onSubmit={submitManual}
                    className="mx-auto grid w-full max-w-sm gap-2"
                >
                    <Label htmlFor={manualId}>{t('ui.qr.manual_label')}</Label>
                    <div className="flex gap-2">
                        <Input
                            id={manualId}
                            value={manualCode}
                            onChange={(event) =>
                                setManualCode(event.target.value)
                            }
                            placeholder={t('ui.qr.manual_placeholder')}
                            dir="ltr"
                            className="code"
                            autoComplete="off"
                            autoCapitalize="characters"
                            spellCheck={false}
                            maxLength={512}
                        />
                        <Button
                            type="submit"
                            disabled={manualCode.trim() === ''}
                        >
                            {t('ui.qr.manual_submit')}
                        </Button>
                    </div>
                </form>
            ) : null}
        </div>
    );
}
