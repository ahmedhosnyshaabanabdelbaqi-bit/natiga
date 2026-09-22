import { Head, Link, useForm } from '@inertiajs/react';
import { Car, Pencil, Plus } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Label } from '@/components/ui/label';
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
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index } from '@/routes/admin/vehicles';
import { destroy, store, toggle, update } from '@/routes/admin/vehicles/makes';
import { index as modelsIndex } from '@/routes/admin/vehicles/models';

type Make = {
    id: number;
    slug: string;
    name_ar: string;
    name_en: string;
    name: string;
    logo: string | null;
    country_code: string | null;
    is_active: boolean;
    sort_order: number;
    models_count: number;
    vehicles_count: number;
};

type Props = { makes: Make[]; canManage: boolean };

type MakeForm = {
    name_ar: string;
    name_en: string;
    slug: string;
    country_code: string;
    sort_order: string;
    is_active: boolean;
    logo: File | null;
    remove_logo: boolean;
};

function MakeDialog({
    make,
    open,
    onOpenChange,
}: {
    make: Make | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
}) {
    const form = useForm<MakeForm>({
        name_ar: make?.name_ar ?? '',
        name_en: make?.name_en ?? '',
        slug: make?.slug ?? '',
        country_code: make?.country_code ?? '',
        sort_order: String(make?.sort_order ?? 0),
        is_active: make?.is_active ?? true,
        logo: null,
        remove_logo: false,
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = {
            forceFormData: true,
            preserveScroll: true,
            onSuccess: () => onOpenChange(false),
        };
        form.transform((data) => ({
            ...data,
            is_active: data.is_active ? 1 : 0,
            remove_logo: data.remove_logo ? 1 : 0,
            logo: data.logo ?? undefined,
            ...(make ? { _method: 'put' } : {}),
        }));
        form.post(make ? update(make.id).url : store().url, options);
    };

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-lg">
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {make
                                ? t('vehicles.admin.makes.edit')
                                : t('vehicles.admin.makes.add')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('vehicles.admin.makes.dialog_description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            id="make-name-ar"
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
                            id="make-name-en"
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
                            id="make-slug"
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
                            id="make-country"
                            label={t('vehicles.fields.country_code')}
                            optional
                            hint={t('vehicles.hints.country_code')}
                            error={form.errors.country_code}
                        >
                            <Input
                                dir="ltr"
                                maxLength={2}
                                className="w-20 uppercase"
                                value={form.data.country_code}
                                onChange={(event) =>
                                    form.setData(
                                        'country_code',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="make-sort"
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
                            id="make-active"
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
                    <FormField
                        id="make-logo"
                        label={t('vehicles.fields.logo')}
                        optional
                        hint={t('vehicles.hints.logo')}
                        error={form.errors.logo}
                    >
                        <Input
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            onChange={(event) =>
                                form.setData(
                                    'logo',
                                    event.target.files?.[0] ?? null,
                                )
                            }
                        />
                    </FormField>
                    {make?.logo ? (
                        <div className="flex items-center gap-3">
                            <img
                                src={make.logo}
                                alt=""
                                className="h-10 w-auto rounded border bg-white p-1"
                            />
                            <div className="flex items-center gap-2">
                                <Checkbox
                                    id="make-remove-logo"
                                    checked={form.data.remove_logo}
                                    onCheckedChange={(checked) =>
                                        form.setData(
                                            'remove_logo',
                                            checked === true,
                                        )
                                    }
                                />
                                <Label
                                    htmlFor="make-remove-logo"
                                    className="font-normal"
                                >
                                    {t('vehicles.admin.makes.remove_logo')}
                                </Label>
                            </div>
                        </div>
                    ) : null}
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="outline"
                            onClick={() => onOpenChange(false)}
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

export default function AdminVehicleMakes({ makes, canManage }: Props) {
    const [editing, setEditing] = useState<Make | null>(null);
    const [dialogOpen, setDialogOpen] = useState(false);

    const openDialog = (make: Make | null) => {
        setEditing(make);
        setDialogOpen(true);
    };

    return (
        <>
            <Head title={t('vehicles.admin.makes.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('vehicles.admin.title')}
                    description={t('vehicles.admin.description')}
                    actions={
                        canManage ? (
                            <Button
                                type="button"
                                onClick={() => openDialog(null)}
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                {t('vehicles.admin.makes.add')}
                            </Button>
                        ) : null
                    }
                />
                <VehiclesAdminNav current="makes" />
                <DomainErrorAlert />
                {makes.length === 0 ? (
                    <EmptyState
                        icon={Car}
                        title={t('vehicles.admin.makes.title')}
                        description={t('vehicles.admin.makes.empty')}
                    />
                ) : (
                    <div className="overflow-hidden rounded-xl border bg-card shadow-card">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('vehicles.admin.makes.title')}
                                    </TableHead>
                                    <TableHead className="hidden md:table-cell">
                                        {t('vehicles.fields.slug')}
                                    </TableHead>
                                    <TableHead className="hidden sm:table-cell">
                                        {t('vehicles.fields.country_code')}
                                    </TableHead>
                                    <TableHead className="text-end">
                                        {t('vehicles.admin.makes.models_count')}
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
                                {makes.map((make) => (
                                    <TableRow key={make.id}>
                                        <TableCell>
                                            <div className="flex items-center gap-3">
                                                <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded border bg-white">
                                                    {make.logo ? (
                                                        <img
                                                            src={make.logo}
                                                            alt=""
                                                            className="max-h-8 max-w-8 object-contain"
                                                        />
                                                    ) : (
                                                        <Car
                                                            className="size-4 text-muted-foreground"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                </span>
                                                <div className="min-w-0">
                                                    <Link
                                                        href={
                                                            modelsIndex({
                                                                query: {
                                                                    make: make.id,
                                                                },
                                                            }).url
                                                        }
                                                        className="font-medium hover:underline"
                                                    >
                                                        {make.name}
                                                    </Link>
                                                    <p className="text-xs text-muted-foreground">
                                                        {make.name_ar} ·{' '}
                                                        <span dir="ltr">
                                                            {make.name_en}
                                                        </span>
                                                    </p>
                                                </div>
                                            </div>
                                        </TableCell>
                                        <TableCell className="hidden md:table-cell">
                                            <Code>{make.slug}</Code>
                                        </TableCell>
                                        <TableCell className="hidden sm:table-cell">
                                            {make.country_code ?? '—'}
                                        </TableCell>
                                        <TableCell className="tabular text-end">
                                            {formatNumber(make.models_count, 0)}
                                        </TableCell>
                                        <TableCell className="tabular hidden text-end sm:table-cell">
                                            {formatNumber(
                                                make.vehicles_count,
                                                0,
                                            )}
                                        </TableCell>
                                        <TableCell>
                                            {canManage ? (
                                                <ActiveToggle
                                                    url={toggle(make.id).url}
                                                    active={make.is_active}
                                                    label={`${t('vehicles.fields.is_active')}: ${make.name}`}
                                                />
                                            ) : (
                                                <span className="text-sm">
                                                    {make.is_active
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
                                                    aria-label={`${t('core.actions.edit')}: ${make.name}`}
                                                    onClick={() =>
                                                        openDialog(make)
                                                    }
                                                >
                                                    <Pencil
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                                <DeleteRowButton
                                                    url={destroy(make.id).url}
                                                    name={make.name}
                                                    disabled={
                                                        make.models_count > 0 ||
                                                        make.vehicles_count > 0
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
            {canManage && dialogOpen ? (
                <MakeDialog
                    key={editing?.id ?? 'new'}
                    make={editing}
                    open={dialogOpen}
                    onOpenChange={setDialogOpen}
                />
            ) : null}
        </>
    );
}

AdminVehicleMakes.layout = () => ({
    breadcrumbs: [{ title: t('vehicles.admin.title'), href: index().url }],
});
