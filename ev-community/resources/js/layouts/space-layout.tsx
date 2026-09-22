import { usePage } from '@inertiajs/react';
import type { ReactNode } from 'react';
import AdminLayout from '@/layouts/admin-layout';
import MemberLayout from '@/layouts/member-layout';
import PartnerLayout from '@/layouts/partner-layout';
import PublicLayout from '@/layouts/public-layout';
import type { BreadcrumbItem } from '@/types';

/**
 * Picks the portal layout from the server-computed `space` shared prop.
 * Used for pages shared between portals (settings, generic pages).
 */
export default function SpaceLayout({ children, breadcrumbs = [] }: { children: ReactNode; breadcrumbs?: BreadcrumbItem[] }) {
    const { space } = usePage().props;
    switch (space) {
        case 'admin':
            return <AdminLayout breadcrumbs={breadcrumbs}>{children}</AdminLayout>;
        case 'partner':
            return <PartnerLayout breadcrumbs={breadcrumbs}>{children}</PartnerLayout>;
        case 'member':
            return <MemberLayout breadcrumbs={breadcrumbs}>{children}</MemberLayout>;
        default:
            return <PublicLayout>{children}</PublicLayout>;
    }
}
