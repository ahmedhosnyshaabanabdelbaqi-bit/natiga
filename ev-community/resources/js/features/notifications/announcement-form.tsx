import { Link, useForm } from '@inertiajs/react';
import { Eye, Lock, Users } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { FormActions, FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { EmailFrame } from '@/features/notifications/email-frame';
import { requestJson } from '@/features/notifications/http';
import type { AudienceField, AudienceOption, Campaign, ChannelOption, LocalePreview, Option } from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import { estimate, preview, store, update } from '@/routes/admin/notifications';

export type AnnouncementFormData = {
    title_ar: string;
    title_en: string;
    body_ar: string;
    body_en: string;
    url: string;
    category: string;
    is_marketing: boolean;
    channels: string[];
    audience_type: string;
    audience_params: Record<string, string>;
};

type Props = {
    audiences: AudienceOption[];
    channels: ChannelOption[];
    categories: Option[];
    campaign?: Campaign;
    onCancelHref: string;
};

const ESTIMATE_DEBOUNCE_MS = 600;

function paramsToStrings(params: Record<string, unknown> | undefined): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [name, value] of Object.entries(params ?? {})) {
        if (Array.isArray(value)) {
            out[name] = value.map((v) => String(v)).join('\n');
        } else if (value !== null && value !== undefined) {
            out[name] = String(value);
        }
    }
    return out;
}

function initialData(props: Props): AnnouncementFormData {
    const c = props.campaign;
    return {
        title_ar: c?.title_ar ?? '',
        title_en: c?.title_en ?? '',
        body_ar: c?.body_ar ?? '',
        body_en: c?.body_en ?? '',
        url: c?.url ?? '',
        category: c?.category ?? 'system',
        is_marketing: c?.is_marketing ?? false,
        channels: c?.channels ?? ['in_app'],
        audience_type: c?.audience_type ?? props.audiences[0]?.key ?? '',
        audience_params: paramsToStrings(c?.audience_params),
    };
}

export function AnnouncementForm(props: Props) {
    const { audiences, channels, categories, campaign, onCancelHref } = props;
    const form = useForm<AnnouncementFormData>(initialData(props));
    const [estimateLabel, setEstimateLabel] = useState<string | null>(null);
    const [estimateError, setEstimateError] = useState<string | null>(null);
    const [estimating, setEstimating] = useState(false);
    const [previewData, setPreviewData] = useState<Record<'ar' | 'en', LocalePreview> | null>(null);
    const [previewing, setPreviewing] = useState(false);
    const [previewError, setPreviewError] = useState<string | null>(null);
    const estimateAbort = useRef<AbortController | null>(null);

    const audience = audiences.find((a) => a.key === form.data.audience_type) ?? null;
    const error = (key: string): string | undefined => (form.errors as Record<string, string | undefined>)[key];

    const runEstimate = useCallback(async (type: string, params: Record<string, string>) => {
        estimateAbort.current?.abort();
        const controller = new AbortController();
        estimateAbort.current = controller;
        setEstimating(true);
        setEstimateError(null);
        try {
            const result = await requestJson<{ count: number; label: string }>('post', estimate.url(), { audience_type: type, audience_params: params }, controller.signal);
            if (result.ok) {
                setEstimateLabel(result.data.label);
            } else {
                setEstimateLabel(null);
                setEstimateError(Object.values(result.errors)[0] ?? result.message ?? t('notifications.errors.request_failed'));
            }
        } catch {
            return; // superseded by a newer estimate
        } finally {
            if (estimateAbort.current === controller) {
                setEstimating(false);
            }
        }
    }, []);

    // Server-computed estimate, refreshed (debounced) whenever the audience changes and is complete.
    useEffect(() => {
        const current = audiences.find((a) => a.key === form.data.audience_type);
        if (!current) {
            return;
        }
        const complete = current.fields.every((field) => (form.data.audience_params[field.name] ?? '').trim() !== '');
        if (!complete) {
            setEstimateLabel(null);
            setEstimateError(null);
            return;
        }
        const timer = window.setTimeout(() => void runEstimate(current.key, form.data.audience_params), ESTIMATE_DEBOUNCE_MS);
        return () => window.clearTimeout(timer);
    }, [audiences, form.data.audience_type, form.data.audience_params, runEstimate]);

    useEffect(() => () => estimateAbort.current?.abort(), []);

    const loadPreview = async () => {
        setPreviewing(true);
        setPreviewError(null);
        const { title_ar, title_en, body_ar, body_en, url } = form.data;
        const result = await requestJson<Record<'ar' | 'en', LocalePreview>>('post', preview.url(), { title_ar, title_en, body_ar, body_en, url });
        setPreviewing(false);
        if (result.ok) {
            setPreviewData(result.data);
        } else {
            setPreviewError(result.message ?? t('notifications.errors.request_failed'));
        }
    };

    const setParam = (name: string, value: string) => form.setData('audience_params', { ...form.data.audience_params, [name]: value });

    const toggleChannel = (value: string, checked: boolean) => {
        const next = checked ? [...new Set([...form.data.channels, value])] : form.data.channels.filter((c) => c !== value);
        form.setData('channels', next.includes('in_app') ? next : ['in_app', ...next]);
    };

    const submit = () => {
        if (campaign) {
            form.put(update.url(campaign.id), { preserveScroll: true });
        } else {
            form.post(store.url(), { preserveScroll: true });
        }
    };

    const renderAudienceField = (field: AudienceField) => {
        const id = `audience-${field.name}`;
        const value = form.data.audience_params[field.name] ?? '';
        const fieldError = error(`audience_params.${field.name}`);
        if (field.type === 'select') {
            return (
                <FormField key={field.name} id={id} label={field.label} hint={field.hint} error={fieldError} required>
                    {(controlProps) => (
                        <Select value={value} onValueChange={(next) => setParam(field.name, next)}>
                            <SelectTrigger {...controlProps} className="w-full">
                                <SelectValue placeholder={t('notifications.admin.fields.select_placeholder')} />
                            </SelectTrigger>
                            <SelectContent>
                                {(field.options ?? []).map((option) => (
                                    <SelectItem key={String(option.value)} value={String(option.value)}>
                                        {option.label}
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    )}
                </FormField>
            );
        }
        if (field.type === 'textarea') {
            return (
                <FormField key={field.name} id={id} label={field.label} hint={field.hint} error={fieldError} required>
                    <Textarea value={value} onChange={(e) => setParam(field.name, e.target.value)} rows={5} dir="ltr" className="font-mono text-sm" />
                </FormField>
            );
        }
        return (
            <FormField key={field.name} id={id} label={field.label} hint={field.hint} error={fieldError} required>
                <Input type={field.type === 'number' ? 'number' : 'text'} value={value} onChange={(e) => setParam(field.name, e.target.value)} />
            </FormField>
        );
    };

    return (
        <form
            className="space-y-6"
            onSubmit={(event) => {
                event.preventDefault();
                submit();
            }}
            noValidate
        >
            {error('domain') ? <InlineAlert tone="danger">{error('domain')}</InlineAlert> : null}

            <SectionCard title={t('notifications.admin.fields.content')}>
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label={t('notifications.admin.fields.title_ar')} error={error('title_ar')} required>
                        <Input value={form.data.title_ar} onChange={(e) => form.setData('title_ar', e.target.value)} dir="rtl" lang="ar" maxLength={255} />
                    </FormField>
                    <FormField label={t('notifications.admin.fields.title_en')} error={error('title_en')} required>
                        <Input value={form.data.title_en} onChange={(e) => form.setData('title_en', e.target.value)} dir="ltr" lang="en" maxLength={255} />
                    </FormField>
                    <FormField label={t('notifications.admin.fields.body_ar')} error={error('body_ar')} required>
                        <Textarea value={form.data.body_ar} onChange={(e) => form.setData('body_ar', e.target.value)} dir="rtl" lang="ar" rows={5} maxLength={5000} />
                    </FormField>
                    <FormField label={t('notifications.admin.fields.body_en')} error={error('body_en')} required>
                        <Textarea value={form.data.body_en} onChange={(e) => form.setData('body_en', e.target.value)} dir="ltr" lang="en" rows={5} maxLength={5000} />
                    </FormField>
                    <FormField label={t('notifications.admin.fields.url')} hint={t('notifications.admin.fields.url_hint')} error={error('url')} optional>
                        <Input value={form.data.url} onChange={(e) => form.setData('url', e.target.value)} dir="ltr" placeholder="/account" maxLength={2048} />
                    </FormField>
                    <FormField label={t('notifications.admin.fields.category')} error={error('category')} required>
                        {(controlProps) => (
                            <Select value={form.data.category} onValueChange={(value) => form.setData('category', value)}>
                                <SelectTrigger {...controlProps} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {categories.map((option) => (
                                        <SelectItem key={option.value} value={option.value}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </FormField>
                </div>
                <div className="mt-4 flex items-start gap-3 rounded-lg border p-3">
                    <Switch id="is_marketing" checked={form.data.is_marketing} onCheckedChange={(value) => form.setData('is_marketing', value)} aria-describedby="is_marketing-hint" />
                    <div className="space-y-1">
                        <Label htmlFor="is_marketing">{t('notifications.admin.fields.is_marketing')}</Label>
                        <p id="is_marketing-hint" className="text-xs text-muted-foreground">
                            {t('notifications.admin.fields.is_marketing_hint')}
                        </p>
                    </div>
                </div>
            </SectionCard>

            <SectionCard title={t('notifications.admin.fields.channels')}>
                <fieldset className="grid gap-3 sm:grid-cols-2" aria-describedby={error('channels') ? 'channels-error' : undefined}>
                    <legend className="sr-only">{t('notifications.admin.fields.channels')}</legend>
                    {channels.map((channel) => {
                        const id = `channel-${channel.value}`;
                        const checked = channel.always || form.data.channels.includes(channel.value);
                        return (
                            <div key={channel.value} className="flex items-center gap-3 rounded-lg border p-3">
                                <Checkbox
                                    id={id}
                                    checked={checked}
                                    disabled={channel.always || !channel.configured}
                                    onCheckedChange={(value) => toggleChannel(channel.value, value === true)}
                                />
                                <Label htmlFor={id} className="flex flex-1 flex-wrap items-center gap-2">
                                    {channel.label}
                                    {channel.always ? (
                                        <Badge variant="secondary" className="font-normal">
                                            <Lock aria-hidden="true" />
                                            {t('notifications.admin.fields.in_app_always')}
                                        </Badge>
                                    ) : null}
                                    {!channel.configured ? (
                                        <Badge variant="outline" className="font-normal text-muted-foreground" title={t('notifications.admin.channel_not_configured_hint')}>
                                            {t('notifications.admin.channel_not_configured')}
                                        </Badge>
                                    ) : null}
                                </Label>
                            </div>
                        );
                    })}
                </fieldset>
                {channels.some((c) => !c.configured) ? <p className="mt-3 text-xs text-muted-foreground">{t('notifications.admin.channel_not_configured_hint')}</p> : null}
                {error('channels') ? (
                    <p id="channels-error" role="alert" className="mt-2 text-sm text-danger">
                        {error('channels')}
                    </p>
                ) : null}
            </SectionCard>

            <SectionCard title={t('notifications.admin.fields.audience')}>
                <div className="grid gap-4 md:grid-cols-2">
                    <FormField label={t('notifications.admin.fields.audience_type')} error={error('audience_type')} required>
                        {(controlProps) => (
                            <Select
                                value={form.data.audience_type}
                                onValueChange={(value) => {
                                    form.setData((data) => ({ ...data, audience_type: value, audience_params: {} }));
                                }}
                            >
                                <SelectTrigger {...controlProps} className="w-full">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {audiences.map((option) => (
                                        <SelectItem key={option.key} value={option.key}>
                                            {option.label}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        )}
                    </FormField>
                    {audience?.fields.map(renderAudienceField)}
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3 rounded-lg bg-muted/50 p-3" aria-live="polite">
                    <Users className="size-5 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                            {estimating ? t('core.states.loading') : estimateError ? <span className="text-danger">{estimateError}</span> : (estimateLabel ?? t('notifications.admin.fields.estimated_recipients'))}
                        </p>
                        <p className="text-xs text-muted-foreground">{t('notifications.admin.estimate_hint')}</p>
                    </div>
                    <Button type="button" variant="outline" size="sm" disabled={estimating || !audience} onClick={() => audience && void runEstimate(audience.key, form.data.audience_params)}>
                        {estimating ? <Spinner /> : null}
                        {t('notifications.admin.actions.estimate')}
                    </Button>
                </div>
            </SectionCard>

            <SectionCard
                title={t('notifications.admin.preview_title')}
                description={t('notifications.admin.preview_hint')}
                actions={
                    <Button type="button" variant="outline" size="sm" onClick={() => void loadPreview()} disabled={previewing}>
                        {previewing ? <Spinner /> : <Eye aria-hidden="true" />}
                        {t('notifications.admin.actions.preview')}
                    </Button>
                }
            >
                {previewError ? <InlineAlert tone="danger">{previewError}</InlineAlert> : null}
                {previewData ? (
                    <Tabs defaultValue="ar">
                        <TabsList>
                            <TabsTrigger value="ar">{t('core.labels.arabic')}</TabsTrigger>
                            <TabsTrigger value="en">{t('core.labels.english')}</TabsTrigger>
                        </TabsList>
                        {(['ar', 'en'] as const).map((locale) => (
                            <TabsContent key={locale} value={locale} className="grid gap-4 lg:grid-cols-2">
                                <div className="space-y-2" dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale}>
                                    <p className="text-xs font-medium text-muted-foreground">{t('notifications.admin.in_app_preview')}</p>
                                    <div className="rounded-lg border bg-card p-4">
                                        <p className="text-sm font-semibold">{previewData[locale].title}</p>
                                        <p className="mt-1 text-sm whitespace-pre-line text-muted-foreground">{previewData[locale].body}</p>
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs font-medium text-muted-foreground">
                                        {t('notifications.admin.email_preview')} — {t('notifications.admin.subject')}: <span dir={locale === 'ar' ? 'rtl' : 'ltr'}>{previewData[locale].email_subject}</span>
                                    </p>
                                    <EmailFrame html={previewData[locale].email_html} dir={locale === 'ar' ? 'rtl' : 'ltr'} lang={locale} title={`${t('notifications.admin.email_preview')} (${locale})`} />
                                </div>
                            </TabsContent>
                        ))}
                    </Tabs>
                ) : (
                    <p className="text-sm text-muted-foreground">{t('notifications.admin.preview_empty')}</p>
                )}
            </SectionCard>

            <FormActions>
                <Button type="button" variant="ghost" asChild>
                    <Link href={onCancelHref}>{t('core.actions.cancel')}</Link>
                </Button>
                <Button type="submit" disabled={form.processing}>
                    {form.processing ? <Spinner /> : null}
                    {campaign ? t('notifications.admin.actions.save_changes') : t('notifications.admin.actions.save_draft')}
                </Button>
            </FormActions>
        </form>
    );
}
