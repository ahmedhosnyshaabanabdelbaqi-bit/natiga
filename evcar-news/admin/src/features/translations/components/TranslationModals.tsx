import { Alert, Button, Group, Modal, SimpleGrid, Stack, Textarea, TextInput } from '@mantine/core';
import { useForm } from '@mantine/form';
import { useTranslation } from 'react-i18next';
import { describeError } from '@/api/describeError';
import { applyServerErrors } from '@/components/formUtils';
import { LocalizedTextInputs } from '@/components/LocalizedTextInputs';
import { KEY_PATTERN, NAMESPACE_PATTERN, type TranslationOverride } from '../api';
import { useUpdateTranslation, useUpsertTranslations } from '../hooks';

/** Adds overrides for one key in Arabic and/or English. */
export function AddTranslationModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation(['translations', 'common']);
  const upsert = useUpsertTranslations();
  const form = useForm({
    initialValues: { namespace: '', key: '', ar: '', en: '' },
    validate: {
      namespace: (v) => (NAMESPACE_PATTERN.test(v) ? null : t('translations:validation.namespace')),
      key: (v) => (KEY_PATTERN.test(v) ? null : t('translations:validation.key')),
      ar: (v, values) =>
        v.trim() || values.en.trim() ? null : t('translations:validation.oneValue'),
    },
  });
  const v = form.getValues();

  const submit = form.onSubmit(async (values) => {
    const items = (['ar', 'en'] as const)
      .filter((lang) => values[lang].trim())
      .map((lang) => ({
        namespace: values.namespace,
        key: values.key,
        locale: lang,
        value: values[lang],
      }));
    try {
      await upsert.mutateAsync(items);
      form.reset();
      onClose();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <Modal opened={opened} onClose={onClose} size="lg" title={t('translations:add')}>
      <form onSubmit={submit} noValidate>
        <Stack>
          {upsert.error ? (
            <Alert color="red">{describeError(upsert.error, t).message}</Alert>
          ) : null}
          <SimpleGrid cols={{ base: 1, sm: 2 }}>
            <TextInput
              label={t('translations:fields.namespace')}
              description={t('translations:fields.namespaceHint')}
              required
              dir="ltr"
              {...form.getInputProps('namespace')}
            />
            <TextInput
              label={t('translations:fields.key')}
              description={t('translations:fields.keyHint')}
              required
              dir="ltr"
              {...form.getInputProps('key')}
            />
          </SimpleGrid>
          <LocalizedTextInputs
            label={t('translations:fields.value')}
            multiline
            minRows={2}
            value={{ ar: v.ar, en: v.en }}
            onChange={(val) => form.setValues({ ar: val.ar, en: val.en })}
            errors={{ ar: form.errors.ar as string | undefined }}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" loading={upsert.isPending}>
              {t('common:actions.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}

/** Edits the value of one existing override row. */
export function EditTranslationModal({
  row,
  onClose,
}: {
  row: TranslationOverride | null;
  onClose: () => void;
}) {
  const { t } = useTranslation(['translations', 'common']);
  const upsert = useUpdateTranslation();
  const form = useForm({
    initialValues: { value: row?.value ?? '' },
    validate: { value: (v) => (v.trim() ? null : t('common:validation.required')) },
  });

  const submit = form.onSubmit(async ({ value }) => {
    if (!row) return;
    try {
      await upsert.mutateAsync({ id: row.id, value });
      onClose();
    } catch (error) {
      applyServerErrors(form, error);
    }
  });

  return (
    <Modal
      opened={row !== null}
      onClose={onClose}
      size="lg"
      title={
        row
          ? t('translations:editTitle', { key: `${row.namespace}:${row.key}`, locale: row.locale })
          : ''
      }
    >
      <form onSubmit={submit} noValidate>
        <Stack>
          {upsert.error ? (
            <Alert color="red">{describeError(upsert.error, t).message}</Alert>
          ) : null}
          <Textarea
            label={t('translations:fields.value')}
            autosize
            minRows={3}
            required
            dir={row?.locale === 'ar' ? 'rtl' : 'ltr'}
            lang={row?.locale}
            {...form.getInputProps('value')}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={onClose}>
              {t('common:actions.cancel')}
            </Button>
            <Button type="submit" loading={upsert.isPending} disabled={!form.isDirty()}>
              {t('common:actions.save')}
            </Button>
          </Group>
        </Stack>
      </form>
    </Modal>
  );
}
