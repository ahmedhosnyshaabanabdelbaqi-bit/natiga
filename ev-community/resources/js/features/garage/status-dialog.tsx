import { useForm } from '@inertiajs/react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { FormField } from '@/components/shared/form-field';
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
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import type { LabeledValue, VehicleStatusValue } from '@/features/garage/types';
import { t } from '@/lib/i18n';
import { status as statusRoute } from '@/routes/member/garage';

type Props = {
    vehicleId: string;
    current: VehicleStatusValue;
    statuses: LabeledValue[];
};

/** Mark a vehicle sold / archived or reactivate it (audited; a sold/archived vehicle is never the primary one). */
export function StatusDialog({ vehicleId, current, statuses }: Props) {
    const [open, setOpen] = useState(false);
    const form = useForm<{ status: string; reason: string }>({
        status: current,
        reason: '',
    });

    // A reactivation can be refused because the VIN is now registered on another active vehicle.
    const extraErrors = form.errors as Record<string, string | undefined>;

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.post(statusRoute(vehicleId).url, {
            preserveScroll: true,
            onSuccess: () => setOpen(false),
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                setOpen(next);
                if (next) {
                    form.setData({ status: current, reason: '' });
                    form.clearErrors();
                }
            }}
        >
            <DialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                    {t('garage.status.change')}
                </Button>
            </DialogTrigger>
            <DialogContent>
                <form onSubmit={submit} className="grid gap-4">
                    <DialogHeader>
                        <DialogTitle>{t('garage.status.title')}</DialogTitle>
                        <DialogDescription>
                            {t('garage.status.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <FormField
                        label={t('core.labels.status')}
                        error={form.errors.status}
                    >
                        {(control) => (
                            <RadioGroup
                                value={form.data.status}
                                onValueChange={(value) =>
                                    form.setData('status', value)
                                }
                                aria-describedby={control['aria-describedby']}
                                className="gap-3"
                            >
                                {statuses.map((option) => (
                                    <div
                                        key={option.value}
                                        className="flex items-center gap-2"
                                    >
                                        <RadioGroupItem
                                            id={`status-${option.value}`}
                                            value={option.value}
                                        />
                                        <Label
                                            htmlFor={`status-${option.value}`}
                                        >
                                            {option.label}
                                        </Label>
                                    </div>
                                ))}
                            </RadioGroup>
                        )}
                    </FormField>
                    <FormField
                        id="status-reason"
                        label={t('garage.status.reason')}
                        optional
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
                    {(extraErrors.vin ?? extraErrors.domain) ? (
                        <p className="text-sm text-danger" role="alert">
                            {extraErrors.vin ?? extraErrors.domain}
                        </p>
                    ) : null}
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
                                form.processing || form.data.status === current
                            }
                        >
                            {form.processing ? <Spinner /> : null}
                            {t('garage.status.confirm')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
