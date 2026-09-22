import type { ReactNode } from 'react';
import type { Tone } from '@/components/shared/tone';
import { toneSolid } from '@/components/shared/tone';
import { Progress } from '@/components/ui/progress';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    value: number;
    max?: number;
    label?: ReactNode;
    /** `percent` (default) shows "42%", `fraction` shows "42 of 100", `none` hides the text. */
    format?: 'percent' | 'fraction' | 'none';
    /** Optional secondary text under the bar (e.g. "3 more to reach the minimum"). */
    hint?: ReactNode;
    tone?: Tone;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
};

const heights = { sm: 'h-1.5', md: 'h-2', lg: 'h-3' } as const;

/** Labelled progress bar (group-buy quantities, capacity, uploads). */
export function ProgressBar({
    value,
    max = 100,
    label,
    format = 'percent',
    hint,
    tone = 'brand',
    size = 'md',
    className,
}: Props) {
    const safeMax = max > 0 ? max : 1;
    const percent = Math.min(100, Math.max(0, (value / safeMax) * 100));
    const text =
        format === 'none'
            ? null
            : format === 'fraction'
              ? t('ui.progress.of', {
                    value: formatNumber(value, 0),
                    max: formatNumber(max, 0),
                })
              : t('ui.progress.percent', { percent: formatNumber(percent, 0) });
    const ariaLabel = typeof label === 'string' ? label : undefined;

    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            {label || text ? (
                <div className="flex items-center justify-between gap-3 text-sm">
                    {label ? (
                        <span className="min-w-0 truncate font-medium">
                            {label}
                        </span>
                    ) : (
                        <span />
                    )}
                    {text ? (
                        <span className="tabular shrink-0 text-muted-foreground">
                            {text}
                        </span>
                    ) : null}
                </div>
            ) : null}
            <Progress
                value={value}
                max={safeMax}
                aria-label={ariaLabel}
                className={heights[size]}
                indicatorClassName={toneSolid[tone]}
            />
            {hint ? (
                <p className="text-xs text-muted-foreground">{hint}</p>
            ) : null}
        </div>
    );
}
