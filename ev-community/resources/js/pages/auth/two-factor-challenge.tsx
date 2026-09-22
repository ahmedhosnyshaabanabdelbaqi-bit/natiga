import { Form, Head, setLayoutProps } from '@inertiajs/react';
import { REGEXP_ONLY_DIGITS } from 'input-otp';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { OTP_MAX_LENGTH } from '@/hooks/use-two-factor-auth';
import { t } from '@/lib/i18n';
import { store } from '@/routes/two-factor/login';

export default function TwoFactorChallenge() {
    const [showRecoveryInput, setShowRecoveryInput] = useState<boolean>(false);
    const [code, setCode] = useState<string>('');

    const content = showRecoveryInput
        ? {
              title: t('auth.two_factor.recovery_title'),
              description: t('auth.two_factor.recovery_description'),
              toggleText: t('auth.two_factor.use_code'),
          }
        : {
              title: t('auth.two_factor.code_title'),
              description: t('auth.two_factor.code_description'),
              toggleText: t('auth.two_factor.recovery'),
          };

    setLayoutProps({
        title: content.title,
        description: content.description,
    });

    const toggleRecoveryMode = (clearErrors: () => void): void => {
        setShowRecoveryInput(!showRecoveryInput);
        clearErrors();
        setCode('');
    };

    return (
        <>
            <Head title={t('auth.two_factor.title')} />

            <div className="space-y-6">
                <Form {...store.form()} className="space-y-4" resetOnError resetOnSuccess={!showRecoveryInput}>
                    {({ errors, processing, clearErrors }) => (
                        <>
                            {showRecoveryInput ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="recovery_code" className="sr-only">
                                        {t('auth.fields.recovery_code')}
                                    </Label>
                                    <Input
                                        id="recovery_code"
                                        name="recovery_code"
                                        type="text"
                                        dir="ltr"
                                        className="code"
                                        autoComplete="one-time-code"
                                        placeholder={t('auth.two_factor.recovery_placeholder')}
                                        autoFocus={showRecoveryInput}
                                        required
                                        aria-invalid={errors.recovery_code ? true : undefined}
                                    />
                                    <InputError message={errors.recovery_code} />
                                </div>
                            ) : (
                                <div className="flex flex-col items-center justify-center space-y-3 text-center">
                                    <div className="flex w-full items-center justify-center">
                                        <InputOTP
                                            name="code"
                                            maxLength={OTP_MAX_LENGTH}
                                            value={code}
                                            onChange={(value) => setCode(value)}
                                            disabled={processing}
                                            pattern={REGEXP_ONLY_DIGITS}
                                            aria-label={t('auth.fields.code')}
                                            autoComplete="one-time-code"
                                            autoFocus
                                        >
                                            <InputOTPGroup>
                                                {Array.from({ length: OTP_MAX_LENGTH }, (_, index) => (
                                                    <InputOTPSlot key={index} index={index} />
                                                ))}
                                            </InputOTPGroup>
                                        </InputOTP>
                                    </div>
                                    <InputError message={errors.code} />
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={processing}>
                                {processing ? <Spinner /> : null}
                                {t('auth.two_factor.submit')}
                            </Button>

                            <div className="text-center text-sm text-muted-foreground">
                                <button
                                    type="button"
                                    className="cursor-pointer rounded-sm text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out outline-none hover:decoration-current! focus-visible:ring-2 focus-visible:ring-ring/60 dark:decoration-neutral-500"
                                    onClick={() => toggleRecoveryMode(clearErrors)}
                                >
                                    {content.toggleText}
                                </button>
                            </div>
                        </>
                    )}
                </Form>
            </div>
        </>
    );
}
