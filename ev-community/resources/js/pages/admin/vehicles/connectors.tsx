import { Head, router, useForm } from '@inertiajs/react';
import { Pencil, Plug, Plus, Save, ShieldCheck } from 'lucide-react';
import type { FormEvent } from 'react';
import { useMemo, useState } from 'react';
import { DateTime } from '@/components/shared/date-time';
import { EmptyState } from '@/components/shared/empty-state';
import { FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import type { Tone } from '@/components/shared/tone';
import { toneSoft } from '@/components/shared/tone';
import { Badge } from '@/components/ui/badge';
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
import { Textarea } from '@/components/ui/textarea';
import {
    ActiveToggle,
    DomainErrorAlert,
} from '@/features/vehicles/admin-actions';
import { VehiclesAdminNav } from '@/features/vehicles/admin-nav';
import { OptionSelect } from '@/features/vehicles/option-select';
import type { Option } from '@/features/vehicles/types';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { index as makesIndex } from '@/routes/admin/vehicles';
import { update as updateMatrix } from '@/routes/admin/vehicles/compatibility';
import {
    index,
    store,
    toggle,
    update,
} from '@/routes/admin/vehicles/connectors';

type Connector = {
    id: number;
    code: string;
    name_ar: string;
    name_en: string;
    name: string;
    current_type: 'ac' | 'dc';
    is_active: boolean;
    sort_order: number;
};

type Compatibility = 'direct' | 'adapter' | 'incompatible';

type Rule = {
    vehicle_connector_type_id: number;
    station_connector_type_id: number;
    compatibility: Compatibility;
    adapter_name: string | null;
    notes: string | null;
    verified_by: string | null;
    verified_at: string | null;
};

type Props = {
    connectors: Connector[];
    rules: Rule[];
    compatibilityOptions: Option<Compatibility>[];
    currentTypes: Option<'ac' | 'dc'>[];
    canManage: boolean;
};

type Cell = {
    compatibility: Compatibility;
    adapter_name: string;
    notes: string;
};

const TONES: Record<Compatibility, Tone> = {
    direct: 'success',
    adapter: 'warning',
    incompatible: 'danger',
};

const cellKey = (vehicleId: number, stationId: number) =>
    `${vehicleId}:${stationId}`;

function ConnectorDialog({
    connector,
    currentTypes,
    onClose,
}: {
    connector: Connector | null;
    currentTypes: Option[];
    onClose: () => void;
}) {
    const form = useForm({
        code: connector?.code ?? '',
        name_ar: connector?.name_ar ?? '',
        name_en: connector?.name_en ?? '',
        current_type: connector?.current_type ?? 'ac',
        sort_order: String(connector?.sort_order ?? 0),
        is_active: connector?.is_active ?? true,
    });
    const submit = (event: FormEvent) => {
        event.preventDefault();
        const options = { preserveScroll: true, onSuccess: onClose };
        if (connector) {
            form.put(update(connector.id).url, options);
        } else {
            form.post(store().url, options);
        }
    };
    return (
        <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent>
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <DialogHeader>
                        <DialogTitle>
                            {connector
                                ? t('vehicles.admin.connectors.edit')
                                : t('vehicles.admin.connectors.add')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('vehicles.admin.connectors.dialog_description')}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            id="connector-code"
                            label={t('vehicles.fields.code')}
                            required
                            hint={t('vehicles.hints.connector_code')}
                            error={form.errors.code}
                        >
                            <Input
                                dir="ltr"
                                maxLength={30}
                                className="font-mono"
                                value={form.data.code}
                                onChange={(event) =>
                                    form.setData('code', event.target.value)
                                }
                            />
                        </FormField>
                        <FormField
                            id="connector-current"
                            label={t('vehicles.fields.current_type')}
                            required
                            error={form.errors.current_type}
                        >
                            <OptionSelect
                                value={form.data.current_type}
                                options={currentTypes}
                                onChange={(value) =>
                                    form.setData(
                                        'current_type',
                                        value as 'ac' | 'dc',
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            id="connector-name-ar"
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
                            id="connector-name-en"
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
                            id="connector-sort"
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
                            id="connector-active"
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

function CellDialog({
    vehicle,
    station,
    cell,
    rule,
    options,
    readOnly,
    onApply,
    onClose,
}: {
    vehicle: Connector;
    station: Connector;
    cell: Cell | null;
    rule: Rule | undefined;
    options: Option<Compatibility>[];
    readOnly: boolean;
    onApply: (cell: Cell) => void;
    onClose: () => void;
}) {
    const [value, setValue] = useState<Cell>(
        cell ?? {
            compatibility:
                vehicle.id === station.id ? 'direct' : 'incompatible',
            adapter_name: '',
            notes: '',
        },
    );
    return (
        <Dialog open onOpenChange={(open) => (!open ? onClose() : undefined)}>
            <DialogContent>
                <DialogHeader>
                    <DialogTitle>
                        {vehicle.name} → {station.name}
                    </DialogTitle>
                    <DialogDescription>
                        {t('vehicles.admin.compatibility.cell_description')}
                    </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4">
                    <FormField
                        id="cell-compatibility"
                        label={t('vehicles.admin.compatibility.value')}
                        required
                    >
                        <OptionSelect
                            value={value.compatibility}
                            options={options}
                            disabled={readOnly}
                            onChange={(next) =>
                                setValue({
                                    ...value,
                                    compatibility: next as Compatibility,
                                })
                            }
                        />
                    </FormField>
                    {value.compatibility === 'adapter' ? (
                        <FormField
                            id="cell-adapter"
                            label={t('vehicles.fields.adapter_name')}
                            optional
                        >
                            <Input
                                maxLength={120}
                                value={value.adapter_name}
                                disabled={readOnly}
                                onChange={(event) =>
                                    setValue({
                                        ...value,
                                        adapter_name: event.target.value,
                                    })
                                }
                            />
                        </FormField>
                    ) : null}
                    <FormField
                        id="cell-notes"
                        label={t('vehicles.fields.notes')}
                        optional
                    >
                        <Textarea
                            rows={2}
                            maxLength={500}
                            value={value.notes}
                            disabled={readOnly}
                            onChange={(event) =>
                                setValue({
                                    ...value,
                                    notes: event.target.value,
                                })
                            }
                        />
                    </FormField>
                    <p className="text-xs text-muted-foreground">
                        {rule?.verified_at ? (
                            <>
                                <ShieldCheck
                                    className="me-1 inline size-3.5 text-success"
                                    aria-hidden="true"
                                />
                                {t('vehicles.admin.compatibility.verified_by', {
                                    name: rule.verified_by ?? '—',
                                })}{' '}
                                · <DateTime value={rule.verified_at} />
                            </>
                        ) : (
                            t('vehicles.admin.compatibility.unverified')
                        )}
                    </p>
                </div>
                <DialogFooter>
                    <Button type="button" variant="outline" onClick={onClose}>
                        {readOnly
                            ? t('core.actions.close')
                            : t('core.actions.cancel')}
                    </Button>
                    {!readOnly ? (
                        <Button type="button" onClick={() => onApply(value)}>
                            {t('core.actions.apply')}
                        </Button>
                    ) : null}
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
}

export default function AdminVehicleConnectors({
    connectors,
    rules,
    compatibilityOptions,
    currentTypes,
    canManage,
}: Props) {
    const ruleMap = useMemo(
        () =>
            new Map(
                rules.map((rule) => [
                    cellKey(
                        rule.vehicle_connector_type_id,
                        rule.station_connector_type_id,
                    ),
                    rule,
                ]),
            ),
        [rules],
    );
    const [edits, setEdits] = useState<Record<string, Cell>>({});
    const [connectorDialog, setConnectorDialog] = useState<{
        connector: Connector | null;
    } | null>(null);
    const [editingCell, setEditingCell] = useState<{
        vehicle: Connector;
        station: Connector;
    } | null>(null);
    const [saving, setSaving] = useState(false);
    const dirty = Object.keys(edits).length;

    const cellFor = (vehicleId: number, stationId: number): Cell | null => {
        const key = cellKey(vehicleId, stationId);
        if (edits[key]) {
            return edits[key];
        }
        const rule = ruleMap.get(key);
        return rule
            ? {
                  compatibility: rule.compatibility,
                  adapter_name: rule.adapter_name ?? '',
                  notes: rule.notes ?? '',
              }
            : null;
    };

    const saveMatrix = () => {
        const payload = Object.entries(edits).map(([key, cell]) => {
            const [vehicleId, stationId] = key.split(':').map(Number);
            return {
                vehicle_connector_type_id: vehicleId,
                station_connector_type_id: stationId,
                compatibility: cell.compatibility,
                adapter_name: cell.adapter_name || null,
                notes: cell.notes || null,
            };
        });
        router.put(
            updateMatrix().url,
            { rules: payload },
            {
                preserveScroll: true,
                onStart: () => setSaving(true),
                onFinish: () => setSaving(false),
                onSuccess: () => setEdits({}),
            },
        );
    };

    const labelFor = (value: Compatibility) =>
        compatibilityOptions.find((option) => option.value === value)?.label ??
        value;

    return (
        <>
            <Head title={t('vehicles.admin.connectors.title')} />
            <div className="space-y-6">
                <PageHeader
                    title={t('vehicles.admin.title')}
                    description={t('vehicles.admin.description')}
                    actions={
                        canManage ? (
                            <Button
                                type="button"
                                onClick={() =>
                                    setConnectorDialog({ connector: null })
                                }
                            >
                                <Plus className="size-4" aria-hidden="true" />
                                {t('vehicles.admin.connectors.add')}
                            </Button>
                        ) : null
                    }
                />
                <VehiclesAdminNav current="connectors" />
                <DomainErrorAlert />

                <SectionCard
                    title={t('vehicles.admin.connectors.title')}
                    flush={connectors.length > 0}
                >
                    {connectors.length === 0 ? (
                        <EmptyState
                            icon={Plug}
                            title={t('vehicles.admin.connectors.title')}
                            description={t('vehicles.admin.connectors.empty')}
                            className="border-0"
                        />
                    ) : (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>
                                        {t('core.labels.name')}
                                    </TableHead>
                                    <TableHead>
                                        {t('vehicles.fields.code')}
                                    </TableHead>
                                    <TableHead>
                                        {t('vehicles.fields.current_type')}
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
                                {connectors.map((connector) => (
                                    <TableRow key={connector.id}>
                                        <TableCell>
                                            <p className="font-medium">
                                                {connector.name}
                                            </p>
                                            <p className="text-xs text-muted-foreground">
                                                {connector.name_ar} ·{' '}
                                                <span dir="ltr">
                                                    {connector.name_en}
                                                </span>
                                            </p>
                                        </TableCell>
                                        <TableCell>
                                            <Code>{connector.code}</Code>
                                        </TableCell>
                                        <TableCell>
                                            <Badge variant="outline">
                                                {t(
                                                    `vehicles.current_type.${connector.current_type}`,
                                                )}
                                            </Badge>
                                        </TableCell>
                                        <TableCell>
                                            {canManage ? (
                                                <ActiveToggle
                                                    url={
                                                        toggle(connector.id).url
                                                    }
                                                    active={connector.is_active}
                                                    label={`${t('vehicles.fields.is_active')}: ${connector.name}`}
                                                />
                                            ) : (
                                                <span className="text-sm">
                                                    {connector.is_active
                                                        ? t('core.labels.yes')
                                                        : t('core.labels.no')}
                                                </span>
                                            )}
                                        </TableCell>
                                        {canManage ? (
                                            <TableCell className="text-end">
                                                <Button
                                                    type="button"
                                                    variant="ghost"
                                                    size="icon"
                                                    aria-label={`${t('core.actions.edit')}: ${connector.name}`}
                                                    onClick={() =>
                                                        setConnectorDialog({
                                                            connector,
                                                        })
                                                    }
                                                >
                                                    <Pencil
                                                        className="size-4"
                                                        aria-hidden="true"
                                                    />
                                                </Button>
                                            </TableCell>
                                        ) : null}
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    )}
                </SectionCard>

                {connectors.length > 0 ? (
                    <SectionCard
                        title={t('vehicles.admin.compatibility.title')}
                        description={t('vehicles.hints.compatibility_matrix')}
                        actions={
                            canManage ? (
                                <Button
                                    type="button"
                                    onClick={saveMatrix}
                                    disabled={dirty === 0 || saving}
                                >
                                    {saving ? (
                                        <Spinner />
                                    ) : (
                                        <Save
                                            className="size-4"
                                            aria-hidden="true"
                                        />
                                    )}
                                    {t('vehicles.admin.compatibility.save')}
                                </Button>
                            ) : null
                        }
                    >
                        {dirty > 0 ? (
                            <InlineAlert tone="warning" className="mb-4">
                                {t('vehicles.admin.compatibility.unsaved', {
                                    count: dirty,
                                })}
                            </InlineAlert>
                        ) : null}
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[40rem] border-separate border-spacing-1 text-sm">
                                <caption className="sr-only">
                                    {t('vehicles.admin.compatibility.title')}
                                </caption>
                                <thead>
                                    <tr>
                                        <th
                                            scope="col"
                                            className="p-2 text-start text-xs font-medium text-muted-foreground"
                                        >
                                            {t(
                                                'vehicles.admin.compatibility.vehicle_side',
                                            )}{' '}
                                            ↓ /{' '}
                                            {t(
                                                'vehicles.admin.compatibility.station_side',
                                            )}{' '}
                                            →
                                        </th>
                                        {connectors.map((station) => (
                                            <th
                                                key={station.id}
                                                scope="col"
                                                className="p-2 text-center text-xs font-medium"
                                            >
                                                <Code>{station.code}</Code>
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {connectors.map((vehicle) => (
                                        <tr key={vehicle.id}>
                                            <th
                                                scope="row"
                                                className="p-2 text-start text-xs font-medium"
                                            >
                                                <Code>{vehicle.code}</Code>
                                            </th>
                                            {connectors.map((station) => {
                                                const key = cellKey(
                                                    vehicle.id,
                                                    station.id,
                                                );
                                                const cell = cellFor(
                                                    vehicle.id,
                                                    station.id,
                                                );
                                                const rule = ruleMap.get(key);
                                                return (
                                                    <td
                                                        key={station.id}
                                                        className="p-0"
                                                    >
                                                        <button
                                                            type="button"
                                                            onClick={() =>
                                                                setEditingCell({
                                                                    vehicle,
                                                                    station,
                                                                })
                                                            }
                                                            className={cn(
                                                                'flex w-full flex-col items-center justify-center gap-0.5 rounded-md border px-2 py-2 text-xs transition focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                                                                cell
                                                                    ? toneSoft[
                                                                          TONES[
                                                                              cell
                                                                                  .compatibility
                                                                          ]
                                                                      ]
                                                                    : 'border-dashed text-muted-foreground',
                                                                edits[key] &&
                                                                    'ring-2 ring-brand',
                                                            )}
                                                            aria-label={`${vehicle.name} → ${station.name}: ${cell ? labelFor(cell.compatibility) : t('vehicles.admin.compatibility.not_set')}`}
                                                        >
                                                            <span className="font-medium">
                                                                {cell
                                                                    ? labelFor(
                                                                          cell.compatibility,
                                                                      )
                                                                    : t(
                                                                          'vehicles.admin.compatibility.not_set',
                                                                      )}
                                                            </span>
                                                            {rule?.verified_at &&
                                                            !edits[key] ? (
                                                                <ShieldCheck
                                                                    className="size-3"
                                                                    aria-hidden="true"
                                                                />
                                                            ) : null}
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <p className="mt-3 flex items-center gap-1 text-xs text-muted-foreground">
                            <ShieldCheck
                                className="size-3.5"
                                aria-hidden="true"
                            />
                            {t('vehicles.admin.compatibility.legend_verified')}
                        </p>
                    </SectionCard>
                ) : null}
            </div>
            {canManage && connectorDialog ? (
                <ConnectorDialog
                    key={connectorDialog.connector?.id ?? 'new'}
                    connector={connectorDialog.connector}
                    currentTypes={currentTypes}
                    onClose={() => setConnectorDialog(null)}
                />
            ) : null}
            {editingCell ? (
                <CellDialog
                    vehicle={editingCell.vehicle}
                    station={editingCell.station}
                    cell={cellFor(
                        editingCell.vehicle.id,
                        editingCell.station.id,
                    )}
                    rule={ruleMap.get(
                        cellKey(editingCell.vehicle.id, editingCell.station.id),
                    )}
                    options={compatibilityOptions}
                    readOnly={!canManage}
                    onClose={() => setEditingCell(null)}
                    onApply={(cell) => {
                        setEdits((current) => ({
                            ...current,
                            [cellKey(
                                editingCell.vehicle.id,
                                editingCell.station.id,
                            )]: cell,
                        }));
                        setEditingCell(null);
                    }}
                />
            ) : null}
        </>
    );
}

AdminVehicleConnectors.layout = () => ({
    breadcrumbs: [
        { title: t('vehicles.admin.title'), href: makesIndex().url },
        { title: t('vehicles.admin.connectors.title'), href: index().url },
    ],
});
