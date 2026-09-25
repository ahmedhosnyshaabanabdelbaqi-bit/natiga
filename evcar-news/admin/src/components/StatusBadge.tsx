import { Badge, type BadgeProps } from '@mantine/core';
import {
  IconArchive,
  IconCircleCheck,
  IconClock,
  IconEye,
  IconPencil,
  IconQuestionMark,
  type Icon,
} from '@tabler/icons-react';
import { useTranslation } from 'react-i18next';
import type { ContentStatus } from '@/api/types';

const META: Record<ContentStatus, { color: string; icon: Icon }> = {
  draft: { color: 'gray', icon: IconPencil },
  in_review: { color: 'yellow', icon: IconEye },
  scheduled: { color: 'blue', icon: IconClock },
  published: { color: 'teal', icon: IconCircleCheck },
  archived: { color: 'dark', icon: IconArchive },
};

/** Content workflow status (draft → in_review → scheduled → published → archived). Icon + text, never colour only. */
export function StatusBadge({
  status,
  ...props
}: { status: ContentStatus | string } & Omit<BadgeProps, 'children' | 'color' | 'leftSection'>) {
  const { t } = useTranslation('common');
  const meta = (META as Record<string, { color: string; icon: Icon } | undefined>)[status];
  const IconCmp = meta?.icon ?? IconQuestionMark;
  return (
    <Badge
      variant="light"
      color={meta?.color ?? 'gray'}
      leftSection={<IconCmp size={12} aria-hidden />}
      {...props}
    >
      {meta ? t(`status.${status}`) : status}
    </Badge>
  );
}
