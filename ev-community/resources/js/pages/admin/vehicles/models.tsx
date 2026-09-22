import { Head, Link, router, useForm } from '@inertiajs/react';
import { Layers, Pencil, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    ActiveToggle,
    DeleteRowButton,
    DomainErrorAlert,
} from '@/features/vehicles/admin-actions';
import { VehiclesAdminNav } from '@/features/vehicles/admin-nav';
import { OptionSelect } from '@/features/vehicles/option-select';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index as makesIndex } from '@/routes/admin/vehicles';
import {
    destroy,
    index,
    store,
    toggle,
    update,
} from '@/routes/admin/vehicles/models';
import { index as variantsIndex } from '@/routes/admin/vehicles/variants';

type MakeOption = { id: number; name: string; is_active: boolean };

type Model = {
    id: number;
    vehicle_make_id: number;
    make_name: string;
    slug: string;
    name_ar: string;
    name_en: string;
    name: string;
    model_code: string | null;
    body_type: string | null;
    is_active: boolean;
    sort_order: number;
    variants_count: number;
    vehicles_count: number;
};

type Props = {
    makes: MakeOption[];
    models: Model[];
    bodyTypes: string[];
    filters: { make: number | null };
    canManage: boolean;
};

const NONE = 'none';

function ModelDialog({
    model,
    makes,
    bodyTypes,
    defaultMakeId,
    onClose,
}: {
    model: Model | null;
    makes: MakeOption[];
    bodyTypes: string[];
    defaultMakeId: number | null;
    onClose: () => void;
}) {
    const form = useForm({
        vehicle_make_id: String(model?.vehicle_make_id ?? defaultMakeId ?? ''),
        name_ar: model?.name_ar ?? '',
        name_en: model?.name_en ?? '',
        slug: model?.slug ?? '',
        model_code: model?.model_code ?? '',
        body_type: model?.body_type ?? '',
        sort_order: String(model?.sort_order ?? 0),
        is_active: model?.is_active ?? true,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (model) {
            form.put(update(model.id).url, options);
        } else {
            form.post(store().url, options);
        }
    };

    return (
        <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {model
                                ? t('vehicles.admin.models.edit')
                                : t('vehicles.admin.models.add')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('vehicles.admin.models.dialog_description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            id="model-make"
                            label={t('vehicles.fields.make')}
                            required
                            error={form.errors.vehicle_make_id}
                            className="sm:col-span-2"
                        >
                            <OptionSelect
                                value={form.data.vehicle_make_id}
                                placeholder={t(
                                    'vehicles.admin.models.select_make',
                                )}
                                options={makes.map((make) => ({
                                    value: String(make.id),
                                    label: make.name,
                                }))}
                                onChange={(value) =>
                                    form.setData('vehicle_make_id', value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-name-ar"
                            label={t('vehicles.fields.name_ar')}
                            required
                            error={form.errors.name_ar}
                        >
                            <Input
                                dir="rtl"
                                maxLength={120}
                                value={form.data.name_ar}
                                onChange={(event) =>
                                    form.setData('name_ar', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-name-en"
                            label={t('vehicles.fields.name_en')}
                            required
                            error={form.errors.name_en}
                        >
                            <Input
                                dir="ltr"
                                maxLength={120}
                                value={form.data.name_en}
                                onChange={(event) =>
                                    form.setData('name_en', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-slug"
                            label={t('vehicles.fields.slug')}
                            optional
                            hint={t('vehicles.hints.slug')}
                            error={form.errors.slug}
                        >
                            <Input
                                dir="ltr"
                                maxLength={80}
                                value={form.data.slug}
                                onChange={(event) =>
                                    form.setData('slug', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-code"
                            label={t('vehicles.fields.model_code')}
                            optional
                            error={form.errors.model_code}
                        >
                            <Input
                                dir="ltr"
                                maxLength={40}
                                value={form.data.model_code}
                                onChange={(event) =>
                                    form.setData(
                                        'model_code',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-body"
                            label={t('vehicles.fields.body_type')}
                            optional
                            error={form.errors.body_type}
                        >
                            <OptionSelect
                                value={form.data.body_type || NONE}
                                options={[
                                    {
                                        value: NONE,
                                        label: t('core.labels.none'),
                                    },
                                    ...bodyTypes.map((type) => ({
                                        value: type,
                                        label: t(`vehicles.body_type.${type}`),
                                    })),
                                ]}
                                onChange={(value) =>
                                    form.setData(
                                        'body_type',
                                        value === NONE ? '' : value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-sort"
                            label={t('vehicles.fields.sort_order')}
                            optional
                            error={form.errors.sort_order}
                        >
                            <Input
                                type="number"
                                dir="ltr"
                                min={-1000}
                                max={1000}
                                value={form.data.sort_order}
                                onChange={(event) =>
                                    form.setData(
                                        'sort_order',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="model-active"
                            label={t('vehicles.fields.is_active')}
                            inline
                            error={form.errors.is_active}
                        >
                            <Switch
                                checked={form.data.is_active}
                                onCheckedChange={(checked) =>
                                    form.setData('is_active', checked)
                                }
                            />
                        </FormField>
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={onClose}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? <Spinner /> : null}
                            {t('core.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminVehicleModels({
    makes,
    models,
    bodyTypes,
    filters,
    canManage,
}: Props) {
    const [dialog, setDialog] = useState<{ model: Model | null } | null>(null);
    const selectedMake = makes.find((make) => make.id === filters.make) ?? null;

    return (
        <>
            <Head title={t('vehicles.admin.models.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('vehicles.admin.title')}
                    description={t('vehicles.admin.description')}
                    actions={
                        canManage ? (
                            <Button
                                type="button"
                                onClick={() => setDialog({ model: null })}
                                disabled={makes.length === 0}
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                {t('vehicles.admin.models.add')}
                            </Button>
                        ) : null
                    }
                />
                <VehiclesAdminNav current="models" />
                <DomainErrorAlert />
                <div className="flex flex-wrap items-end gap-3">
                    <div className="w-full sm:w-72">
                        <OptionSelect
                            aria-label={t('vehicles.fields.make')}
                            value={filters.make ? String(filters.make) : 'all'}
                            options={[
                                {
                                    value: 'all',
                                    label: t('vehicles.admin.models.all_makes'),
                                },
                                ...makes.map((make) => ({
                                    value: String(make.id),
                                    label: make.name,
                                })),
                            ]}
                            onChange={(value) =>
                                router.get(
                                    index({
                                        query:
                                            value === 'all'
                                                ? {}
                                                : { make: value },
                                    }).url,
                                    {},
                                    {
                                        preserveScroll: true,
                                        preserveState: true,
                                        replace: true,
                                    },
                                )
                            }
                        />
                    </div>
                </div>
                {models.length === 0 ? (
                    <EmptyState
                        icon={Layers}
                        title={
                            selectedMake
                                ? selectedMake.name
                                : t('vehicles.admin.models.title')
                        }
                        description={t('vehicles.admin.models.empty')}
                    />
                ) : (
                    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('vehicles.admin.models.title')}
                                    </TableHead>
                                    <TableHead className="hidden md:table-cell">
                                        {t('vehicles.fields.model_code')}
                                    </TableHead>
                                    <TableHead className="hidden sm:table-cell">
                                        {t('vehicles.fields.body_type')}
                                    </TableHead>
                                    <TableHead className="text-end">
                                        {t(
                                            'vehicles.admin.models.variants_count',
                                        )}
                                    </TableHead>
                                    <TableHead className="hidden text-end sm:table-cell">
                                        {t(
                                            'vehicles.admin.makes.vehicles_count',
                                        )}
                                    </TableHead>
                                    <TableHead>
                                        {t('vehicles.fields.is_active')}
                                    </TableHead>
                                    {canManage ? (
                                        <TableHead className="text-end">
                                            {t('core.labels.actions')}
                                        </TableHead>
                                    ) : null}
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {models.map((model) => (
                                    <TableRow key={model.id}>
                                        <TableCell>
                                            <Link
                                                href={
                                                    variantsIndex({
                                                        query: {
                                                            model: model.id,
                                                        },
                                                    }).url
                                                }
                                                className="font-medium hover:underline"
                                            >
                                                {model.name}
                                            </Link>
                                            <p className="text-xs text-muted-foreground">
                                                {model.make_name} ·{' '}
                                                {model.name_ar} ·{' '}
                                                <span dir="ltr">
                                                    {model.name_en}
                                                </span>
                                            </p>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            {model.model_code ? (
                                                <Code>{model.model_code}</Code>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            {model.body_type
                                                ? t(
                                                      `vehicles.body_type.${model.body_type}`,
                                                  )
                                                : '—'}
                                        </TableCell>
                                        <TableCell className="tabular text-end">
                                            {formatNumber(
                                                model.variants_count,
                                                0,
                                            )}
                                        </TableCell>
                                        <TableCell className="tabular hidden text-end sm:table-cell">
                                            {formatNumber(
                                                model.vehicles_count,
                                                0,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {canManage ? (
                                                <ActiveToggle
                                                    url={toggle(model.id).url}
                                                    active={model.is_active}
                                                    label={`${t('vehicles.fields.is_active')}: ${model.name}`}
                                                />
                                            ) : (
                                                <span className="text-sm">
                                                    {model.is_active
                                                        ? t('core.labels.yes')
                                                        : t('core.labels.no')}
                                                </span>
                                            )}
                                        </TableCell>
                                        {canManage ? (
                                            <TableCell className="text-end whitespace-nowrap">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`${t('core.actions.edit')}: ${model.name}`}
                                                    onClick={() =>
                                                        setDialog({ model })
                                                    }
                                                >
                                                    <Pencil
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                                <DeleteRowButton
                                                    url={destroy(model.id).url}
                                                    name={model.name}
                                                    disabled={
                                                        model.variants_count >
                                                            0 ||
                                                        model.vehicles_count > 0
                                                    }
                                                    disabledReason={t(
                                                        'vehicles.errors.in_use',
                                                    )}
                                                />
                                            </TableCell>
                                        ) : null}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </div>
                )}
            </div>
            {canManage && dialog ? (
                <ModelDialog
                    key={dialog.model?.id ?? 'new'}
                    model={dialog.model}
                    makes={makes}
                    bodyTypes={bodyTypes}
                    defaultMakeId={filters.make}
                    onClose={() => setDialog(null)}
                />
            ) : null}
        </>
    );
}

AdminVehicleModels.layout = () => ({
    breadcrumbs: [
        { title: t('vehicles.admin.title'), href: makesIndex().url },
        { title: t('vehicles.admin.models.title'), href: index().url },
    ],
});
