import { Button, Center, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';

export default function NotFoundPage() {
  const { t } = useTranslation('common');
  return (
    <Center mih={360}>
      <Stack align="center" gap="sm" ta="center">
        <Title order={1} c="dimmed">
          404
        </Title>
        <Title order={2}>{t('notFound.title')}</Title>
        <Text c="dimmed">{t('notFound.body')}</Text>
        <Button component={Link} to="/" variant="light">
          {t('actions.backHome')}
        </Button>
      </Stack>
    </Center>
  );
}
