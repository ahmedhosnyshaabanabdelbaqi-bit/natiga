import { Link, usePage } from '@inertiajs/react';
import { CheckCircle2, Info, PlugZap, Unplug, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineAlert } from '@/components/shared/inline-alert';
import { SectionCard } from '@/components/shared/section-card';
import type { Tone } from '@/components/shared/tone';
import { toneSoft } from '@/components/shared/tone';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type {
    ChargingSectionData,
    CompatibleConnector,
    GarageSectionProps,
} from '@/features/garage/types';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { edit } from '@/routes/member/garage';

function Group({
    title,
    icon: Icon,
    tone,
    items,
    showAdapter = false,
}: {
    title: string;
    icon: LucideIcon;
    tone: Tone;
    items: CompatibleConnector[];
    showAdapter?: boolean;
}) {
    return (
        <SectionCard
            title={title}
            actions={
                <Icon
                    className={cn('size-5 rounded-full', toneSoft[tone])}
                    aria-hidden="true"
                />
            }
        >
            {items.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                    {t('garage.charging.none')}
                </p>
            ) : (
                <ul className="space-y-3">
                    {items.map((connector) => (
                        <li key={connector.id} className="space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-medium">
                                    {connector.name}
                                </span>
                                <Badge variant="outline">
                                    {t(
                                        `vehicles.current_type.${connector.current_type}`,
                                    )}
                                </Badge>
                            </div>
                            {showAdapter && connector.adapter_name ? (
                                <p className="text-xs text-muted-foreground">
                                    {t('garage.charging.adapter_name')}:{' '}
                                    {connector.adapter_name}
                                </p>
                            ) : null}
                            {connector.notes ? (
                                <p className="text-xs text-muted-foreground">
                                    {connector.notes}
                                </p>
                            ) : null}
                        </li>
                    ))}
                </ul>
            )}
        </SectionCard>
    );
}

/** "Charging compatibility" tab: which station connectors this vehicle can use (from the verified matrix). */
export default function ChargingCompatibilitySection({
    data,
    vehicle,
    canUpdate,
}: GarageSectionProps<ChargingSectionData>) {
    const { modules } = usePage().props;
    const { locale } = useLocale();

    if (!data.known) {
        return (
            <EmptyState
                icon={Unplug}
                title={t('garage.charging.title')}
                description={t('garage.charging.unknown')}
                action={
                    canUpdate ? (
                        <Button asChild variant="outline">
                            <Link href={edit(vehicle.id).url}>
                                {t('garage.edit.title')}
                            </Link>
                        </Button>
                    ) : undefined
                }
            />
        );
    }

    return (
        <div className="space-y-4">
            <SectionCard
                title={t('garage.charging.your_connectors')}
                description={t('garage.charging.description')}
            >
                <div className="flex flex-wrap gap-2">
                    {data.vehicle_connectors.map((connector) => (
                        <Badge
                            key={connector.id}
                            variant="secondary"
                            className="gap-1.5 py-1"
                        >
                            <PlugZap className="size-3.5" aria-hidden="true" />
                            {connector.name}
                        </Badge>
                    ))}
                </div>
            </SectionCard>
            <div className="grid gap-4 md:grid-cols-3">
                <Group
                    title={t('garage.charging.direct')}
                    icon={CheckCircle2}
                    tone="success"
                    items={data.direct}
                />
                <Group
                    title={t('garage.charging.adapter')}
                    icon={Info}
                    tone="warning"
                    items={data.adapter}
                    showAdapter
                />
                <Group
                    title={t('garage.charging.incompatible')}
                    icon={XCircle}
                    tone="danger"
                    items={data.incompatible}
                />
            </div>
            <InlineAlert tone="info">
                {t('garage.charging.disclaimer')}
                {modules.charging_stations !== false ? (
                    <>
                        {' '}
                        <Link href={`/${locale}/charging-stations`}>
                            {t('garage.charging.find_stations')}
                        </Link>
                    </>
                ) : null}
            </InlineAlert>
        </div>
    );
}
