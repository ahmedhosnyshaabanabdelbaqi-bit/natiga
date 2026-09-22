import { Form, Head } from '@inertiajs/react';
import InputError from '@/components/input-error';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { login } from '@/routes';
import { email } from '@/routes/password';

export default function ForgotPassword({ status }: { status?: string }) {
    return (
        <>
            <Head title={t('auth.forgot.title')} />

            {status && (
                <div role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-center text-sm font-medium text-success">
                    {status}
                </div>
            )}

            <div className="space-y-6">
                <Form {...email.form()}>
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="email">{t('auth.fields.email')}</Label>
                                <Input
                                    id="email"
                                    type="email"
                                    name="email"
                                    autoComplete="email"
                                    required
                                    autoFocus
                                    dir="ltr"
                                    className="code"
                                    placeholder="email@example.com"
                                    aria-invalid={errors.email ? true : undefined}
                                />

                                <InputError message={errors.email} />
                            </div>

                            <div className="my-6 flex items-center justify-start">
                                <Button className="w-full" disabled={processing} data-test="email-password-reset-link-button">
                                    {processing && <Spinner />}
                                    {t('auth.forgot.submit')}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>

                <div className="flex justify-center gap-1 text-center text-sm text-muted-foreground">
                    <span>{t('auth.forgot.or_return')}</span>
                    <TextLink href={login()}>{t('auth.forgot.login_link')}</TextLink>
                </div>
            </div>
        </>
    );
}

ForgotPassword.layout = () => ({
    title: t('auth.forgot.title'),
    description: t('auth.forgot.description'),
});
