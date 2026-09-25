import { Badge } from '@mantine/core';
import { IconBan, IconCircleCheck } from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { UserStatus } from '../api';

export function UserStatusBadge({ status }: { status: UserStatus | string }) {
  const { t } = useTranslation('users');
  const suspended = status === 'suspended';
  return (
    <Badge
      variant="light"
      color={suspended ? 'red' : 'teal'}
      leftSection={
        suspended ? <IconBan size={12} aria-hidden /> : <IconCircleCheck size={12} aria-hidden />
      }
    >
      {t(`status.${suspended ? 'suspended' : 'active'}`)}
    </Badge>
  );
}
