import { Form } from '@inertiajs/react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { Check, Copy, ScanLine } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AlertError from '@/components/alert-error';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Spinner } from '@/components/ui/spinner';
import { useAppearance } from '@/hooks/use-appearance';
import { useClipboard } from '@/hooks/use-clipboard';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import { t } from '@/lib/i18n';
import { confirm } from '@/routes/two-factor';

function GridScanIcon() {
    return (
        <div className="mb-3 rounded-full border border-border bg-card p-0.5 shadow-sm" aria-hidden="true">
            <div className="relative overflow-hidden rounded-full border border-border bg-muted p-2.5">
                <div className="absolute inset-0 grid grid-cols-5 opacity-50">
                    {Array.from({ length: 5 }, (_, i) => (
                        <div key={`col-${i + 1}`} className="border-e border-border last:border-e-0" />
                    ))}
                </div>
                <div className="absolute inset-0 grid grid-rows-5 opacity-50">
                    {Array.from({ length: 5 }, (_, i) => (
                        <div key={`row-${i + 1}`} className="border-b border-border last:border-b-0" />
                    ))}
                </div>
                <ScanLine className="relative z-20 size-6 text-foreground" />
            </div>
        </div>
    );
}

function TwoFactorSetupStep({
    qrCodeSvg,
    manualSetupKey,
    buttonText,
    onNextStep,
    errors,
}: {
    qrCodeSvg: string | null;
    manualSetupKey: string | null;
    buttonText: string;
    onNextStep: () => void;
    errors: string[];
}) {
    const { resolvedAppearance } = useAppearance();
    const [copiedText, copy] = useClipboard();
    const copied = manualSetupKey !== null && copiedText === manualSetupKey;
    const IconComponent = copied ? Check : Copy;

    if (errors.length > 0) {
        return <AlertError errors={errors} />;
    }

    return (
        <>
            <div className="mx-auto flex max-w-md overflow-hidden">
                <div className="mx-auto aspect-square w-64 rounded-lg border border-border">
                    <div className="z-10 flex h-full w-full items-center justify-center p-5">
                        {qrCodeSvg ? (
                            <div
                                role="img"
                                aria-label={t('settings.two_factor.modal.qr_alt')}
                                className="aspect-square w-full rounded-lg bg-white p-2 [&_svg]:size-full"
                                // Fortify renders this SVG server-side from the user's own secret; it is not user-supplied markup.
                                dangerouslySetInnerHTML={{ __html: qrCodeSvg }}
                                style={{ filter: resolvedAppearance === 'dark' ? 'invert(1) brightness(1.5)' : undefined }}
                            />
                        ) : (
                            <Spinner />
                        )}
                    </div>
                </div>
            </div>

            <div className="flex w-full gap-5">
                <Button type="button" className="w-full" onClick={onNextStep}>
                    {buttonText}
                </Button>
            </div>

            <div className="relative flex w-full items-center justify-center">
                <div className="absolute inset-0 top-1/2 h-px w-full bg-border" />
                <span className="relative bg-card px-2 py-1 text-sm text-muted-foreground">{t('settings.two_factor.modal.or_manual')}</span>
            </div>

            <div className="flex w-full gap-2">
                <div className="flex w-full items-stretch overflow-hidden rounded-xl border border-border">
                    {!manualSetupKey ? (
                        <div className="flex h-full w-full items-center justify-center bg-muted p-3">
                            <Spinner />
                        </div>
                    ) : (
                        <>
                            <input
                                type="text"
                                readOnly
                                value={manualSetupKey}
                                aria-label={t('settings.two_factor.modal.setup_key')}
                                dir="ltr"
                                className="code h-full w-full bg-background p-3 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
                                onFocus={(event) => event.currentTarget.select()}
                            />
                            <button
                                type="button"
                                onClick={() => void copy(manualSetupKey)}
                                aria-label={copied ? t('core.actions.copied') : t('settings.two_factor.modal.copy_key')}
                                title={t('settings.two_factor.modal.copy_key')}
                                className="border-s border-border px-3 outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-inset"
                            >
                                <IconComponent className="w-4" aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            </div>
        </>
    );
}

function TwoFactorVerificationStep({ onClose, onBack }: { onClose: () => void; onBack: () => void }) {
    const [code, setCode] = useState<string>('');
    const pinInputContainerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const timer = window.setTimeout(() => {
            pinInputContainerRef.current?.querySelector('input')?.focus();
        }, 0);
        return () => window.clearTimeout(timer);
    }, []);

    return (
        <Form {...confirm.form()} onSuccess={() => onClose()} resetOnError resetOnSuccess>
            {({ processing, errors }: { processing: boolean; errors?: { confirmTwoFactorAuthentication?: { code?: string } } }) => (
                <div ref={pinInputContainerRef} className="relative w-full space-y-3">
                    <div className="flex w-full flex-col items-center space-y-3 py-2">
                        <InputOTP
                            id="otp"
                            name="code"
                            maxLength={OTP_MAX_LENGTH}
                            onChange={setCode}
                            disabled={processing}
                            pattern={REGEXP_ONLY_DIGITS}
                            aria-label={t('settings.two_factor.modal.code')}
                            autoComplete="one-time-code"
                            autoFocus
                        >
                            <InputOTPGroup>
                                {Array.from({ length: OTP_MAX_LENGTH }, (_, index) => (
                                    <InputOTPSlot key={index} index={index} />
                                ))}
                            </InputOTPGroup>
                        </InputOTP>
                        <InputError message={errors?.confirmTwoFactorAuthentication?.code} />
                    </div>

                    <div className="flex w-full gap-5">
                        <Button type="button" variant="outline" className="flex-1" onClick={onBack} disabled={processing}>
                            {t('settings.two_factor.modal.back')}
                        </Button>
                        <Button type="submit" className="flex-1" disabled={processing || code.length < OTP_MAX_LENGTH}>
                            {processing ? <Spinner /> : null}
                            {t('settings.two_factor.modal.confirm')}
                        </Button>
                    </div>
                </div>
            )}
        </Form>
    );
}

type Props = {
    isOpen: boolean;
    onClose: () => void;
    requiresConfirmation: boolean;
    twoFactorEnabled: boolean;
    qrCodeSvg: string | null;
    manualSetupKey: string | null;
    clearSetupData: () => void;
    fetchSetupData: () => Promise<void>;
    errors: string[];
};

export default function TwoFactorSetupModal({ isOpen, onClose, requiresConfirmation, twoFactorEnabled, qrCodeSvg, manualSetupKey, clearSetupData, fetchSetupData, errors }: Props) {
    const [showVerificationStep, setShowVerificationStep] = useState<boolean>(false);

    const modalConfig = useMemo<{ title: string; description: string; buttonText: string }>(() => {
        if (twoFactorEnabled) {
            return {
                title: t('settings.two_factor.modal.enabled_title'),
                description: t('settings.two_factor.modal.enabled_description'),
                buttonText: t('settings.two_factor.modal.close'),
            };
        }

        if (showVerificationStep) {
            return {
                title: t('settings.two_factor.modal.verify_title'),
                description: t('settings.two_factor.modal.verify_description'),
                buttonText: t('settings.two_factor.modal.continue'),
            };
        }

        return {
            title: t('settings.two_factor.modal.setup_title'),
            description: t('settings.two_factor.modal.setup_description'),
            buttonText: t('settings.two_factor.modal.continue'),
        };
    }, [twoFactorEnabled, showVerificationStep]);

    const resetModalState = useCallback(() => {
        if (twoFactorEnabled) {
            clearSetupData();
        }

        setShowVerificationStep(false);
    }, [clearSetupData, twoFactorEnabled]);

    const handleClose = useCallback(() => {
        resetModalState();
        onClose();
    }, [onClose, resetModalState]);

    const handleModalNextStep = useCallback(() => {
        if (requiresConfirmation) {
            setShowVerificationStep(true);

            return;
        }

        clearSetupData();
        handleClose();
    }, [requiresConfirmation, clearSetupData, handleClose]);

    const fetchSetupDataRef = useRef(fetchSetupData);

    useEffect(() => {
        fetchSetupDataRef.current = fetchSetupData;
    }, [fetchSetupData]);

    useEffect(() => {
        if (isOpen && !qrCodeSvg) {
            void fetchSetupDataRef.current();
        }
    }, [isOpen, qrCodeSvg]);

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()}>
            <DialogContent className="sm:max-w-md">
                <DialogHeader className="flex items-center justify-center">
                    <GridScanIcon />
                    <DialogTitle>{modalConfig.title}</DialogTitle>
                    <DialogDescription className="text-center">{modalConfig.description}</DialogDescription>
                </DialogHeader>

                <div className="flex flex-col items-center space-y-5">
                    {showVerificationStep ? (
                        <TwoFactorVerificationStep onClose={handleClose} onBack={() => setShowVerificationStep(false)} />
                    ) : (
                        <TwoFactorSetupStep qrCodeSvg={qrCodeSvg} manualSetupKey={manualSetupKey} buttonText={modalConfig.buttonText} onNextStep={handleModalNextStep} errors={errors} />
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
}
