import { Alert, Button, Checkbox, Group, Modal, ScrollArea, Stack, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { QueryState } from '@/components/StateViews';
import { roleLabel, type AdminPermission, type AdminRole } from '../api';
import { usePermissionCatalog, useSetRolePermissions } from '../hooks';

function groupCatalog(list: AdminPermission[]): [string, AdminPermission[]][] {
  const groups = new Map<string, AdminPermission[]>();
  for (const p of list) groups.set(p.group, [...(groups.get(p.group) ?? []), p]);
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function Editor({
  role,
  catalog,
  onClose,
}: {
  role: AdminRole;
  catalog: AdminPermission[];
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(['users', 'common']);
  const [selected, setSelected] = useState<string[]>(role.permissions);
  const save = useSetRolePermissions();
  const groups = useMemo(() => groupCatalog(catalog), [catalog]);
  const dirty =
    selected.length !== role.permissions.length ||
    selected.some((p) => !role.permissions.includes(p));
  const describe = (p: AdminPermission) =>
    (i18n.language === 'ar' ? p.descriptionAr : p.descriptionEn) ?? undefined;

  return (
    <Stack>
      <Text size="sm" c="dimmed">
        {t('users:rolesTab.editIntro')}
      </Text>
      <ScrollArea.Autosize mah="60vh" type="auto">
        <Stack gap="md">
          {groups.map(([group, perms]) => {
            const keys = perms.map((p) => p.key);
            const checkedCount = keys.filter((k) => selected.includes(k)).length;
            return (
              <Stack key={group} gap={6}>
                <Checkbox
                  label={
                    <Text fw={600} size="sm" dir="ltr" span>
                      {group}
                    </Text>
                  }
                  aria-label={`${t('users:rolesTab.groupAll')}: ${group}`}
                  checked={checkedCount === keys.length}
                  indeterminate={checkedCount > 0 && checkedCount < keys.length}
                  onChange={(e) => {
                    // Read the event now: the state updater runs after the handler returns.
                    const checked = e.currentTarget.checked;
                    setSelected((cur) =>
                      checked
                        ? [...new Set([...cur, ...keys])]
                        : cur.filter((k) => !keys.includes(k)),
                    );
                  }}
                />
                <Stack gap={4} ps="lg">
                  {perms.map((p) => (
                    <Checkbox
                      key={p.key}
                      size="xs"
                      label={
                        <Text span size="xs" dir="ltr">
                          {p.key}
                        </Text>
                      }
                      description={describe(p)}
                      checked={selected.includes(p.key)}
                      onChange={(e) => {
                        const checked = e.currentTarget.checked;
                        setSelected((cur) =>
                          checked ? [...cur, p.key] : cur.filter((k) => k !== p.key),
                        );
                      }}
                    />
                  ))}
                </Stack>
              </Stack>
            );
          })}
        </Stack>
      </ScrollArea.Autosize>
      <Group justify="space-between">
        <Text size="xs" c="dimmed">
          {t('users:rolesTab.selectedCount', { count: selected.length })} ·{' '}
          {roleLabel(role, i18n.language)}
        </Text>
        <Group>
          <Button variant="default" onClick={onClose}>
            {t('common:actions.cancel')}
          </Button>
          <Button
            disabled={!dirty}
            loading={save.isPending}
            onClick={() =>
              save.mutate(
                { key: role.key, permissions: [...selected].sort() },
                { onSuccess: onClose },
              )
            }
          >
            {t('users:rolesTab.savePermissions')}
          </Button>
        </Group>
      </Group>
    </Stack>
  );
}

/** Owner-only editor for a role's permission set (PUT /admin/roles/:key/permissions). */
export function RolePermissionsModal({
  role,
  onClose,
}: {
  role: AdminRole | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation('users');
  const catalog = usePermissionCatalog(!!role);
  return (
    <Modal
      opened={!!role}
      onClose={onClose}
      size="lg"
      title={role ? t('rolesTab.editTitle', { role: roleLabel(role, i18n.language) }) : ''}
    >
      {role && !role.permissionsEditable ? (
        <Alert icon={<IconInfoCircle aria-hidden />} color="gray">
          {t('rolesTab.notEditable')}
        </Alert>
      ) : role ? (
        <QueryState query={catalog}>
          {(list) => <Editor key={role.key} role={role} catalog={list} onClose={onClose} />}
        </QueryState>
      ) : null}
    </Modal>
  );
}
