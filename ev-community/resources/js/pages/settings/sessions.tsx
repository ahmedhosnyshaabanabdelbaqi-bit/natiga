import { Head, router, useForm } from '@inertiajs/react';
import { LogOut } from 'lucide-react';
import { useState } from 'react';
import Heading from '@/components/heading';
import PasswordInput from '@/components/password-input';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { PageErrors } from '@/features/system/page-errors';
import { SessionsList } from '@/features/system/sessions-list';
import type { SessionRow } from '@/features/system/types';
import { t } from '@/lib/i18n';
import {
    destroy,
    index as sessionsIndex,
    logoutOthers,
} from '@/routes/shared/settings/sessions';

type Props = {
    sessions: SessionRow[];
    supported: boolean;
};

export default function Sessions({ sessions, supported }: Props) {
    const [revoking, setRevoking] = useState<SessionRow | null>(null);
    const form = useForm({ current_password: '' });
    const others = sessions.filter((session) => !session.is_current).length;

    return (
        <>
            <Head title={t('system.sessions.title')} />
            <h1 className="sr-only">{t('system.sessions.title')}</h1>
            <div className="space-y-6">
                <Heading
                    variant="small"
                    title={t('system.sessions.title')}
                    description={t('system.sessions.description')}
                />
                <PageErrors ignore={['current_password']} />
                {!supported ? (
                    <InlineAlert tone="info">
                        {t('system.sessions.unsupported')}
                    </InlineAlert>
                ) : (
                    <>
                        <SessionsList
                            sessions={sessions}
                            onRevoke={setRevoking}
                            emptyText={t('system.sessions.empty')}
                        />
                        {others > 0 ? (
                            <form
                                className="grid gap-4 rounded-xl border p-4"
                                onSubmit={(event) => {
                                    event.preventDefault();
                                    form.submit(logoutOthers(), {
                                        preserveScroll: true,
                                        onSuccess: () => form.reset(),
                                    });
                                }}
                            >
                                <Heading
                                    variant="small"
                                    title={t(
                                        'system.sessions.logout_others.title',
                                    )}
                                    description={t(
                                        'system.sessions.logout_others.description',
                                    )}
                                />
                                <FormField
                                    label={t(
                                        'system.sessions.logout_others.password',
                                    )}
                                    required
                                    error={form.errors.current_password}
                                >
                                    <PasswordInput
                                        value={form.data.current_password}
                                        onChange={(event) =>
                                            form.setData(
                                                'current_password',
                                                event.target.value,
                                            )
                                        }
                                        autoComplete="current-password"
                                        required
                                    />
                                </FormField>
                                <div>
                                    <Button
                                        type="submit"
                                        variant="destructive"
                                        disabled={
                                            form.processing ||
                                            form.data.current_password === ''
                                        }
                                    >
                                        {form.processing ? (
                                            <Spinner />
                                        ) : (
                                            <LogOut
                                                className="size-4 rtl:rotate-180"
                                                aria-hidden="true"
                                            />
                                        )}
                                        {t(
                                            'system.sessions.logout_others.submit',
                                        )}
                                    </Button>
                                </div>
                            </form>
                        ) : null}
                    </>
                )}
            </div>
            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => (!open ? setRevoking(null) : undefined)}
                title={t('system.sessions.revoke_confirm.title')}
                description={t('system.sessions.revoke_confirm.description')}
                confirmLabel={t('system.sessions.actions.revoke')}
                destructive
                onConfirm={() =>
                    new Promise<void>((resolve) => {
                        if (!revoking) {
                            resolve();
                            return;
                        }
                        router.delete(destroy(revoking.id).url, {
                            preserveScroll: true,
                            onFinish: () => {
                                resolve();
                                setRevoking(null);
                            },
                        });
                    })
                }
            />
        </>
    );
}

Sessions.layout = () => ({
    breadcrumbs: [
        { title: t('system.sessions.title'), href: sessionsIndex().url },
    ],
});
