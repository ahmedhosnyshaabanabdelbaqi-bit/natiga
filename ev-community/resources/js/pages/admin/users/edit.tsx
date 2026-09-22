import { Head, Link, useForm } from '@inertiajs/react';
import { Save } from 'lucide-react';
import { FormActions } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { ProfileData } from '@/features/users/profile-fields';
import { ProfileFields } from '@/features/users/profile-fields';
import type { StaffUserDetail, UserFormProps } from '@/features/users/types';
import { t } from '@/lib/i18n';
import { edit, index as usersIndex, show, update } from '@/routes/admin/users';

type Props = UserFormProps & { user: StaffUserDetail };

export default function UsersEdit({ user, locales }: Props) {
    const form = useForm<ProfileData>({ name: user.name, email: user.email, mobile: user.mobile ?? '', preferred_locale: user.preferred_locale });
    const errors = form.errors as Record<string, string | undefined>;

    return (
        <>
            <Head title={t('users.edit.title', { name: user.name })} />
            <form
                className="grid gap-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit(update(user.id));
                }}
                noValidate
            >
                <PageHeader title={t('users.edit.title', { name: user.name })} description={t('users.edit.description')} />
                {errors.domain ? <InlineAlert tone="danger">{errors.domain}</InlineAlert> : null}
                <SectionCard>
                    <div className="grid gap-4">
                        <ProfileFields data={form.data} errors={form.errors} onChange={(key, value) => form.setData(key, value)} locales={locales} />
                        {form.data.email.trim().toLowerCase() !== user.email.toLowerCase() ? <InlineAlert tone="warning">{t('users.edit.email_notice')}</InlineAlert> : null}
                    </div>
                </SectionCard>
                <FormActions>
                    <Button type="button" variant="ghost" asChild>
                        <Link href={show(user.id).url}>{t('core.actions.cancel')}</Link>
                    </Button>
                    <Button type="submit" disabled={form.processing || !form.isDirty}>
                        {form.processing ? <Spinner /> : <Save className="size-4" aria-hidden="true" />}
                        {t('core.actions.save')}
                    </Button>
                </FormActions>
            </form>
        </>
    );
}

UsersEdit.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('users.title'), href: usersIndex().url },
        { title: props.user.name, href: show(props.user.id).url },
        { title: t('users.actions.edit'), href: edit(props.user.id).url },
    ],
});
