import { Head, router, useForm } from '@inertiajs/react';
import {
    Check,
    Crown,
    Plus,
    Save,
    Search,
    Trash2,
    Undo2,
    Users,
} from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Code } from '@/components/ui/code';
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
import { Textarea } from '@/components/ui/textarea';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { pick, tOr } from '@/features/system/i18n';
import { PageErrors } from '@/features/system/page-errors';
import type { LocalizedLabel } from '@/features/system/types';
import { formatNumber } from '@/lib/format';
import { localized, t } from '@/lib/i18n';
import {
    destroy,
    index as rolesIndex,
    permissions as savePermissions,
    store,
} from '@/routes/admin/roles';

type RoleRow = {
    id: number;
    slug: string;
    name_ar: string;
    name_en: string;
    description: string | null;
    is_system: boolean;
    is_super: boolean;
    portal: string;
    users_count: number;
    permissions: string[];
};

type PermissionDef = {
    key: string;
    label: LocalizedLabel;
    default_roles: string[];
};
type PermissionGroup = {
    module: string;
    label: LocalizedLabel;
    permissions: PermissionDef[];
};

type Props = {
    roles: RoleRow[];
    groups: PermissionGroup[];
    actorIsSuper: boolean;
    actorPermissions: string[];
};

function sameSet(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((item) => b.includes(item));
}

function CreateRoleDialog({
    open,
    onOpenChange,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const form = useForm({
        slug: '',
        name_ar: '',
        name_en: '',
        description: '',
    });
    const close = (next: boolean) => {
        if (!next) {
            form.reset();
            form.clearErrors();
        }
        onOpenChange(next);
    };
    return (
        <Dialog open={open} onOpenChange={close}>
            <DialogContent>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(store(), {
                            preserveScroll: true,
                            onSuccess: () => close(false),
                        });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>{t('roles.create.title')}</DialogTitle>
                        <DialogDescription>
                            {t('roles.create.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <FormField
                        label={t('roles.fields.slug')}
                        required
                        hint={t('roles.labels.slug_hint')}
                        error={form.errors.slug}
                    >
                        <Input
                            dir="ltr"
                            value={form.data.slug}
                            onChange={(event) =>
                                form.setData(
                                    'slug',
                                    event.target.value
                                        .toLowerCase()
                                        .replace(/[^a-z0-9-]/g, '-'),
                                )
                            }
                            maxLength={40}
                            className="font-mono"
                            required
                        />
                    </FormField>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label={t('roles.fields.name_ar')}
                            required
                            error={form.errors.name_ar}
                        >
                            <Input
                                dir="rtl"
                                lang="ar"
                                value={form.data.name_ar}
                                onChange={(event) =>
                                    form.setData('name_ar', event.target.value)
                                }
                                maxLength={80}
                                required
                            />
                        </FormField>
                        <FormField
                            label={t('roles.fields.name_en')}
                            required
                            error={form.errors.name_en}
                        >
                            <Input
                                dir="ltr"
                                lang="en"
                                value={form.data.name_en}
                                onChange={(event) =>
                                    form.setData('name_en', event.target.value)
                                }
                                maxLength={80}
                                required
                            />
                        </FormField>
                    </div>
                    <FormField
                        label={t('roles.fields.description')}
                        optional
                        error={form.errors.description}
                    >
                        <Textarea
                            value={form.data.description}
                            onChange={(event) =>
                                form.setData('description', event.target.value)
                            }
                            rows={2}
                            maxLength={255}
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => close(false)}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <Plus className="size-4" aria-hidden="true" />
                            )}
                            {t('roles.create.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function RolesIndex({
    roles,
    groups,
    actorIsSuper,
    actorPermissions,
}: Props) {
    const original = useMemo(
        () =>
            Object.fromEntries(
                roles.map((role) => [role.slug, role.permissions]),
            ),
        [roles],
    );
    const [draft, setDraft] = useState<Record<string, string[]>>(original);
    const [seen, setSeen] = useState(original);
    const [query, setQuery] = useState('');
    const [creating, setCreating] = useState(false);
    const [saving, setSaving] = useState<RoleRow | null>(null);
    const [deleting, setDeleting] = useState<RoleRow | null>(null);

    // Adopt fresh server data after a save (the page props change) without losing unrelated drafts.
    if (seen !== original) {
        setSeen(original);
        setDraft((previous) => {
            const next: Record<string, string[]> = { ...original };
            for (const [slug, list] of Object.entries(previous)) {
                if (
                    seen[slug] &&
                    original[slug] &&
                    sameSet(seen[slug], original[slug]) &&
                    !sameSet(list, seen[slug])
                ) {
                    next[slug] = list; // still an unsaved edit for a role the server did not change
                }
            }
            return next;
        });
    }

    const held = useMemo(() => new Set(actorPermissions), [actorPermissions]);
    const needle = query.trim().toLowerCase();
    const visibleGroups = useMemo(
        () =>
            groups
                .map((group) => ({
                    ...group,
                    permissions: group.permissions.filter(
                        (permission) =>
                            needle === '' ||
                            permission.key.includes(needle) ||
                            permission.label.ar
                                .toLowerCase()
                                .includes(needle) ||
                            permission.label.en.toLowerCase().includes(needle),
                    ),
                }))
                .filter((group) => group.permissions.length > 0),
        [groups, needle],
    );
    const editable = roles.filter((role) => !role.is_super);
    const dirty = editable.filter(
        (role) => !sameSet(draft[role.slug] ?? [], original[role.slug] ?? []),
    );

    const setCell = (role: RoleRow, key: string, on: boolean) =>
        setDraft((previous) => {
            const list = previous[role.slug] ?? [];
            return {
                ...previous,
                [role.slug]: on
                    ? Array.from(new Set([...list, key]))
                    : list.filter((item) => item !== key),
            };
        });

    const lockedReason = (role: RoleRow, key: string): string | null => {
        if (role.is_super) {
            return t('roles.errors.super_role_readonly');
        }
        if (
            !actorIsSuper &&
            !held.has(key) &&
            !(original[role.slug] ?? []).includes(key)
        ) {
            return t('roles.labels.not_grantable');
        }
        return null;
    };

    const roleLabel = (role: RoleRow) => localized(role, 'name') || role.slug;
    const diff = (role: RoleRow) => {
        const before = original[role.slug] ?? [];
        const after = draft[role.slug] ?? [];
        return {
            added: after.filter((key) => !before.includes(key)).length,
            removed: before.filter((key) => !after.includes(key)).length,
        };
    };

    return (
        <>
            <Head title={t('roles.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('roles.title')}
                    description={t('roles.description')}
                    actions={
                        <Button onClick={() => setCreating(true)}>
                            <Plus className="size-4" aria-hidden="true" />
                            {t('roles.actions.create')}
                        </Button>
                    }
                />
                <PageErrors />

                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {roles.map((role) => (
                        <li key={role.slug}>
                            <Card className="h-full shadow-card">
                                <CardContent className="grid gap-2 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <p className="flex items-center gap-1.5 font-medium">
                                            {role.is_super ? (
                                                <Crown
                                                    className="size-4 text-warning"
                                                    aria-hidden="true"
                                                />
                                            ) : null}
                                            {roleLabel(role)}
                                        </p>
                                        {!role.is_system &&
                                        role.users_count === 0 ? (
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="size-7"
                                                onClick={() =>
                                                    setDeleting(role)
                                                }
                                                aria-label={`${t('roles.actions.delete')}: ${roleLabel(role)}`}
                                            >
                                                <Trash2
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                            </Button>
                                        ) : null}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-1.5">
                                        <Code className="text-[0.7rem]">
                                            {role.slug}
                                        </Code>
                                        <Badge
                                            variant={
                                                role.is_super
                                                    ? 'default'
                                                    : 'secondary'
                                            }
                                            className="font-normal"
                                        >
                                            {role.is_super
                                                ? t('roles.labels.super')
                                                : role.is_system
                                                  ? t('roles.labels.system')
                                                  : t('roles.labels.custom')}
                                        </Badge>
                                        <span className="text-xs text-muted-foreground">
                                            {tOr(
                                                `roles.portals.${role.portal}`,
                                                role.portal,
                                            )}
                                        </span>
                                    </div>
                                    {role.description ? (
                                        <p className="text-xs text-muted-foreground">
                                            {role.description}
                                        </p>
                                    ) : null}
                                    <p className="tabular flex items-center gap-3 text-xs text-muted-foreground">
                                        <span className="inline-flex items-center gap-1">
                                            <Users
                                                className="size-3.5"
                                                aria-hidden="true"
                                            />
                                            {t('roles.labels.users_count', {
                                                count: formatNumber(
                                                    role.users_count,
                                                    0,
                                                ),
                                            })}
                                        </span>
                                        <span>
                                            {t('roles.labels.granted', {
                                                granted: formatNumber(
                                                    (draft[role.slug] ?? [])
                                                        .length,
                                                    0,
                                                ),
                                                total: formatNumber(
                                                    groups.reduce(
                                                        (sum, group) =>
                                                            sum +
                                                            group.permissions
                                                                .length,
                                                        0,
                                                    ),
                                                    0,
                                                ),
                                            })}
                                        </span>
                                    </p>
                                </CardContent>
                            </Card>
                        </li>
                    ))}
                </ul>

                <div className="grid gap-3">
                    <div className="relative sm:max-w-sm">
                        <Search
                            className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                            aria-hidden="true"
                        />
                        <Input
                            type="search"
                            value={query}
                            onChange={(event) => setQuery(event.target.value)}
                            placeholder={t('roles.labels.search')}
                            aria-label={t('roles.labels.search')}
                            className="ps-9"
                        />
                    </div>

                    {dirty.length > 0 ? (
                        <div
                            className="sticky top-2 z-20 grid gap-2 rounded-xl border border-warning/40 bg-background/95 p-3 shadow-card backdrop-blur"
                            aria-live="polite"
                        >
                            {dirty.map((role) => {
                                const { added, removed } = diff(role);
                                return (
                                    <div
                                        key={role.slug}
                                        className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                        <p className="text-sm">
                                            <span className="font-medium">
                                                {roleLabel(role)}
                                            </span>
                                            <span className="text-muted-foreground">
                                                {' '}
                                                — {t(
                                                    'roles.labels.unsaved',
                                                )}:{' '}
                                                {t('roles.labels.changes', {
                                                    added: formatNumber(
                                                        added,
                                                        0,
                                                    ),
                                                    removed: formatNumber(
                                                        removed,
                                                        0,
                                                    ),
                                                })}
                                            </span>
                                        </p>
                                        <div className="flex gap-2">
                                            <Button
                                                size="sm"
                                                variant="ghost"
                                                onClick={() =>
                                                    setDraft((previous) => ({
                                                        ...previous,
                                                        [role.slug]:
                                                            original[
                                                                role.slug
                                                            ] ?? [],
                                                    }))
                                                }
                                            >
                                                <Undo2
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                                {t('roles.actions.discard')}
                                            </Button>
                                            <Button
                                                size="sm"
                                                onClick={() => setSaving(role)}
                                            >
                                                <Save
                                                    className="size-4"
                                                    aria-hidden="true"
                                                />
                                                {t('roles.actions.save')}
                                            </Button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    ) : null}

                    {visibleGroups.length === 0 ? (
                        <InlineAlert tone="info">
                            {t('roles.labels.no_permissions')}
                        </InlineAlert>
                    ) : (
                        <div className="overflow-x-auto rounded-xl border bg-card shadow-card">
                            <table className="w-full min-w-max border-collapse text-sm">
                                <caption className="sr-only">
                                    {t('roles.title')}
                                </caption>
                                <thead>
                                    <tr className="border-b bg-muted/40">
                                        <th
                                            scope="col"
                                            className="sticky start-0 z-10 min-w-64 bg-muted px-3 py-2 text-start font-medium"
                                        >
                                            {t('roles.labels.permission')}
                                        </th>
                                        {roles.map((role) => (
                                            <th
                                                key={role.slug}
                                                scope="col"
                                                className="px-2 py-2 text-center text-xs font-medium whitespace-nowrap"
                                            >
                                                <span className="inline-flex items-center gap-1">
                                                    {role.is_super ? (
                                                        <Crown
                                                            className="size-3 text-warning"
                                                            aria-hidden="true"
                                                        />
                                                    ) : null}
                                                    {roleLabel(role)}
                                                </span>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {visibleGroups.map((group) => (
                                        <Fragment key={group.module}>
                                            <tr className="border-b bg-muted/20">
                                                <th
                                                    scope="colgroup"
                                                    colSpan={roles.length + 1}
                                                    className="sticky start-0 px-3 py-1.5 text-start text-xs font-semibold tracking-wide text-muted-foreground uppercase"
                                                >
                                                    {pick(group.label)}
                                                </th>
                                            </tr>
                                            {group.permissions.map(
                                                (permission) => (
                                                    <tr
                                                        key={permission.key}
                                                        className="border-b last:border-0 hover:bg-muted/30"
                                                    >
                                                        <th
                                                            scope="row"
                                                            className="sticky start-0 z-10 bg-card px-3 py-2 text-start font-normal"
                                                        >
                                                            <span className="block">
                                                                {pick(
                                                                    permission.label,
                                                                )}
                                                            </span>
                                                            <Code className="text-[0.7rem]">
                                                                {permission.key}
                                                            </Code>
                                                        </th>
                                                        {roles.map((role) => {
                                                            const checked = (
                                                                draft[
                                                                    role.slug
                                                                ] ?? []
                                                            ).includes(
                                                                permission.key,
                                                            );
                                                            const locked =
                                                                lockedReason(
                                                                    role,
                                                                    permission.key,
                                                                );
                                                            const changed =
                                                                checked !==
                                                                (
                                                                    original[
                                                                        role
                                                                            .slug
                                                                    ] ?? []
                                                                ).includes(
                                                                    permission.key,
                                                                );
                                                            const label = `${roleLabel(role)} — ${pick(permission.label)}`;
                                                            const box =
                                                                role.is_super ? (
                                                                    <Check
                                                                        className="mx-auto size-4 text-muted-foreground"
                                                                        aria-label={
                                                                            label
                                                                        }
                                                                    />
                                                                ) : (
                                                                    <Checkbox
                                                                        checked={
                                                                            checked
                                                                        }
                                                                        disabled={
                                                                            locked !==
                                                                            null
                                                                        }
                                                                        onCheckedChange={(
                                                                            value,
                                                                        ) =>
                                                                            setCell(
                                                                                role,
                                                                                permission.key,
                                                                                value ===
                                                                                    true,
                                                                            )
                                                                        }
                                                                        aria-label={
                                                                            label
                                                                        }
                                                                    />
                                                                );
                                                            return (
                                                                <td
                                                                    key={
                                                                        role.slug
                                                                    }
                                                                    className={
                                                                        changed
                                                                            ? 'bg-warning-soft/40 px-2 py-2 text-center'
                                                                            : 'px-2 py-2 text-center'
                                                                    }
                                                                >
                                                                    {locked &&
                                                                    !role.is_super ? (
                                                                        <Tooltip>
                                                                            <TooltipTrigger
                                                                                asChild
                                                                            >
                                                                                <span className="inline-flex">
                                                                                    {
                                                                                        box
                                                                                    }
                                                                                </span>
                                                                            </TooltipTrigger>
                                                                            <TooltipContent>
                                                                                {
                                                                                    locked
                                                                                }
                                                                            </TooltipContent>
                                                                        </Tooltip>
                                                                    ) : (
                                                                        box
                                                                    )}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                ),
                                            )}
                                        </Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            </div>

            <CreateRoleDialog open={creating} onOpenChange={setCreating} />

            <ConfirmDialog
                open={saving !== null}
                onOpenChange={(open) => (!open ? setSaving(null) : undefined)}
                title={t('roles.save_confirm.title', {
                    role: saving ? roleLabel(saving) : '',
                })}
                description={
                    saving
                        ? `${t('roles.save_confirm.description')} ${t('roles.labels.changes', { added: formatNumber(diff(saving).added, 0), removed: formatNumber(diff(saving).removed, 0) })}`
                        : undefined
                }
                confirmLabel={t('roles.actions.save')}
                requireReason
                reasonLabel={t('roles.fields.reason')}
                onConfirm={(reason) =>
                    new Promise<void>((resolve) => {
                        if (!saving) {
                            resolve();
                            return;
                        }
                        router.put(
                            savePermissions(saving.slug).url,
                            {
                                permissions: draft[saving.slug] ?? [],
                                reason: reason ?? '',
                            },
                            {
                                preserveScroll: true,
                                onFinish: () => {
                                    resolve();
                                    setSaving(null);
                                },
                            },
                        );
                    })
                }
            />

            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}
                title={t('roles.delete_confirm.title', {
                    role: deleting ? roleLabel(deleting) : '',
                })}
                description={t('roles.delete_confirm.description')}
                confirmLabel={t('roles.actions.delete')}
                destructive
                onConfirm={() =>
                    new Promise<void>((resolve) => {
                        if (!deleting) {
                            resolve();
                            return;
                        }
                        router.delete(destroy(deleting.slug).url, {
                            preserveScroll: true,
                            onFinish: () => {
                                resolve();
                                setDeleting(null);
                            },
                        });
                    })
                }
            />
        </>
    );
}

RolesIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: rolesIndex().url },
        { title: t('roles.title'), href: rolesIndex().url },
    ],
});
