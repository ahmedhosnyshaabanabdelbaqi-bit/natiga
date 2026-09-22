import { useForm } from '@inertiajs/react';
import { Pencil } from 'lucide-react';
import type { FormEvent } from 'react';
import { useState } from 'react';
import { FormField } from '@/components/shared/form-field';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { Textarea } from '@/components/ui/textarea';
import { t } from '@/lib/i18n';
import { update } from '@/routes/admin/members';
import type { GovernorateOption, MembershipDetail } from './types';

const NONE = '__none__';

type Props = {
    membership: MembershipDetail;
    governorates: GovernorateOption[];
    locales: string[];
};

/** Staff profile edit (members.edit). Every change is audited server-side with old/new values. */
export function EditProfileDialog({
    membership,
    governorates,
    locales,
}: Props) {
    const [open, setOpen] = useState(false);
    const form = useForm({
        name: membership.user.name,
        email: membership.user.email,
        mobile: membership.user.mobile ?? '',
        governorate_id:
            membership.user.governorate_id !== null
                ? String(membership.user.governorate_id)
                : '',
        preferred_locale: membership.user.preferred_locale,
        reason: '',
    });

    const submit = (event: FormEvent) => {
        event.preventDefault();
        form.transform((data) => ({
            ...data,
            governorate_id:
                data.governorate_id === '' ? null : Number(data.governorate_id),
            mobile: data.mobile.trim() === '' ? null : data.mobile,
        }));
        form.patch(update(membership.id).url, {
            preserveScroll: true,
            onSuccess: () => {
                setOpen(false);
                form.setDefaults();
                form.reset('reason');
            },
        });
    };

    return (
        <Dialog
            open={open}
            onOpenChange={(next) => {
                if (!form.processing) {
                    setOpen(next);
                    if (!next) {
                        form.clearErrors();
                    }
                }
            }}
        >
            <DialogTrigger asChild>
                <Button type="button" size="sm" variant="outline">
                    <Pencil className="size-4" aria-hidden="true" />
                    {t('members.admin.actions.edit_profile')}
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                    <DialogTitle>{t('members.admin.edit.title')}</DialogTitle>
                    <DialogDescription>
                        {t('members.admin.edit.description')}
                    </DialogDescription>
                </DialogHeader>
                <form onSubmit={submit} className="grid gap-4" noValidate>
                    <FormField
                        label={t('core.labels.name')}
                        error={form.errors.name}
                        required
                    >
                        <Input
                            value={form.data.name}
                            onChange={(event) =>
                                form.setData('name', event.target.value)
                            }
                            autoComplete="off"
                        />
                    </FormField>
                    <FormField
                        label={t('core.labels.email')}
                        error={form.errors.email}
                        required
                        hint={t('members.admin.edit.email_hint')}
                    >
                        <Input
                            type="email"
                            dir="ltr"
                            value={form.data.email}
                            onChange={(event) =>
                                form.setData('email', event.target.value)
                            }
                            autoComplete="off"
                        />
                    </FormField>
                    <FormField
                        label={t('core.labels.mobile')}
                        error={form.errors.mobile}
                        optional
                    >
                        <Input
                            type="tel"
                            dir="ltr"
                            inputMode="tel"
                            value={form.data.mobile}
                            onChange={(event) =>
                                form.setData('mobile', event.target.value)
                            }
                            autoComplete="off"
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
                                            {t('core.labels.none')}
                                        </SelectItem>
                                        {governorates.map((governorate) => (
                                            <SelectItem
                                                key={governorate.id}
                                                value={String(governorate.id)}
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
                                                    ? t('core.labels.arabic')
                                                    : t('core.labels.english')}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            )}
                        </FormField>
                    </div>
                    <FormField
                        label={t('core.labels.reason')}
                        error={form.errors.reason}
                        optional
                        hint={t('members.admin.edit.reason_hint')}
                    >
                        <Textarea
                            value={form.data.reason}
                            onChange={(event) =>
                                form.setData('reason', event.target.value)
                            }
                            rows={2}
                            maxLength={500}
                        />
                    </FormField>
                    <DialogFooter>
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => setOpen(false)}
                            disabled={form.processing}
                        >
                            {t('core.actions.cancel')}
                        </Button>
                        <Button
                            type="submit"
                            disabled={form.processing || !form.isDirty}
                        >
                            {form.processing ? <Spinner /> : null}
                            {t('core.actions.save')}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    );
}
