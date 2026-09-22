import { RotateCcw } from 'lucide-react';
import type { FormFieldControlProps } from '@/components/shared/form-field';
import { FormField } from '@/components/shared/form-field';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { humanize, pick } from '@/features/system/i18n';
import type { SettingItem, SettingValue } from '@/features/system/types';
import { t } from '@/lib/i18n';

/** Value kept in the form for one setting (JSON is edited as text; the server decodes and validates it). */
export type SettingFormValue = string | boolean | null;

export const SECRET_MASK = '••••••••';

/** Initial form value for a setting as delivered by the server. */
export function toFormValue(item: SettingItem): SettingFormValue {
    const { value } = item;
    if (item.type === 'bool') {
        return (
            value === true || value === 1 || value === '1' || value === 'true'
        );
    }
    if (item.type === 'json') {
        return value === null || value === undefined
            ? ''
            : JSON.stringify(value, null, 2);
    }
    if (value === null || value === undefined) {
        return '';
    }
    return typeof value === 'object' ? JSON.stringify(value) : String(value);
}

function describeDefault(item: SettingItem): string {
    const value: SettingValue = item.default;
    if (item.sensitive) {
        return '';
    }
    if (value === null || value === undefined || value === '') {
        return t('system.settings.labels.no_default');
    }
    if (typeof value === 'boolean') {
        return t('system.settings.labels.default', {
            value: value
                ? t('system.settings.labels.enabled')
                : t('system.settings.labels.disabled'),
        });
    }
    if (item.type === 'select' && typeof value === 'string') {
        return t('system.settings.labels.default', {
            value: optionLabel(item, value),
        });
    }
    const text =
        typeof value === 'object' ? JSON.stringify(value) : String(value);
    return t('system.settings.labels.default', {
        value: text.length > 80 ? `${text.slice(0, 80)}…` : text,
    });
}

export function optionLabel(item: SettingItem, option: string): string {
    const label = item.option_labels?.[option];
    return label ? pick(label) : humanize(option);
}

type Props = {
    item: SettingItem;
    value: SettingFormValue;
    onChange: (value: SettingFormValue) => void;
    error?: string;
    disabled?: boolean;
    /** Opens the reset-to-default confirmation (only rendered when the setting is customised). */
    onReset?: () => void;
};

/** One typed settings control (text, number, switch, select, colour, JSON, secret) with label, hints and errors. */
export function SettingField({
    item,
    value,
    onChange,
    error,
    disabled = false,
    onReset,
}: Props) {
    const id = `setting-${item.key.replace(/[^a-z0-9]+/gi, '-')}`;
    const required = item.rules.split('|').includes('required');
    const help = item.help ? pick(item.help) : null;
    const hints = [
        help,
        item.input === 'color' ? t('system.settings.labels.color_hint') : null,
        item.type === 'json' ? t('system.settings.labels.json_hint') : null,
        describeDefault(item),
    ]
        .filter((hint): hint is string => Boolean(hint))
        .join(' · ');

    const label = (
        <span className="flex flex-wrap items-center gap-2">
            <span>{pick(item.label)}</span>
            {item.overridden ? (
                <Badge variant="secondary" className="font-normal">
                    {t('system.settings.labels.overridden')}
                </Badge>
            ) : null}
            {item.sensitive ? (
                <Badge variant="outline" className="font-normal">
                    {t('system.settings.labels.sensitive')}
                </Badge>
            ) : null}
            {item.public ? (
                <span className="text-xs font-normal text-muted-foreground">
                    ({t('system.settings.labels.public')})
                </span>
            ) : null}
        </span>
    );

    const control = (aria: FormFieldControlProps) => {
        const a11y = {
            'aria-describedby': aria['aria-describedby'],
            'aria-invalid': aria['aria-invalid'],
            'aria-required': aria['aria-required'],
        };
        switch (item.input) {
            case 'bool':
                return (
                    <div className="flex items-center gap-3">
                        <Switch
                            id={id}
                            {...a11y}
                            checked={value === true}
                            onCheckedChange={(checked) => onChange(checked)}
                            disabled={disabled}
                        />
                        <span className="text-sm text-muted-foreground">
                            {value === true
                                ? t('system.settings.labels.enabled')
                                : t('system.settings.labels.disabled')}
                        </span>
                    </div>
                );
            case 'select':
                return (
                    <Select
                        value={
                            typeof value === 'string' && value !== ''
                                ? value
                                : undefined
                        }
                        onValueChange={(next) => onChange(next)}
                        disabled={disabled}
                    >
                        <SelectTrigger
                            id={id}
                            {...a11y}
                            className="w-full sm:max-w-sm"
                        >
                            <SelectValue
                                placeholder={t('system.settings.labels.choose')}
                            />
                        </SelectTrigger>
                        <SelectContent>
                            {(item.options ?? []).map((option) => (
                                <SelectItem key={option} value={option}>
                                    {optionLabel(item, option)}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                );
            case 'text':
                return (
                    <Textarea
                        id={id}
                        {...a11y}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => onChange(event.target.value)}
                        rows={3}
                        disabled={disabled}
                        required={required}
                    />
                );
            case 'json':
                return (
                    <Textarea
                        id={id}
                        {...a11y}
                        dir="ltr"
                        className="font-mono text-xs"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => onChange(event.target.value)}
                        rows={Math.min(
                            12,
                            Math.max(
                                3,
                                (typeof value === 'string'
                                    ? value.split('\n').length
                                    : 3) + 1,
                            ),
                        )}
                        disabled={disabled}
                        spellCheck={false}
                    />
                );
            case 'int':
            case 'decimal':
                return (
                    <Input
                        id={id}
                        {...a11y}
                        type="number"
                        inputMode={item.input === 'int' ? 'numeric' : 'decimal'}
                        step={item.input === 'int' ? 1 : 'any'}
                        dir="ltr"
                        className="w-full sm:max-w-40"
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => onChange(event.target.value)}
                        disabled={disabled}
                        required={required}
                    />
                );
            case 'color': {
                const hex =
                    typeof value === 'string' && /^#[0-9a-f]{6}$/i.test(value)
                        ? value
                        : '#000000';
                return (
                    <div className="flex items-center gap-2">
                        <input
                            type="color"
                            aria-label={pick(item.label)}
                            value={hex}
                            onChange={(event) =>
                                onChange(event.target.value.toUpperCase())
                            }
                            disabled={disabled}
                            className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1 disabled:cursor-not-allowed"
                        />
                        <Input
                            id={id}
                            {...a11y}
                            dir="ltr"
                            className="w-32 font-mono uppercase"
                            value={typeof value === 'string' ? value : ''}
                            maxLength={7}
                            onChange={(event) => onChange(event.target.value)}
                            disabled={disabled}
                            required={required}
                        />
                    </div>
                );
            }
            case 'secret':
                return (
                    <Input
                        id={id}
                        {...a11y}
                        type="password"
                        dir="ltr"
                        autoComplete="off"
                        value={typeof value === 'string' ? value : ''}
                        placeholder={t(
                            'system.settings.labels.secret_placeholder',
                        )}
                        onFocus={(event) => {
                            if (event.target.value === SECRET_MASK) {
                                onChange('');
                            }
                        }}
                        onChange={(event) => onChange(event.target.value)}
                        disabled={disabled}
                    />
                );
            default:
                return (
                    <Input
                        id={id}
                        {...a11y}
                        value={typeof value === 'string' ? value : ''}
                        onChange={(event) => onChange(event.target.value)}
                        disabled={disabled}
                        required={required}
                    />
                );
        }
    };

    return (
        <div
            className="grid gap-2 border-b border-dashed pb-5 last:border-0 last:pb-0"
            data-setting={item.key}
        >
            <FormField
                id={id}
                label={label}
                required={required}
                hint={hints || null}
                error={error}
            >
                {(aria) => control(aria)}
            </FormField>
            <div className="flex flex-wrap items-center justify-between gap-2">
                <Code className="text-[0.7rem] text-muted-foreground">
                    {item.key}
                </Code>
                {item.overridden && onReset && !disabled ? (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={onReset}
                    >
                        <RotateCcw className="size-3.5" aria-hidden="true" />
                        {t('system.settings.actions.reset')}
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
