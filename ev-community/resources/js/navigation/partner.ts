import { Building2, CalendarCheck, ClipboardList, FileSearch, LayoutDashboard, LifeBuoy, Star, Wallet, Wrench } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { NavGroup } from '@/types';

export function partnerNavigation(): NavGroup[] {
    return [
        {
            title: t('core.labels.dashboard'),
            items: [
                { title: t('core.labels.dashboard'), href: '/partner/dashboard', icon: LayoutDashboard },
                { title: t('partner.nav.bookings'), href: '/partner/bookings', icon: CalendarCheck, module: 'maintenance' },
                { title: t('partner.nav.work_orders'), href: '/partner/work-orders', icon: Wrench, module: 'maintenance' },
                { title: t('partner.nav.rfqs'), href: '/partner/rfqs', icon: FileSearch, module: 'maintenance' },
                { title: t('partner.nav.quotes'), href: '/partner/quotes', icon: ClipboardList, module: 'maintenance' },
            ],
        },
        {
            title: t('partner.nav.center'),
            items: [
                { title: t('partner.nav.branches'), href: '/partner/branches', icon: Building2 },
                { title: t('partner.nav.services'), href: '/partner/services', icon: Wrench },
                { title: t('partner.nav.reviews'), href: '/partner/reviews', icon: Star, module: 'reviews' },
                { title: t('partner.nav.settlements'), href: '/partner/settlements', icon: Wallet },
                { title: t('partner.nav.support'), href: '/partner/support', icon: LifeBuoy },
            ],
        },
    ];
}
