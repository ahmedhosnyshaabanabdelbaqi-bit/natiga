import { Head, Link, router, useForm } from '@inertiajs/react';
import {
    Crown,
    KeyRound,
    LogOut,
    Pencil,
    RotateCcw,
    Save,
    ShieldCheck,
    ShieldOff,
    UserCheck,
    UserX,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import { Label } from '@/components/ui/label';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { securityEventLabel, severityTone, tOr } from '@/features/system/i18n';
import { MetaSummary } from '@/features/system/meta-summary';
import { PageErrors } from '@/features/system/page-errors';
import { SessionsList } from '@/features/system/sessions-list';
import type { SecurityEventRow, SessionRow } from '@/features/system/types';
import { AccessEditor } from '@/features/users/access-editor';
import { RoleBadges } from '@/features/users/role-badges';
import type { StaffUserDetail, UserFormProps } from '@/features/users/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import {
    access,
    disable,
    edit,
    index as usersIndex,
    reactivate,
    resetAccess,
    show,
} from '@/routes/admin/users';
import {
    destroy as destroySession,
    destroyAll,
} from '@/routes/admin/users/sessions';

type Props = UserFormProps & {
    user: StaffUserDetail;
    loginHistory: SecurityEventRow[];
    securityEvents: SecurityEventRow[];
    sessions: SessionRow[];
    sessionsSupported: boolean;
    can: {
        update: boolean;
        change_access: boolean;
        disable: boolean;
        reactivate: boolean;
        reset_access: boolean;
        manage_sessions: boolean;
    };
    isSelf: boolean;
};

type AccessForm = { roles: string[]; permissions: string[] };

function eventColumns(
    withSeverity: boolean,
): DataTableColumn<SecurityEventRow>[] {
    const columns: DataTableColumn<SecurityEventRow>[] = [
        {
            key: 'created_at',
            header: t('users.labels.when'),
            required: true,
            cell: (event) => <DateTime value={event.created_at} />,
        },
        {
            key: 'type',
            header: t('users.labels.event'),
            cell: (event) => securityEventLabel(event.type),
        },
    ];
    if (withSeverity) {
        columns.push({
            key: 'severity',
            header: t('audit.security.columns.severity'),
            cell: (event) => (
                <StatusBadge
                    status={event.severity}
                    tone={severityTone(event.severity)}
                    label={tOr(
                        `audit.security.severity.${event.severity}`,
                        event.severity,
                    )}
                />
            ),
        });
    }
    columns.push(
        {
            key: 'ip_address',
            header: t('users.labels.ip'),
            cell: (event) => <span dir="ltr">{event.ip_address ?? '—'}</span>,
        },
        {
            key: 'meta',
            header: t('users.labels.details'),
            hideOnMobile: true,
            cell: (event) => <MetaSummary meta={event.meta} limit={4} />,
        },
        {
            key: 'user_agent',
            header: t('users.labels.device'),
            defaultHidden: true,
            cell: (event) => (
                <span
                    className="block max-w-64 truncate text-xs"
                    dir="ltr"
                    title={event.user_agent ?? undefined}
                >
                    {event.user_agent ?? '—'}
                </span>
            ),
        },
    );
    return columns;
}

function ResetAccessDialog({
    user,
    open,
    onOpenChange,
}: {
    user: StaffUserDetail;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const form = useForm({ reset_mfa: false, reason: '' });
    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!form.processing) {
                    if (!next) {
                        form.reset();
                        form.clearErrors();
                    }
                    onOpenChange(next);
                }
            }}
        >
            <DialogContent>
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(resetAccess(user.id), {
                            preserveScroll: true,
                            onSuccess: () => onOpenChange(false),
                        });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {t('users.reset_access.title', { name: user.name })}
                        </DialogTitle>
                        <DialogDescription>
                            {t('users.reset_access.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="flex items-start gap-3">
                        <Checkbox
                            id="reset-mfa"
                            checked={form.data.reset_mfa}
                            onCheckedChange={(checked) =>
                                form.setData('reset_mfa', checked === true)
                            }
                            className="mt-0.5"
                            disabled={!user.mfa_enabled}
                        />
                        <div className="grid gap-1">
                            <Label htmlFor="reset-mfa">
                                {t('users.reset_access.reset_mfa')}
                            </Label>
                            <p className="text-xs text-muted-foreground">
                                {user.mfa_enabled
                                    ? t('users.reset_access.reset_mfa_hint')
                                    : t('users.mfa.disabled')}
                            </p>
                        </div>
                    </div>
                    <FormField
                        label={t('users.fields.reason')}
                        required={form.data.reset_mfa}
                        optional={!form.data.reset_mfa}
                        error={form.errors.reason}
                    >
                        <Textarea
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                            rows={3}
                            maxLength={500}
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            variant="destructive"
                            disabled={
                                form.processing ||
                                (form.data.reset_mfa &&
                                    form.data.reason.trim().length < 5)
                            }
                        >
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <KeyRound
                                    className="size-4"
                                    aria-hidden="true"
                                />
                            )}
                            {t('users.reset_access.submit')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

function AccessTab({
    user,
    roles,
    permissionGroups,
    actorIsSuper,
    can,
    isSelf,
}: Props) {
    const currentRoles = user.roles.filter((role) => role !== 'member');
    const form = useForm<AccessForm>({
        roles: currentRoles,
        permissions: user.direct_permissions,
    });
    const [confirming, setConfirming] = useState(false);
    const errors = form.errors as Record<string, string | undefined>;
    const superLocked = user.is_super && !actorIsSuper;

    return (
        <div className="grid gap-4">
            {!user.is_staff_account ? (
                <InlineAlert tone="info">
                    {t('users.labels.not_staff')}
                </InlineAlert>
            ) : null}
            {isSelf ? (
                <InlineAlert tone="info">
                    {t('users.labels.own_access_locked')}
                </InlineAlert>
            ) : null}
            {superLocked && !isSelf ? (
                <InlineAlert tone="warning">
                    {t('users.labels.super_target_locked')}
                </InlineAlert>
            ) : null}
            {can.change_access ? (
                <SectionCard>
                    <form
                        className="grid gap-5"
                        onSubmit={(event) => {
                            event.preventDefault();
                            setConfirming(true);
                        }}
                    >
                        <AccessEditor
                            roles={roles}
                            permissionGroups={permissionGroups}
                            selectedRoles={form.data.roles}
                            selectedPermissions={form.data.permissions}
                            onRolesChange={(value) =>
                                form.setData('roles', value)
                            }
                            onPermissionsChange={(value) =>
                                form.setData('permissions', value)
                            }
                            actorIsSuper={actorIsSuper}
                            originalRoles={currentRoles}
                            originalPermissions={user.direct_permissions}
                            rolesError={errors.roles}
                            permissionsError={errors.permissions}
                        />
                        {errors.reason ? (
                            <InlineAlert tone="danger">
                                {errors.reason}
                            </InlineAlert>
                        ) : null}
                        {errors.domain ? (
                            <InlineAlert tone="danger">
                                {errors.domain}
                            </InlineAlert>
                        ) : null}
                        <div className="flex justify-end gap-2">
                            <Button
                                type="button"
                                variant="ghost"
                                onClick={() => form.reset()}
                                disabled={!form.isDirty || form.processing}
                            >
                                <RotateCcw
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('core.actions.reset')}
                            </Button>
                            <Button
                                type="submit"
                                disabled={!form.isDirty || form.processing}
                            >
                                {form.processing ? (
                                    <Spinner />
                                ) : (
                                    <Save
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                )}
                                {t('users.actions.save_access')}
                            </Button>
                        </div>
                    </form>
                    <ConfirmDialog
                        open={confirming}
                        onOpenChange={setConfirming}
                        title={t('users.access_confirm.title', {
                            name: user.name,
                        })}
                        description={t('users.access_confirm.description')}
                        confirmLabel={t('users.actions.save_access')}
                        processing={form.processing}
                        requireReason
                        reasonLabel={t('users.labels.change_note')}
                        onConfirm={(reason) => {
                            form.transform((data) => ({
                                ...data,
                                reason: reason ?? '',
                            }));
                            form.submit(access(user.id), {
                                preserveScroll: true,
                                onFinish: () => setConfirming(false),
                                onSuccess: () => form.setDefaults(),
                            });
                        }}
                    />
                </SectionCard>
            ) : (
                <SectionCard title={t('users.tabs.access')}>
                    <DescriptionList
                        columns={1}
                        items={[
                            {
                                label: t('users.fields.roles'),
                                value: (
                                    <RoleBadges
                                        slugs={user.roles}
                                        roles={roles}
                                    />
                                ),
                            },
                            {
                                label: t('users.fields.permissions'),
                                value:
                                    user.direct_permissions.length > 0 ? (
                                        <span className="flex flex-wrap gap-1">
                                            {user.direct_permissions.map(
                                                (permission) => (
                                                    <Code key={permission}>
                                                        {permission}
                                                    </Code>
                                                ),
                                            )}
                                        </span>
                                    ) : (
                                        t('users.labels.none')
                                    ),
                            },
                        ]}
                    />
                </SectionCard>
            )}
            <SectionCard
                title={t('users.labels.effective_permissions')}
                description={
                    user.is_super
                        ? t('users.labels.super_has_all')
                        : t('users.labels.permission_count', {
                              count: formatNumber(
                                  user.effective_permissions.length,
                                  0,
                              ),
                          })
                }
            >
                {user.effective_permissions.length > 0 ? (
                    <div className="flex max-h-64 flex-wrap gap-1 overflow-y-auto">
                        {user.effective_permissions.map((permission) => (
                            <Code key={permission} className="text-[0.7rem]">
                                {permission}
                            </Code>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">
                        {t('users.labels.none')}
                    </p>
                )}
            </SectionCard>
        </div>
    );
}

export default function UsersShow(props: Props) {
    const {
        user,
        loginHistory,
        securityEvents,
        sessions,
        sessionsSupported,
        can,
        isSelf,
        roles,
    } = props;
    const [dialog, setDialog] = useState<
        'disable' | 'reactivate' | 'reset' | 'logout_all' | null
    >(null);
    const [revoking, setRevoking] = useState<SessionRow | null>(null);

    const post = (url: string, data: Record<string, string>) =>
        new Promise<void>((resolve) => {
            router.post(url, data, {
                preserveScroll: true,
                onFinish: () => {
                    resolve();
                    setDialog(null);
                },
            });
        });

    const remove = (url: string, after: () => void) =>
        new Promise<void>((resolve) => {
            router.delete(url, {
                preserveScroll: true,
                onFinish: () => {
                    resolve();
                    after();
                },
            });
        });

    const disabled = user.status === 'disabled';

    return (
        <>
            <Head title={user.name} />
            <div className="grid gap-6">
                <PageHeader
                    title={user.name}
                    actions={
                        <>
                            {can.update ? (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={edit(user.id).url}>
                                        <Pencil
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                        {t('users.actions.edit')}
                                    </Link>
                                </Button>
                            ) : null}
                            {can.reset_access ? (
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setDialog('reset')}
                                >
                                    <KeyRound
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('users.actions.reset_access')}
                                </Button>
                            ) : null}
                            {disabled && can.reactivate ? (
                                <Button
                                    size="sm"
                                    onClick={() => setDialog('reactivate')}
                                >
                                    <UserCheck
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('users.actions.reactivate')}
                                </Button>
                            ) : null}
                            {!disabled && can.disable ? (
                                <Button
                                    variant="destructive"
                                    size="sm"
                                    onClick={() => setDialog('disable')}
                                >
                                    <UserX
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('users.actions.disable')}
                                </Button>
                            ) : null}
                        </>
                    }
                >
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="text-muted-foreground" dir="ltr">
                            {user.email}
                        </span>
                        <StatusBadge
                            status={user.status}
                            label={t(
                                `users.status.${disabled ? 'disabled' : 'active'}`,
                            )}
                        />
                        {user.is_super ? (
                            <Badge className="gap-1">
                                <Crown className="size-3" aria-hidden="true" />
                                {t('users.labels.super')}
                            </Badge>
                        ) : null}
                        {isSelf ? (
                            <Badge variant="outline">
                                {t('users.labels.self')}
                            </Badge>
                        ) : null}
                        {user.mfa_enabled ? (
                            <span className="inline-flex items-center gap-1 text-success">
                                <ShieldCheck
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('users.mfa.enabled')}
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-warning">
                                <ShieldOff
                                    className="size-4"
                                    aria-hidden="true"
                                />
                                {t('users.mfa.disabled')}
                            </span>
                        )}
                    </div>
                </PageHeader>

                <PageErrors
                    ignore={['roles', 'permissions', 'reason', 'domain']}
                />

                <Tabs defaultValue="profile" className="gap-4">
                    <TabsList className="w-full justify-start sm:w-fit">
                        <TabsTrigger value="profile">
                            {t('users.tabs.profile')}
                        </TabsTrigger>
                        <TabsTrigger value="access">
                            {t('users.tabs.access')}
                        </TabsTrigger>
                        <TabsTrigger value="logins">
                            {t('users.tabs.logins')}
                        </TabsTrigger>
                        <TabsTrigger value="security">
                            {t('users.tabs.security')}
                        </TabsTrigger>
                        {can.manage_sessions ? (
                            <TabsTrigger value="sessions">
                                {t('users.tabs.sessions')}
                            </TabsTrigger>
                        ) : null}
                    </TabsList>

                    <TabsContent value="profile">
                        <SectionCard>
                            <DescriptionList
                                items={[
                                    {
                                        label: t('users.fields.name'),
                                        value: user.name,
                                    },
                                    {
                                        label: t('users.fields.email'),
                                        value: (
                                            <span dir="ltr">{user.email}</span>
                                        ),
                                    },
                                    {
                                        label: t('users.fields.mobile'),
                                        value: user.mobile ? (
                                            <span dir="ltr">{user.mobile}</span>
                                        ) : null,
                                    },
                                    {
                                        label: t(
                                            'users.fields.preferred_locale',
                                        ),
                                        value: tOr(
                                            `users.locales.${user.preferred_locale}`,
                                            user.preferred_locale,
                                        ),
                                    },
                                    {
                                        label: t(
                                            'users.labels.email_verification',
                                        ),
                                        value: user.email_verified_at ? (
                                            <span>
                                                {t(
                                                    'users.labels.email_verified',
                                                )}{' '}
                                                ·{' '}
                                                <DateTime
                                                    value={
                                                        user.email_verified_at
                                                    }
                                                    mode="date"
                                                />
                                            </span>
                                        ) : (
                                            t('users.labels.email_unverified')
                                        ),
                                    },
                                    {
                                        label: t('users.fields.roles'),
                                        value: (
                                            <RoleBadges
                                                slugs={user.roles}
                                                roles={roles}
                                            />
                                        ),
                                    },
                                    {
                                        label: t('users.fields.created_at'),
                                        value: user.created_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t('users.fields.last_login_at'),
                                        value: user.last_login_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t('users.labels.last_login_ip'),
                                        value: user.last_login_ip,
                                        type: 'code',
                                    },
                                    {
                                        label: t(
                                            'users.labels.password_changed_at',
                                        ),
                                        value: user.password_changed_at,
                                        type: 'datetime',
                                    },
                                    {
                                        label: t('users.labels.disabled_at'),
                                        value: user.disabled_at,
                                        type: 'datetime',
                                        hidden: !disabled,
                                    },
                                    {
                                        label: t('users.labels.disabled_by'),
                                        value: user.disabled_by,
                                        hidden: !disabled,
                                    },
                                ]}
                            />
                        </SectionCard>
                    </TabsContent>

                    <TabsContent value="access">
                        <AccessTab {...props} />
                    </TabsContent>

                    <TabsContent value="logins">
                        <DataTable
                            id="admin-user-logins"
                            columns={eventColumns(false)}
                            data={loginHistory}
                            rowKey="id"
                            columnToggle={false}
                            emptyTitle={t('users.events.empty')}
                            caption={t('users.tabs.logins')}
                        />
                    </TabsContent>

                    <TabsContent value="security">
                        <DataTable
                            id="admin-user-security"
                            columns={eventColumns(true)}
                            data={securityEvents}
                            rowKey="id"
                            columnToggle={false}
                            emptyTitle={t('users.events.empty')}
                            caption={t('users.tabs.security')}
                        />
                    </TabsContent>

                    {can.manage_sessions ? (
                        <TabsContent value="sessions">
                            <div className="grid gap-3">
                                {!sessionsSupported ? (
                                    <InlineAlert tone="info">
                                        {t('users.sessions.unsupported')}
                                    </InlineAlert>
                                ) : (
                                    <>
                                        {sessions.length > 0 ? (
                                            <div className="flex justify-end">
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() =>
                                                        setDialog('logout_all')
                                                    }
                                                >
                                                    <LogOut
                                                        className="size-4 rtl:rotate-180"
                                                        aria-hidden="true"
                                                    />
                                                    {t(
                                                        'users.actions.logout_all',
                                                    )}
                                                </Button>
                                            </div>
                                        ) : null}
                                        <SessionsList
                                            sessions={sessions}
                                            onRevoke={setRevoking}
                                            emptyText={t(
                                                'users.sessions.empty',
                                            )}
                                        />
                                    </>
                                )}
                            </div>
                        </TabsContent>
                    ) : null}
                </Tabs>
            </div>

            <ConfirmDialog
                open={dialog === 'disable'}
                onOpenChange={(open) => setDialog(open ? 'disable' : null)}
                title={t('users.disable.title', { name: user.name })}
                description={t('users.disable.description')}
                confirmLabel={t('users.actions.disable')}
                destructive
                requireReason
                onConfirm={(reason) =>
                    post(disable(user.id).url, { reason: reason ?? '' })
                }
            />
            <ConfirmDialog
                open={dialog === 'reactivate'}
                onOpenChange={(open) => setDialog(open ? 'reactivate' : null)}
                title={t('users.reactivate.title', { name: user.name })}
                description={t('users.reactivate.description')}
                confirmLabel={t('users.actions.reactivate')}
                requireReason
                onConfirm={(reason) =>
                    post(reactivate(user.id).url, { reason: reason ?? '' })
                }
            />
            <ConfirmDialog
                open={dialog === 'logout_all'}
                onOpenChange={(open) => setDialog(open ? 'logout_all' : null)}
                title={t('users.logout_all.title', { name: user.name })}
                description={t('users.logout_all.description')}
                confirmLabel={t('users.actions.logout_all')}
                destructive
                onConfirm={() =>
                    remove(destroyAll(user.id).url, () => setDialog(null))
                }
            />
            <ConfirmDialog
                open={revoking !== null}
                onOpenChange={(open) => (!open ? setRevoking(null) : undefined)}
                title={t('users.revoke_session.title')}
                description={t('users.revoke_session.description')}
                confirmLabel={t('users.actions.revoke')}
                destructive
                onConfirm={() =>
                    revoking
                        ? remove(
                              destroySession({
                                  user: user.id,
                                  session: revoking.id,
                              }).url,
                              () => setRevoking(null),
                          )
                        : undefined
                }
            />
            {can.reset_access ? (
                <ResetAccessDialog
                    user={user}
                    open={dialog === 'reset'}
                    onOpenChange={(open) => setDialog(open ? 'reset' : null)}
                />
            ) : null}
        </>
    );
}

UsersShow.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('users.title'), href: usersIndex().url },
        { title: props.user.name, href: show(props.user.id).url },
    ],
});
