import { Select } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { useAppConfig } from '@/app/AppConfigContext';
import { SUPPORTED_LANGUAGES } from '@/app/i18n';
import { applyServerErrors } from '@/components/formUtils';
import { objectValue, SETTING_KEYS, str, type SettingsMap } from '../api';
import { useSaveSetting } from '../hooks';
import { SettingsFormShell } from './SettingsFormShell';

export function GeneralTab({ settings, canWrite }: { settings: SettingsMap; canWrite: boolean }) {
  const { t, i18n } = useTranslation(['settings', 'common']);
  const save = useSaveSetting();
  const config = useAppConfig();
  const stored = objectValue(settings, SETTING_KEYS.defaults);
  const initial = {
    defaultLanguage: str(stored.defaultLanguage) || config.data?.defaultLanguage || 'ar',
    defaultMarket: str(stored.defaultMarket) || config.data?.defaultMarket || '',
  };
  const form = useForm({
    initialValues: initial,
    validate: {
      defaultLanguage: (v) => (v ? null : t('common:validation.required')),
      defaultMarket: (v) => (v ? null : t('common:validation.required')),
    },
  });
  const markets = (config.data?.markets ?? []).map((m) => ({
    value: m.code,
    label: `${i18n.language === 'ar' ? m.nameAr : m.nameEn} (${m.code})${m.enabled ? '' : ` — ${t('common:disabled')}`}`,
    disabled: !m.enabled,
  }));

  const submit = form.onSubmit(async (values) => {
    try {
      await save.mutateAsync({ key: SETTING_KEYS.defaults, value: { ...stored, ...values } });
      form.setInitialValues(values);
      form.reset();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <SettingsFormShell
      title={t('settings:general.title')}
      description={t('settings:general.description')}
      records={[settings[SETTING_KEYS.defaults]]}
      settingKey={SETTING_KEYS.defaults}
      dirty={form.isDirty()}
      submitting={save.isPending}
      canWrite={canWrite}
      onSubmit={submit}
      onReset={() => form.reset()}
    >
      <Select
        label={t('settings:general.defaultLanguage')}
        data={SUPPORTED_LANGUAGES.map((l) => ({ value: l, label: t(`common:languages.${l}`) }))}
        allowDeselect={false}
        {...form.getInputProps('defaultLanguage')}
      />
      <Select
        label={t('settings:general.defaultMarket')}
        description={t('settings:general.defaultMarketHint')}
        data={markets}
        searchable
        nothingFoundMessage={t('common:states.emptyTitle')}
        {...form.getInputProps('defaultMarket')}
      />
    </SettingsFormShell>
  );
}
