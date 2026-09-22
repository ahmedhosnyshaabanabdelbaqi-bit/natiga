import { Head, Link, useForm } from '@inertiajs/react';
import { Crown, Search, ShieldCheck, ShieldOff, UserPlus } from 'lucide-react';
import { useState } from 'react';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import type { FilterDefinition } from '@/components/shared/filters-bar';
import {
    FiltersBar,
    isFilterActive,
    useQueryState,
} from '@/components/shared/filters-bar';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import type { Paginated } from '@/types/pagination';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { RoleBadges, roleName } from '@/features/users/role-badges';
import type { RoleOption, StaffUserSummary } from '@/features/users/types';
import { t } from '@/lib/i18n';
import {
    create,
    index as usersIndex,
    lookup,
    show,
} from '@/routes/admin/users';

type Props = {
    users: Paginated<StaffUserSummary>;
    filters: Record<string, string | undefined>;
    roles: RoleOption[];
    can: { create: boolean; manage: boolean; roles: boolean };
};

function LookupDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const form = useForm({ email: '' });
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!next) {
                    form.reset();
                    form.clearErrors();
                }
                onOpenChange(next);
            }}
        >
            <DialogContent>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(lookup());
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t('users.lookup.title')}</DialogTitle>
                        <DialogDescription>
                            {t('users.lookup.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <FormField
                        label={t('users.fields.email')}
                        required
                        error={form.errors.email}
                    >
                        <Input
                            type="email"
                            dir="ltr"
                            autoComplete="off"
                            value={form.data.email}
                            onChange={(event) =>
                                form.setData('email', event.target.value)
                            }
                            autoFocus
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                form.processing || form.data.email.trim() === ''
                            }
                        >
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <Search className="size-4" aria-hidden="true" />
                            )}
                            {t('users.actions.find')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function UsersIndex({ users, roles, can }: Props) {
    const query = useQueryState();
    const [lookupOpen, setLookupOpen] = useState(false);

    const filters: FilterDefinition[] = [
        {
            key: 'q',
            type: 'search',
            label: t('users.filters.search'),
            className: 'md:w-72',
        },
        {
            key: 'role',
            type: 'select',
            label: t('users.filters.role'),
            options: roles.map((role) => ({
                value: role.slug,
                label: roleName(role.slug, roles),
            })),
        },
        {
            key: 'status',
            type: 'select',
            label: t('users.filters.status'),
            options: [
                { value: 'active', label: t('users.status.active') },
                { value: 'disabled', label: t('users.status.disabled') },
            ],
        },
        {
            key: 'mfa',
            type: 'select',
            label: t('users.filters.mfa'),
            options: [
                { value: 'enabled', label: t('users.mfa.enabled') },
                { value: 'disabled', label: t('users.mfa.disabled') },
            ],
        },
    ];
    const filtered = filters.some((filter) =>
        isFilterActive(filter, query.query),
    );

    const columns: DataTableColumn<StaffUserSummary>[] = [
        {
            key: 'name',
            header: t('users.fields.name'),
            sortable: true,
            required: true,
            cell: (user) => (
                <div className="min-w-0">
                    <Link
                        href={show(user.id).url}
                        className="flex items-center gap-1.5 font-medium hover:underline"
                    >
                        {user.is_super ? (
                            <Crown
                                className="size-3.5 shrink-0 text-warning"
                                aria-label={t('users.labels.super')}
                            />
                        ) : null}
                        <span className="truncate">{user.name}</span>
                    </Link>
                    <span
                        className="block truncate text-xs text-muted-foreground"
                        dir="ltr"
                    >
                        {user.email}
                    </span>
                </div>
            ),
        },
        {
            key: 'roles',
            header: t('users.fields.roles'),
            cell: (user) => <RoleBadges slugs={user.roles} roles={roles} />,
        },
        {
            key: 'status',
            header: t('users.fields.status'),
            sortable: true,
            cell: (user) => (
                <StatusBadge
                    status={user.status}
                    label={t(
                        `users.status.${user.status === 'disabled' ? 'disabled' : 'active'}`,
                    )}
                />
            ),
        },
        {
            key: 'mfa',
            header: t('users.fields.mfa'),
            cell: (user) =>
                user.mfa_enabled ? (
                    <span className="inline-flex items-center gap-1 text-sm text-success">
                        <ShieldCheck className="size-4" aria-hidden="true" />
                        {t('users.mfa.enabled')}
                    </span>
                ) : (
                    <span className="inline-flex items-center gap-1 text-sm text-warning">
                        <ShieldOff className="size-4" aria-hidden="true" />
                        {t('users.mfa.disabled')}
                    </span>
                ),
        },
        {
            key: 'last_login_at',
            header: t('users.fields.last_login_at'),
            sortable: true,
            cell: (user) =>
                user.last_login_at ? (
                    <DateTime value={user.last_login_at} mode="relative" />
                ) : (
                    <span className="text-muted-foreground">
                        {t('users.labels.never')}
                    </span>
                ),
        },
        {
            key: 'created_at',
            header: t('users.fields.created_at'),
            sortable: true,
            defaultHidden: true,
            cell: (user) => <DateTime value={user.created_at} mode="date" />,
        },
        {
            key: 'mobile',
            header: t('users.fields.mobile'),
            defaultHidden: true,
            cell: (user) =>
                user.mobile ? (
                    <span dir="ltr">{user.mobile}</span>
                ) : (
                    <span className="text-muted-foreground">—</span>
                ),
        },
    ];

    return (
        <>
            <Head title={t('users.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('users.title')}
                    description={t('users.description')}
                    actions={
                        <>
                            {can.roles ? (
                                <Button
                                    variant="outline"
                                    onClick={() => setLookupOpen(true)}
                                >
                                    <Search
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('users.actions.find_account')}
                                </Button>
                            ) : null}
                            {can.create ? (
                                <Button asChild>
                                    <Link href={create().url}>
                                        <UserPlus
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        {t('users.actions.create')}
                                    </Link>
                                </Button>
                            ) : null}
                        </>
                    }
                />
                <DataTable
                    id="admin-users"
                    columns={columns}
                    data={users}
                    rowKey="id"
                    rowHref={(user) => show(user.id).url}
                    toolbar={<FiltersBar filters={filters} />}
                    filtered={filtered}
                    emptyTitle={t('users.empty.title')}
                    emptyDescription={t('users.empty.description')}
                    emptyAction={
                        can.create ? (
                            <Button asChild size="sm">
                                <Link href={create().url}>
                                    {t('users.actions.create')}
                                </Link>
                            </Button>
                        ) : undefined
                    }
                    caption={t('users.title')}
                    mobileTitle={(user) => user.name}
                />
            </div>
            {can.roles ? (
                <LookupDialog open={lookupOpen} onOpenChange={setLookupOpen} />
            ) : null}
        </>
    );
}

UsersIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: usersIndex().url },
        { title: t('users.title'), href: usersIndex().url },
    ],
});
