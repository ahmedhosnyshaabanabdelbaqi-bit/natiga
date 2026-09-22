import { FileText, ImageIcon, UploadCloud, X } from 'lucide-react';
import type { ChangeEvent, DragEvent } from 'react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type BaseProps = {
    /** MIME types and/or extensions, as for `<input accept>` (e.g. "image/*,application/pdf,.heic"). */
    accept?: string;
    /** Client-side size limit per file (the server re-validates; this only gives early feedback). */
    maxSizeMb?: number;
    /** Name of the underlying file input (only matters for plain HTML form posts). */
    name?: string;
    /** Id of the file input; `FormField` injects it so its label opens the file dialog. */
    id?: string;
    /** Validation message (e.g. Inertia `errors.proof`). Omit when the error is shown by a wrapping `FormField`. */
    error?: string | null;
    disabled?: boolean;
    /** Mobile camera hint: `environment` (rear) or `user` (front). */
    capture?: 'user' | 'environment';
    className?: string;
    'aria-describedby'?: string;
    'aria-invalid'?: boolean;
    'aria-required'?: boolean;
};

type SingleProps = BaseProps & {
    multiple?: false;
    value: File | null;
    onChange: (file: File | null) => void;
    maxFiles?: never;
};

type MultipleProps = BaseProps & {
    multiple: true;
    value: File[];
    onChange: (files: File[]) => void;
    /** Maximum number of files kept in `value`. */
    maxFiles?: number;
};

export type FileUploadProps = SingleProps | MultipleProps;

function fileKey(file: File): string {
    return `${file.name}:${file.size}:${file.lastModified}`;
}

function formatSize(bytes: number): string {
    if (bytes < 1024 * 1024) {
        return t('ui.upload.size_kb', { size: formatNumber(Math.max(1, Math.round(bytes / 1024)), 0) });
    }
    return t('ui.upload.size_mb', { size: formatNumber(bytes / 1024 / 1024, 1) });
}

/** Mirrors the browser's `accept` matching: extensions (".pdf"), exact MIME types and wildcards ("image/*"). */
export function fileMatchesAccept(file: File, accept: string | undefined): boolean {
    if (!accept) {
        return true;
    }
    const name = file.name.toLowerCase();
    const type = file.type.toLowerCase();
    return accept
        .split(',')
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)
        .some((rule) => {
            if (rule.startsWith('.')) {
                return name.endsWith(rule);
            }
            if (rule.endsWith('/*')) {
                return type.startsWith(rule.slice(0, -1));
            }
            return type === rule;
        });
}

function describeAccept(accept: string): string {
    return accept
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
        .map((part) => (part.endsWith('/*') ? part.slice(0, -2) : part.startsWith('.') ? part.slice(1) : (part.split('/')[1] ?? part)).toUpperCase())
        .join(', ');
}

/**
 * Object URLs for image previews. Each effect run owns the URLs it creates and revokes them in its
 * cleanup, so removed files, re-renders and unmounts (including StrictMode's double mount) never leak.
 */
function useImagePreviews(files: File[]): Map<string, string> {
    const [previews, setPreviews] = useState<Map<string, string>>(() => new Map());

    useEffect(() => {
        const created = new Map<string, string>();
        for (const file of files) {
            if (file.type.startsWith('image/')) {
                created.set(fileKey(file), URL.createObjectURL(file));
            }
        }
        setPreviews(created);

        return () => {
            for (const url of created.values()) {
                URL.revokeObjectURL(url);
            }
        };
    }, [files]);

    return previews;
}

/**
 * Controlled file picker with drag & drop, image previews and client-side size/type/count checks.
 * It never uploads by itself: put the File(s) in an Inertia `useForm` field and submit with
 * `forceFormData: true`; the server (AttachmentService) remains the authority on type and size.
 */
export function FileUpload(props: FileUploadProps) {
    const { accept, maxSizeMb, name, error, disabled = false, capture, className } = props;
    const generatedId = useId();
    const inputId = props.id ?? `file-upload-${generatedId}`;
    const hintId = `${inputId}-hint`;
    const errorId = `${inputId}-error`;
    const inputRef = useRef<HTMLInputElement>(null);
    const dragDepth = useRef(0);
    const [dragging, setDragging] = useState(false);
    const [rejections, setRejections] = useState<string[]>([]);

    const files = useMemo<File[]>(() => (props.multiple ? props.value : props.value ? [props.value] : []), [props.multiple, props.value]);
    const previews = useImagePreviews(files);
    const maxFiles = props.multiple ? props.maxFiles : 1;

    const emit = (next: File[]) => {
        if (props.multiple) {
            props.onChange(next);
        } else {
            props.onChange(next[0] ?? null);
        }
    };

    const addFiles = (incoming: File[]) => {
        if (disabled || incoming.length === 0) {
            return;
        }
        const problems: string[] = [];
        const accepted: File[] = [];
        for (const file of incoming) {
            if (!fileMatchesAccept(file, accept)) {
                problems.push(t('ui.upload.not_accepted', { name: file.name }));
            } else if (maxSizeMb !== undefined && file.size > maxSizeMb * 1024 * 1024) {
                problems.push(t('ui.upload.too_large', { name: file.name, size: formatNumber(maxSizeMb, 1) }));
            } else {
                accepted.push(file);
            }
        }

        if (!props.multiple) {
            setRejections(problems);
            if (accepted.length > 0) {
                emit([accepted[0]]);
            }
            return;
        }

        const known = new Set(files.map(fileKey));
        let next = [...files, ...accepted.filter((file) => !known.has(fileKey(file)))];
        if (maxFiles !== undefined && next.length > maxFiles) {
            problems.push(t('ui.upload.too_many', { count: maxFiles }));
            next = next.slice(0, maxFiles);
        }
        setRejections(problems);
        if (next.length !== files.length) {
            emit(next);
        }
    };

    const removeFile = (file: File) => {
        setRejections([]);
        emit(files.filter((item) => fileKey(item) !== fileKey(file)));
        // After the re-render (the input may have been disabled while the list was full).
        window.requestAnimationFrame(() => inputRef.current?.focus());
    };

    const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
        addFiles(Array.from(event.target.files ?? []));
        // Allow picking the same file again after removing it.
        event.target.value = '';
    };

    const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        if (disabled) {
            return;
        }
        dragDepth.current += 1;
        setDragging(true);
    };
    const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current = Math.max(0, dragDepth.current - 1);
        if (dragDepth.current === 0) {
            setDragging(false);
        }
    };
    const onDrop = (event: DragEvent<HTMLDivElement>) => {
        event.preventDefault();
        dragDepth.current = 0;
        setDragging(false);
        addFiles(Array.from(event.dataTransfer.files));
    };

    const invalid = Boolean(error) || props['aria-invalid'] === true;
    const hints = [maxSizeMb !== undefined ? t('ui.upload.max_size', { size: formatNumber(maxSizeMb, 1) }) : null, accept ? t('ui.upload.accepted', { types: describeAccept(accept) }) : null, props.multiple && maxFiles !== undefined ? t('ui.upload.max_files', { count: maxFiles }) : null].filter(
        (hint): hint is string => hint !== null,
    );
    const describedBy = [props['aria-describedby'], error ? errorId : null, hints.length > 0 ? hintId : null].filter(Boolean).join(' ') || undefined;
    const full = maxFiles !== undefined && props.multiple === true && files.length >= maxFiles;

    return (
        <div className={cn('grid gap-2', className)} data-slot="file-upload">
            <div
                onDragEnter={onDragEnter}
                onDragOver={(event) => event.preventDefault()}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
                onClick={() => {
                    if (!disabled && !full) {
                        inputRef.current?.click();
                    }
                }}
                className={cn(
                    'relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center text-sm transition-colors',
                    'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/40',
                    dragging ? 'border-brand bg-brand-soft/30' : 'border-border bg-muted/30 hover:bg-muted/50',
                    invalid && 'border-danger/60',
                    disabled || full ? 'cursor-not-allowed opacity-60' : 'cursor-pointer',
                )}
            >
                <UploadCloud className={cn('size-8', dragging ? 'text-brand' : 'text-muted-foreground')} aria-hidden="true" />
                <p className="text-muted-foreground">
                    {dragging ? (
                        t('ui.upload.release')
                    ) : (
                        <>
                            {props.multiple ? t('ui.upload.drop') : t('ui.upload.single_drop')} <span className="font-medium text-brand underline underline-offset-4">{t('ui.upload.browse')}</span>
                        </>
                    )}
                </p>
                {hints.length > 0 ? (
                    <p id={hintId} className="text-xs text-muted-foreground">
                        {hints.join(' · ')}
                    </p>
                ) : null}
                <input
                    ref={inputRef}
                    id={inputId}
                    name={name}
                    type="file"
                    className="sr-only"
                    accept={accept}
                    multiple={props.multiple === true}
                    capture={capture}
                    disabled={disabled || full}
                    aria-label={props.id ? undefined : t('ui.upload.dropzone')}
                    aria-describedby={describedBy}
                    aria-invalid={invalid || undefined}
                    aria-required={props['aria-required']}
                    onChange={onInputChange}
                    onClick={(event) => event.stopPropagation()}
                />
            </div>

            {files.length > 0 ? (
                <ul className="grid gap-2" aria-label={t('ui.upload.selected')}>
                    {files.map((file) => {
                        const preview = previews.get(fileKey(file));
                        const Icon = file.type.startsWith('image/') ? ImageIcon : FileText;
                        return (
                            <li key={fileKey(file)} className="flex items-center gap-3 rounded-lg border bg-card p-2 pe-1">
                                {preview ? (
                                    <img src={preview} alt={t('ui.upload.preview', { name: file.name })} className="size-12 shrink-0 rounded-md border object-cover" />
                                ) : (
                                    <span className="flex size-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                                        <Icon className="size-5" aria-hidden="true" />
                                    </span>
                                )}
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm font-medium" dir="auto" title={file.name}>
                                        {file.name}
                                    </p>
                                    <p className="text-xs text-muted-foreground tabular">{formatSize(file.size)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeFile(file)}
                                    disabled={disabled}
                                    className="rounded-md p-2 text-muted-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/60 disabled:pointer-events-none disabled:opacity-50"
                                    aria-label={t('ui.upload.remove', { name: file.name })}
                                >
                                    <X className="size-4" aria-hidden="true" />
                                </button>
                            </li>
                        );
                    })}
                </ul>
            ) : null}

            {rejections.length > 0 ? (
                <ul role="alert" className="grid gap-0.5 text-sm text-danger">
                    {rejections.map((message) => (
                        <li key={message}>{message}</li>
                    ))}
                </ul>
            ) : null}

            {error ? (
                <p id={errorId} role="alert" className="text-sm text-danger">
                    {error}
                </p>
            ) : null}
        </div>
    );
}
