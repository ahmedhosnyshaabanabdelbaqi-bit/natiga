import { FormField } from '@/components/shared/form-field';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { tOr } from '@/features/system/i18n';
import { t } from '@/lib/i18n';

export type ProfileData = {
    name: string;
    email: string;
    mobile: string;
    preferred_locale: string;
};

/** Name / e-mail / mobile / language fields shared by the create and edit user forms. */
export function ProfileFields({
    data,
    errors,
    onChange: set,
    locales,
}: {
    data: ProfileData;
    errors: Partial<Record<keyof ProfileData, string>>;
    onChange: (key: keyof ProfileData, value: string) => void;
    locales: string[];
}) {
    return (
        <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={t('users.fields.name')} required error={errors.name} className="sm:col-span-2">
                <Input value={data.name} onChange={(event) => set('name', event.target.value)} autoComplete="off" maxLength={120} required />
            </FormField>
            <FormField label={t('users.fields.email')} required error={errors.email}>
                <Input type="email" dir="ltr" value={data.email} onChange={(event) => set('email', event.target.value)} autoComplete="off" maxLength={255} required />
            </FormField>
            <FormField label={t('users.fields.mobile')} optional error={errors.mobile} hint="01XXXXXXXXX">
                <Input type="tel" dir="ltr" inputMode="tel" value={data.mobile} onChange={(event) => set('mobile', event.target.value)} autoComplete="off" maxLength={14} />
            </FormField>
            <FormField label={t('users.fields.preferred_locale')} error={errors.preferred_locale}>
                <Select value={data.preferred_locale} onValueChange={(value) => set('preferred_locale', value)}>
                    <SelectTrigger className="w-full">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {locales.map((locale) => (
                            <SelectItem key={locale} value={locale}>
                                {tOr(`users.locales.${locale}`, locale)}
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </FormField>
        </div>
    );
}
