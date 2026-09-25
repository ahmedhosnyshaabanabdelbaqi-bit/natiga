import {
  Alert,
  Badge,
  Button,
  Checkbox,
  Divider,
  Drawer,
  Group,
  Stack,
  Text,
  Textarea,
  Title,
} from '@mantine/core';
import { IconAlertTriangle, IconBan, IconUserCheck } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/auth/AuthContext';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { QueryState } from '@/components/StateViews';
import { formatDateTime } from '@/lib/format';
import { roleDescription, roleLabel, type AdminRole, type AdminUser } from '../api';
import { useRoles, useSetUserRoles, useSetUserStatus, useUser } from '../hooks';
import { SessionsSection } from './SessionsSection';
import { UserStatusBadge } from './UserStatusBadge';

function sameSet(a: readonly string[], b: readonly string[]) {
  return a.length === b.length && a.every((x) => b.includes(x));
}

function RolesEditor({
  user,
  roles,
  canManage,
  isSelf,
}: {
  user: AdminUser;
  roles: AdminRole[];
  canManage: boolean;
  isSelf: boolean;
}) {
  const { t, i18n } = useTranslation(['users', 'common']);
  const { user: me } = useAuth();
  const [selected, setSelected] = useState<string[]>(user.roles);
  const [base, setBase] = useState(user.roles);
  const mutation = useSetUserRoles();
  if (!sameSet(base, user.roles)) {
    setBase(user.roles);
    setSelected(user.roles);
  }
  const dirty = !sameSet(selected, user.roles);
  const iAmOwner = me?.roles.includes('owner') ?? false;
  const { can } = usePermissions();
  const canManageAdmins = can(PERMISSIONS.usersManageAdmins);
  // Server rules (cosmetic here): only owners touch owners; admins need users.manage_admins.
  const targetLocked =
    (user.roles.includes('owner') && !iAmOwner) ||
    (user.roles.includes('admin') && !canManageAdmins);

  return (
    <Stack gap="sm">
      <Title order={4}>{t('users:roles.title')}</Title>
      {isSelf ? (
        <Alert color="yellow" icon={<IconAlertTriangle aria-hidden />} variant="light">
          {t('users:roles.selfWarning')}
        </Alert>
      ) : null}
      <Checkbox.Group value={selected} onChange={setSelected} aria-label={t('users:roles.title')}>
        <Stack gap="xs">
          {roles.map((role) => {
            const ownerLocked = role.key === 'owner' && !iAmOwner;
            const adminLocked = role.key === 'admin' && !canManageAdmins;
            // Every account keeps the base `user` role (the server re-adds it).
            const baseRole = role.key === 'user';
            return (
              <Checkbox
                key={role.key}
                value={role.key}
                disabled={!canManage || targetLocked || ownerLocked || adminLocked || baseRole}
                label={
                  <Group gap={6}>
                    <span>{roleLabel(role, i18n.language)}</span>
                    <Text span size="xs" c="dimmed" dir="ltr">
                      {role.key}
                    </Text>
                  </Group>
                }
                description={
                  ownerLocked
                    ? t('users:roles.ownerOnly')
                    : adminLocked
                      ? t('users:roles.adminOnly')
                      : roleDescription(role, t)
                }
              />
            );
          })}
        </Stack>
      </Checkbox.Group>
      {targetLocked && canManage ? (
        <Text size="xs" c="dimmed">
          {t('users:roles.targetLocked')}
        </Text>
      ) : null}
      {canManage && !targetLocked ? (
        <Group justify="flex-end">
          <Button
            variant="default"
            disabled={!dirty || mutation.isPending}
            onClick={() => setSelected(user.roles)}
          >
            {t('common:actions.discard')}
          </Button>
          <Button
            disabled={!dirty}
            loading={mutation.isPending}
            onClick={() => mutation.mutate({ id: user.id, roles: selected })}
          >
            {t('users:roles.save')}
          </Button>
        </Group>
      ) : (
        <Text size="xs" c="dimmed">
          {t('users:readOnly')}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Mirrors the server rules for acting on an account (cosmetic only — the API
 * enforces them): owners are handled by owners, admins by holders of
 * users.manage_admins; listing their sessions follows the same rule.
 */
function useTargetAccess(user: AdminUser) {
  const { user: me } = useAuth();
  const { can } = usePermissions();
  const iAmOwner = me?.roles.includes('owner') ?? false;
  const privilegedLocked =
    (user.roles.includes('owner') && !iAmOwner) ||
    (user.roles.includes('admin') && !can(PERMISSIONS.usersManageAdmins));
  const isStaff = user.roles.some((r) => r !== 'user');
  return { privilegedLocked, isStaff };
}

function StatusSection({
  user,
  canManage,
  isSelf,
}: {
  user: AdminUser;
  canManage: boolean;
  isSelf: boolean;
}) {
  const { t } = useTranslation(['users', 'common']);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const mutation = useSetUserStatus();
  const suspended = user.status === 'suspended';
  const { can } = usePermissions();
  const { privilegedLocked, isStaff } = useTargetAccess(user);
  // users.block alone covers plain accounts; staff accounts need users.manage too.
  const staffLocked = isStaff && !can(PERMISSIONS.usersManage);
  const allowed = canManage && !privilegedLocked && !staffLocked;

  return (
    <Stack gap="sm">
      <Group justify="space-between">
        <Title order={4}>{t('users:status.title')}</Title>
        <UserStatusBadge status={user.status} />
      </Group>
      {canManage && !allowed ? (
        <Text size="xs" c="dimmed">
          {t(privilegedLocked ? 'users:status.privilegedLocked' : 'users:status.staffNeedsManage')}
        </Text>
      ) : null}
      {allowed ? (
        <Group>
          <Button
            variant="light"
            color={suspended ? 'teal' : 'red'}
            leftSection={
              suspended ? (
                <IconUserCheck size={16} aria-hidden />
              ) : (
                <IconBan size={16} aria-hidden />
              )
            }
            disabled={isSelf}
            onClick={() => setOpen(true)}
          >
            {t(suspended ? 'users:status.reactivate' : 'users:status.suspend')}
          </Button>
          {isSelf ? (
            <Text size="xs" c="dimmed">
              {t('users:status.cannotSuspendSelf')}
            </Text>
          ) : null}
        </Group>
      ) : null}
      <ConfirmDialog
        opened={open}
        onClose={() => {
          setOpen(false);
          setReason('');
        }}
        danger={!suspended}
        title={t(suspended ? 'users:status.reactivateTitle' : 'users:status.suspendTitle')}
        message={
          <Stack gap="sm">
            <Text size="sm">
              {t(suspended ? 'users:status.reactivateBody' : 'users:status.suspendBody', {
                name: user.displayName || user.email,
              })}
            </Text>
            {!suspended ? (
              <Textarea
                label={t('users:status.reason')}
                description={t('users:status.reasonHint')}
                value={reason}
                maxLength={500}
                onChange={(e) => setReason(e.currentTarget.value)}
              />
            ) : null}
          </Stack>
        }
        confirmLabel={t(suspended ? 'users:status.reactivate' : 'users:status.suspend')}
        onConfirm={() =>
          mutation.mutateAsync({
            id: user.id,
            status: suspended ? 'active' : 'suspended',
            ...(reason.trim() ? { reason: reason.trim() } : {}),
          })
        }
      />
    </Stack>
  );
}

/** Sessions of owners/admins (IPs, devices) are only listed for actors allowed to act on them. */
function SessionsBlock({ user, canManage }: { user: AdminUser; canManage: boolean }) {
  const { t } = useTranslation(['users']);
  const { privilegedLocked } = useTargetAccess(user);
  if (privilegedLocked) {
    return (
      <Stack gap="sm">
        <Title order={4}>{t('users:sessions.title')}</Title>
        <Text size="sm" c="dimmed">
          {t('users:sessions.hidden')}
        </Text>
      </Stack>
    );
  }
  return <SessionsSection userId={user.id} canManage={canManage} />;
}

export function UserDrawer({ userId, onClose }: { userId: string | null; onClose: () => void }) {
  const { t, i18n } = useTranslation(['users', 'common']);
  const { user: me } = useAuth();
  const { can } = usePermissions();
  const canManage = can(PERMISSIONS.usersManage);
  const canBlock = can(PERMISSIONS.usersBlock);
  const userQuery = useUser(userId);
  const roles = useRoles(!!userId);

  return (
    <Drawer
      opened={!!userId}
      onClose={onClose}
      // Mantine resolves `right` to the end side, i.e. the left edge in RTL.
      position="right"
      size="lg"
      title={<Text fw={700}>{t('users:drawer.title')}</Text>}
    >
      <QueryState query={userQuery}>
        {(user) => {
          const isSelf = me?.id === user.id;
          return (
            <Stack gap="lg">
              <Stack gap={4}>
                <Group gap="xs">
                  <Title order={3}>{user.displayName || user.email}</Title>
                  {isSelf ? <Badge variant="outline">{t('users:you')}</Badge> : null}
                </Group>
                <Text size="sm" dir="ltr" ta="start">
                  {user.email}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('users:createdOn', { date: formatDateTime(user.createdAt, i18n.language) })}
                  {' · '}
                  {user.lastLoginAt
                    ? t('users:lastLoginOn', {
                        date: formatDateTime(user.lastLoginAt, i18n.language),
                      })
                    : t('users:neverLoggedIn')}
                </Text>
              </Stack>
              <Divider />
              <QueryState query={roles}>
                {(roleList) => (
                  <RolesEditor user={user} roles={roleList} canManage={canManage} isSelf={isSelf} />
                )}
              </QueryState>
              <Divider />
              <StatusSection user={user} canManage={canBlock} isSelf={isSelf} />
              <Divider />
              <SessionsBlock user={user} canManage={canManage} />
            </Stack>
          );
        }}
      </QueryState>
    </Drawer>
  );
}
