/**
 * Semantic tones shared by badges, timelines, alerts, progress bars and dots.
 * Every map is keyed by the same union so modules can pass a `tone` prop and
 * get consistent colors in light and dark mode.
 */
export type Tone = 'default' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'muted';

export const toneText: Record<Tone, string> = {
    default: 'text-foreground',
    brand: 'text-brand',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-danger',
    info: 'text-info',
    muted: 'text-muted-foreground',
};

/** Soft (tinted) background + matching text, for boxes and chips. */
export const toneSoft: Record<Tone, string> = {
    default: 'bg-muted text-foreground',
    brand: 'bg-brand-soft text-brand dark:text-brand-foreground dark:bg-brand',
    success: 'bg-success-soft text-success dark:text-success-foreground dark:bg-success/80',
    warning: 'bg-warning-soft text-warning dark:text-warning-foreground dark:bg-warning/80',
    danger: 'bg-danger-soft text-danger dark:text-danger-foreground dark:bg-danger/80',
    info: 'bg-info-soft text-info dark:text-info-foreground dark:bg-info/80',
    muted: 'bg-muted text-muted-foreground',
};

/** Solid background, for dots, bars and indicators. */
export const toneSolid: Record<Tone, string> = {
    default: 'bg-foreground',
    brand: 'bg-brand',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger',
    info: 'bg-info',
    muted: 'bg-muted-foreground',
};

export const toneBorder: Record<Tone, string> = {
    default: 'border-border',
    brand: 'border-brand/40',
    success: 'border-success/40',
    warning: 'border-warning/40',
    danger: 'border-danger/40',
    info: 'border-info/40',
    muted: 'border-border',
};

export const tones: Tone[] = ['default', 'brand', 'success', 'warning', 'danger', 'info', 'muted'];

export function isTone(value: unknown): value is Tone {
    return typeof value === 'string' && (tones as string[]).includes(value);
}
