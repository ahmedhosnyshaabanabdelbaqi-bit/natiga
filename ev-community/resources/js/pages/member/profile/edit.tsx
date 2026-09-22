import { Head, Link, useForm } from '@inertiajs/react';
import { Settings } from 'lucide-react';
import type { FormEvent } from 'react';
import { FormActions, FormField } from '@/components/shared/form-field';
import { PageHeader } from '@/components/shared/page-header';
import { DescriptionList, SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { MembershipStatusBadge } from '@/features/members/status';
import type {
    GovernorateOption,
    MembershipStatus,
} from '@/features/members/types';
import { t } from '@/lib/i18n';
import { edit, update } from '@/routes/member/profile';
import { edit as settingsProfile } from '@/routes/profile';

type Props = {
    profile: {
        name: string;
        email: string;
        mobile: string | null;
        preferred_locale: 'ar' | 'en';
        governorate_id: number | null;
        referral_source: string | null;
        member_number: string;
        status: MembershipStatus;
    };
    governorates: GovernorateOption[];
    locales: string[];
    require_mobile: boolean;
};

const NONE = '__none__';

export default function MemberProfileEdit({
    profile,
    governorates,
    locales,
    require_mobile: requireMobile,
}: Props) {
    const form = useForm({
        mobile: profile.mobile ?? '',
        governorate_id:
            profile.governorate_id !== null
                ? String(profile.governorate_id)
                : '',
        preferred_locale: profile.preferred_locale,
        referral_source: profile.referral_source ?? '',
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((data) => ({
            ...data,
            mobile: data.mobile.trim() === '' ? null : data.mobile.trim(),
            governorate_id:
                data.governorate_id === '' ? null : Number(data.governorate_id),
            referral_source:
                data.referral_source.trim() === ''
                    ? null
                    : data.referral_source.trim(),
        }));
        form.patch(update.url(), {
            preserveScroll: true,
            onSuccess: () => form.setDefaults(),
        });
    };

    return (
        <>
            <Head title={t('members.profile.title')} />
            <PageHeader
                title={t('members.profile.title')}
                description={t('members.profile.description')}
                actions={
                    <Button asChild variant="outline" size="sm">
                        <Link href={settingsProfile.url()}>
                            <Settings className="size-4" aria-hidden="true" />
                            {t('members.profile.settings_link')}
                        </Link>
                    </Button>
                }
            />
            <div className="grid gap-4 lg:grid-cols-3">
                <SectionCard
                    title={t('members.profile.membership')}
                    className="lg:order-2"
                >
                    <DescriptionList
                        columns={1}
                        items={[
                            {
                                label: t('core.labels.name'),
                                value: profile.name,
                            },
                            {
                                label: t('core.labels.email'),
                                value: <span dir="ltr">{profile.email}</span>,
                            },
                            {
                                label: t('members.card.member_number'),
                                value: profile.member_number,
                                type: 'code',
                            },
                            {
                                label: t('core.labels.status'),
                                value: (
                                    <MembershipStatusBadge
                                        status={profile.status}
                                    />
                                ),
                            },
                        ]}
                    />
                </SectionCard>
                <SectionCard
                    title={t('members.profile.details')}
                    className="lg:order-1 lg:col-span-2"
                >
                    <form onSubmit={submit} className="grid gap-4" noValidate>
                        <FormField
                            label={t('core.labels.mobile')}
                            error={form.errors.mobile}
                            required={requireMobile}
                            optional={!requireMobile}
                            hint={t('members.profile.mobile_hint')}
                        >
                            <Input
                                type="tel"
                                dir="ltr"
                                inputMode="tel"
                                autoComplete="tel"
                                value={form.data.mobile}
                                onChange={(event) =>
                                    form.setData('mobile', event.target.value)
                                }
                                placeholder="01xxxxxxxxx"
                            />
                        </FormField>
                        <div className="grid gap-4 sm:grid-cols-2">
                            <FormField
                                label={t('core.labels.governorate')}
                                error={form.errors.governorate_id}
                                optional
                            >
                                {(control) => (
                                    <Select
                                        value={
                                            form.data.governorate_id === ''
                                                ? NONE
                                                : form.data.governorate_id
                                        }
                                        onValueChange={(value) =>
                                            form.setData(
                                                'governorate_id',
                                                value === NONE ? '' : value,
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            {...control}
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value={NONE}>
                                                {t(
                                                    'members.profile.choose_governorate',
                                                )}
                                            </SelectItem>
                                            {governorates.map((governorate) => (
                                                <SelectItem
                                                    key={governorate.id}
                                                    value={String(
                                                        governorate.id,
                                                    )}
                                                >
                                                    {governorate.name}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </FormField>
                            <FormField
                                label={t('core.labels.language')}
                                error={form.errors.preferred_locale}
                                hint={t('members.profile.locale_hint')}
                                required
                            >
                                {(control) => (
                                    <Select
                                        value={form.data.preferred_locale}
                                        onValueChange={(value) =>
                                            form.setData(
                                                'preferred_locale',
                                                value === 'en' ? 'en' : 'ar',
                                            )
                                        }
                                    >
                                        <SelectTrigger
                                            {...control}
                                            className="w-full"
                                        >
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {locales.map((locale) => (
                                                <SelectItem
                                                    key={locale}
                                                    value={locale}
                                                >
                                                    {locale === 'ar'
                                                        ? t(
                                                              'core.labels.arabic',
                                                          )
                                                        : t(
                                                              'core.labels.english',
                                                          )}
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                )}
                            </FormField>
                        </div>
                        <FormField
                            label={t('members.profile.referral_source')}
                            error={form.errors.referral_source}
                            optional
                        >
                            <Input
                                value={form.data.referral_source}
                                onChange={(event) =>
                                    form.setData(
                                        'referral_source',
                                        event.target.value,
                                    )
                                }
                                maxLength={100}
                            />
                        </FormField>
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
                </SectionCard>
            </div>
        </>
    );
}

MemberProfileEdit.layout = () => ({
    breadcrumbs: [{ title: t('members.profile.title'), href: edit.url() }],
});
