import { Info, PlugZap } from 'lucide-react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Code } from '@/components/ui/code';
import type {
    GarageSectionProps,
    InfoSectionData,
} from '@/features/garage/types';
import { VinReveal } from '@/features/garage/vin-reveal';
import type { ConnectorSummary } from '@/features/vehicles/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';

function ConnectorValue({ connector }: { connector: ConnectorSummary | null }) {
    if (!connector) {
        return (
            <span className="text-muted-foreground">
                {t('garage.info.not_available')}
            </span>
        );
    }
    return (
        <span className="inline-flex flex-wrap items-center gap-2">
            <span>{connector.name}</span>
            <Badge variant="outline">
                {t(`vehicles.current_type.${connector.current_type}`)}
            </Badge>
        </span>
    );
}

/** "Info & specs" tab: identity, specifications (approximate), battery and charging connectors. */
export default function InfoSection({
    data,
    vehicle,
    canUpdate,
}: GarageSectionProps<InfoSectionData>) {
    return (
        <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={t('garage.info.identity')}>
                <DescriptionList
                    items={[
                        { label: t('vehicles.fields.make'), value: data.make },
                        {
                            label: t('vehicles.fields.model'),
                            value: data.model,
                        },
                        {
                            label: t('vehicles.fields.variant'),
                            value:
                                data.variant ??
                                t('vehicles.selector.unknown_variant'),
                        },
                        {
                            label: t('vehicles.fields.year'),
                            value: String(data.year),
                        },
                        {
                            label: t('vehicles.fields.market_version'),
                            value: data.market_version,
                        },
                        {
                            label: t('vehicles.fields.model_code'),
                            value: data.model_code,
                            type: 'code',
                            hidden: !data.model_code,
                        },
                        {
                            label: t('vehicles.fields.body_type'),
                            value: data.body_type
                                ? t(`vehicles.body_type.${data.body_type}`)
                                : null,
                        },
                        {
                            label: t('vehicles.fields.nickname'),
                            value: data.nickname,
                            hidden: !data.nickname,
                        },
                        {
                            label: t('vehicles.fields.color'),
                            value: data.color,
                            hidden: !data.color,
                        },
                        {
                            label: t('vehicles.fields.plate_hint'),
                            value: data.plate_hint ? (
                                <Code>{data.plate_hint}</Code>
                            ) : null,
                            hidden: !data.plate_hint,
                        },
                        {
                            label: t('vehicles.fields.vin'),
                            full: true,
                            value:
                                canUpdate && data.has_vin ? (
                                    <VinReveal
                                        vehicleId={vehicle.id}
                                        masked={data.vin_masked}
                                    />
                                ) : data.vin_masked ? (
                                    <Code>{data.vin_masked}</Code>
                                ) : (
                                    t('garage.info.no_vin')
                                ),
                        },
                    ]}
                />
            </SectionCard>
            <div className="grid content-start gap-4">
                <SectionCard title={t('garage.info.specs')}>
                    {data.variant === null ? (
                        <InlineAlert tone="info" icon={Info}>
                            {t('garage.info.unknown_variant')}
                        </InlineAlert>
                    ) : null}
                    <DescriptionList
                        className={data.variant === null ? 'mt-4' : undefined}
                        items={[
                            {
                                label: t('vehicles.fields.trim'),
                                value: data.trim,
                                hidden: !data.trim,
                            },
                            {
                                label: t('garage.info.battery'),
                                value: data.battery_capacity_kwh
                                    ? t('garage.info.kwh', {
                                          value: formatNumber(
                                              data.battery_capacity_kwh,
                                              2,
                                          ),
                                      })
                                    : null,
                            },
                            {
                                label: t('vehicles.fields.chemistry'),
                                value: data.battery?.chemistry ?? null,
                                hidden: !data.battery?.chemistry,
                            },
                            {
                                label: t('vehicles.fields.motor_kw'),
                                value: data.motor_kw
                                    ? t('garage.info.kw', {
                                          value: formatNumber(data.motor_kw, 0),
                                      })
                                    : null,
                                hidden: !data.motor_kw,
                            },
                            {
                                label: t('vehicles.fields.range_km_wltp'),
                                value: data.range_km_wltp
                                    ? t('garage.info.km', {
                                          value: formatNumber(
                                              data.range_km_wltp,
                                              0,
                                          ),
                                      })
                                    : null,
                                hidden: !data.range_km_wltp,
                            },
                        ]}
                    />
                    {data.spec_notes ? (
                        <p className="mt-4 text-xs text-muted-foreground">
                            {t('vehicles.hints.spec_approximate')}
                        </p>
                    ) : null}
                </SectionCard>
                <SectionCard
                    title={t('garage.info.connectors')}
                    actions={
                        <PlugZap
                            className="size-4 text-muted-foreground"
                            aria-hidden="true"
                        />
                    }
                >
                    <DescriptionList
                        columns={1}
                        layout="inline"
                        items={[
                            {
                                label: t('garage.info.ac_port'),
                                value: (
                                    <ConnectorValue
                                        connector={data.connectors.ac}
                                    />
                                ),
                            },
                            {
                                label: t('garage.info.dc_port'),
                                value: (
                                    <ConnectorValue
                                        connector={data.connectors.dc}
                                    />
                                ),
                            },
                        ]}
                    />
                </SectionCard>
            </div>
        </div>
    );
}
