import { Group, Stack, Text, Title } from '@mantine/core';
import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <Group justify="space-between" align="flex-start" mb="lg" wrap="wrap" gap="sm">
      <Stack gap={4}>
        <Group gap="sm">
          <Title order={2}>{title}</Title>
          {badge}
        </Group>
        {description ? (
          <Text c="dimmed" size="sm" maw={720}>
            {description}
          </Text>
        ) : null}
      </Stack>
      {actions ? <Group gap="xs">{actions}</Group> : null}
    </Group>
  );
}
