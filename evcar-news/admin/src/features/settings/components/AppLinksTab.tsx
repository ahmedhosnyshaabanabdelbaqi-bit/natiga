import { SimpleGrid, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { applyServerErrors } from '@/components/formUtils';
import { objectValue, SETTING_KEYS, str, type SettingsMap } from '../api';
import { useSaveSetting } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

/** Same rules as the backend AppLinksSettingsDto. */
const PACKAGE_ID = /^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/;
const SHA256_FINGERPRINT = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;
const TEAM_ID = /^[A-Z0-9]{10}$/;
const LINK_PATH = /^\/[A-Za-z0-9/_*.-]*$/;

const lines = (text: string) =>
  text
    .split(/[\n,]/)
    .map((l) => l.trim())
    .filter(Boolean);

/**
 * Android App Links / iOS Universal Links (private setting `app_links`). The
 * backend share module builds /.well-known/assetlinks.json and
 * apple-app-site-association from it; nothing is verified by the stores until
 * the release certificate fingerprint and the Apple team id are entered.
 */
export function AppLinksTab({ settings, canWrite }: { settings: SettingsMap; canWrite: boolean }) {
  const { t } = useTranslation(['settings', 'common']);
  const save = useSaveSetting();
  const stored = objectValue(settings, SETTING_KEYS.appLinks);
  const list = (v: unknown) =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];

  const initial = {
    androidPackage: str(stored.androidPackage),
    fingerprints: list(stored.androidSha256CertFingerprints).join('\n'),
    iosTeamId: str(stored.iosTeamId),
    iosBundleId: str(stored.iosBundleId),
    paths: list(stored.paths).join('\n'),
  };

  const form = useForm({
    initialValues: initial,
    validate: {
      androidPackage: (v) => (PACKAGE_ID.test(v.trim()) ? null : t('settings:appLinks.invalidId')),
      iosBundleId: (v) => (PACKAGE_ID.test(v.trim()) ? null : t('settings:appLinks.invalidId')),
      iosTeamId: (v) =>
        v.trim() === '' || TEAM_ID.test(v.trim()) ? null : t('settings:appLinks.invalidTeamId'),
      fingerprints: (v) =>
        lines(v).every((f) => SHA256_FINGERPRINT.test(f.toUpperCase()))
          ? null
          : t('settings:appLinks.invalidFingerprint'),
      paths: (v) =>
        lines(v).every((p) => LINK_PATH.test(p)) ? null : t('settings:appLinks.invalidPath'),
    },
  });

  const submit = form.onSubmit(async (values) => {
    try {
      await save.mutateAsync({
        key: SETTING_KEYS.appLinks,
        value: {
          ...stored,
          androidPackage: values.androidPackage.trim(),
          androidSha256CertFingerprints: [
            ...new Set(lines(values.fingerprints).map((f) => f.toUpperCase())),
          ],
          iosTeamId: values.iosTeamId.trim() || null,
          iosBundleId: values.iosBundleId.trim(),
          paths: lines(values.paths),
        },
      });
      form.setInitialValues(values);
      form.reset();
    } catch (error) {
      // API field names → form fields (other errors are toasted by the query client).
      applyServerErrors(
        {
          setFieldError: (path, message) =>
            form.setFieldError(
              path.startsWith('androidSha256CertFingerprints') ? 'fingerprints' : path,
              message,
            ),
        },
        error,
      );
    }
  });

  return (
    <SettingsFormShell
      title={t('settings:appLinks.title')}
      description={t('settings:appLinks.description')}
      records={[settings[SETTING_KEYS.appLinks]]}
      settingKey={SETTING_KEYS.appLinks}
      dirty={form.isDirty()}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={submit}
      onReset={() => form.reset()}
    >
      <SimpleGrid cols={{ base: 1, md: 2 }}>
        <TextInput
          label={t('settings:appLinks.androidPackage')}
          required
          dir="ltr"
          {...form.getInputProps('androidPackage')}
        />
        <TextInput
          label={t('settings:appLinks.iosBundleId')}
          required
          dir="ltr"
          {...form.getInputProps('iosBundleId')}
        />
        <TextInput
          label={t('settings:appLinks.iosTeamId')}
          description={t('settings:appLinks.iosTeamIdHint')}
          placeholder="ABCDE12345"
          dir="ltr"
          {...form.getInputProps('iosTeamId')}
        />
      </SimpleGrid>
      <Textarea
        label={t('settings:appLinks.fingerprints')}
        description={t('settings:appLinks.fingerprintsHint')}
        placeholder="14:6D:E9:…:44:E5"
        autosize
        minRows={2}
        dir="ltr"
        styles={{ input: { fontFamily: 'monospace' } }}
        {...form.getInputProps('fingerprints')}
      />
      <Textarea
        label={t('settings:appLinks.paths')}
        description={t('settings:appLinks.pathsHint')}
        autosize
        minRows={3}
        dir="ltr"
        {...form.getInputProps('paths')}
      />
    </SettingsFormShell>
  );
}
