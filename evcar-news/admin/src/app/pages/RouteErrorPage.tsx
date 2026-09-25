import { Button, Center, Code, Stack, Text, Title } from '@mantine/core';
import { useTranslation } from 'react-i18next';
import { isRouteErrorResponse, useRouteError } from 'react-router';

/** Last-resort boundary for render errors and failed lazy chunk loads (e.g. after a deploy). */
export default function RouteErrorPage() {
  const { t } = useTranslation('common');
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : String(error);
  return (
    <Center mih="60vh" p="md">
      <Stack align="center" gap="sm" maw={560} ta="center">
        <Title order={2}>{t('routeError.title')}</Title>
        <Text c="dimmed">{t('routeError.body')}</Text>
        <Code block dir="ltr" style={{ maxWidth: '100%', whiteSpace: 'pre-wrap' }}>
          {detail}
        </Code>
        <Button onClick={() => window.location.reload()}>{t('actions.reload')}</Button>
      </Stack>
    </Center>
  );
}
