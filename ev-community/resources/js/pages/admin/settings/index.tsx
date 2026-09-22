import { Head, Link, router, useForm, usePage } from '@inertiajs/react';
import { Flag, ListChecks, Megaphone, Puzzle, Save, Undo2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormActions, FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { BrandingImageField } from '@/features/system/branding-image-field';
import { BrandingPreview } from '@/features/system/branding-preview';
import { humanize, pick, tOr } from '@/features/system/i18n';
import type { SettingFormValue } from '@/features/system/setting-field';
import { SettingField, toFormValue } from '@/features/system/setting-field';
import type { SettingGroup, SettingItem } from '@/features/system/types';
import { can } from '@/lib/auth';
import { currentLocale, t } from '@/lib/i18n';
import { index as bannersIndex } from '@/routes/admin/banners';
import { index as modulesIndex } from '@/routes/admin/modules';
import { index as settingsIndex, reset, update } from '@/routes/admin/settings';
import { setup } from '@/routes/admin';

type Props = {
    groups: SettingGroup[];
    activeGroup: string;
    canManage: boolean;
    maxImageMb: number;
};

type GroupForm = {
    values: Record<string, SettingFormValue>;
    reason: string;
};

function groupLabel(key: string): string {
    return tOr(`system.settings.groups.${key}`, humanize(key));
}

function initialValues(group: SettingGroup): Record<string, SettingFormValue> {
    const values: Record<string, SettingFormValue> = {};
    for (const item of group.items) {
        if (item.type !== 'image') {
            values[item.key] = toFormValue(item);
        }
    }
    return values;
}

function GroupEditor({ group, canManage, maxImageMb }: { group: SettingGroup; canManage: boolean; maxImageMb: number }) {
    const { errors: pageErrors } = usePage().props as { errors?: Record<string, string> };
    const form = useForm<GroupForm>({ values: initialValues(group), reason: '' });
    const [resetting, setResetting] = useState<SettingItem | null>(null);
    const errors = form.errors as Record<string, string | undefined>;
    const fields = group.items.filter((item) => item.type !== 'image');
    const images = group.items.filter((item) => item.type === 'image');

    const setValue = (key: string, value: SettingFormValue) => form.setData('values', { ...form.data.values, [key]: value });
    const text = (key: string) => {
        const value = form.data.values[key];
        return typeof value === 'string' ? value : '';
    };

    const submit = () => {
        form.submit(update(group.key), { preserveScroll: true });
    };

    const locale = currentLocale();
    const imageValue = (key: string) => {
        const item = group.items.find((candidate) => candidate.key === key);
        return item && typeof item.value === 'string' && item.value !== '' ? item.value : null;
    };

    return (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
            <SectionCard title={groupLabel(group.key)}>
                <form
                    className="grid gap-5"
                    onSubmit={(event) => {
                        event.preventDefault();
                        submit();
                    }}
                    noValidate
                >
                    {images.map((item) => (
                        <BrandingImageField key={item.key} item={item} maxMb={maxImageMb} disabled={!canManage} error={pageErrors?.file} />
                    ))}
                    {fields.map((item) => (
                        <SettingField
                            key={item.key}
                            item={item}
                            value={form.data.values[item.key] ?? null}
                            onChange={(value) => setValue(item.key, value)}
                            error={errors[item.key]}
                            disabled={!canManage}
                            onReset={canManage ? () => setResetting(item) : undefined}
                        />
                    ))}
                    {canManage && fields.length > 0 ? (
                        <>
                            <FormField label={t('system.settings.labels.change_note')} optional hint={t('system.settings.labels.change_note_hint')} error={errors.reason}>
                                <Textarea value={form.data.reason} onChange={(event) => form.setData('reason', event.target.value)} rows={2} maxLength={500} />
                            </FormField>
                            {form.isDirty ? <InlineAlert tone="warning">{t('system.settings.labels.unsaved')}</InlineAlert> : null}
                            {errors.domain ? <InlineAlert tone="danger">{errors.domain}</InlineAlert> : null}
                            <FormActions>
                                <Button type="button" variant="ghost" onClick={() => form.reset()} disabled={!form.isDirty || form.processing}>
                                    <Undo2 className="size-4" aria-hidden="true" />
                                    {t('system.settings.actions.discard')}
                                </Button>
                                <Button type="submit" disabled={!form.isDirty || form.processing}>
                                    {form.processing ? <Spinner /> : <Save className="size-4" aria-hidden="true" />}
                                    {t('system.settings.actions.save')}
                                </Button>
                            </FormActions>
                        </>
                    ) : null}
                </form>
            </SectionCard>
            {group.key === 'branding' ? (
                <div className="lg:sticky lg:top-4 lg:self-start">
                    <BrandingPreview
                        siteName={text(`branding.site_name_${locale}`)}
                        tagline={text(`branding.tagline_${locale}`)}
                        logo={imageValue('branding.logo_path')}
                        primary={text('branding.primary_color')}
                        accent={text('branding.accent_color')}
                        background={text('branding.background_color')}
                    />
                </div>
            ) : null}
            <ConfirmDialog
                open={resetting !== null}
                onOpenChange={(open) => (!open ? setResetting(null) : undefined)}
                title={t('system.settings.reset_confirm.title', { label: resetting ? pick(resetting.label) : '' })}
                description={t('system.settings.reset_confirm.description')}
                confirmLabel={t('system.settings.actions.reset')}
                onConfirm={() =>
                    new Promise<void>((resolve) => {
                        if (!resetting) {
                            resolve();
                            return;
                        }
                        router.delete(reset(resetting.key).url, {
                            preserveScroll: true,
                            onFinish: () => {
                                resolve();
                                setResetting(null);
                            },
                        });
                    })
                }
            />
        </div>
    );
}

export default function SettingsIndex({ groups, activeGroup, canManage, maxImageMb }: Props) {
    const [tab, setTab] = useState(activeGroup);
    // Remount a group's form whenever the server values change (after save/reset/upload) so it shows server truth.
    const versions = useMemo(() => Object.fromEntries(groups.map((group) => [group.key, JSON.stringify(group.items.map((item) => [item.key, item.value, item.overridden]))])), [groups]);

    return (
        <>
            <Head title={t('system.settings.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('system.settings.title')}
                    description={t('system.settings.description')}
                    actions={
                        <>
                            {canManage ? (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={setup().url}>
                                        <ListChecks className="size-4" aria-hidden="true" />
                                        {t('system.settings.actions.setup')}
                                    </Link>
                                </Button>
                            ) : null}
                            {can('modules.manage') ? (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={modulesIndex().url}>
                                        <Puzzle className="size-4" aria-hidden="true" />
                                        {t('system.settings.actions.modules')}
                                    </Link>
                                </Button>
                            ) : null}
                            {can('banners.manage') ? (
                                <Button variant="outline" size="sm" asChild>
                                    <Link href={bannersIndex().url}>
                                        <Megaphone className="size-4" aria-hidden="true" />
                                        {t('system.settings.actions.banners')}
                                    </Link>
                                </Button>
                            ) : null}
                        </>
                    }
                />
                {!canManage ? (
                    <InlineAlert tone="info" icon={Flag}>
                        {t('system.settings.read_only')}
                    </InlineAlert>
                ) : null}
                <Tabs value={tab} onValueChange={setTab} className="gap-4">
                    <TabsList className="w-full justify-start sm:w-fit">
                        {groups.map((group) => (
                            <TabsTrigger key={group.key} value={group.key}>
                                {groupLabel(group.key)}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                    {groups.map((group) => (
                        <TabsContent key={group.key} value={group.key}>
                            <GroupEditor key={versions[group.key]} group={group} canManage={canManage} maxImageMb={maxImageMb} />
                        </TabsContent>
                    ))}
                </Tabs>
            </div>
        </>
    );
}

SettingsIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: settingsIndex().url },
        { title: t('system.settings.title'), href: settingsIndex().url },
    ],
});
