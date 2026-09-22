import { Form, Head } from '@inertiajs/react';
import InputError from '@/components/input-error';
import PasswordInput from '@/components/password-input';
import TextLink from '@/components/text-link';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Spinner } from '@/components/ui/spinner';
import { t, useLocale } from '@/lib/i18n';
import { login } from '@/routes';
import { store } from '@/routes/register';

type Props = {
    passwordRules: string;
    registrationMode: 'open' | 'invitation_only' | 'admin_approval';
    requireMobile: boolean;
    governorates: { id: number; name: string }[];
    invitationCode?: string | null;
};

export default function Register({ passwordRules, registrationMode, requireMobile, governorates, invitationCode }: Props) {
    const { locale } = useLocale();
    return (
        <>
            <Head title={t('auth.register.title')} />
            {registrationMode === 'admin_approval' ? <p className="rounded-md bg-info-soft px-3 py-2 text-sm text-info">{t('auth.register.pending_notice')}</p> : null}
            {registrationMode === 'invitation_only' ? <p className="rounded-md bg-warning-soft px-3 py-2 text-sm text-warning">{t('auth.register.invitation_notice')}</p> : null}
            <Form {...store.form()} resetOnSuccess={['password', 'password_confirmation']} disableWhileProcessing className="flex flex-col gap-6">
                {({ processing, errors }) => (
                    <>
                        <div className="grid gap-5">
                            <div className="grid gap-2">
                                <Label htmlFor="name">{t('auth.fields.name')}</Label>
                                <Input id="name" type="text" required autoFocus tabIndex={1} autoComplete="name" name="name" />
                                <InputError message={errors.name} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="email">{t('auth.fields.email')}</Label>
                                <Input id="email" type="email" required tabIndex={2} autoComplete="email" name="email" placeholder="email@example.com" dir="ltr" className="code" />
                                <InputError message={errors.email} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="mobile">
                                    {t('auth.fields.mobile')} {requireMobile ? null : <span className="text-xs text-muted-foreground">({t('core.labels.optional')})</span>}
                                </Label>
                                <Input id="mobile" type="tel" required={requireMobile} tabIndex={3} autoComplete="tel" name="mobile" placeholder="01xxxxxxxxx" dir="ltr" className="code" inputMode="tel" />
                                <InputError message={errors.mobile} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="governorate_id">{t('auth.register.governorate')}</Label>
                                <Select name="governorate_id">
                                    <SelectTrigger id="governorate_id" tabIndex={4}>
                                        <SelectValue placeholder={t('core.actions.select')} />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {governorates.map((g) => (
                                            <SelectItem key={g.id} value={String(g.id)}>
                                                {g.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                                <InputError message={errors.governorate_id} />
                            </div>
                            {registrationMode === 'invitation_only' || invitationCode ? (
                                <div className="grid gap-2">
                                    <Label htmlFor="invitation_code">{t('auth.register.invitation_code')}</Label>
                                    <Input id="invitation_code" name="invitation_code" defaultValue={invitationCode ?? ''} required={registrationMode === 'invitation_only'} dir="ltr" className="code uppercase" tabIndex={5} />
                                    <InputError message={errors.invitation_code} />
                                </div>
                            ) : null}
                            <div className="grid gap-2">
                                <Label htmlFor="referral_source">{t('auth.register.referral_source')}</Label>
                                <Input id="referral_source" name="referral_source" tabIndex={6} />
                                <InputError message={errors.referral_source} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password">{t('auth.fields.password')}</Label>
                                <PasswordInput id="password" required tabIndex={7} autoComplete="new-password" name="password" passwordrules={passwordRules} />
                                <InputError message={errors.password} />
                            </div>
                            <div className="grid gap-2">
                                <Label htmlFor="password_confirmation">{t('auth.register.password_confirmation')}</Label>
                                <PasswordInput id="password_confirmation" required tabIndex={8} autoComplete="new-password" name="password_confirmation" />
                                <InputError message={errors.password_confirmation} />
                            </div>
                            <input type="hidden" name="preferred_locale" value={locale} />
                            <div className="flex items-start gap-3">
                                <Checkbox id="terms" name="terms" value="1" tabIndex={9} className="mt-0.5" />
                                <Label htmlFor="terms" className="text-sm leading-snug font-normal">
                                    {t('auth.register.terms_prefix')}{' '}
                                    <TextLink href={`/${locale}/pages/terms`} target="_blank">{t('auth.register.terms')}</TextLink> {t('auth.register.and')}{' '}
                                    <TextLink href={`/${locale}/pages/privacy`} target="_blank">{t('auth.register.privacy')}</TextLink>
                                </Label>
                            </div>
                            <InputError message={errors.terms} />
                            <Button type="submit" className="mt-2 w-full" tabIndex={10} data-test="register-user-button">
                                {processing && <Spinner />}
                                {t('auth.register.submit')}
                            </Button>
                        </div>
                        <div className="text-center text-sm text-muted-foreground">
                            {t('auth.register.have_account')}{' '}
                            <TextLink href={login()} tabIndex={11}>
                                {t('auth.login.submit')}
                            </TextLink>
                        </div>
                    </>
                )}
            </Form>
        </>
    );
}

Register.layout = () => ({
    title: t('auth.register.title'),
    description: t('auth.register.description'),
});
