import { Head, Link, useForm } from '@inertiajs/react';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { FormActions } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StepIndicator } from '@/components/shared/step-indicator';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type {
    STEP_FIELDS,
    VehicleFormData,
} from '@/features/garage/vehicle-form';
import {
    DetailsFields,
    IdentityFields,
    PhotoFields,
    stepIsComplete,
    stepWithError,
    toPayload,
    VehicleFields,
} from '@/features/garage/vehicle-form';
import type { VehicleCatalog } from '@/features/vehicles/types';
import { t } from '@/lib/i18n';
import { create, index, store } from '@/routes/member/garage';

type Props = {
    vehicleData: VehicleCatalog;
    maxImageMb: number;
    supportUrl: string | null;
};

type StepKey = keyof typeof STEP_FIELDS;

const STEPS: StepKey[] = ['vehicle', 'details', 'identity', 'photo'];

export default function GarageCreate({
    vehicleData,
    maxImageMb,
    supportUrl,
}: Props) {
    const [step, setStep] = useState<StepKey>('vehicle');
    const form = useForm<VehicleFormData>({
        vehicle_make_id: null,
        vehicle_model_id: null,
        vehicle_variant_id: null,
        year: null,
        market_version: 'unknown',
        battery_variant_id: '',
        odometer_km: '',
        vin: '',
        vin_action: 'keep',
        nickname: '',
        color: '',
        plate_hint: '',
        image: null,
        remove_image: false,
    });
    const index_ = STEPS.indexOf(step);
    const isLast = index_ === STEPS.length - 1;
    const complete = stepIsComplete(step, form.data, maxImageMb);
    const domainError = (form.errors as Record<string, string | undefined>)
        .domain;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        if (!complete) {
            return;
        }
        if (!isLast) {
            setStep(STEPS[index_ + 1]);
            return;
        }
        form.transform((data) => toPayload(data));
        form.post(store().url, {
            forceFormData: true,
            onError: (errors) => {
                const target = stepWithError(errors);
                if (target) {
                    setStep(target);
                }
            },
        });
    };

    const descriptions: Record<StepKey, string> = {
        vehicle: t('garage.wizard.vehicle_help'),
        details: t('garage.wizard.details_help'),
        identity: t('garage.wizard.identity_help'),
        photo: t('garage.wizard.photo_help'),
    };

    return (
        <>
            <Head title={t('garage.wizard.title')} />
            <form
                onSubmit={submit}
                className="mx-auto max-w-3xl space-y-6"
                noValidate
            >
                <PageHeader
                    title={t('garage.wizard.title')}
                    actions={
                        <Button asChild variant="ghost">
                            <Link href={index().url}>
                                {t('core.actions.cancel')}
                            </Link>
                        </Button>
                    }
                />
                <StepIndicator
                    steps={STEPS.map((key) => ({
                        key,
                        label: t(`garage.wizard.steps.${key}`),
                    }))}
                    current={step}
                />
                {domainError ? (
                    <InlineAlert tone="danger">{domainError}</InlineAlert>
                ) : null}
                <SectionCard
                    title={t(`garage.wizard.steps.${step}`)}
                    description={descriptions[step]}
                >
                    {step === 'vehicle' ? (
                        <VehicleFields form={form} catalog={vehicleData} />
                    ) : null}
                    {step === 'details' ? (
                        <DetailsFields
                            form={form}
                            catalog={vehicleData}
                            withOdometer
                        />
                    ) : null}
                    {step === 'identity' ? (
                        <IdentityFields
                            form={form}
                            maskedVin={null}
                            supportUrl={supportUrl}
                        />
                    ) : null}
                    {step === 'photo' ? (
                        <PhotoFields
                            form={form}
                            maxImageMb={maxImageMb}
                            currentImage={null}
                        />
                    ) : null}
                </SectionCard>
                <FormActions align="between">
                    <Button
                        type="button"
                        variant="outline"
                        disabled={index_ === 0 || form.processing}
                        onClick={() => setStep(STEPS[index_ - 1])}
                    >
                        <ArrowLeft
                            className="size-4 rtl:rotate-180"
                            aria-hidden="true"
                        />
                        {t('core.actions.previous')}
                    </Button>
                    <div className="flex flex-wrap items-center gap-2">
                        {isLast && !form.data.image ? (
                            <span className="text-sm text-muted-foreground">
                                {t('garage.wizard.photo_optional')}
                            </span>
                        ) : null}
                        <Button
                            type="submit"
                            disabled={!complete || form.processing}
                        >
                            {form.processing ? <Spinner /> : null}
                            {isLast ? (
                                <>
                                    <Check
                                        className="size-4"
                                        aria-hidden="true"
                                    />
                                    {t('garage.wizard.submit')}
                                </>
                            ) : (
                                <>
                                    {t('core.actions.next')}
                                    <ArrowRight
                                        className="size-4 rtl:rotate-180"
                                        aria-hidden="true"
                                    />
                                </>
                            )}
                        </Button>
                    </div>
                </FormActions>
                {form.progress ? (
                    <p className="text-end text-xs text-muted-foreground">
                        {t('garage.wizard.uploading', {
                            percent: Math.round(form.progress.percentage ?? 0),
                        })}
                    </p>
                ) : null}
            </form>
        </>
    );
}

GarageCreate.layout = () => ({
    breadcrumbs: [
        { title: t('garage.title'), href: index().url },
        { title: t('garage.wizard.title'), href: create().url },
    ],
});
