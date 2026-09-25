import {
  Alert,
  Button,
  Group,
  Modal,
  NumberInput,
  Select,
  SimpleGrid,
  Stack,
  Switch,
  TextInput,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '@/api/describeError';
import { applyServerErrors } from '@/components/formUtils';
import { LocalizedTextInputs } from '@/components/LocalizedTextInputs';
import { regionName, timeZones } from '@/lib/intl';
import type { AdminMarket, AdminMarketInput } from '../api';
import { useCreateMarket, useCurrencies, useUpdateMarket } from '../hooks';
import { validateMarket } from '../validation';

const EMPTY: AdminMarketInput = {
  code: '',
  nameAr: '',
  nameEn: '',
  currencyCode: '',
  timezone: '',
  defaultLanguage: 'ar',
  unitSystem: 'metric',
  driveSide: 'lhd',
  enabled: false,
  sortOrder: 0,
};

function pickInput(m: AdminMarket): AdminMarketInput {
  const { updatedAt: _u, isDefault: _d, ...input } = m;
  return { ...EMPTY, ...input };
}

export function MarketFormModal({
  opened,
  market,
  onClose,
}: {
  opened: boolean;
  /** null = create */
  market: AdminMarket | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(['markets', 'common']);
  const create = useCreateMarket();
  const update = useUpdateMarket();
  const editing = market !== null;
  const form = useForm<AdminMarketInput>({
    initialValues: market ? pickInput(market) : EMPTY,
    validate: (values) => validateMarket(values, t),
  });

  // Only currencies registered on the server are valid (CreateMarketDto.currencyCode).
  const currencyQuery = useCurrencies();
  const currencies = useMemo(
    () =>
      (currencyQuery.data ?? []).map((c) => ({
        value: c.code,
        label: `${c.code} — ${i18n.language === 'ar' ? c.nameAr : c.nameEn}`,
      })),
    [currencyQuery.data, i18n.language],
  );
  const zones = useMemo(() => timeZones(), []);
  const mutation = editing ? update : create;

  const submit = form.onSubmit(async (values) => {
    try {
      if (market) {
        const { code: _code, ...patch } = values;
        await update.mutateAsync({ code: market.code, patch });
      } else {
        await create.mutateAsync(values);
      }
      onClose();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  const v = form.getValues();

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        editing ? t('markets:form.editTitle', { code: market.code }) : t('markets:form.createTitle')
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack>
          {mutation.error ? (
            <Alert color="red" role="alert">
              {describeError(mutation.error, t).message}
            </Alert>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label={t('markets:fields.code')}
              description={
                v.code.length === 2 ? regionName(v.code, i18n.language) : t('markets:form.codeHint')
              }
              required
              disabled={editing}
              maxLength={2}
              dir="ltr"
              {...form.getInputProps('code')}
              onChange={(e) => form.setFieldValue('code', e.currentTarget.value.toUpperCase())}
            />
            <NumberInput
              label={t('markets:fields.sortOrder')}
              allowDecimal={false}
              {...form.getInputProps('sortOrder')}
            />
          </SimpleGrid>
          <LocalizedTextInputs
            label={t('markets:fields.name')}
            required={['ar', 'en']}
            value={{ ar: v.nameAr, en: v.nameEn }}
            onChange={(val) => form.setValues({ nameAr: val.ar, nameEn: val.en })}
            errors={{
              ar: form.errors.nameAr as string | undefined,
              en: form.errors.nameEn as string | undefined,
            }}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <Select
              label={t('markets:fields.currency')}
              description={t('markets:form.currencyHint')}
              required
              searchable
              data={currencies}
              nothingFoundMessage={t('markets:form.noCurrency')}
              disabled={currencyQuery.isLoading}
              {...form.getInputProps('currencyCode')}
            />
            {zones.length > 0 ? (
              <Select
                label={t('markets:fields.timezone')}
                required
                searchable
                data={zones}
                limit={50}
                {...form.getInputProps('timezone')}
              />
            ) : (
              <TextInput
                label={t('markets:fields.timezone')}
                required
                dir="ltr"
                {...form.getInputProps('timezone')}
              />
            )}
            <Select
              label={t('markets:fields.defaultLanguage')}
              allowDeselect={false}
              data={[
                { value: 'ar', label: t('common:languages.ar') },
                { value: 'en', label: t('common:languages.en') },
              ]}
              {...form.getInputProps('defaultLanguage')}
            />
            <Select
              label={t('markets:fields.unitSystem')}
              allowDeselect={false}
              data={[
                { value: 'metric', label: t('markets:unitSystems.metric') },
                { value: 'imperial', label: t('markets:unitSystems.imperial') },
              ]}
              {...form.getInputProps('unitSystem')}
            />
            <Select
              label={t('markets:fields.driveSide')}
              allowDeselect={false}
              data={[
                { value: 'lhd', label: t('markets:driveSides.lhd') },
                { value: 'rhd', label: t('markets:driveSides.rhd') },
              ]}
              {...form.getInputProps('driveSide')}
            />
          </SimpleGrid>
          <Switch
            label={t('markets:fields.enabled')}
            description={t('markets:coverageNote')}
            {...form.getInputProps('enabled', { type: 'checkbox' })}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={mutation.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" loading={mutation.isPending}>
              {t(editing ? 'common:actions.save' : 'markets:form.create')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
