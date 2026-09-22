import { router } from '@inertiajs/react';
import { ImageOff, Trash2, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Spinner } from '@/components/ui/spinner';
import { pick } from '@/features/system/i18n';
import type { SettingItem } from '@/features/system/types';
import { t } from '@/lib/i18n';
import { reset, upload } from '@/routes/admin/settings';

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const ICON_TYPES = ['image/x-icon', 'image/vnd.microsoft.icon'];

type Props = {
    item: SettingItem;
    maxMb: number;
    disabled?: boolean;
    /** Server validation error for the upload (`file`). */
    error?: string;
};

/**
 * Logo / dark logo / favicon: preview + upload (MIME re-checked on the server with finfo, ≤ maxMb) + remove.
 * The client checks type and size only to give fast feedback.
 */
export function BrandingImageField({ item, maxMb, disabled = false, error }: Props) {
    const inputId = useId();
    const input = useRef<HTMLInputElement>(null);
    const [uploading, setUploading] = useState(false);
    const [clientError, setClientError] = useState<string | null>(null);
    const [confirmRemove, setConfirmRemove] = useState(false);
    const isFavicon = item.key === 'branding.favicon_path';
    const accepted = isFavicon ? [...IMAGE_TYPES, ...ICON_TYPES] : IMAGE_TYPES;
    const current = typeof item.value === 'string' && item.value !== '' ? item.value : null;
    const label = pick(item.label);

    const onFile = (file: File | undefined) => {
        setClientError(null);
        if (!file) {
            return;
        }
        const extensionOk = isFavicon && file.name.toLowerCase().endsWith('.ico');
        if (!accepted.includes(file.type) && !extensionOk) {
            setClientError(t('system.settings.errors.image_type_not_allowed', { types: isFavicon ? 'png, jpg, webp, ico' : 'png, jpg, webp' }));
            return;
        }
        if (file.size > maxMb * 1024 * 1024) {
            setClientError(t('system.settings.errors.image_too_large', { max: `${maxMb} MB` }));
            return;
        }
        router.post(
            upload(item.key).url,
            { file },
            {
                forceFormData: true,
                preserveScroll: true,
                onStart: () => setUploading(true),
                onFinish: () => {
                    setUploading(false);
                    if (input.current) {
                        input.current.value = '';
                    }
                },
            },
        );
    };

    const message = clientError ?? error ?? null;

    return (
        <div className="grid gap-3 border-b border-dashed pb-5 last:border-0 last:pb-0" data-setting={item.key}>
            <div className="flex flex-wrap items-center gap-2">
                <label htmlFor={inputId} className="text-sm font-medium">
                    {label}
                </label>
                {item.overridden ? (
                    <Badge variant="secondary" className="font-normal">
                        {t('system.settings.labels.overridden')}
                    </Badge>
                ) : null}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex h-20 w-40 shrink-0 items-center justify-center overflow-hidden rounded-lg border bg-[repeating-conic-gradient(var(--color-muted)_0%_25%,transparent_0%_50%)] bg-[length:16px_16px] p-2">
                    {current ? (
                        <img src={current} alt={label} className="max-h-full max-w-full object-contain" />
                    ) : (
                        <ImageOff className="size-6 text-muted-foreground" aria-hidden="true" />
                    )}
                </div>
                <div className="grid gap-2">
                    <p className="text-xs text-muted-foreground">{current ? t('system.settings.labels.current_image') : t('system.settings.labels.no_image')}</p>
                    <p className="text-xs text-muted-foreground">{t(isFavicon ? 'system.settings.labels.favicon_hint' : 'system.settings.labels.image_hint', { max: maxMb })}</p>
                    {!disabled ? (
                        <div className="flex flex-wrap gap-2">
                            <input
                                ref={input}
                                id={inputId}
                                type="file"
                                className="sr-only"
                                accept={isFavicon ? `${accepted.join(',')},.ico` : accepted.join(',')}
                                onChange={(event) => onFile(event.target.files?.[0])}
                                aria-describedby={message ? `${inputId}-error` : undefined}
                                aria-invalid={message ? true : undefined}
                                disabled={uploading}
                            />
                            <Button type="button" variant="outline" size="sm" onClick={() => input.current?.click()} disabled={uploading}>
                                {uploading ? <Spinner /> : <Upload className="size-4" aria-hidden="true" />}
                                {uploading ? t('system.settings.labels.uploading') : current ? t('system.settings.actions.replace') : t('system.settings.actions.upload')}
                            </Button>
                            {current ? (
                                <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmRemove(true)} disabled={uploading}>
                                    <Trash2 className="size-4" aria-hidden="true" />
                                    {t('system.settings.actions.remove')}
                                </Button>
                            ) : null}
                        </div>
                    ) : null}
                </div>
            </div>
            {message ? (
                <p id={`${inputId}-error`} role="alert" className="text-sm text-danger">
                    {message}
                </p>
            ) : null}
            <Code className="w-fit text-[0.7rem] text-muted-foreground">{item.key}</Code>
            <ConfirmDialog
                open={confirmRemove}
                onOpenChange={setConfirmRemove}
                destructive
                title={t('system.settings.remove_image_confirm.title', { label })}
                description={t('system.settings.remove_image_confirm.description')}
                confirmLabel={t('system.settings.actions.remove')}
                onConfirm={() =>
                    new Promise<void>((resolve) => {
                        router.delete(reset(item.key).url, {
                            preserveScroll: true,
                            onFinish: () => {
                                resolve();
                                setConfirmRemove(false);
                            },
                        });
                    })
                }
            />
        </div>
    );
}
