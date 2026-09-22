import type { LucideIcon } from 'lucide-react';
import { Monitor, Moon, Sun } from 'lucide-react';
import type { HTMLAttributes, KeyboardEvent } from 'react';
import type { Appearance } from '@/hooks/use-appearance';
import { useAppearance } from '@/hooks/use-appearance';
import { isRtl, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/** Light / dark / system theme switch (a keyboard-operable radio group). */
export default function AppearanceToggleTab({
    className = '',
    ...props
}: HTMLAttributes<HTMLDivElement>) {
    const { appearance, updateAppearance } = useAppearance();

    const tabs: { value: Appearance; icon: LucideIcon; label: string }[] = [
        { value: 'light', icon: Sun, label: t('settings.appearance.light') },
        { value: 'dark', icon: Moon, label: t('settings.appearance.dark') },
        {
            value: 'system',
            icon: Monitor,
            label: t('settings.appearance.system'),
        },
    ];

    const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
        const index = tabs.findIndex((tab) => tab.value === appearance);
        const forward = isRtl() ? 'ArrowLeft' : 'ArrowRight';
        const backward = isRtl() ? 'ArrowRight' : 'ArrowLeft';
        let next: number | null = null;
        if (event.key === forward || event.key === 'ArrowDown') {
            next = (index + 1) % tabs.length;
        } else if (event.key === backward || event.key === 'ArrowUp') {
            next = (index - 1 + tabs.length) % tabs.length;
        }
        if (next !== null) {
            event.preventDefault();
            updateAppearance(tabs[next].value);
            event.currentTarget.parentElement
                ?.querySelectorAll<HTMLButtonElement>('button[role="radio"]')
                [next]?.focus();
        }
    };

    return (
        <div
            role="radiogroup"
            aria-label={t('settings.appearance.label')}
            className={cn(
                'inline-flex gap-1 rounded-lg bg-neutral-100 p-1 dark:bg-neutral-800',
                className,
            )}
            {...props}
        >
            {tabs.map(({ value, icon: Icon, label }) => {
                const checked = appearance === value;
                return (
                    <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={checked}
                        tabIndex={checked ? 0 : -1}
                        onClick={() => updateAppearance(value)}
                        onKeyDown={onKeyDown}
                        className={cn(
                            'flex items-center gap-1.5 rounded-md px-3.5 py-1.5 transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                            checked
                                ? 'bg-white shadow-xs dark:bg-neutral-700 dark:text-neutral-100'
                                : 'text-neutral-500 hover:bg-neutral-200/60 hover:text-black dark:text-neutral-400 dark:hover:bg-neutral-700/60',
                        )}
                    >
                        <Icon className="size-4" aria-hidden="true" />
                        <span className="text-sm">{label}</span>
                    </button>
                );
            })}
        </div>
    );
}
