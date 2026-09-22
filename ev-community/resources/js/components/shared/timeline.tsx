import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { DateTime } from '@/components/shared/date-time';
import type { Tone } from '@/components/shared/tone';
import { toneSolid, toneSoft } from '@/components/shared/tone';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type TimelineItem = {
    id?: string | number;
    title: ReactNode;
    description?: ReactNode;
    /** ISO timestamp (null renders no time). */
    at: string | null;
    /** Who did it (name), if known. */
    actor?: string | null;
    tone?: Tone;
    icon?: LucideIcon;
};

type Props = {
    items: TimelineItem[];
    /** Compact spacing for side panels. */
    dense?: boolean;
    /** Show absolute date-time instead of relative time. */
    absolute?: boolean;
    className?: string;
};

/** Vertical status history (order/payment/booking/ticket timelines). */
export function Timeline({ items, dense = false, absolute = false, className }: Props) {
    if (items.length === 0) {
        return null;
    }
    return (
        <ol aria-label={t('ui.timeline.label')} className={cn('relative ms-3 border-s border-border', className)}>
            {items.map((item, index) => {
                const tone = item.tone ?? 'muted';
                const Icon = item.icon;
                return (
                    <li key={item.id ?? index} className={cn('relative ps-6', dense ? 'pb-4' : 'pb-6', 'last:pb-0')}>
                        <span
                            aria-hidden="true"
                            className={cn(
                                'absolute top-0.5 -start-[calc(0.5rem+1px)] flex size-4 items-center justify-center rounded-full ring-4 ring-background',
                                Icon ? cn('size-6 -start-[calc(0.75rem+1px)]', toneSoft[tone]) : toneSolid[tone],
                            )}
                        >
                            {Icon ? <Icon className="size-3.5" /> : null}
                        </span>
                        <div className={cn('flex flex-col gap-0.5', Icon && 'pt-0.5')}>
                            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                                <p className="text-sm font-medium">{item.title}</p>
                                {item.at ? (
                                    <DateTime value={item.at} mode={absolute ? 'datetime' : 'relative'} className="text-xs text-muted-foreground tabular" />
                                ) : null}
                            </div>
                            {item.description ? <div className="text-sm text-muted-foreground">{item.description}</div> : null}
                            {item.actor ? <p className="text-xs text-muted-foreground">{t('ui.timeline.by', { actor: item.actor })}</p> : null}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}
