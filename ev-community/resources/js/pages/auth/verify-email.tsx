import { Form, Head } from '@inertiajs/react';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { logout } from '@/routes';
import { send } from '@/routes/verification';

export default function VerifyEmail({ status }: { status?: string }) {
    return (
        <>
            <Head title={t('auth.verify.title')} />

            {status === 'verification-link-sent' && (
                <div role="status" className="mb-4 rounded-md bg-success-soft px-3 py-2 text-center text-sm font-medium text-success">
                    {t('auth.verify.sent')}
                </div>
            )}

            <Form {...send.form()} className="space-y-6 text-center">
                {({ processing }) => (
                    <>
                        <Button disabled={processing} variant="secondary">
                            {processing && <Spinner />}
                            {t('auth.verify.resend')}
                        </Button>

                        <TextLink href={logout()} as="button" className="mx-auto block text-sm">
                            {t('auth.verify.logout')}
                        </TextLink>
                    </>
                )}
            </Form>
        </>
    );
}

VerifyEmail.layout = () => ({
    title: t('auth.verify.title'),
    description: t('auth.verify.description'),
});
