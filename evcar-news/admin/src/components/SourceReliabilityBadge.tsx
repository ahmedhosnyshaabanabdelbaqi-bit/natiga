import { Badge, Stack, Text, Tooltip } from '@mantine/core';
import {
  IconAlertTriangle,
  IconBuildingFactory2,
  IconChartDots,
  IconHelpCircle,
  IconShieldCheck,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { Reliability } from '@/api/types';
import { formatDate } from '@/lib/format';

const META: Record<Reliability, { color: string; icon: Icon }> = {
  verified: { color: 'teal', icon: IconShieldCheck },
  manufacturer_claim: { color: 'blue', icon: IconBuildingFactory2 },
  estimated: { color: 'yellow', icon: IconChartDots },
  unverified: { color: 'gray', icon: IconHelpCircle },
  disputed: { color: 'red', icon: IconAlertTriangle },
};

export interface SourceReliabilityBadgeProps {
  reliability: Reliability | null | undefined;
  sourceName?: string | null;
  verifiedAt?: string | null;
  size?: 'xs' | 'sm' | 'md';
}

/** Reliability of a spec value with its source and verification date in a tooltip. */
export function SourceReliabilityBadge({
  reliability,
  sourceName,
  verifiedAt,
  size = 'sm',
}: SourceReliabilityBadgeProps) {
  const { t, i18n } = useTranslation('common');
  const level: Reliability = reliability ?? 'unverified';
  const { color, icon: IconCmp } = META[level];
  const label = t(`reliability.${level}`);
  return (
    <Tooltip
      withArrow
      label={
        <Stack gap={2}>
          <Text size="xs" fw={600}>
            {label}
          </Text>
          <Text size="xs">
            {t('reliability.source')}: {sourceName || t('states.notAvailable')}
          </Text>
          <Text size="xs">
            {t('reliability.verifiedAt')}:{' '}
            {verifiedAt ? formatDate(verifiedAt, i18n.language) : t('states.notAvailable')}
          </Text>
        </Stack>
      }
    >
      <Badge
        size={size}
        variant="light"
        color={color}
        leftSection={<IconCmp size={12} aria-hidden />}
        tabIndex={0}
      >
        {label}
      </Badge>
    </Tooltip>
  );
}
