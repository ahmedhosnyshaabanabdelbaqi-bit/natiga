import { TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { applyServerErrors } from '@/components/formUtils';
import { isWebUrl, objectValue, str, type SettingKey, type SettingsMap } from '../api';
import { useSaveSetting } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

/**
 * Small forms made of URL fields stored under one settings key
 * (share: baseUrl; legal: privacyUrl, termsUrl). The rest of the stored value
 * (e.g. share.paths) is sent back unchanged. http is accepted here; the API
 * requires https in production.
 */
export function LinksTab({
  settings,
  canWrite,
  settingKey,
  fields,
  section,
}: {
  settings: SettingsMap;
  canWrite: boolean;
  settingKey: SettingKey;
  fields: { name: string; required?: boolean; placeholder?: string }[];
  /** i18n sub-namespace inside settings.json, e.g. "share" or "legal". */
  section: string;
}) {
  const { t } = useTranslation(['settings', 'common']);
  const save = useSaveSetting();
  const stored = objectValue(settings, settingKey);
  const initial = Object.fromEntries(fields.map((f) => [f.name, str(stored[f.name])])) as Record<
    string,
    string
  >;
  const form = useForm({
    initialValues: initial,
    validate: Object.fromEntries(
      fields.map((f) => [
        f.name,
        (v: string) =>
          v === ''
            ? f.required
              ? t('common:validation.required')
              : null
            : isWebUrl(v)
              ? null
              : t('common:validation.url'),
      ]),
    ),
  });

  const submit = form.onSubmit(async (values) => {
    try {
      const patch = Object.fromEntries(
        Object.entries(values).map(([k, v]) => [k, v.trim() || null]),
      );
      await save.mutateAsync({ key: settingKey, value: { ...stored, ...patch } });
      form.setInitialValues(values);
      form.reset();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <SettingsFormShell
      title={t(`settings:${section}.title`)}
      description={t(`settings:${section}.description`)}
      records={[settings[settingKey]]}
      settingKey={settingKey}
      dirty={form.isDirty()}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={submit}
      onReset={() => form.reset()}
    >
      {fields.map((f) => (
        <TextInput
          key={f.name}
          type="url"
          dir="ltr"
          label={t(`settings:${section}.fields.${f.name}`)}
          required={f.required}
          placeholder={f.placeholder ?? 'https://'}
          {...form.getInputProps(f.name)}
        />
      ))}
    </SettingsFormShell>
  );
}
