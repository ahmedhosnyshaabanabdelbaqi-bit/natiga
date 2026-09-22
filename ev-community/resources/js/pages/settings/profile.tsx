import { Form, Head, Link, usePage } from '@inertiajs/react';
import ProfileController from '@/actions/App/Http/Controllers/Settings/ProfileController';
import DeleteUser from '@/components/delete-user';
import Heading from '@/components/heading';
import InputError from '@/components/input-error';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { edit } from '@/routes/profile';
import { send } from '@/routes/verification';

type Props = {
    mustVerifyEmail: boolean;
    status?: string;
};

export default function Profile({ mustVerifyEmail, status }: Props) {
    const { auth } = usePage().props;

    return (
        <>
            <Head title={t('settings.profile.title')} />

            <h1 className="sr-only">{t('settings.profile.title')}</h1>

            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('settings.profile.heading')}
                    description={t('settings.profile.description')}
                />

                <Form
                    {...ProfileController.update.form()}
                    options={{ preserveScroll: true }}
                    className="space-y-6"
                >
                    {({ processing, errors }) => (
                        <>
                            <div className="grid gap-2">
                                <Label htmlFor="name">
                                    {t('settings.profile.name')}
                                </Label>

                                <Input
                                    id="name"
                                    className="mt-1 block w-full"
                                    defaultValue={auth.user?.name}
                                    name="name"
                                    required
                                    maxLength={255}
                                    autoComplete="name"
                                    placeholder={t(
                                        'settings.profile.name_placeholder',
                                    )}
                                    aria-invalid={
                                        errors.name ? true : undefined
                                    }
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.name}
                                />
                            </div>

                            <div className="grid gap-2">
                                <Label htmlFor="email">
                                    {t('settings.profile.email')}
                                </Label>

                                <Input
                                    id="email"
                                    type="email"
                                    className="code mt-1 block w-full"
                                    dir="ltr"
                                    defaultValue={auth.user?.email}
                                    name="email"
                                    required
                                    maxLength={255}
                                    autoComplete="username"
                                    placeholder={t(
                                        'settings.profile.email_placeholder',
                                    )}
                                    aria-invalid={
                                        errors.email ? true : undefined
                                    }
                                />

                                <InputError
                                    className="mt-2"
                                    message={errors.email}
                                />
                            </div>

                            {mustVerifyEmail &&
                                auth.user?.email_verified_at === null && (
                                    <div>
                                        <p className="-mt-4 text-sm text-muted-foreground">
                                            {t('settings.profile.unverified')}{' '}
                                            <Link
                                                href={send()}
                                                as="button"
                                                className="text-foreground underline decoration-neutral-300 underline-offset-4 transition-colors duration-300 ease-out hover:decoration-current! dark:decoration-neutral-500"
                                            >
                                                {t(
                                                    'settings.profile.resend_verification',
                                                )}
                                            </Link>
                                        </p>

                                        {status ===
                                            'verification-link-sent' && (
                                            <div
                                                role="status"
                                                className="mt-2 text-sm font-medium text-success"
                                            >
                                                {t(
                                                    'settings.profile.verification_sent',
                                                )}
                                            </div>
                                        )}
                                    </div>
                                )}

                            <div className="flex items-center gap-4">
                                <Button
                                    disabled={processing}
                                    data-test="update-profile-button"
                                >
                                    {processing ? <Spinner /> : null}
                                    {t('settings.profile.save')}
                                </Button>
                            </div>
                        </>
                    )}
                </Form>
            </div>

            <DeleteUser />
        </>
    );
}

Profile.layout = () => ({
    breadcrumbs: [{ title: t('settings.profile.title'), href: edit() }],
});
