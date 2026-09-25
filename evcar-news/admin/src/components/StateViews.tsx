import {
  Alert,
  Button,
  Center,
  Code,
  EmptyState as MantineEmptyState,
  Group,
  Loader,
  Stack,
  Text,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconInbox,
  IconLock,
  IconPlugConnectedX,
  IconRefresh,
  IconWifiOff,
} from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { describeError } from '@/api/describeError';
import { CLIENT_ERROR_CODES, isApiError } from '@/api/errors';

export function LoadingState({ label, minHeight = 200 }: { label?: string; minHeight?: number }) {
  const { t } = useTranslation('common');
  const text = label ?? t('states.loading');
  return (
    <Center mih={minHeight} role="status" aria-live="polite">
      <Stack align="center" gap="xs">
        <Loader size="md" aria-hidden />
        <Text c="dimmed" size="sm">
          {text}
        </Text>
      </Stack>
    </Center>
  );
}

export function EmptyState({
  title,
  description,
  icon,
  action,
}: {
  title?: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  action?: ReactNode;
}) {
  const { t } = useTranslation('common');
  return (
    <MantineEmptyState
      py="xl"
      icon={icon ?? <IconInbox size={28} aria-hidden />}
      title={title ?? t('states.emptyTitle')}
      description={description ?? t('states.emptyDescription')}
    >
      {action}
    </MantineEmptyState>
  );
}

/**
 * Renders any thrown error with a localized explanation, the server's
 * requestId (for support) and an optional retry button.
 */
export function ErrorState({
  error,
  onRetry,
  compact = false,
}: {
  error: unknown;
  onRetry?: (() => void) | undefined;
  compact?: boolean;
}) {
  const { t } = useTranslation('common');
  const { title, message, requestId } = describeError(error, t);
  const icon = !isApiError(error) ? (
    <IconAlertCircle aria-hidden />
  ) : error.code === CLIENT_ERROR_CODES.network ? (
    <IconWifiOff aria-hidden />
  ) : error.isForbidden ? (
    <IconLock aria-hidden />
  ) : error.isNotConfigured ? (
    <IconPlugConnectedX aria-hidden />
  ) : (
    <IconAlertCircle aria-hidden />
  );
  const color =
    isApiError(error) && (error.isForbidden || error.isNotConfigured) ? 'yellow' : 'red';

  return (
    <Alert
      color={color}
      icon={icon}
      title={title}
      role="alert"
      variant={compact ? 'light' : 'outline'}
      my={compact ? 0 : 'md'}
    >
      <Stack gap="xs">
        <Text size="sm">{message}</Text>
        {requestId ? (
          <Text size="xs" c="dimmed">
            {t('errors.requestId')}: <Code>{requestId}</Code>
          </Text>
        ) : null}
        {onRetry ? (
          <Group>
            <Button
              size="xs"
              variant="light"
              color={color}
              leftSection={<IconRefresh size={14} aria-hidden />}
              onClick={onRetry}
            >
              {t('actions.retry')}
            </Button>
          </Group>
        ) : null}
      </Stack>
    </Alert>
  );
}

/** Wraps the loading / error / empty / data states of a query in one place. */
export function QueryState<T>({
  query,
  isEmpty,
  empty,
  children,
}: {
  query: { data: T | undefined; error: unknown; isPending: boolean; refetch: () => unknown };
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.isPending) return <LoadingState />;
  if (query.error || query.data === undefined)
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
  if (isEmpty?.(query.data)) return <>{empty ?? <EmptyState />}</>;
  return <>{children(query.data)}</>;
}
