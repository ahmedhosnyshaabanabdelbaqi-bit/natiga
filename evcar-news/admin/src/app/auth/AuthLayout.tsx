import { Center, Group, Paper, Stack, Title } from '@mantine/core';
import type { ReactNode } from 'react';
import { BrandMark } from '@/app/layout/BrandMark';
import { ColorSchemeToggle, LanguageSwitcher } from '@/app/layout/HeaderControls';

export function AuthLayout({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Center mih="100vh" p="md" bg="var(--mantine-color-body)">
      <Stack w="100%" maw={440} gap="lg">
        <Group justify="space-between">
          <BrandMark size="lg" />
          <Group gap="xs">
            <LanguageSwitcher />
            <ColorSchemeToggle />
          </Group>
        </Group>
        <Paper withBorder shadow="sm" radius="lg" p="xl" component="main">
          <Title order={2} size="h3" mb="lg">
            {title}
          </Title>
          {children}
        </Paper>
      </Stack>
    </Center>
  );
}
