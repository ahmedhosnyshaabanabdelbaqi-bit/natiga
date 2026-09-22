import { t } from '@/lib/i18n';

type PasskeyErrorLike = { name: string; message: string } | null | undefined;

/**
 * Translates `@laravel/passkeys` errors (whose built-in messages are English) into the current
 * locale. Server responses already carry a translated Laravel message and are passed through.
 */
export function usePasskeyErrorMessage(error: PasskeyErrorLike): string | null {
    if (!error) {
        return null;
    }
    switch (error.name) {
        case 'UserCancelledError':
            return t('auth.passkey.cancelled');
        case 'PasskeyExistsError':
            return t('settings.passkeys.exists');
        case 'NotSupportedError':
            return t('settings.passkeys.unsupported');
        case 'InvalidDomainError':
            return t('auth.passkey.invalid_domain');
        default:
            if (
                error.message === '' ||
                error.message === 'An unknown error occurred.' ||
                error.message.startsWith('Request failed with status')
            ) {
                return t('core.states.error');
            }
            return error.message;
    }
}
