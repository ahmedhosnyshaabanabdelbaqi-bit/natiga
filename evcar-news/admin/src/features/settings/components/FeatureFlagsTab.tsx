import { Alert, Stack, Switch, Text } from '@mantine/core';
import { IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState } from '@/components/StateViews';
import { booleanFlags, objectValue, SETTING_KEYS, type SettingsMap } from '../api';
import { useSaveSetting } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

export function FeatureFlagsTab({
  settings,
  canWrite,
}: {
  settings: SettingsMap;
  canWrite: boolean;
}) {
  const { t } = useTranslation('settings');
  const save = useSaveSetting();
  const stored = objectValue(settings, SETTING_KEYS.features);
  const initial = booleanFlags(stored);
  const initialJson = JSON.stringify(initial);
  const [flags, setFlags] = useState(initial);
  const [base, setBase] = useState(initialJson);
  if (base !== initialJson) {
    setBase(initialJson);
    setFlags(initial);
  }
  const keys = Object.keys(flags).sort();
  const dirty = JSON.stringify(flags) !== initialJson;

  return (
    <SettingsFormShell
      title={t('features.title')}
      description={t('features.description')}
      records={[settings[SETTING_KEYS.features]]}
      settingKey={SETTING_KEYS.features}
      dirty={dirty}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={(e) => {
        e?.preventDefault();
        save.mutate({ key: SETTING_KEYS.features, value: { ...stored, ...flags } });
      }}
      onReset={() => setFlags(initial)}
    >
      <Alert color="blue" variant="light" icon={<IconInfoCircle aria-hidden />}>
        {t('features.integrationNote')}
      </Alert>
      {keys.length === 0 ? (
        <EmptyState title={t('features.emptyTitle')} description={t('features.emptyBody')} />
      ) : (
        <Stack gap="sm">
          {keys.map((key) => (
            <Switch
              key={key}
              checked={flags[key] ?? false}
              onChange={(e) => {
                const checked = e.currentTarget.checked;
                setFlags((f) => ({ ...f, [key]: checked }));
              }}
              label={t(`features.flags.${key}`, { defaultValue: key })}
              description={
                <Text span size="xs" c="dimmed" dir="ltr">
                  {key}
                </Text>
              }
            />
          ))}
        </Stack>
      )}
    </SettingsFormShell>
  );
}
