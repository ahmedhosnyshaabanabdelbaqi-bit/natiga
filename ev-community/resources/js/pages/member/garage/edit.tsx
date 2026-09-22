import { Head, Link, useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useMemo } from 'react';
import { FormActions } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { GarageVehicleDetail } from '@/features/garage/types';
import type { VehicleFormData } from '@/features/garage/vehicle-form';
import {
    DetailsFields,
    IdentityFields,
    PhotoFields,
    stepIsComplete,
    toPayload,
    VehicleFields,
} from '@/features/garage/vehicle-form';
import { withCurrentSelection } from '@/features/vehicles/catalog';
import type { CatalogVariant, VehicleCatalog } from '@/features/vehicles/types';
import { t } from '@/lib/i18n';
import { edit, index, show, update } from '@/routes/member/garage';

type Props = {
    vehicle: GarageVehicleDetail & {
        vehicle_make_id: number;
        vehicle_model_id: number;
        vehicle_variant_id: number | null;
        battery_variant_id: number | null;
    };
    currentSelection: {
        make: { id: number; name: string };
        model: { id: number; name: string };
        variant: CatalogVariant | null;
    };
    vehicleData: VehicleCatalog;
    maxImageMb: number;
    supportUrl: string | null;
};

export default function GarageEdit({
    vehicle,
    currentSelection,
    vehicleData,
    maxImageMb,
    supportUrl,
}: Props) {
    const catalog = useMemo(
        () => withCurrentSelection(vehicleData, currentSelection),
        [vehicleData, currentSelection],
    );
    const form = useForm<VehicleFormData>({
        vehicle_make_id: vehicle.vehicle_make_id,
        vehicle_model_id: vehicle.vehicle_model_id,
        vehicle_variant_id: vehicle.vehicle_variant_id,
        year: vehicle.year,
        market_version: vehicle.market_version.value,
        battery_variant_id: vehicle.battery_variant_id
            ? String(vehicle.battery_variant_id)
            : '',
        odometer_km: '',
        vin: '',
        vin_action: 'keep',
        nickname: vehicle.nickname ?? '',
        color: vehicle.color ?? '',
        plate_hint: vehicle.plate_hint ?? '',
        image: null,
        remove_image: false,
    });
    const valid = (['vehicle', 'details', 'identity', 'photo'] as const).every(
        (step) => stepIsComplete(step, form.data, maxImageMb),
    );
    const domainError = (form.errors as Record<string, string | undefined>)
        .domain;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        // Files cannot be sent with PUT: post multipart and let Laravel spoof the method.
        form.transform((data) => ({ ...toPayload(data), _method: 'put' }));
        form.post(update(vehicle.id).url, {
            forceFormData: true,
            preserveScroll: true,
        });
    };

    return (
        <>
            <Head title={t('garage.edit.title')} />
            <form
                onSubmit={submit}
                className="mx-auto max-w-3xl space-y-6"
                noValidate
            >
                <PageHeader
                    title={t('garage.edit.title')}
                    description={vehicle.display_name}
                />
                {domainError ? (
                    <InlineAlert tone="danger">{domainError}</InlineAlert>
                ) : null}
                <SectionCard
                    title={t('garage.wizard.steps.vehicle')}
                    description={t('garage.wizard.vehicle_help')}
                >
                    <VehicleFields form={form} catalog={catalog} />
                </SectionCard>
                <SectionCard
                    title={t('garage.wizard.steps.details')}
                    description={t('garage.edit.odometer_elsewhere')}
                >
                    <DetailsFields
                        form={form}
                        catalog={catalog}
                        withOdometer={false}
                    />
                </SectionCard>
                <SectionCard
                    title={t('garage.wizard.steps.identity')}
                    description={t('garage.wizard.identity_help')}
                >
                    <IdentityFields
                        form={form}
                        maskedVin={vehicle.vin_masked}
                        supportUrl={supportUrl}
                    />
                </SectionCard>
                <SectionCard
                    title={t('garage.wizard.steps.photo')}
                    description={t('garage.wizard.photo_help')}
                >
                    <PhotoFields
                        form={form}
                        maxImageMb={maxImageMb}
                        currentImage={vehicle.image_url}
                    />
                </SectionCard>
                <FormActions>
                    <Button asChild variant="outline">
                        <Link href={show(vehicle.id).url}>
                            {t('core.actions.cancel')}
                        </Link>
                    </Button>
                    <Button type="submit" disabled={!valid || form.processing}>
                        {form.processing ? <Spinner /> : null}
                        {t('garage.edit.submit')}
                    </Button>
                </FormActions>
            </form>
        </>
    );
}

GarageEdit.layout = (props: Props) => ({
    breadcrumbs: [
        { title: t('garage.title'), href: index().url },
        { title: props.vehicle.display_name, href: show(props.vehicle.id).url },
        { title: t('garage.edit.title'), href: edit(props.vehicle.id).url },
    ],
});
