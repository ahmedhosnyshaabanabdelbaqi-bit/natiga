import { StatCard } from '@/components/shared/stat-card';
import { formatMoney, formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

export type Kpi = {
    key: string;
    label: string;
    value: number | string | null;
    href: string | null;
    source: string | null;
    format: 'number' | 'money' | 'text';
    tone: 'default' | 'brand' | 'success' | 'warning' | 'danger';
};

export function KpiGrid({ kpis }: { kpis: Kpi[] }) {
    if (kpis.length === 0) {
        return null;
    }
    return (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {kpis.map((kpi) => (
                <StatCard
                    key={kpi.key}
                    label={kpi.label}
                    value={kpi.value === null ? '—' : kpi.format === 'money' ? formatMoney(kpi.value) : kpi.format === 'number' ? formatNumber(kpi.value, 0) : kpi.value}
                    hint={kpi.source ? `${t('admin.dashboard.source')}: ${kpi.source}` : undefined}
                    href={kpi.href ?? undefined}
                    tone={kpi.tone}
                />
            ))}
        </div>
    );
}
