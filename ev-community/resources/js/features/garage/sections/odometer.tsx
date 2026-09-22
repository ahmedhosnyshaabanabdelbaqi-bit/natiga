import { Gauge, TrendingDown } from 'lucide-react';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { OdometerDialog } from '@/features/garage/odometer-dialog';
import type {
    GarageSectionProps,
    OdometerSectionData,
} from '@/features/garage/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

/** "Odometer" tab: current reading, update dialog and the append-only reading history. */
export default function OdometerSection({
    data,
    vehicle,
    canUpdate,
}: GarageSectionProps<OdometerSectionData>) {
    const canRecord = canUpdate && vehicle.status.value === 'active';

    return (
        <SectionCard
            title={t('garage.odometer.history')}
            description={
                data.current_km !== null ? (
                    <>
                        {t('garage.odometer.current')}:{' '}
                        <span className="tabular font-medium text-foreground">
                            {t('garage.info.km', {
                                value: formatNumber(data.current_km, 0),
                            })}
                        </span>
                        {data.updated_at ? (
                            <>
                                {' · '}
                                {t('garage.odometer.last_updated')}{' '}
                                <DateTime value={data.updated_at} mode="date" />
                            </>
                        ) : null}
                    </>
                ) : null
            }
            actions={
                canRecord ? (
                    <OdometerDialog
                        vehicleId={vehicle.id}
                        currentKm={data.current_km}
                    />
                ) : null
            }
            flush={data.history.length > 0}
        >
            {data.history.length === 0 ? (
                <EmptyState
                    icon={Gauge}
                    title={t('garage.odometer.no_history_title')}
                    description={t('garage.odometer.no_history')}
                    action={
                        canRecord ? (
                            <OdometerDialog
                                vehicleId={vehicle.id}
                                currentKm={data.current_km}
                            />
                        ) : undefined
                    }
                    className="border-0"
                />
            ) : (
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>{t('core.labels.date')}</TableHead>
                            <TableHead className="text-end">
                                {t('garage.odometer.reading')}
                            </TableHead>
                            <TableHead>{t('core.labels.source')}</TableHead>
                            <TableHead>{t('core.labels.notes')}</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {data.history.map((entry) => (
                            <TableRow key={entry.id}>
                                <TableCell className="whitespace-nowrap">
                                    <DateTime value={entry.recorded_at} />
                                </TableCell>
                                <TableCell className="tabular text-end whitespace-nowrap">
                                    {entry.is_decrease ? (
                                        <Badge
                                            variant="outline"
                                            className="me-2 text-warning"
                                            title={t(
                                                'garage.odometer.decrease',
                                            )}
                                        >
                                            <TrendingDown
                                                className="size-3"
                                                aria-hidden="true"
                                            />
                                            <span className="sr-only">
                                                {t('garage.odometer.decrease')}
                                            </span>
                                        </Badge>
                                    ) : null}
                                    {t('garage.info.km', {
                                        value: formatNumber(
                                            entry.odometer_km,
                                            0,
                                        ),
                                    })}
                                </TableCell>
                                <TableCell>{entry.source.label}</TableCell>
                                <TableCell className="max-w-72 text-sm break-words text-muted-foreground">
                                    {entry.note ?? '—'}
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            )}
        </SectionCard>
    );
}
