import { FormField } from '@/components/shared/form-field';
import { DateInput } from '@/components/ui/date-input';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import type { ModuleOption, PersonRef, Severity } from '@/features/operations/types';
import { pick } from '@/features/system/i18n';
import { t } from '@/lib/i18n';

export type IncidentFormData = {
    title: string;
    severity: Severity;
    affected_module: string;
    impact: string;
    started_at: string;
    detected_at: string;
    owner: string;
};

const NONE = '__none__';

type Props = {
    data: IncidentFormData;
    errors: Partial<Record<keyof IncidentFormData, string>>;
    onChange: <K extends keyof IncidentFormData>(key: K, value: IncidentFormData[K]) => void;
    owners: PersonRef[];
    modules: ModuleOption[];
    severities: Severity[];
    /** On create an empty owner means "me"; on edit it means "no owner". */
    creating?: boolean;
};

/** Incident details form (create + edit). Times are entered in Cairo time (platform timezone). */
export function IncidentFields({ data, errors, onChange, owners, modules, severities, creating = false }: Props) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('operations.incidents.fields.title')} required error={errors.title} className="sm:col-span-2">
                <Input value={data.title} onChange={(event) => onChange('title', event.target.value)} maxLength={255} required />
            </FormField>
            <FormField label={t('operations.incidents.fields.severity')} required error={errors.severity}>
                <Select value={data.severity} onValueChange={(value) => onChange('severity', value as Severity)}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {severities.map((severity) => (
                            <SelectItem key={severity} value={severity}>
                                {t(`operations.severity.${severity}`)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FormField>
            <FormField label={t('operations.incidents.fields.affected_module')} optional error={errors.affected_module}>
                <Select value={data.affected_module === '' ? NONE : data.affected_module} onValueChange={(value) => onChange('affected_module', value === NONE ? '' : value)}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>{t('operations.incidents.labels.no_module')}</SelectItem>
                        {modules.map((module) => (
                            <SelectItem key={module.key} value={module.key}>
                                {pick(module.name)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FormField>
            <FormField label={t('operations.incidents.fields.impact')} optional error={errors.impact} className="sm:col-span-2">
                <Textarea value={data.impact} onChange={(event) => onChange('impact', event.target.value)} rows={3} maxLength={2000} />
            </FormField>
            <FormField label={t('operations.incidents.fields.started_at')} optional error={errors.started_at}>
                <DateInput mode="datetime" value={data.started_at} onChange={(event) => onChange('started_at', event.target.value)} />
            </FormField>
            <FormField label={t('operations.incidents.fields.detected_at')} optional error={errors.detected_at}>
                <DateInput mode="datetime" value={data.detected_at} min={data.started_at || undefined} onChange={(event) => onChange('detected_at', event.target.value)} />
            </FormField>
            <FormField label={t('operations.incidents.fields.owner')} optional hint={creating ? t('operations.incidents.labels.owner_default') : undefined} error={errors.owner} className="sm:col-span-2">
                <Select value={data.owner === '' ? NONE : data.owner} onValueChange={(value) => onChange('owner', value === NONE ? '' : value)}>
                    <SelectTrigger className="w-full sm:max-w-sm">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value={NONE}>{t('operations.incidents.labels.no_owner')}</SelectItem>
                        {owners.map((person) => (
                            <SelectItem key={person.id} value={person.id}>
                                {person.name}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FormField>
        </div>
    );
}
