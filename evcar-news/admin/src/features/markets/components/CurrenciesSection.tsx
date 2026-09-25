import {
  Alert,
  Button,
  Code,
  Group,
  Modal,
  NumberInput,
  Paper,
  ScrollArea,
  SimpleGrid,
  Stack,
  Table,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import { useForm } from '@mantine/form';
import { IconPencil, IconPlus, IconTrash } from '@tabler/icons-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '@/api/describeError';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { applyServerErrors } from '@/components/formUtils';
import { EmptyState, QueryState } from '@/components/StateViews';
import { currencyName } from '@/lib/intl';
import type { Currency, CurrencyInput } from '../api';
import { useCurrencies, useDeleteCurrency, useSaveCurrency } from '../hooks';

const EMPTY = { code: '', nameAr: '', nameEn: '', symbolAr: '', symbolEn: '', decimals: 2 };

function CurrencyFormModal({
  currency,
  onClose,
}: {
  /** null = create */
  currency: Currency | null;
  onClose: () => void;
}) {
  const { t, i18n } = useTranslation(['markets', 'common']);
  const save = useSaveCurrency();
  const editing = currency !== null;
  const form = useForm({
    initialValues: currency
      ? {
          ...currency,
          symbolAr: currency.symbolAr ?? '',
          symbolEn: currency.symbolEn ?? '',
        }
      : EMPTY,
    validate: {
      code: (v) => (/^[A-Z]{3}$/.test(v) ? null : t('markets:validation.currency')),
      nameAr: (v) => (v.trim() ? null : t('common:validation.required')),
      nameEn: (v) => (v.trim() ? null : t('common:validation.required')),
      decimals: (v) =>
        Number.isInteger(v) && v >= 0 && v <= 4 ? null : t('markets:currencies.invalidDecimals'),
    },
  });
  const v = form.getValues();

  const submit = form.onSubmit(async (values) => {
    const input: CurrencyInput = {
      code: values.code,
      nameAr: values.nameAr.trim(),
      nameEn: values.nameEn.trim(),
      symbolAr: values.symbolAr.trim() || null,
      symbolEn: values.symbolEn.trim() || null,
      decimals: values.decimals,
    };
    try {
      await save.mutateAsync({ input, existing: editing });
      onClose();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <Modal
      opened
      onClose={onClose}
      title={
        editing
          ? t('markets:currencies.editTitle', { code: currency.code })
          : t('markets:currencies.createTitle')
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack>
          {save.error ? (
            <Alert color="red" role="alert">
              {describeError(save.error, t).message}
            </Alert>
          ) : null}
          <TextInput
            label={t('markets:currencies.code')}
            description={
              v.code.length === 3
                ? currencyName(v.code, i18n.language)
                : t('markets:currencies.codeHint')
            }
            required
            disabled={editing}
            maxLength={3}
            dir="ltr"
            {...form.getInputProps('code')}
            onChange={(e) => form.setFieldValue('code', e.currentTarget.value.toUpperCase())}
          />
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label={t('markets:currencies.nameAr')}
              required
              dir="rtl"
              lang="ar"
              {...form.getInputProps('nameAr')}
            />
            <TextInput
              label={t('markets:currencies.nameEn')}
              required
              dir="ltr"
              lang="en"
              {...form.getInputProps('nameEn')}
            />
            <TextInput
              label={t('markets:currencies.symbolAr')}
              dir="rtl"
              lang="ar"
              maxLength={8}
              {...form.getInputProps('symbolAr')}
            />
            <TextInput
              label={t('markets:currencies.symbolEn')}
              dir="ltr"
              lang="en"
              maxLength={8}
              {...form.getInputProps('symbolEn')}
            />
          </SimpleGrid>
          <NumberInput
            label={t('markets:currencies.decimals')}
            description={t('markets:currencies.decimalsHint')}
            min={0}
            max={4}
            allowDecimal={false}
            {...form.getInputProps('decimals')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose} disabled={save.isPending}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" loading={save.isPending}>
              {t('common:actions.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Currencies referenced by markets and prices (GET/POST/PATCH/DELETE /admin/currencies). */
export function CurrenciesSection({ canWrite }: { canWrite: boolean }) {
  const { t, i18n } = useTranslation(['markets', 'common']);
  const currencies = useCurrencies();
  const remove = useDeleteCurrency();
  const [editing, setEditing] = useState<Currency | null | undefined>(undefined);
  const [deleting, setDeleting] = useState<Currency | null>(null);
  const ar = i18n.language === 'ar';

  return (
    <Stack gap="sm" mt="xl">
      <Group justify="space-between">
        <Stack gap={0}>
          <Title order={3}>{t('markets:currencies.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('markets:currencies.description')}
          </Text>
        </Stack>
        {canWrite ? (
          <Button
            variant="light"
            leftSection={<IconPlus size={16} aria-hidden />}
            onClick={() => setEditing(null)}
          >
            {t('markets:currencies.add')}
          </Button>
        ) : null}
      </Group>
      <QueryState
        query={currencies}
        isEmpty={(list) => list.length === 0}
        empty={<EmptyState title={t('markets:currencies.empty')} description="" />}
      >
        {(list) => (
          <Paper withBorder radius="md">
            <ScrollArea type="auto">
              <Table verticalSpacing="xs" striped miw={560}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th>{t('markets:currencies.code')}</Table.Th>
                    <Table.Th>{t('markets:currencies.name')}</Table.Th>
                    <Table.Th>{t('markets:currencies.symbol')}</Table.Th>
                    <Table.Th>{t('markets:currencies.decimals')}</Table.Th>
                    {canWrite ? <Table.Th /> : null}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {list.map((c) => (
                    <Table.Tr key={c.code}>
                      <Table.Td>
                        <Code dir="ltr">{c.code}</Code>
                      </Table.Td>
                      <Table.Td>{ar ? c.nameAr : c.nameEn}</Table.Td>
                      <Table.Td>{(ar ? c.symbolAr : c.symbolEn) ?? '—'}</Table.Td>
                      <Table.Td>{c.decimals}</Table.Td>
                      {canWrite ? (
                        <Table.Td ta="end">
                          <Group gap={4} justify="flex-end" wrap="nowrap">
                            <Button
                              size="compact-sm"
                              variant="subtle"
                              leftSection={<IconPencil size={14} aria-hidden />}
                              onClick={() => setEditing(c)}
                            >
                              {t('common:actions.edit')}
                            </Button>
                            <Button
                              size="compact-sm"
                              variant="subtle"
                              color="red"
                              aria-label={t('markets:currencies.deleteLabel', { code: c.code })}
                              onClick={() => setDeleting(c)}
                            >
                              <IconTrash size={14} aria-hidden />
                            </Button>
                          </Group>
                        </Table.Td>
                      ) : null}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea>
          </Paper>
        )}
      </QueryState>
      {editing !== undefined ? (
        <CurrencyFormModal currency={editing} onClose={() => setEditing(undefined)} />
      ) : null}
      <ConfirmDialog
        opened={deleting !== null}
        onClose={() => setDeleting(null)}
        danger
        title={t('markets:currencies.deleteTitle', { code: deleting?.code ?? '' })}
        message={t('markets:currencies.deleteBody')}
        confirmLabel={t('markets:currencies.delete')}
        onConfirm={() => (deleting ? remove.mutateAsync(deleting.code) : undefined)}
      />
    </Stack>
  );
}
