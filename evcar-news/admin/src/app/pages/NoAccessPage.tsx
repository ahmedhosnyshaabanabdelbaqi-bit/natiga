import { Button, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconShieldX } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useAuth } from '@/app/auth/AuthContext';

/** Signed-in account without any admin role/permission (e.g. a regular app user). */
export function NoAccessPage() {
  const { t } = useTranslation('common');
  const { user } = useAuth();
  return (
    <Center mih="100vh" p="md">
      <Stack align="center" gap="sm" maw={480} ta="center">
        <ThemeIcon size={56} radius="xl" variant="light" color="red">
          <IconShieldX size={30} aria-hidden />
        </ThemeIcon>
        <Title order={2}>{t('noAccess.title')}</Title>
        <Text c="dimmed">{t('noAccess.body', { email: user?.email ?? '' })}</Text>
        <Button component={Link} to="/logout" variant="light" color="red">
          {t('header.logout')}
        </Button>
      </Stack>
    </Center>
  );
}
