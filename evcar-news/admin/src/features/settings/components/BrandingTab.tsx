import {
  Badge,
  Button,
  ColorInput,
  FileButton,
  Group,
  Image,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { notifications } from '@mantine/notifications';
import { IconBolt, IconTrash, IconUpload } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { applyServerErrors } from '@/components/formUtils';
import { DEFAULT_BRANDING, isHexColor } from '@/app/theme';
import { contrastRatio } from '@/lib/color';
import {
  isWebUrl,
  LOGO_MAX_BYTES,
  LOGO_MIME_TYPES,
  objectValue,
  SETTING_KEYS,
  str,
  type SettingsMap,
} from '../api';
import { useRemoveLogo, useSaveSetting, useUploadLogo } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

/**
 * Upload goes straight to POST /admin/settings/branding/logo (the server
 * decodes, strips metadata and re-encodes to PNG, then stores logoUrl).
 */
function LogoControls({
  canWrite,
  hasLogo,
  blocked,
}: {
  canWrite: boolean;
  hasLogo: boolean;
  /** Unsaved edits in the form: uploading would reload the tab and drop them. */
  blocked: boolean;
}) {
  const { t } = useTranslation('settings');
  const upload = useUploadLogo();
  const remove = useRemoveLogo();
  if (!canWrite) return null;
  const onFile = (file: File | null) => {
    if (!file) return;
    if (!LOGO_MIME_TYPES.includes(file.type)) {
      notifications.show({ color: 'red', message: t('branding.logoType') });
      return;
    }
    if (file.size > LOGO_MAX_BYTES) {
      notifications.show({ color: 'red', message: t('branding.logoTooLarge') });
      return;
    }
    upload.mutate(file);
  };
  return (
    <Group gap="xs">
      <FileButton onChange={onFile} accept={LOGO_MIME_TYPES.join(',')}>
        {(props) => (
          <Button
            {...props}
            size="xs"
            variant="light"
            disabled={blocked}
            loading={upload.isPending}
            leftSection={<IconUpload size={14} aria-hidden />}
          >
            {t('branding.uploadLogo')}
          </Button>
        )}
      </FileButton>
      {hasLogo ? (
        <Button
          size="xs"
          variant="subtle"
          color="red"
          disabled={blocked}
          loading={remove.isPending}
          leftSection={<IconTrash size={14} aria-hidden />}
          onClick={() => remove.mutate()}
        >
          {t('branding.removeLogo')}
        </Button>
      ) : null}
      <Text size="xs" c="dimmed">
        {t(blocked ? 'branding.logoBlocked' : 'branding.logoRules')}
      </Text>
    </Group>
  );
}

const SWATCHES = ['#0A5CFF', '#00C2E0', '#0B7A75', '#1F2937', '#7C3AED', '#E11D48'];

function ContrastBadge({ color }: { color: string }) {
  const { t } = useTranslation('settings');
  const ratio = contrastRatio(color, '#FFFFFF');
  if (ratio === null) return null;
  const ok = ratio >= 4.5;
  return (
    <Badge variant="light" color={ok ? 'teal' : 'orange'}>
      {t(ok ? 'branding.contrastOk' : 'branding.contrastLow', { ratio: ratio.toFixed(2) })}
    </Badge>
  );
}

export function BrandingTab({ settings, canWrite }: { settings: SettingsMap; canWrite: boolean }) {
  const { t } = useTranslation(['settings', 'common']);
  const save = useSaveSetting();
  const branding = objectValue(settings, SETTING_KEYS.branding);

  const initial = {
    appName: str(branding.appName) || DEFAULT_BRANDING.appName,
    logoUrl: str(branding.logoUrl),
    primaryColor: str(branding.primaryColor) || DEFAULT_BRANDING.primaryColor,
    accentColor: str(branding.accentColor) || DEFAULT_BRANDING.accentColor,
  };

  const form = useForm({
    initialValues: initial,
    validate: {
      appName: (v) =>
        v.trim().length === 0
          ? t('common:validation.required')
          : v.length > 60
            ? t('common:validation.maxLength', { max: 60 })
            : null,
      logoUrl: (v) => (v === '' || isWebUrl(v) ? null : t('common:validation.url')),
      primaryColor: (v) => (isHexColor(v) ? null : t('common:validation.hexColor')),
      accentColor: (v) => (isHexColor(v) ? null : t('common:validation.hexColor')),
    },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      // One PUT with the whole branding value (colours live in `branding`).
      await save.mutateAsync({
        key: SETTING_KEYS.branding,
        value: {
          ...branding,
          appName: values.appName.trim(),
          logoUrl: values.logoUrl.trim() || null,
          primaryColor: values.primaryColor.toUpperCase(),
          accentColor: values.accentColor.toUpperCase(),
        },
      });
      form.setInitialValues(values);
      form.reset();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  const v = form.getValues();

  return (
    <SettingsFormShell
      title={t('settings:branding.title')}
      description={t('settings:branding.description')}
      records={[settings[SETTING_KEYS.branding]]}
      settingKey={SETTING_KEYS.branding}
      dirty={form.isDirty()}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={submit}
      onReset={() => form.reset()}
    >
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TextInput
          label={t('settings:branding.appName')}
          required
          maxLength={60}
          dir="auto"
          {...form.getInputProps('appName')}
        />
        <Stack gap={6}>
          <TextInput
            label={t('settings:branding.logoUrl')}
            description={t('settings:branding.logoHint')}
            placeholder="https://"
            dir="ltr"
            type="url"
            {...form.getInputProps('logoUrl')}
          />
          <LogoControls canWrite={canWrite} hasLogo={!!initial.logoUrl} blocked={form.isDirty()} />
        </Stack>
        <Stack gap={4}>
          <ColorInput
            label={t('settings:branding.primaryColor')}
            format="hex"
            swatches={SWATCHES}
            dir="ltr"
            {...form.getInputProps('primaryColor')}
          />
          <ContrastBadge color={v.primaryColor} />
        </Stack>
        <Stack gap={4}>
          <ColorInput
            label={t('settings:branding.accentColor')}
            format="hex"
            swatches={SWATCHES}
            dir="ltr"
            {...form.getInputProps('accentColor')}
          />
          <ContrastBadge color={v.accentColor} />
        </Stack>
      </SimpleGrid>
      <Paper withBorder p="md" radius="md">
        <Text size="xs" c="dimmed" mb="xs">
          {t('settings:branding.preview')}
        </Text>
        <Group>
          {v.logoUrl && isWebUrl(v.logoUrl) ? (
            <Image
              src={v.logoUrl}
              alt={t('settings:branding.logoAlt')}
              h={40}
              w="auto"
              fit="contain"
            />
          ) : (
            <Paper
              w={40}
              h={40}
              radius="md"
              style={{
                display: 'grid',
                placeItems: 'center',
                background:
                  isHexColor(v.primaryColor) && isHexColor(v.accentColor)
                    ? `linear-gradient(135deg, ${v.primaryColor}, ${v.accentColor})`
                    : undefined,
                color: '#fff',
              }}
            >
              <IconBolt aria-hidden />
            </Paper>
          )}
          <Text fw={700} size="lg" dir="auto">
            {v.appName}
          </Text>
          <Button
            type="button"
            tabIndex={-1}
            style={{ backgroundColor: isHexColor(v.primaryColor) ? v.primaryColor : undefined }}
          >
            {t('settings:branding.sampleButton')}
          </Button>
          <Badge
            style={{ backgroundColor: isHexColor(v.accentColor) ? v.accentColor : undefined }}
            c="white"
          >
            {t('settings:branding.sampleBadge')}
          </Badge>
        </Group>
      </Paper>
    </SettingsFormShell>
  );
}
