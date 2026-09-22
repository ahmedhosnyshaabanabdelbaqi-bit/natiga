import { Star } from 'lucide-react';
import type { KeyboardEvent } from 'react';
import { useState } from 'react';
import { isRtl, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    value: number;
    max?: number;
    /** When provided (and not readOnly) the component becomes an input. */
    onChange?: (value: number) => void;
    readOnly?: boolean;
    size?: 'sm' | 'md' | 'lg';
    /** Accessible name of the group; defaults to ui.rating.label. */
    label?: string;
    /** Hidden input name so the value is submitted with plain HTML forms. */
    name?: string;
    /** Show the numeric value next to the stars (read-only mode). */
    showValue?: boolean;
    className?: string;
};

const sizes = { sm: 'size-3.5', md: 'size-5', lg: 'size-7' } as const;

/** Star rating: read-only display or a keyboard-operable radio-group input. */
export function Rating({
    value,
    max = 5,
    onChange,
    readOnly = false,
    size = 'md',
    label,
    name,
    showValue = false,
    className,
}: Props) {
    const [hovered, setHovered] = useState<number | null>(null);
    const interactive = !readOnly && typeof onChange === 'function';
    const shown = hovered ?? value;
    const stars = Array.from({ length: max }, (_, index) => index + 1);

    const star = (index: number, filled: boolean) => (
        <Star
            className={cn(
                sizes[size],
                'transition-colors',
                filled
                    ? 'fill-warning text-warning'
                    : 'fill-transparent text-muted-foreground/50',
            )}
            aria-hidden="true"
        />
    );

    if (!interactive) {
        return (
            <span
                className={cn('inline-flex items-center gap-0.5', className)}
                role="img"
                aria-label={t('ui.rating.value', { value, max })}
            >
                {stars.map((index) => (
                    <span key={index}>
                        {star(index, index <= Math.round(value))}
                    </span>
                ))}
                {showValue ? (
                    <span className="tabular ms-1.5 text-sm text-muted-foreground">
                        {value.toFixed(1)}
                    </span>
                ) : null}
            </span>
        );
    }

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const next = isRtl()
            ? ['ArrowLeft', 'ArrowUp']
            : ['ArrowRight', 'ArrowUp'];
        const prev = isRtl()
            ? ['ArrowRight', 'ArrowDown']
            : ['ArrowLeft', 'ArrowDown'];
        let target: number | null = null;
        if (next.includes(event.key)) {
            target = Math.min(max, value + 1);
        } else if (prev.includes(event.key)) {
            target = Math.max(1, value - 1);
        } else if (event.key === 'Home') {
            target = 1;
        } else if (event.key === 'End') {
            target = max;
        }
        if (target !== null) {
            event.preventDefault();
            onChange(target);
            const button =
                event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
                    'button[role="radio"]',
                )[target - 1];
            button?.focus();
        }
    };

    return (
        <div
            role="radiogroup"
            aria-label={label ?? t('ui.rating.label')}
            className={cn('inline-flex items-center gap-0.5', className)}
            onMouseLeave={() => setHovered(null)}
        >
            {name ? <input type="hidden" name={name} value={value} /> : null}
            {stars.map((index) => {
                const checked = index === value;
                return (
                    <button
                        key={index}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        aria-label={t('ui.rating.star', { count: index, max })}
                        tabIndex={
                            checked || (value === 0 && index === 1) ? 0 : -1
                        }
                        className="rounded-sm p-0.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/60"
                        onMouseEnter={() => setHovered(index)}
                        onFocus={() => setHovered(null)}
                        onClick={() => onChange(index === value ? 0 : index)}
                        onKeyDown={onKeyDown}
                    >
                        {star(index, index <= shown)}
                    </button>
                );
            })}
        </div>
    );
}
