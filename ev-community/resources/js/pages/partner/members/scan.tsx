import { Head } from '@inertiajs/react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import type { Option } from '@/features/members/types';
import { VerifyPanel } from '@/features/members/verify-panel';
import { t } from '@/lib/i18n';
import { scan, verify } from '@/routes/partner/members';

export default function PartnerMembersScan({
    purposes,
}: {
    purposes: Option[];
}) {
    return (
        <>
            <Head title={t('members.partner.scan_title')} />
            <PageHeader
                title={t('members.partner.scan_title')}
                description={t('members.partner.scan_description')}
            />
            <InlineAlert tone="info">
                {t('members.partner.privacy_note')}
            </InlineAlert>
            <VerifyPanel
                action={verify()}
                purposes={purposes}
                audience="partner"
            />
        </>
    );
}

PartnerMembersScan.layout = () => ({
    breadcrumbs: [{ title: t('members.partner.scan_title'), href: scan.url() }],
});
