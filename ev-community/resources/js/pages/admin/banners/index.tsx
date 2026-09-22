import { Head, router, useForm } from '@inertiajs/react';
import {
    AlertTriangle,
    Info,
    OctagonAlert,
    Pencil,
    Plus,
    Save,
    Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import type { DataTableColumn } from '@/components/shared/data-table';
import { DataTable } from '@/components/shared/data-table';
import { DateTime } from '@/components/shared/date-time';
import { FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import type { StatusTone } from '@/components/shared/status-badge';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { DateInput } from '@/components/ui/date-input';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { toCairoInput } from '@/features/system/i18n';
import { PageErrors } from '@/features/system/page-errors';
import type {
    Banner,
    BannerLevel,
    BannerTarget,
} from '@/features/system/types';
import { currentLocale, t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import {
    destroy,
    index as bannersIndex,
    store,
    update,
} from '@/routes/admin/banners';
import type { Paginated } from '@/types/pagination';

type Props = {
    banners: Paginated<Banner>;
    levels: BannerLevel[];
    targets: BannerTarget[];
};

type BannerForm = {
    level: BannerLevel;
    message_ar: string;
    message_en: string;
    targets: BannerTarget[];
    is_active: boolean;
    starts_at: string;
    ends_at: string;
};

type BannerState = 'live' | 'scheduled' | 'expired' | 'inactive';

const STATE_TONE: Record<BannerState, StatusTone> = {
    live: 'success',
    scheduled: 'info',
    expired: 'muted',
    inactive: 'muted',
};

function stateOf(banner: Banner, now: number): BannerState {
    if (!banner.is_active) {
        return 'inactive';
    }
    if (banner.ends_at && new Date(banner.ends_at).getTime() < now) {
        return 'expired';
    }
    if (banner.starts_at && new Date(banner.starts_at).getTime() > now) {
        return 'scheduled';
    }
    return 'live';
}

function BannerPreview({
    level,
    message,
}: {
    level: BannerLevel;
    message: string;
}) {
    const Icon =
        level === 'major'
            ? OctagonAlert
            : level === 'warning'
              ? AlertTriangle
              : Info;
    return (
        <div
            className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm',
                level === 'major' && 'bg-danger-soft text-danger',
                level === 'warning' && 'bg-warning-soft text-warning',
                level === 'information' && 'bg-info-soft text-info',
            )}
        >
            <Icon className="size-4 shrink-0" aria-hidden="true" />
            <span className="min-w-0 break-words">{message || '—'}</span>
        </div>
    );
}

function BannerDialog({
    banner,
    open,
    onOpenChange,
    levels,
    targets,
}: {
    banner: Banner | null;
    open: boolean;
    onOpenChange: (open: boolean) => void;
    levels: BannerLevel[];
    targets: BannerTarget[];
}) {
    const form = useForm<BannerForm>({
        level: banner?.level ?? 'information',
        message_ar: banner?.message_ar ?? '',
        message_en: banner?.message_en ?? '',
        targets: banner?.targets ?? ['public', 'member'],
        is_active: banner?.is_active ?? true,
        starts_at: toCairoInput(banner?.starts_at),
        ends_at: toCairoInput(banner?.ends_at),
    });
    const errors = form.errors as Record<string, string | undefined>;
    const targetsError =
        errors.targets ??
        Object.entries(errors).find(([key]) => key.startsWith('targets.'))?.[1];
    const previewMessage =
        currentLocale() === 'ar' ? form.data.message_ar : form.data.message_en;

    return (
        <Dialog
            open={open}
            onOpenChange={(next) =>
                !form.processing ? onOpenChange(next) : undefined
            }
        >
            <DialogContent className="sm:max-w-lg">
                <form
                    className="grid gap-4"
                    onSubmit={(event) => {
                        event.preventDefault();
                        form.submit(banner ? update(banner.id) : store(), {
                            preserveScroll: true,
                            onSuccess: () => onOpenChange(false),
                        });
                    }}
                >
                    <DialogHeader>
                        <DialogTitle>
                            {banner
                                ? t('system.banners.form.edit_title')
                                : t('system.banners.form.create_title')}
                        </DialogTitle>
                        <DialogDescription>
                            {t('system.banners.form.description')}
                        </DialogDescription>
                    </DialogHeader>
                    <FormField
                        label={t('system.banners.fields.level')}
                        required
                        error={errors.level}
                    >
                        <Select
                            value={form.data.level}
                            onValueChange={(value) =>
                                form.setData('level', value as BannerLevel)
                            }
                        >
                            <SelectTrigger className="w-full">
                                <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                                {levels.map((level) => (
                                    <SelectItem key={level} value={level}>
                                        {t(`system.banners.levels.${level}`)}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </FormField>
                    <FormField
                        label={t('system.banners.fields.message_ar')}
                        required
                        error={errors.message_ar}
                    >
                        <Textarea
                            dir="rtl"
                            lang="ar"
                            value={form.data.message_ar}
                            onChange={(event) =>
                                form.setData('message_ar', event.target.value)
                            }
                            rows={2}
                            maxLength={255}
                            required
                        />
                    </FormField>
                    <FormField
                        label={t('system.banners.fields.message_en')}
                        required
                        error={errors.message_en}
                    >
                        <Textarea
                            dir="ltr"
                            lang="en"
                            value={form.data.message_en}
                            onChange={(event) =>
                                form.setData('message_en', event.target.value)
                            }
                            rows={2}
                            maxLength={255}
                            required
                        />
                    </FormField>
                    <fieldset className="grid gap-2">
                        <legend className="mb-1 text-sm font-medium">
                            {t('system.banners.fields.targets')}
                        </legend>
                        <div className="flex flex-wrap gap-4">
                            {targets.map((target) => (
                                <div
                                    key={target}
                                    className="flex items-center gap-2"
                                >
                                    <Checkbox
                                        id={`banner-target-${target}`}
                                        checked={form.data.targets.includes(
                                            target,
                                        )}
                                        onCheckedChange={(checked) =>
                                            form.setData(
                                                'targets',
                                                checked === true
                                                    ? Array.from(
                                                          new Set([
                                                              ...form.data
                                                                  .targets,
                                                              target,
                                                          ]),
                                                      )
                                                    : form.data.targets.filter(
                                                          (item) =>
                                                              item !== target,
                                                      ),
                                            )
                                        }
                                    />
                                    <Label htmlFor={`banner-target-${target}`}>
                                        {t(`system.banners.targets.${target}`)}
                                    </Label>
                                </div>
                            ))}
                        </div>
                        {targetsError ? (
                            <p role="alert" className="text-sm text-danger">
                                {targetsError}
                            </p>
                        ) : null}
                    </fieldset>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <FormField
                            label={t('system.banners.fields.starts_at')}
                            optional
                            error={errors.starts_at}
                        >
                            <DateInput
                                mode="datetime"
                                value={form.data.starts_at}
                                onChange={(event) =>
                                    form.setData(
                                        'starts_at',
                                        event.target.value,
                                    )
                                }
                            />
                        </FormField>
                        <FormField
                            label={t('system.banners.fields.ends_at')}
                            optional
                            error={errors.ends_at}
                        >
                            <DateInput
                                mode="datetime"
                                value={form.data.ends_at}
                                min={form.data.starts_at || undefined}
                                onChange={(event) =>
                                    form.setData('ends_at', event.target.value)
                                }
                            />
                        </FormField>
                    </div>
                    <p className="-mt-2 text-xs text-muted-foreground">
                        {t('system.banners.labels.cairo_time')}
                    </p>
                    <div className="flex items-center gap-3">
                        <Switch
                            id="banner-active"
                            checked={form.data.is_active}
                            onCheckedChange={(checked) =>
                                form.setData('is_active', checked)
                            }
                        />
                        <Label htmlFor="banner-active">
                            {t('system.banners.fields.is_active')}
                        </Label>
                    </div>
                    <div className="grid gap-1.5">
                        <span className="text-xs font-medium text-muted-foreground">
                            {t('system.banners.labels.preview')}
                        </span>
                        <BannerPreview
                            level={form.data.level}
                            message={previewMessage}
                        />
                    </div>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => onOpenChange(false)}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button type="submit" disabled={form.processing}>
                            {form.processing ? (
                                <Spinner />
                            ) : (
                                <Save className="size-4" aria-hidden="true" />
                            )}
                            {t('core.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}

export default function BannersIndex({ banners, levels, targets }: Props) {
    const [editing, setEditing] = useState<{ banner: Banner | null } | null>(
        null,
    );
    const [deleting, setDeleting] = useState<Banner | null>(null);
    const [now] = useState(() => Date.now());
    const locale = currentLocale();

    const columns: DataTableColumn<Banner>[] = [
        {
            key: 'message',
            header: t('system.banners.labels.message'),
            required: true,
            cell: (banner) => (
                <div className="grid max-w-md gap-1">
                    <BannerPreview
                        level={banner.level}
                        message={
                            locale === 'ar'
                                ? banner.message_ar
                                : banner.message_en
                        }
                    />
                </div>
            ),
        },
        {
            key: 'state',
            header: t('core.labels.status'),
            cell: (banner) => {
                const state = stateOf(banner, now);
                return (
                    <StatusBadge
                        status={state}
                        tone={STATE_TONE[state]}
                        label={t(`system.banners.states.${state}`)}
                    />
                );
            },
        },
        {
            key: 'targets',
            header: t('system.banners.fields.targets'),
            cell: (banner) =>
                banner.targets
                    .map((target) => t(`system.banners.targets.${target}`))
                    .join(locale === 'ar' ? '، ' : ', '),
        },
        {
            key: 'window',
            header: t('system.banners.labels.window'),
            hideOnMobile: true,
            cell: (banner) => (
                <span className="grid text-xs">
                    <span>
                        {banner.starts_at ? (
                            <DateTime value={banner.starts_at} />
                        ) : (
                            t('system.banners.labels.immediately')
                        )}
                    </span>
                    <span className="text-muted-foreground">
                        {banner.ends_at ? (
                            <DateTime value={banner.ends_at} />
                        ) : (
                            t('system.banners.labels.no_end')
                        )}
                    </span>
                </span>
            ),
        },
        {
            key: 'actions',
            header: <span className="sr-only">{t('core.labels.actions')}</span>,
            align: 'end',
            required: true,
            cell: (banner) => (
                <div className="flex justify-end gap-1">
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setEditing({ banner })}
                        aria-label={t('system.banners.actions.edit')}
                    >
                        <Pencil className="size-4" aria-hidden="true" />
                    </Button>
                    <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(banner)}
                        aria-label={t('system.banners.actions.delete')}
                    >
                        <Trash2 className="size-4" aria-hidden="true" />
                    </Button>
                </div>
            ),
        },
    ];

    return (
        <>
            <Head title={t('system.banners.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('system.banners.title')}
                    description={t('system.banners.description')}
                    actions={
                        <Button onClick={() => setEditing({ banner: null })}>
                            <Plus className="size-4" aria-hidden="true" />
                            {t('system.banners.actions.create')}
                        </Button>
                    }
                />
                <PageErrors
                    ignore={[
                        'level',
                        'message_ar',
                        'message_en',
                        'targets',
                        'is_active',
                        'starts_at',
                        'ends_at',
                    ]}
                />
                <DataTable
                    id="admin-banners"
                    columns={columns}
                    data={banners}
                    rowKey="id"
                    columnToggle={false}
                    emptyTitle={t('system.banners.empty.title')}
                    emptyDescription={t('system.banners.empty.description')}
                    emptyAction={
                        <Button
                            size="sm"
                            onClick={() => setEditing({ banner: null })}
                        >
                            {t('system.banners.actions.create')}
                        </Button>
                    }
                    caption={t('system.banners.title')}
                />
            </div>
            {editing ? (
                <BannerDialog
                    key={editing.banner?.id ?? 'new'}
                    banner={editing.banner}
                    open
                    onOpenChange={(open) =>
                        !open ? setEditing(null) : undefined
                    }
                    levels={levels}
                    targets={targets}
                />
            ) : null}
            <ConfirmDialog
                open={deleting !== null}
                onOpenChange={(open) => (!open ? setDeleting(null) : undefined)}
                title={t('system.banners.delete_confirm.title')}
                description={t('system.banners.delete_confirm.description')}
                confirmLabel={t('system.banners.actions.delete')}
                destructive
                onConfirm={() =>
                    new Promise<void>((resolve) => {
                        if (!deleting) {
                            resolve();
                            return;
                        }
                        router.delete(destroy(deleting.id).url, {
                            preserveScroll: true,
                            onFinish: () => {
                                resolve();
                                setDeleting(null);
                            },
                        });
                    })
                }
            />
        </>
    );
}

BannersIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: bannersIndex().url },
        { title: t('system.banners.title'), href: bannersIndex().url },
    ],
});
