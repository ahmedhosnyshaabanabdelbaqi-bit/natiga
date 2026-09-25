import {
  Alert,
  Anchor,
  Button,
  Group,
  Image,
  NumberInput,
  Stack,
  Text,
  Textarea,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconAlertTriangle, IconInfoCircle } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyServerErrors } from '@/components/formUtils';
import {
  isValidTileTemplate,
  objectValue,
  sampleTileUrl,
  SETTING_KEYS,
  str,
  type SettingsMap,
} from '../api';
import { useSaveSetting } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

export function MapTab({ settings, canWrite }: { settings: SettingsMap; canWrite: boolean }) {
  const { t } = useTranslation(['settings', 'common']);
  const save = useSaveSetting();
  const stored = objectValue(settings, SETTING_KEYS.map);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewFailed, setPreviewFailed] = useState(false);

  const initial = {
    tileUrlTemplate: str(stored.tileUrlTemplate),
    attribution: str(stored.attribution),
    maxZoom: typeof stored.maxZoom === 'number' ? stored.maxZoom : ('' as number | ''),
  };
  const form = useForm({
    initialValues: initial,
    validate: {
      tileUrlTemplate: (v) =>
        v === '' || isValidTileTemplate(v) ? null : t('settings:map.invalidTemplate'),
      attribution: (v, values) =>
        values.tileUrlTemplate && v.trim() === '' ? t('settings:map.attributionRequired') : null,
      // Required by the API (1–22) even while no tile server is configured.
      maxZoom: (v) =>
        v !== '' && Number.isInteger(v) && v >= 1 && v <= 22 ? null : t('settings:map.invalidZoom'),
    },
  });
  const v = form.getValues();
  const configured = !!v.tileUrlTemplate && !!v.attribution;

  const submit = form.onSubmit(async (values) => {
    try {
      await save.mutateAsync({
        key: SETTING_KEYS.map,
        value: {
          ...stored,
          tileUrlTemplate: values.tileUrlTemplate || null,
          attribution: values.attribution.trim() || null,
          maxZoom: values.maxZoom === '' ? 19 : values.maxZoom,
        },
      });
      form.setInitialValues(values);
      form.reset();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <SettingsFormShell
      title={t('settings:map.title')}
      description={t('settings:map.description')}
      records={[settings[SETTING_KEYS.map]]}
      settingKey={SETTING_KEYS.map}
      dirty={form.isDirty()}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={submit}
      onReset={() => form.reset()}
    >
      <Alert color="blue" variant="light" icon={<IconInfoCircle aria-hidden />}>
        <Stack gap={4}>
          <Text size="sm">{t('settings:map.licenceNote')}</Text>
          <Anchor
            href="https://operations.osmfoundation.org/policies/tiles/"
            target="_blank"
            rel="noreferrer"
            size="sm"
          >
            {t('settings:map.osmPolicyLink')}
          </Anchor>
        </Stack>
      </Alert>
      {!configured ? (
        <Alert color="yellow" variant="light" icon={<IconAlertTriangle aria-hidden />}>
          {t('settings:map.notConfigured')}
        </Alert>
      ) : null}
      <TextInput
        label={t('settings:map.tileUrlTemplate')}
        description={t('settings:map.tileUrlHint')}
        placeholder="https://tile.example.com/{z}/{x}/{y}.png"
        dir="ltr"
        {...form.getInputProps('tileUrlTemplate')}
      />
      <Textarea
        label={t('settings:map.attribution')}
        description={t('settings:map.attributionHint')}
        autosize
        minRows={2}
        dir="ltr"
        {...form.getInputProps('attribution')}
      />
      <NumberInput
        label={t('settings:map.maxZoom')}
        min={0}
        max={22}
        allowDecimal={false}
        w={160}
        {...form.getInputProps('maxZoom')}
      />
      <Group>
        <Button
          type="button"
          variant="light"
          disabled={!isValidTileTemplate(v.tileUrlTemplate)}
          onClick={() => {
            setPreviewFailed(false);
            setPreviewUrl(sampleTileUrl(v.tileUrlTemplate));
          }}
        >
          {t('settings:map.testTile')}
        </Button>
        {previewUrl ? (
          <Text size="xs" c="dimmed" dir="ltr">
            {previewUrl}
          </Text>
        ) : null}
      </Group>
      {previewUrl ? (
        previewFailed ? (
          <Alert color="red" variant="light">
            {t('settings:map.tileFailed')}
          </Alert>
        ) : (
          <Image
            src={previewUrl}
            alt={t('settings:map.tileAlt')}
            w={256}
            h={256}
            radius="sm"
            referrerPolicy="no-referrer"
            onError={() => setPreviewFailed(true)}
          />
        )
      ) : null}
    </SettingsFormShell>
  );
}
