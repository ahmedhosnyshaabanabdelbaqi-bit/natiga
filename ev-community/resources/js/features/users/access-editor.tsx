import { Crown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import {
    Tooltip,
    TooltipContent,
    TooltipTrigger,
} from '@/components/ui/tooltip';
import { pick } from '@/features/system/i18n';
import { roleName } from '@/features/users/role-badges';
import type { PermissionGroup, RoleOption } from '@/features/users/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

type Props = {
    roles: RoleOption[];
    permissionGroups: PermissionGroup[];
    selectedRoles: string[];
    selectedPermissions: string[];
    onRolesChange: (roles: string[]) => void;
    onPermissionsChange: (permissions: string[]) => void;
    actorIsSuper: boolean;
    /** Roles/permissions the target already has: removing them is allowed even when the actor could not grant them. */
    originalRoles?: string[];
    originalPermissions?: string[];
    disabled?: boolean;
    rolesError?: string;
    permissionsError?: string;
};

function toggle(list: string[], value: string, on: boolean): string[] {
    return on
        ? Array.from(new Set([...list, value]))
        : list.filter((item) => item !== value);
}

/**
 * Role + direct-permission picker. Items the actor may not grant are disabled with an explanation; the server
 * (UserAccessRules) enforces the same rules and records blocked attempts as security events.
 */
export function AccessEditor({
    roles,
    permissionGroups,
    selectedRoles,
    selectedPermissions,
    onRolesChange,
    onPermissionsChange,
    actorIsSuper,
    originalRoles = [],
    originalPermissions = [],
    disabled = false,
    rolesError,
    permissionsError,
}: Props) {
    const [query, setQuery] = useState('');
    const needle = query.trim().toLowerCase();
    const groups = useMemo(
        () =>
            permissionGroups
                .map((group) => ({
                    ...group,
                    permissions: group.permissions.filter(
                        (permission) =>
                            needle === '' ||
                            permission.key.toLowerCase().includes(needle) ||
                            permission.label.ar
                                .toLowerCase()
                                .includes(needle) ||
                            permission.label.en.toLowerCase().includes(needle),
                    ),
                }))
                .filter((group) => group.permissions.length > 0),
        [permissionGroups, needle],
    );

    const roleLocked = (role: RoleOption): string | null => {
        if (role.is_super && !actorIsSuper) {
            return t('users.labels.super_only');
        }
        if (role.grantable === false && !originalRoles.includes(role.slug)) {
            return t('users.labels.not_grantable');
        }
        return null;
    };

    return (
        <div className="grid gap-6">
            <fieldset
                className="grid gap-3"
                aria-describedby={rolesError ? 'access-roles-error' : undefined}
            >
                <legend className="mb-1 text-sm font-medium">
                    {t('users.fields.roles')}
                </legend>
                <div className="grid gap-2 sm:grid-cols-2">
                    {roles.map((role) => {
                        const locked = roleLocked(role);
                        const checked = selectedRoles.includes(role.slug);
                        const id = `role-${role.slug}`;
                        const row = (
                            <label
                                htmlFor={id}
                                className="flex cursor-pointer items-start gap-3 rounded-lg border p-3 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-60 has-[[data-state=checked]]:border-brand/50 has-[[data-state=checked]]:bg-brand-soft/20"
                            >
                                <Checkbox
                                    id={id}
                                    checked={checked}
                                    disabled={disabled || locked !== null}
                                    onCheckedChange={(value) =>
                                        onRolesChange(
                                            toggle(
                                                selectedRoles,
                                                role.slug,
                                                value === true,
                                            ),
                                        )
                                    }
                                    className="mt-0.5"
                                />
                                <span className="grid min-w-0 gap-0.5">
                                    <span className="flex flex-wrap items-center gap-1.5 text-sm font-medium">
                                        {role.is_super ? (
                                            <Crown
                                                className="size-3.5 text-warning"
                                                aria-hidden="true"
                                            />
                                        ) : null}
                                        {roleName(role.slug, roles)}
                                    </span>
                                    <span className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                                        <Code className="text-[0.7rem]">
                                            {role.slug}
                                        </Code>
                                        <span>
                                            {t(
                                                `users.labels.portal_${role.portal === 'partner' ? 'partner' : role.portal === 'member' ? 'member' : 'admin'}`,
                                            )}
                                        </span>
                                    </span>
                                </span>
                            </label>
                        );
                        return locked ? (
                            <Tooltip key={role.slug}>
                                <TooltipTrigger asChild>
                                    <div>{row}</div>
                                </TooltipTrigger>
                                <TooltipContent>{locked}</TooltipContent>
                            </Tooltip>
                        ) : (
                            <div key={role.slug}>{row}</div>
                        );
                    })}
                </div>
                {rolesError ? (
                    <p
                        id="access-roles-error"
                        role="alert"
                        className="text-sm text-danger"
                    >
                        {rolesError}
                    </p>
                ) : null}
            </fieldset>

            <fieldset
                className="grid gap-3"
                aria-describedby={
                    permissionsError
                        ? 'access-permissions-error'
                        : 'access-permissions-hint'
                }
            >
                <legend className="mb-1 flex flex-wrap items-center gap-2 text-sm font-medium">
                    {t('users.fields.permissions')}
                    {selectedPermissions.length > 0 ? (
                        <Badge variant="secondary">
                            {t('users.labels.selected_count', {
                                count: formatNumber(
                                    selectedPermissions.length,
                                    0,
                                ),
                            })}
                        </Badge>
                    ) : null}
                </legend>
                <p
                    id="access-permissions-hint"
                    className="text-xs text-muted-foreground"
                >
                    {t('users.labels.direct_hint')}
                </p>
                <div className="relative sm:max-w-sm">
                    <Search
                        className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                        aria-hidden="true"
                    />
                    <Input
                        type="search"
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder={t('users.labels.search_permissions')}
                        aria-label={t('users.labels.search_permissions')}
                        className="ps-9"
                    />
                </div>
                <div className="grid max-h-[28rem] gap-4 overflow-y-auto rounded-lg border p-3">
                    {groups.length === 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('roles.labels.no_permissions')}
                        </p>
                    ) : null}
                    {groups.map((group) => (
                        <div key={group.module} className="grid gap-2">
                            <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                                {pick(group.label)}
                            </p>
                            <div className="grid gap-1.5 sm:grid-cols-2">
                                {group.permissions.map((permission) => {
                                    const checked =
                                        selectedPermissions.includes(
                                            permission.key,
                                        );
                                    const locked =
                                        permission.grantable === false &&
                                        !originalPermissions.includes(
                                            permission.key,
                                        );
                                    const id = `perm-${permission.key.replace(/[^a-z0-9]+/gi, '-')}`;
                                    return (
                                        <label
                                            key={permission.key}
                                            htmlFor={id}
                                            title={
                                                locked
                                                    ? t(
                                                          'users.labels.not_grantable',
                                                      )
                                                    : undefined
                                            }
                                            className="flex cursor-pointer items-start gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted/50 has-[[data-disabled]]:cursor-not-allowed has-[[data-disabled]]:opacity-60"
                                        >
                                            <Checkbox
                                                id={id}
                                                checked={checked}
                                                disabled={disabled || locked}
                                                onCheckedChange={(value) =>
                                                    onPermissionsChange(
                                                        toggle(
                                                            selectedPermissions,
                                                            permission.key,
                                                            value === true,
                                                        ),
                                                    )
                                                }
                                                className="mt-0.5"
                                            />
                                            <span className="grid min-w-0">
                                                <span>
                                                    {pick(permission.label)}
                                                </span>
                                                <Code className="w-fit text-[0.7rem]">
                                                    {permission.key}
                                                </Code>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </div>
                {permissionsError ? (
                    <p
                        id="access-permissions-error"
                        role="alert"
                        className="text-sm text-danger"
                    >
                        {permissionsError}
                    </p>
                ) : null}
            </fieldset>
        </div>
    );
}
