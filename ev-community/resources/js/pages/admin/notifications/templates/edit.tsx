import { Head, Link, router, useForm } from '@inertiajs/react';
import { ArrowLeft, RotateCcw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { FormActions, FormField } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { StatusBadge } from '@/components/shared/status-badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { AdminNotificationsNav } from '@/features/notifications/admin-nav';
import { EmailFrame } from '@/features/notifications/email-frame';
import { requestJson } from '@/features/notifications/http';
import type {
    TemplateDetail,
    TemplatePreview,
} from '@/features/notifications/types';
import { t } from '@/lib/i18n';
import {
    edit,
    index,
    preview,
    reset,
    update,
} from '@/routes/admin/notifications/templates';

type Field = 'subject_ar' | 'subject_en' | 'body_ar' | 'body_en';
type FormData = Record<Field, string>;
type Locale = 'ar' | 'en';

const PREVIEW_DEBOUNCE_MS = 500;

export default function EmailTemplateEdit({
    template,
}: {
    template: TemplateDetail;
}) {
    const form = useForm<FormData>({
        subject_ar: template.values.subject_ar ?? '',
        subject_en: template.values.subject_en ?? '',
        body_ar: template.values.body_ar ?? '',
        body_en: template.values.body_en ?? '',
    });
    const [focused, setFocused] = useState<Field>('body_ar');
    const [previewData, setPreviewData] = useState<TemplatePreview | null>(
        null,
    );
    const [previewError, setPreviewError] = useState(false);
    const [previewing, setPreviewing] = useState(false);
    const [confirmReset, setConfirmReset] = useState(false);
    const [resetting, setResetting] = useState(false);
    const refs = useRef<
        Partial<Record<Field, HTMLInputElement | HTMLTextAreaElement | null>>
    >({});

    // Live preview with sample data (debounced).
    useEffect(() => {
        const controller = new AbortController();
        const timer = window.setTimeout(async () => {
            setPreviewing(true);
            try {
                const result = await requestJson<TemplatePreview>(
                    'post',
                    preview.url({ key: template.key }),
                    form.data,
                    controller.signal,
                );
                if (result.ok) {
                    setPreviewData(result.data);
                    setPreviewError(false);
                } else {
                    setPreviewError(true);
                }
            } catch {
                return;
            } finally {
                if (!controller.signal.aborted) {
                    setPreviewing(false);
                }
            }
        }, PREVIEW_DEBOUNCE_MS);
        return () => {
            window.clearTimeout(timer);
            controller.abort();
        };
    }, [form.data, template.key]);

    const insertVariable = (name: string) => {
        const token = `{{${name}}}`;
        const element = refs.current[focused];
        const current = form.data[focused];
        const start = element?.selectionStart ?? current.length;
        const end = element?.selectionEnd ?? current.length;
        const next = current.slice(0, start) + token + current.slice(end);
        form.setData(focused, next);
        window.requestAnimationFrame(() => {
            element?.focus();
            element?.setSelectionRange(
                start + token.length,
                start + token.length,
            );
        });
    };

    const submit = () =>
        form.put(update.url({ key: template.key }), {
            preserveScroll: true,
            onSuccess: () => form.setDefaults(),
        });

    const doReset = () =>
        new Promise<void>((resolve) => {
            setResetting(true);
            router.delete(reset.url({ key: template.key }), {
                preserveScroll: true,
                onSuccess: () => {
                    form.setData({
                        subject_ar: '',
                        subject_en: '',
                        body_ar: '',
                        body_en: '',
                    });
                    form.setDefaults({
                        subject_ar: '',
                        subject_en: '',
                        body_ar: '',
                        body_en: '',
                    });
                },
                onFinish: () => {
                    setResetting(false);
                    setConfirmReset(false);
                    resolve();
                },
            });
        });

    const renderLocale = (locale: Locale) => {
        const subject: Field = locale === 'ar' ? 'subject_ar' : 'subject_en';
        const body: Field = locale === 'ar' ? 'body_ar' : 'body_en';
        const defaults = template.defaults[locale];
        const dir = locale === 'ar' ? 'rtl' : 'ltr';
        return (
            <div className="space-y-4">
                <FormField
                    label={t(`notifications.email_templates.${subject}`)}
                    hint={t('notifications.email_templates.empty_uses_default')}
                    error={form.errors[subject]}
                >
                    <Input
                        ref={(el) => {
                            refs.current[subject] = el;
                        }}
                        value={form.data[subject]}
                        onChange={(e) => form.setData(subject, e.target.value)}
                        onFocus={() => setFocused(subject)}
                        placeholder={defaults.subject ?? ''}
                        dir={dir}
                        lang={locale}
                        maxLength={255}
                    />
                </FormField>
                <FormField
                    label={t(`notifications.email_templates.${body}`)}
                    hint={t('notifications.email_templates.formatting_hint')}
                    error={form.errors[body]}
                >
                    <Textarea
                        ref={(el) => {
                            refs.current[body] = el;
                        }}
                        value={form.data[body]}
                        onChange={(e) => form.setData(body, e.target.value)}
                        onFocus={() => setFocused(body)}
                        placeholder={defaults.body ?? ''}
                        dir={dir}
                        lang={locale}
                        rows={10}
                        maxLength={10000}
                    />
                </FormField>
                <div className="rounded-lg bg-muted/50 p-3 text-xs">
                    <p className="font-medium text-muted-foreground">
                        {t('notifications.email_templates.default_text')}
                    </p>
                    {defaults.subject || defaults.body ? (
                        <div
                            dir={dir}
                            lang={locale}
                            className="mt-1 space-y-1 whitespace-pre-line"
                        >
                            {defaults.subject ? (
                                <p className="font-semibold">
                                    {defaults.subject}
                                </p>
                            ) : null}
                            {defaults.body ? <p>{defaults.body}</p> : null}
                        </div>
                    ) : (
                        <p className="mt-1">
                            {t('notifications.email_templates.no_default')}
                        </p>
                    )}
                </div>
            </div>
        );
    };

    return (
        <>
            <Head
                title={`${t('notifications.email_templates.edit')} · ${template.key}`}
            />
            <div className="space-y-6">
                <PageHeader
                    title={t('notifications.email_templates.edit')}
                    description={template.module_label}
                    actions={
                        <>
                            <Button variant="ghost" asChild>
                                <Link href={index.url()}>
                                    <ArrowLeft
                                        className="rtl:rotate-180"
                                        aria-hidden="true"
                                    />
                                    {t('notifications.email_templates.back')}
                                </Link>
                            </Button>
                            {template.customized ? (
                                <Button
                                    variant="outline"
                                    onClick={() => setConfirmReset(true)}
                                >
                                    <RotateCcw aria-hidden="true" />
                                    {t('notifications.email_templates.reset')}
                                </Button>
                            ) : null}
                        </>
                    }
                >
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                        <Code>{template.key}</Code>
                        <StatusBadge
                            status={
                                template.customized ? 'customized' : 'default'
                            }
                            label={
                                template.customized
                                    ? t(
                                          'notifications.email_templates.customized',
                                      )
                                    : t('notifications.email_templates.default')
                            }
                            tone={template.customized ? 'brand' : 'muted'}
                        />
                        {template.customized && template.updated_by ? (
                            <span className="text-xs text-muted-foreground">
                                {t(
                                    'notifications.email_templates.last_updated_by',
                                    { name: template.updated_by },
                                )}
                            </span>
                        ) : null}
                    </div>
                </PageHeader>
                <AdminNotificationsNav current="templates" />

                <div className="grid gap-6 xl:grid-cols-2">
                    <form
                        className="space-y-6"
                        onSubmit={(event) => {
                            event.preventDefault();
                            submit();
                        }}
                    >
                        <SectionCard
                            title={t('notifications.email_templates.variables')}
                            description={t(
                                'notifications.email_templates.variables_hint',
                            )}
                        >
                            <ul className="flex flex-wrap gap-2">
                                {template.variables.map((name) => (
                                    <li key={name}>
                                        <Button
                                            type="button"
                                            variant="outline"
                                            size="sm"
                                            className="font-mono text-xs"
                                            dir="ltr"
                                            onClick={() => insertVariable(name)}
                                            aria-label={t(
                                                'notifications.email_templates.insert_variable',
                                                { name },
                                            )}
                                        >
                                            {`{{${name}}}`}
                                        </Button>
                                    </li>
                                ))}
                            </ul>
                        </SectionCard>

                        <SectionCard>
                            <Tabs defaultValue="ar">
                                <TabsList>
                                    <TabsTrigger value="ar">
                                        {t(
                                            'notifications.email_templates.arabic',
                                        )}
                                    </TabsTrigger>
                                    <TabsTrigger value="en">
                                        {t(
                                            'notifications.email_templates.english',
                                        )}
                                    </TabsTrigger>
                                </TabsList>
                                <TabsContent
                                    value="ar"
                                    forceMount
                                    className="data-[state=inactive]:hidden"
                                >
                                    {renderLocale('ar')}
                                </TabsContent>
                                <TabsContent
                                    value="en"
                                    forceMount
                                    className="data-[state=inactive]:hidden"
                                >
                                    {renderLocale('en')}
                                </TabsContent>
                            </Tabs>
                        </SectionCard>

                        <FormActions>
                            <Button
                                type="submit"
                                disabled={form.processing || !form.isDirty}
                            >
                                {form.processing ? <Spinner /> : null}
                                {t('core.actions.save')}
                            </Button>
                        </FormActions>
                    </form>

                    <SectionCard
                        title={t('notifications.email_templates.preview')}
                        description={t(
                            'notifications.email_templates.preview_hint',
                        )}
                        actions={previewing ? <Spinner /> : null}
                        className="self-start xl:sticky xl:top-4"
                    >
                        {previewError ? (
                            <InlineAlert tone="warning">
                                {t(
                                    'notifications.email_templates.preview_error',
                                )}
                            </InlineAlert>
                        ) : null}
                        {previewData ? (
                            <div className="space-y-5">
                                {(['ar', 'en'] as const).map((locale) => (
                                    <div key={locale} className="space-y-2">
                                        <p className="text-xs font-medium text-muted-foreground">
                                            {locale === 'ar'
                                                ? t(
                                                      'notifications.email_templates.arabic',
                                                  )
                                                : t(
                                                      'notifications.email_templates.english',
                                                  )}{' '}
                                            —{' '}
                                            {t(
                                                'notifications.email_templates.subject',
                                            )}
                                            :{' '}
                                            <span
                                                dir={
                                                    locale === 'ar'
                                                        ? 'rtl'
                                                        : 'ltr'
                                                }
                                                className="text-foreground"
                                            >
                                                {previewData[locale].subject}
                                            </span>
                                        </p>
                                        <EmailFrame
                                            html={previewData[locale].html}
                                            dir={
                                                locale === 'ar' ? 'rtl' : 'ltr'
                                            }
                                            lang={locale}
                                            title={`${t('notifications.email_templates.preview')} (${locale})`}
                                        />
                                    </div>
                                ))}
                            </div>
                        ) : previewing ? null : (
                            <p className="text-sm text-muted-foreground">
                                {t('core.states.loading')}
                            </p>
                        )}
                    </SectionCard>
                </div>
            </div>

            <ConfirmDialog
                open={confirmReset}
                onOpenChange={(open) => !resetting && setConfirmReset(open)}
                title={t('notifications.email_templates.reset_confirm_title')}
                description={t(
                    'notifications.email_templates.reset_confirm_text',
                )}
                confirmLabel={t('notifications.email_templates.reset')}
                destructive
                processing={resetting}
                onConfirm={doReset}
            />
        </>
    );
}

EmailTemplateEdit.layout = (props: { template: TemplateDetail }) => ({
    breadcrumbs: [
        { title: t('notifications.email_templates.title'), href: index.url() },
        {
            title: props.template.key,
            href: edit.url({ key: props.template.key }),
        },
    ],
});
