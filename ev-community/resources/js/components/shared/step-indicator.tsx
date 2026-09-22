import { Check } from 'lucide-react';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

export type Step = {
    key: string;
    label: string;
    description?: string;
};

type Props = {
    steps: Step[];
    /** Key or zero-based index of the current step. */
    current: string | number;
    orientation?: 'horizontal' | 'vertical';
    /** Marks every step as done (e.g. completed workflow). */
    completed?: boolean;
    className?: string;
};

type Status = 'done' | 'current' | 'pending';

/** Workflow progress (order lifecycle, booking, onboarding). */
export function StepIndicator({ steps, current, orientation = 'horizontal', completed = false, className }: Props) {
    const currentIndex = typeof current === 'number' ? current : steps.findIndex((step) => step.key === current);
    const statusOf = (index: number): Status => {
        if (completed || index < currentIndex) {
            return 'done';
        }
        return index === currentIndex ? 'current' : 'pending';
    };
    const horizontal = orientation === 'horizontal';

    return (
        <ol aria-label={t('ui.steps.label')} className={cn('flex gap-0', horizontal ? 'flex-col sm:flex-row sm:items-start' : 'flex-col', className)}>
            {steps.map((step, index) => {
                const status = statusOf(index);
                const last = index === steps.length - 1;
                return (
                    <li
                        key={step.key}
                        aria-current={status === 'current' ? 'step' : undefined}
                        data-status={status}
                        className={cn('relative flex gap-3', horizontal ? 'sm:flex-1 sm:flex-col sm:items-center sm:text-center' : '', !last && 'pb-6 sm:pb-0')}
                    >
                        {!last ? (
                            <span
                                aria-hidden="true"
                                className={cn(
                                    'absolute bg-border',
                                    horizontal
                                        ? 'top-4 start-4 h-[calc(100%-1rem)] w-px sm:top-4 sm:start-1/2 sm:h-px sm:w-full'
                                        : 'top-8 start-4 h-[calc(100%-1.5rem)] w-px',
                                    status === 'done' && 'bg-brand',
                                )}
                            />
                        ) : null}
                        <span
                            className={cn(
                                'relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full border text-sm font-semibold',
                                status === 'done' && 'border-brand bg-brand text-brand-foreground',
                                status === 'current' && 'border-brand bg-background text-brand ring-4 ring-brand/15',
                                status === 'pending' && 'border-border bg-background text-muted-foreground',
                            )}
                        >
                            {status === 'done' ? <Check className="size-4" aria-hidden="true" /> : index + 1}
                        </span>
                        <span className={cn('min-w-0', horizontal && 'sm:mt-2')}>
                            <span className={cn('block text-sm font-medium', status === 'pending' && 'text-muted-foreground')}>
                                {step.label}
                                <span className="sr-only">
                                    {' '}
                                    ({t(`ui.steps.${status}`)})
                                </span>
                            </span>
                            {step.description ? <span className="block text-xs text-muted-foreground">{step.description}</span> : null}
                        </span>
                    </li>
                );
            })}
        </ol>
    );
}
