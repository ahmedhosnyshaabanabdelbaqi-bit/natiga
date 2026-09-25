import { Button, Group, Paper, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

/** Titled block of related fields. */
export function FormSection({
  title,
  description,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Paper withBorder radius="md" p="md">
      <Stack gap="md">
        <div>
          <Title order={4}>{title}</Title>
          {description ? (
            <Text size="sm" c="dimmed">
              {description}
            </Text>
          ) : null}
        </div>
        {children}
      </Stack>
    </Paper>
  );
}

/** Save / discard buttons aware of dirty and submitting state. */
export function FormActions({
  dirty,
  submitting,
  onReset,
  submitLabel,
  disabled,
}: {
  dirty: boolean;
  submitting: boolean;
  onReset?: () => void;
  submitLabel?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation('common');
  return (
    <Group justify="flex-end" gap="sm">
      {onReset ? (
        <Button variant="default" onClick={onReset} disabled={!dirty || submitting}>
          {t('actions.discard')}
        </Button>
      ) : null}
      <Button type="submit" loading={submitting} disabled={disabled || !dirty}>
        {submitLabel ?? t('actions.save')}
      </Button>
    </Group>
  );
}
