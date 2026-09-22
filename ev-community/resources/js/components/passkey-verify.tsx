import type { UrlMethodPair } from '@inertiajs/core';
import { router } from '@inertiajs/react';
import { usePasskeyVerify } from '@laravel/passkeys/react';
import { KeyRound } from 'lucide-react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { usePasskeyErrorMessage } from '@/hooks/use-passkey-error-message';
import { t } from '@/lib/i18n';

type Props = {
    routes?: {
        options: UrlMethodPair;
        submit: UrlMethodPair;
    };
    label?: string;
    loadingLabel?: string;
    separator?: string;
};

/** "Sign in with a passkey" button + separator. Renders nothing when WebAuthn is unavailable. */
export default function PasskeyVerify({ routes, label, loadingLabel, separator }: Props = {}) {
    const { verify, isLoading, errorInstance, isSupported } = usePasskeyVerify({
        ...(routes && {
            routes: {
                options: routes.options.url,
                submit: routes.submit.url,
            },
        }),
        onSuccess: (response) => {
            // The server always returns the intended URL; "/" is only a defensive fallback.
            router.visit(response.redirect ?? '/');
        },
    });

    const error = usePasskeyErrorMessage(errorInstance);

    if (!isSupported) {
        return null;
    }

    return (
        <>
            <div className="grid gap-2">
                <Button type="button" variant="outline" className="w-full" onClick={() => void verify()} disabled={isLoading}>
                    {isLoading ? <Spinner /> : <KeyRound className="h-4 w-4" aria-hidden="true" />}
                    {isLoading ? (loadingLabel ?? t('auth.passkey.authenticating')) : (label ?? t('auth.passkey.sign_in'))}
                </Button>
                {error && <InputError message={error} className="text-center" />}
            </div>

            <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                    <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">{separator ?? t('auth.passkey.or_email')}</span>
                </div>
            </div>
        </>
    );
}
