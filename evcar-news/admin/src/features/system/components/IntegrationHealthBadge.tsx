import { Badge } from '@mantine/core';
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconPlugConnectedX,
  IconPlayerPause,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { IntegrationHealth } from '../api';

const META = {
  ok: { color: 'teal', icon: IconCircleCheck },
  error: { color: 'red', icon: IconAlertTriangle },
  not_configured: { color: 'gray', icon: IconPlugConnectedX },
  disabled: { color: 'yellow', icon: IconPlayerPause },
} as const;

export function IntegrationHealthBadge({ health }: { health: IntegrationHealth }) {
  const { t } = useTranslation('system');
  const { color, icon: Icon } = META[health];
  return (
    <Badge variant="light" color={color} leftSection={<Icon size={12} aria-hidden />}>
      {t(`health.${health}`)}
    </Badge>
  );
}
