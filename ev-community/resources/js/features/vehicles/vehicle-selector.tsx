import { Link, usePage } from '@inertiajs/react';
import { Car, RefreshCw, X } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/shared/error-state';
import { SkeletonForm } from '@/components/shared/skeletons';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Spinner } from '@/components/ui/spinner';
import type { VehicleCatalog, VehicleSelection } from '@/features/vehicles/types';
import { useSelectedVehicle } from '@/features/vehicles/use-selected-vehicle';
import { useVehicleCatalog } from '@/features/vehicles/use-vehicle-catalog';
import { VehiclePicker } from '@/features/vehicles/vehicle-picker';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type Props = {
    /** Pass when the page already has the catalog (avoids a fetch). */
    catalog?: VehicleCatalog | null;
    /** `card` (default): bordered box with title; `compact`: one line for toolbars. */
    variant?: 'card' | 'compact';
    className?: string;
};

const emptySelection: VehicleSelection = { make_id: null, model_id: null, variant_id: null, year: null };

/**
 * "Your vehicle" selector for the store, search and compatibility UIs.
 *  - Members with a primary garage vehicle see it (change it from My Garage).
 *  - Guests (and members without a garage vehicle) pick make → model → variant → year; the choice is kept in
 *    their server session (POST /{locale}/vehicles/select) and exposed as the shared prop `selectedVehicle`.
 */
export function VehicleSelector({ catalog: initialCatalog, variant = 'card', className }: Props) {
    const { vehicle, fromGarage, choose, clear } = useSelectedVehicle();
    const { auth } = usePage().props;
    const [open, setOpen] = useState(false);

    const trigger = (
        <Button type="button" variant={vehicle ? 'outline' : 'default'} size={variant === 'compact' ? 'sm' : 'default'} onClick={() => setOpen(true)}>
            <Car className="size-4" aria-hidden="true" />
            {vehicle ? t('vehicles.public.change') : t('vehicles.public.select_title')}
        </Button>
    );

    const summary = vehicle ? (
        <div className="flex min-w-0 items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-brand-soft text-brand dark:bg-brand dark:text-brand-foreground">
                <Car className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
                <p className="truncate text-sm font-medium">{vehicle.display_name}</p>
                <p className="truncate text-xs text-muted-foreground">
                    {vehicle.variant_name ?? t('vehicles.selector.unknown_variant')}
                    {fromGarage ? (
                        <Badge variant="secondary" className="ms-2 align-middle">
                            {t('vehicles.public.from_garage')}
                        </Badge>
                    ) : null}
                </p>
            </div>
        </div>
    ) : (
        <div className="min-w-0">
            <p className="text-sm font-medium">{t('vehicles.public.select_title')}</p>
            <p className="text-xs text-muted-foreground">{t('vehicles.public.select_description')}</p>
        </div>
    );

    const actions = fromGarage ? (
        <Button asChild variant="outline" size={variant === 'compact' ? 'sm' : 'default'}>
            <Link href="/account/garage">{t('vehicles.public.manage_in_garage')}</Link>
        </Button>
    ) : (
        <div className="flex flex-wrap items-center gap-2">
            {trigger}
            {vehicle ? (
                <Button type="button" variant="ghost" size={variant === 'compact' ? 'sm' : 'default'} onClick={clear}>
                    <X className="size-4" aria-hidden="true" />
                    {t('vehicles.public.clear')}
                </Button>
            ) : null}
        </div>
    );

    return (
        <>
            <div
                className={cn(
                    'flex flex-wrap items-center justify-between gap-3',
                    variant === 'card' && 'rounded-xl border bg-card p-4 shadow-card',
                    className,
                )}
                data-slot="vehicle-selector"
            >
                {summary}
                {actions}
            </div>
            {!fromGarage ? (
                <SelectorDialog
                    key={open ? 'open' : 'closed'}
                    open={open}
                    onOpenChange={setOpen}
                    initialCatalog={initialCatalog}
                    initial={vehicle ? { make_id: vehicle.make_id, model_id: vehicle.model_id, variant_id: vehicle.variant_id, year: vehicle.year } : emptySelection}
                    showGarageHint={Boolean(auth.user?.is_member)}
                    onSubmit={(selection, done) => choose(selection, { onSuccess: () => setOpen(false), onFinish: done })}
                />
            ) : null}
        </>
    );
}

function SelectorDialog({
    open,
    onOpenChange,
    initialCatalog,
    initial,
    showGarageHint,
    onSubmit,
}: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    initialCatalog?: VehicleCatalog | null;
    initial: VehicleSelection;
    showGarageHint: boolean;
    onSubmit: (selection: VehicleSelection, done: () => void) => void;
}) {
    const { catalog, loading, failed, retry } = useVehicleCatalog(initialCatalog, open);
    const [value, setValue] = useState<VehicleSelection>(initial);
    const [submitting, setSubmitting] = useState(false);
    const { errors } = usePage().props as { errors?: Record<string, string> };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle>{t('vehicles.public.select_title')}</DialogTitle>
                    <DialogDescription>{t('vehicles.public.select_description')}</DialogDescription>
                </DialogHeader>
                {failed ? (
                    <ErrorState
                        kind="connection"
                        description={t('vehicles.selector.error')}
                        action={
                            <Button type="button" variant="outline" onClick={retry}>
                                <RefreshCw className="size-4" aria-hidden="true" />
                                {t('core.actions.retry')}
                            </Button>
                        }
                    />
                ) : loading || !catalog ? (
                    <SkeletonForm fields={4} />
                ) : (
                    <VehiclePicker
                        catalog={catalog}
                        value={value}
                        onChange={setValue}
                        idPrefix="selector"
                        errors={{ make: errors?.make_id, model: errors?.model_id, variant: errors?.variant_id, year: errors?.year }}
                    />
                )}
                {showGarageHint ? (
                    <p className="text-xs text-muted-foreground">
                        {t('vehicles.public.garage_hint')}{' '}
                        <Link href="/account/garage/create" className="font-medium text-brand underline-offset-4 hover:underline">
                            {t('garage.add_vehicle')}
                        </Link>
                    </p>
                ) : null}
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
                        {t('core.actions.cancel')}
                    </Button>
                    <Button
                        type="button"
                        disabled={submitting || !value.make_id || !value.model_id}
                        onClick={() => {
                            setSubmitting(true);
                            onSubmit(value, () => setSubmitting(false));
                        }}
                    >
                        {submitting ? <Spinner /> : null}
                        {t('vehicles.selector.apply')}
                    </Button>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}
