import type { ReactNode } from 'react';
import PortalLayout from '@/layouts/portal-layout';
import { t } from '@/lib/i18n';
import { memberNavigation } from '@/navigation/member';
import type { BreadcrumbItem } from '@/types';

export default function MemberLayout({ children, breadcrumbs = [] }: { children: ReactNode; breadcrumbs?: BreadcrumbItem[] }) {
    return (
        <PortalLayout
            groups={memberNavigation()}
            breadcrumbs={breadcrumbs}
            homeHref="/account"
            portalLabel={t('core.nav.my_account')}
            settingsHref="/settings/profile"
            notificationsHref="/account/notifications"
        >
            {children}
        </PortalLayout>
    );
}
