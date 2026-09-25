import { Button, Center, Stack, Text, ThemeIcon, Title } from '@mantine/core';
import { IconLock } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export function ForbiddenPage() {
  const { t } = useTranslation('common');
  return (
    <Center mih={360}>
      <Stack align="center" gap="sm" maw={480} ta="center">
        <ThemeIcon size={56} radius="xl" variant="light" color="yellow">
          <IconLock size={30} aria-hidden />
        </ThemeIcon>
        <Title order={2}>{t('forbidden.title')}</Title>
        <Text c="dimmed">{t('forbidden.body')}</Text>
        <Button component={Link} to="/" variant="light">
          {t('actions.backHome')}
        </Button>
      </Stack>
    </Center>
  );
}

export default ForbiddenPage;
