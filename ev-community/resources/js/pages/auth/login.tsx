import { Form, Head, usePage } from '@inertiajs/react';
import InputError from '@/components/input-error';
import PasskeyVerify from '@/components/passkey-verify';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { register } from '@/routes';
import { store } from '@/routes/login';
import { request } from '@/routes/password';

type Props = {
    status?: string;
    canResetPassword: boolean;
    canRegister?: boolean;
    portal?: 'member' | 'admin' | 'partner';
};

export default function Login({ status, canResetPassword, canRegister = true, portal = 'member' }: Props) {
    const { flash } = usePage().props;
    const title = portal === 'admin' ? t('auth.login.admin_title') : portal === 'partner' ? t('auth.login.partner_title') : t('auth.login.title');
    return (
        <>
            <Head title={title} />

            {portal === 'member' ? <PasskeyVerify /> : null}

            {flash?.error ? <div className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger">{flash.error}</div> : null}
            {status ? <div className="rounded-md bg-success-soft px-3 py-2 text-center text-sm font-medium text-success">{status}</div> : null}

            <Form {...store.form()} resetOnSuccess={['password']} className="flex flex-col gap-6">
                {({ processing, errors }) => (
                    <>
                        <input type="hidden" name="portal" value={portal} />
                        <div className="grid gap-6">
                            <div className="grid gap-2">
                                <Label htmlFor="email">{t('auth.fields.email')}</Label>
                                <Input id="email" type="email" name="email" required autoFocus tabIndex={1} autoComplete="email" placeholder="email@example.com" dir="ltr" className="code" />
                                <InputError message={errors.email} />
                            </div>

                            <div className="grid gap-2">
                                <div className="flex items-center">
                                    <Label htmlFor="password">{t('auth.fields.password')}</Label>
                                    {canResetPassword && (
                                        <TextLink href={request()} className="ms-auto text-sm" tabIndex={5}>
                                            {t('auth.login.forgot')}
                                        </TextLink>
                                    )}
                                </div>
                                <PasswordInput id="password" name="password" required tabIndex={2} autoComplete="current-password" placeholder="••••••••" />
                                <InputError message={errors.password} />
                            </div>

                            <div className="flex items-center gap-3">
                                <Checkbox id="remember" name="remember" tabIndex={3} />
                                <Label htmlFor="remember">{t('auth.login.remember')}</Label>
                            </div>

                            <Button type="submit" className="mt-2 w-full" tabIndex={4} disabled={processing} data-test="login-button">
                                {processing && <Spinner />}
                                {t('auth.login.submit')}
                            </Button>
                        </div>

                        {canRegister && portal === 'member' ? (
                            <div className="text-center text-sm text-muted-foreground">
                                {t('auth.login.no_account')}{' '}
                                <TextLink href={register()} tabIndex={5}>
                                    {t('auth.login.register')}
                                </TextLink>
                            </div>
                        ) : null}
                    </>
                )}
            </Form>
        </>
    );
}

Login.layout = (page: { props: Props }) => {
    const portal = page.props.portal ?? 'member';
    return {
        title: portal === 'admin' ? t('auth.login.admin_title') : portal === 'partner' ? t('auth.login.partner_title') : t('auth.login.title'),
        description: portal === 'admin' ? t('auth.login.admin_description') : portal === 'partner' ? t('auth.login.partner_description') : t('auth.login.description'),
    };
};
