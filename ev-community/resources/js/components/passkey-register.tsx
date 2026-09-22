import { usePasskeyRegister } from '@laravel/passkeys/react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { usePasskeyErrorMessage } from '@/hooks/use-passkey-error-message';
import { t } from '@/lib/i18n';

type Props = {
    onSuccess: () => void;
};

/** Suggests "<browser> on <os>" (e.g. "Chrome on Android") as the passkey name. */
function defaultPasskeyName(): string {
    if (typeof navigator === 'undefined') {
        return '';
    }
    const ua = navigator.userAgent;

    const browser = [
        { pattern: /Edg|Edge/, name: 'Edge' },
        { pattern: /OPR|Opera|OPiOS/, name: 'Opera' },
        { pattern: /Firefox|FxiOS/, name: 'Firefox' },
        { pattern: /Chrome|CriOS/, name: 'Chrome' },
        { pattern: /Safari/, name: 'Safari' },
    ].find(({ pattern }) => pattern.test(ua))?.name;

    const os = [
        { pattern: /iPhone/, name: 'iPhone' },
        { pattern: /iPad|Macintosh(?=.*Mobile)/, name: 'iPad' },
        { pattern: /Android/, name: 'Android' },
        { pattern: /Mac/, name: 'Mac' },
        { pattern: /Windows/, name: 'Windows' },
    ].find(({ pattern }) => pattern.test(ua))?.name;

    if (browser && os) {
        return t('settings.passkeys.default_name', { browser, os });
    }

    return browser ?? os ?? '';
}

export default function PasskeyRegistration({ onSuccess }: Props) {
    const [name, setName] = useState(defaultPasskeyName);
    const [showForm, setShowForm] = useState(false);
    const { register, isLoading, errorInstance, isSupported } =
        usePasskeyRegister({
            onSuccess: () => {
                setName('');
                setShowForm(false);
                onSuccess();
            },
        });

    const error = usePasskeyErrorMessage(errorInstance);

    const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (!name.trim()) {
            return;
        }

        await register(name.trim());
    };

    const handleCancel = () => {
        setShowForm(false);
        setName(defaultPasskeyName());
    };

    if (!isSupported) {
        return (
            <div className="text-sm text-muted-foreground">
                {t('settings.passkeys.unsupported')}
            </div>
        );
    }

    if (!showForm) {
        return (
            <Button
                type="button"
                variant="outline"
                onClick={() => setShowForm(true)}
            >
                {t('settings.passkeys.add')}
            </Button>
        );
    }

    return (
        <form
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-4 rounded-lg border border-border bg-muted/50 p-4"
        >
            <div className="grid gap-2">
                <Label htmlFor="passkey-name">
                    {t('settings.passkeys.name')}
                </Label>
                <Input
                    id="passkey-name"
                    type="text"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder={t('settings.passkeys.name_placeholder')}
                    className="mt-1 block w-full border-foreground/20"
                    aria-describedby="passkey-name-hint"
                    maxLength={255}
                    autoFocus
                />
                <p
                    id="passkey-name-hint"
                    className="text-xs text-muted-foreground"
                >
                    {t('settings.passkeys.name_hint')}
                </p>
            </div>

            {error && <InputError message={error} />}

            <div className="flex gap-2">
                <Button type="submit" disabled={isLoading || !name.trim()}>
                    {isLoading ? <Spinner /> : null}
                    {isLoading
                        ? t('settings.passkeys.registering')
                        : t('settings.passkeys.register')}
                </Button>
                <Button type="button" variant="ghost" onClick={handleCancel}>
                    {t('settings.passkeys.cancel')}
                </Button>
            </div>
        </form>
    );
}
