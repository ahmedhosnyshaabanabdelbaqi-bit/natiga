import { useForm } from '@inertiajs/react';
import { Gauge } from 'lucide-react';
import type { FormEvent, ReactNode } from 'react';
import { useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { odometer as odometerRoute } from '@/routes/member/garage';

type Props = {
    vehicleId: string;
    currentKm: number | null;
    trigger?: ReactNode;
};

const REASON_MIN = 5;

/** Records a new odometer reading. A reading lower than the current one requires a reason (server-enforced). */
export function OdometerDialog({ vehicleId, currentKm, trigger }: Props) {
    const [open, setOpen] = useState(false);
    const form = useForm<{ odometer_km: string; reason: string }>({
        odometer_km: '',
        reason: '',
    });
    const value =
        form.data.odometer_km === '' ? null : Number(form.data.odometer_km);
    const isDecrease =
        currentKm !== null &&
        value !== null &&
        !Number.isNaN(value) &&
        value < currentKm;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(odometerRoute(vehicleId).url, {
            preserveScroll: true,
            onSuccess: () => {
                form.reset();
                setOpen(false);
            },
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (!next) {
                    form.resetAndClearErrors();
                }
            }}
        >
            <DialogTrigger asChild>
                {trigger ?? (
                    <Button type="button" variant="outline" size="sm">
                        <Gauge className="size-4" aria-hidden="true" />
                        {t('garage.odometer.update')}
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <DialogHeader>
                        <DialogTitle>{t('garage.odometer.update')}</DialogTitle>
                        <DialogDescription>
                            {currentKm !== null
                                ? t('garage.odometer.current_value', {
                                      km: formatNumber(currentKm, 0),
                                  })
                                : t('garage.odometer.no_history')}
                        </DialogDescription>
                    </DialogHeader>
                    <FormField
                        id="odometer-km"
                        label={t('garage.odometer.new_reading')}
                        required
                        error={form.errors.odometer_km}
                    >
                        <Input
                            type="number"
                            inputMode="numeric"
                            min={0}
                            max={2000000}
                            step={1}
                            dir="ltr"
                            value={form.data.odometer_km}
                            onChange={(event) =>
                                form.setData('odometer_km', event.target.value)
                            }
                            autoFocus
                        />
                    </FormField>
                    {isDecrease ? (
                        <InlineAlert tone="warning">
                            {t('garage.odometer.decrease_warning', {
                                previous: formatNumber(currentKm, 0),
                            })}
                        </InlineAlert>
                    ) : null}
                    <FormField
                        id="odometer-reason"
                        label={t('garage.odometer.reason')}
                        required={isDecrease}
                        optional={!isDecrease}
                        hint={t('garage.odometer.reason_hint')}
                        error={form.errors.reason}
                    >
                        <Textarea
                            rows={2}
                            maxLength={500}
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => setOpen(false)}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={
                                form.processing ||
                                value === null ||
                                (isDecrease &&
                                    form.data.reason.trim().length < REASON_MIN)
                            }
                        >
                            {form.processing ? <Spinner /> : null}
                            {t('core.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
