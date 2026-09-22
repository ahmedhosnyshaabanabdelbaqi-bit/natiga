import { Link, usePage } from '@inertiajs/react';
import { ShieldAlert } from 'lucide-react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { t } from '@/lib/i18n';
import { index as privacyIndex } from '@/routes/member/privacy';

/**
 * "Close your account" section of the profile settings page.
 *
 * Accounts are never hard-deleted from self-service (orders, payments, receipts and the audit trail
 * must be kept). Members manage deactivation and personal-data deletion requests on the Privacy &
 * data page (Members module); staff and partner accounts are deactivated by administrators.
 */
export default function DeleteUser() {
    const { auth } = usePage().props;
    const isMember = auth.user?.is_member === true;

    return (
        <div className="space-y-6">
            <Heading
                variant="small"
                title={t('settings.delete_account.heading')}
                description={t('settings.delete_account.description')}
            />
            <div className="space-y-4 rounded-lg border border-warning/30 bg-warning-soft/40 p-4">
                <div className="flex gap-3 text-sm">
                    <ShieldAlert
                        className="mt-0.5 size-4 shrink-0 text-warning"
                        aria-hidden="true"
                    />
                    <p className="text-foreground/90">
                        {isMember
                            ? t('settings.delete_account.member_text')
                            : t('settings.delete_account.managed_text')}
                    </p>
                </div>

                {isMember ? (
                    <Button variant="outline" asChild data-test="privacy-link">
                        <Link href={privacyIndex()}>
                            {t('settings.delete_account.privacy_link')}
                        </Link>
                    </Button>
                ) : null}
            </div>
        </div>
    );
}
