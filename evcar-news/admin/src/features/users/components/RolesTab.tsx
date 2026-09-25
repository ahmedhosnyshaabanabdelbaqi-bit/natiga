import { Badge, Button, Card, Group, SimpleGrid, Stack, Text, Title } from '@mantine/core';
import { IconEdit, IconLock, IconUsers } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/app/auth/AuthContext';
import { usePermissions } from '@/app/auth/usePermissions';
import { PERMISSIONS } from '@/app/permissions';
import { EmptyState, QueryState } from '@/components/StateViews';
import { groupPermissions, roleDescription, roleLabel, type AdminRole } from '../api';
import { useRoles } from '../hooks';
import { RolePermissionsModal } from './RolePermissionsModal';

/**
 * Built-in roles and their permissions (seeded by the backend,
 * src/cli/seed-data/rbac.ts). Owners with `roles.manage` can change a role's
 * permission set (the server enforces both); assigning roles to users happens
 * in the user drawer.
 */
export function RolesTab({ onShowUsers }: { onShowUsers: (roleKey: string) => void }) {
  const { t, i18n } = useTranslation(['users', 'common']);
  const roles = useRoles();
  const { user } = useAuth();
  const { can } = usePermissions();
  const canEdit = can(PERMISSIONS.rolesManage) && (user?.roles.includes('owner') ?? false);
  const [editing, setEditing] = useState<AdminRole | null>(null);
  return (
    <Stack>
      <RolePermissionsModal role={editing} onClose={() => setEditing(null)} />
      <Text size="sm" c="dimmed">
        {t('users:rolesTab.intro')}
      </Text>
      <QueryState query={roles} isEmpty={(r) => r.length === 0} empty={<EmptyState />}>
        {(list) => (
          <SimpleGrid cols={{ base: 1, md: 2 }}>
            {list.map((role) => (
              <Card key={role.key} withBorder radius="md" padding="md">
                <Stack gap="xs">
                  <Group justify="space-between" wrap="nowrap">
                    <Group gap={6}>
                      <Title order={4}>{roleLabel(role, i18n.language)}</Title>
                      <Text size="xs" c="dimmed" dir="ltr">
                        {role.key}
                      </Text>
                    </Group>
                    {role.isSystem ? (
                      <Badge
                        variant="outline"
                        color="gray"
                        leftSection={<IconLock size={10} aria-hidden />}
                      >
                        {t('users:rolesTab.system')}
                      </Badge>
                    ) : null}
                  </Group>
                  {roleDescription(role, t) ? (
                    <Text size="sm" c="dimmed" dir="auto">
                      {roleDescription(role, t)}
                    </Text>
                  ) : null}
                  <Text size="xs" fw={600}>
                    {t('users:rolesTab.permissions', { count: role.permissions.length })}
                  </Text>
                  <Stack gap={4}>
                    {groupPermissions(role.permissions).map(([group, actions]) => (
                      <Group key={group} gap={4} align="flex-start" wrap="wrap">
                        <Text size="xs" fw={600} w={110} dir="ltr" ta="start">
                          {group}
                        </Text>
                        {actions.map((a) => (
                          <Badge key={a} size="xs" variant="light" color="gray" tt="none" dir="ltr">
                            {a}
                          </Badge>
                        ))}
                      </Group>
                    ))}
                  </Stack>
                  <Group justify="flex-end">
                    {canEdit && role.permissionsEditable ? (
                      <Button
                        size="xs"
                        variant="light"
                        leftSection={<IconEdit size={14} aria-hidden />}
                        onClick={() => setEditing(role)}
                      >
                        {t('users:rolesTab.editPermissions')}
                      </Button>
                    ) : null}
                    <Button
                      size="xs"
                      variant="subtle"
                      leftSection={<IconUsers size={14} aria-hidden />}
                      onClick={() => onShowUsers(role.key)}
                    >
                      {t('users:rolesTab.showUsersCount', { count: role.userCount })}
                    </Button>
                  </Group>
                </Stack>
              </Card>
            ))}
          </SimpleGrid>
        )}
      </QueryState>
    </Stack>
  );
}
