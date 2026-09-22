import { Head, Link, useForm } from '@inertiajs/react';
import { UserPlus } from 'lucide-react';
import { FormActions } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { AccessEditor } from '@/features/users/access-editor';
import type { ProfileData } from '@/features/users/profile-fields';
import { ProfileFields } from '@/features/users/profile-fields';
import type { UserFormProps } from '@/features/users/types';
import { currentLocale, t } from '@/lib/i18n';
import { create, index as usersIndex, store } from '@/routes/admin/users';

type CreateForm = ProfileData & { roles: string[]; permissions: string[] };

export default function UsersCreate({ roles, permissionGroups, actorIsSuper, locales }: UserFormProps) {
    const form = useForm<CreateForm>({ name: '', email: '', mobile: '', preferred_locale: currentLocale(), roles: [], permissions: [] });
    const errors = form.errors as Record<string, string | undefined>;

    return (
        <>
            <Head title={t('users.create.title')} />
            <form
                className="grid gap-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit(store());
                }}
                noValidate
            >
                <PageHeader title={t('users.create.title')} description={t('users.create.description')} />
                {errors.domain ? <InlineAlert tone="danger">{errors.domain}</InlineAlert> : null}
                <SectionCard title={t('users.create.profile_title')}>
                    <ProfileFields data={form.data} errors={form.errors} onChange={(key, value) => form.setData(key, value)} locales={locales} />
                </SectionCard>
                <SectionCard title={t('users.create.access_title')} description={t('users.create.access_description')}>
                    <AccessEditor
                        roles={roles}
                        permissionGroups={permissionGroups}
                        selectedRoles={form.data.roles}
                        selectedPermissions={form.data.permissions}
                        onRolesChange={(value) => form.setData('roles', value)}
                        onPermissionsChange={(value) => form.setData('permissions', value)}
                        actorIsSuper={actorIsSuper}
                        rolesError={errors.roles ?? Object.entries(errors).find(([key]) => key.startsWith('roles.'))?.[1]}
                        permissionsError={errors.permissions ?? Object.entries(errors).find(([key]) => key.startsWith('permissions.'))?.[1]}
                    />
                </SectionCard>
                <FormActions>
                    <Button type="button" variant="ghost" asChild>
                        <Link href={usersIndex().url}>{t('core.actions.cancel')}</Link>
                    </Button>
                    <Button type="submit" disabled={form.processing}>
                        {form.processing ? <Spinner /> : <UserPlus className="size-4" aria-hidden="true" />}
                        {t('users.create.submit')}
                    </Button>
                </FormActions>
            </form>
        </>
    );
}

UsersCreate.layout = () => ({
    breadcrumbs: [
        { title: t('users.title'), href: usersIndex().url },
        { title: t('users.create.title'), href: create().url },
    ],
});
