import { Bell, CalendarDays, Car, CreditCard, Heart, IdCard, LayoutDashboard, LifeBuoy, PlugZap, ShieldCheck, ShoppingBag, UsersRound, Wrench } from 'lucide-react';
import { t } from '@/lib/i18n';
import type { NavGroup } from '@/types';

export function memberNavigation(): NavGroup[] {
    return [
        {
            title: t('core.labels.dashboard'),
            items: [
                { title: t('core.labels.dashboard'), href: '/account', icon: LayoutDashboard },
                { title: t('core.nav.my_garage'), href: '/account/garage', icon: Car, module: 'garage' },
                { title: t('core.nav.membership_card'), href: '/account/membership-card', icon: IdCard },
            ],
        },
        {
            title: t('core.nav.store'),
            items: [
                { title: t('core.nav.orders'), href: '/account/orders', icon: ShoppingBag, module: 'orders' },
                { title: t('core.nav.group_buys'), href: '/account/group-buys', icon: UsersRound, module: 'group_buying' },
                { title: t('core.nav.payments'), href: '/account/payments', icon: CreditCard },
                { title: t('core.nav.wishlist'), href: '/account/wishlist', icon: Heart, module: 'demand' },
                { title: t('core.nav.events'), href: '/account/events', icon: CalendarDays, module: 'events' },
            ],
        },
        {
            title: t('core.nav.maintenance'),
            items: [
                { title: t('core.nav.maintenance'), href: '/account/maintenance', icon: Wrench, module: 'maintenance' },
                { title: t('core.nav.charging_stations'), href: '/account/charging', icon: PlugZap, module: 'charging_stations' },
                { title: t('core.nav.warranty'), href: '/account/warranty', icon: ShieldCheck, module: 'warranty' },
            ],
        },
        {
            title: t('core.nav.support'),
            items: [
                { title: t('core.nav.support'), href: '/account/support', icon: LifeBuoy },
                { title: t('core.nav.notifications'), href: '/account/notifications', icon: Bell },
            ],
        },
    ];
}
