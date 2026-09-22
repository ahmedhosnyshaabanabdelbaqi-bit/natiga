import { Link } from '@inertiajs/react';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';

export type RankedItem = {
    key: string;
    label: string;
    sublabel?: string;
    value: number;
    href?: string;
};

/**
 * Single-series ranked horizontal bars (magnitude → one hue). Value at the bar tip, bars ≤ 12px thick with
 * a rounded data end and a square baseline; the list itself is the accessible table view.
 */
export function RankedBars({
    items,
    caption,
    valueLabel,
}: {
    items: RankedItem[];
    caption: string;
    valueLabel: string;
}) {
    const max = Math.max(1, ...items.map((item) => item.value));
    return (
        <table className="w-full text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="sr-only">
                <tr>
                    <th scope="col">{caption}</th>
                    <th scope="col">{valueLabel}</th>
                </tr>
            </thead>
            <tbody>
                {items.map((item) => (
                    <tr
                        key={item.key}
                        className="group align-middle"
                        title={`${item.label}: ${formatNumber(item.value, 0)}`}
                    >
                        <th
                            scope="row"
                            className="w-2/5 py-1.5 pe-3 text-start font-normal"
                        >
                            {item.href ? (
                                <Link
                                    href={item.href}
                                    className="block truncate hover:underline"
                                >
                                    {item.label}
                                </Link>
                            ) : (
                                <span className="block truncate">
                                    {item.label}
                                </span>
                            )}
                            {item.sublabel ? (
                                <span className="block truncate text-xs text-muted-foreground">
                                    {item.sublabel}
                                </span>
                            ) : null}
                        </th>
                        <td className="py-1.5">
                            <div className="flex items-center gap-2">
                                <div className="h-3 flex-1">
                                    <div
                                        className="h-3 rounded-e-[4px] bg-brand/80 transition group-hover:bg-brand"
                                        style={{
                                            width: `${Math.max(2, (item.value / max) * 100)}%`,
                                        }}
                                        aria-hidden="true"
                                    />
                                </div>
                                <span className="tabular w-12 shrink-0 text-end text-xs font-medium text-foreground">
                                    {formatNumber(item.value, 0)}
                                </span>
                            </div>
                        </td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}

/** Single-series columns over an ordinal time axis (model year). Hover/focus shows the value; the sr-only table carries all values. */
export function YearColumns({
    items,
    caption,
    valueLabel,
}: {
    items: { year: number; total: number }[];
    caption: string;
    valueLabel: string;
}) {
    const max = Math.max(1, ...items.map((item) => item.total));
    const peak = items.reduce<{ year: number; total: number } | null>(
        (best, item) =>
            best === null || item.total > best.total ? item : best,
        null,
    );
    return (
        <figure className="space-y-2">
            <div
                className="flex h-44 items-end gap-0.5 border-b border-border"
                aria-hidden="true"
            >
                {items.map((item) => (
                    <div
                        key={item.year}
                        className="group relative flex h-full min-w-0 flex-1 flex-col items-center justify-end"
                        title={`${item.year}: ${formatNumber(item.total, 0)}`}
                    >
                        <span
                            className={cn(
                                'tabular mb-1 text-[10px] text-muted-foreground opacity-0 transition group-hover:opacity-100',
                                peak?.year === item.year &&
                                    'font-medium text-foreground opacity-100',
                            )}
                        >
                            {formatNumber(item.total, 0)}
                        </span>
                        <div
                            className="w-full max-w-6 rounded-t-[4px] bg-brand/80 transition group-hover:bg-brand"
                            style={{
                                height: `${Math.max(2, (item.total / max) * 85)}%`,
                            }}
                        />
                    </div>
                ))}
            </div>
            <div className="flex gap-0.5" aria-hidden="true">
                {items.map((item) => (
                    <span
                        key={item.year}
                        className="tabular min-w-0 flex-1 truncate text-center text-[10px] text-muted-foreground"
                    >
                        {item.year}
                    </span>
                ))}
            </div>
            <table className="sr-only">
                <caption>{caption}</caption>
                <thead>
                    <tr>
                        <th scope="col">{caption}</th>
                        <th scope="col">{valueLabel}</th>
                    </tr>
                </thead>
                <tbody>
                    {items.map((item) => (
                        <tr key={item.year}>
                            <th scope="row">{item.year}</th>
                            <td>{item.total}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </figure>
    );
}
