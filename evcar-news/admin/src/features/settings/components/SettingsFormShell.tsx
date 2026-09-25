import { Alert, Badge, Button, Group, List, Stack, Text } from '@mantine/core';
import { IconAlertTriangle, IconEye, IconEyeOff, IconRestore } from '@tabler/icons-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FormActions, FormSection } from '@/components/FormFields';
import { useUnsavedChangesGuard } from '@/components/formUtils';
import { formatDateTime } from '@/lib/format';
import type { SettingKey, SettingRecord } from '../api';
import { useResetSetting } from '../hooks';

/**
 * Common frame of a settings tab: title, public/private badge, server
 * warnings, save bar, "restore default" and the unsaved-changes guard.
 */
export function SettingsFormShell({
  title,
  description,
  records,
  settingKey,
  dirty,
  submitting,
  canWrite,
  onSubmit,
  onReset,
  children,
}: {
  title: string;
  description?: string;
  records: (SettingRecord | undefined)[];
  /** Enables "restore default" (POST /admin/settings/:key/reset). */
  settingKey?: SettingKey;
  dirty: boolean;
  submitting: boolean;
  canWrite: boolean;
  onSubmit: (e?: FormEvent<HTMLFormElement>) => void;
  onReset: () => void;
  children: ReactNode;
}) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const [confirmReset, setConfirmReset] = useState(false);
  const reset = useResetSetting();
  useUnsavedChangesGuard(dirty && canWrite);
  const present = records.filter((r): r is SettingRecord => !!r);
  const isPublic = present.some((r) => r.isPublic);
  const updatedAt = present
    .map((r) => r.updatedAt)
    .filter((d): d is string => !!d)
    .sort()
    .at(-1);
  const warnings = [...new Set(present.flatMap((r) => r.warnings))];
  const canRestore = canWrite && !!settingKey && present.some((r) => !r.isDefault);

  return (
    <form onSubmit={onSubmit} noValidate>
      <Stack>
        <FormSection
          title={
            <Group gap="xs">
              <span>{title}</span>
              {present.length > 0 ? (
                <Badge
                  size="sm"
                  variant="light"
                  color={isPublic ? 'blue' : 'gray'}
                  leftSection={
                    isPublic ? (
                      <IconEye size={12} aria-hidden />
                    ) : (
                      <IconEyeOff size={12} aria-hidden />
                    )
                  }
                >
                  {t(isPublic ? 'settings:publicBadge' : 'settings:privateBadge')}
                </Badge>
              ) : null}
            </Group>
          }
          description={description}
        >
          {warnings.length > 0 ? (
            <Alert
              color="yellow"
              variant="light"
              icon={<IconAlertTriangle aria-hidden />}
              title={t('settings:warnings.title')}
            >
              <List size="sm" spacing={2}>
                {warnings.map((w) => (
                  <List.Item key={w}>
                    {t(`settings:warnings.codes.${w}`, { defaultValue: w })}
                  </List.Item>
                ))}
              </List>
            </Alert>
          ) : null}
          <fieldset
            disabled={!canWrite || submitting}
            style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}
          >
            <Stack>{children}</Stack>
          </fieldset>
          {updatedAt ? (
            <Text size="xs" c="dimmed">
              {t('settings:lastUpdated', { date: formatDateTime(updatedAt, i18n.language) })}
            </Text>
          ) : null}
        </FormSection>
        {canWrite ? (
          <Group justify="space-between" align="flex-start">
            {canRestore ? (
              <Button
                type="button"
                variant="subtle"
                color="gray"
                leftSection={<IconRestore size={16} aria-hidden />}
                onClick={() => setConfirmReset(true)}
              >
                {t('settings:restoreDefault')}
              </Button>
            ) : (
              <span />
            )}
            <FormActions dirty={dirty} submitting={submitting} onReset={onReset} />
          </Group>
        ) : null}
      </Stack>
      {settingKey ? (
        <ConfirmDialog
          opened={confirmReset}
          onClose={() => setConfirmReset(false)}
          danger
          title={t('settings:restoreDefaultTitle', { title })}
          message={t('settings:restoreDefaultBody')}
          confirmLabel={t('settings:restoreDefault')}
          onConfirm={() => reset.mutateAsync(settingKey)}
        />
      ) : null}
    </form>
  );
}
