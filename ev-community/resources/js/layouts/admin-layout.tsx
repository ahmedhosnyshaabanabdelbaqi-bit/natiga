import type { ReactNode } from 'react';
import PortalLayout from '@/layouts/portal-layout';
import { t } from '@/lib/i18n';
import { adminNavigation } from '@/navigation/admin';
import type { BreadcrumbItem } from '@/types';

export default function AdminLayout({ children, breadcrumbs = [] }: { children: ReactNode; breadcrumbs?: BreadcrumbItem[] }) {
    return (
        <PortalLayout
            groups={adminNavigation()}
            breadcrumbs={breadcrumbs}
            homeHref="/admin/dashboard"
            portalLabel={t('core.nav.admin_panel')}
            settingsHref="/settings/profile"
            notificationsHref="/admin/notifications/inbox"
        >
            {children}
        </PortalLayout>
    );
}
