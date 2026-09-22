import type { ReactNode } from 'react';
import PortalLayout from '@/layouts/portal-layout';
import { t } from '@/lib/i18n';
import { partnerNavigation } from '@/navigation/partner';
import type { BreadcrumbItem } from '@/types';

export default function PartnerLayout({ children, breadcrumbs = [] }: { children: ReactNode; breadcrumbs?: BreadcrumbItem[] }) {
    return (
        <PortalLayout
            groups={partnerNavigation()}
            breadcrumbs={breadcrumbs}
            homeHref="/partner/dashboard"
            portalLabel={t('core.nav.partner_portal')}
            settingsHref="/settings/profile"
            notificationsHref="/partner/notifications"
        >
            {children}
        </PortalLayout>
    );
}
