import {
    Activity,
    BadgePercent,
    BarChart3,
    BookOpen,
    Boxes,
    Building2,
    CalendarDays,
    Car,
    ClipboardList,
    CreditCard,
    FileSearch,
    Gauge,
    Handshake,
    Home,
    LayoutDashboard,
    LifeBuoy,
    ListChecks,
    Megaphone,
    MessageSquare,
    Package,
    PackageCheck,
    PlugZap,
    Puzzle,
    Settings,
    ShieldCheck,
    ShoppingBag,
    Ship,
    Store,
    Tags,
    Truck,
    Users,
    UsersRound,
    Wallet,
    Warehouse,
    Wrench,
} from 'lucide-react';
import { t } from '@/lib/i18n';
import type { NavGroup } from '@/types';

export function adminNavigation(): NavGroup[] {
    return [
        {
            title: t('admin.nav.overview'),
            items: [
                { title: t('admin.nav.dashboard'), href: '/admin/dashboard', icon: LayoutDashboard },
                { title: t('admin.nav.operations'), href: '/admin/operations', icon: Activity, permission: 'operations.view' },
            ],
        },
        {
            title: t('admin.nav.community'),
            items: [
                { title: t('admin.nav.members'), href: '/admin/members', icon: Users, permission: ['members.view'] },
                { title: t('admin.nav.vehicles'), href: '/admin/vehicles', icon: Car, permission: ['vehicles.view', 'vehicles.manage_master'] },
                { title: t('admin.nav.garage_data'), href: '/admin/garage', icon: Home, permission: ['vehicles.view'], module: 'garage' },
            ],
        },
        {
            title: t('admin.nav.commerce'),
            items: [
                { title: t('admin.nav.products'), href: '/admin/products', icon: Package, permission: ['catalog.view'], module: 'catalog' },
                { title: t('admin.nav.categories'), href: '/admin/categories', icon: Tags, permission: ['catalog.manage'], module: 'catalog' },
                { title: t('admin.nav.brands'), href: '/admin/brands', icon: Store, permission: ['catalog.manage'], module: 'catalog' },
                { title: t('admin.nav.compatibility'), href: '/admin/compatibility', icon: Puzzle, permission: ['catalog.manage'], module: 'catalog' },
                { title: t('admin.nav.demand'), href: '/admin/demand', icon: ListChecks, permission: ['demand.view'], module: 'demand' },
                { title: t('admin.nav.orders'), href: '/admin/orders', icon: ShoppingBag, permission: ['orders.view'], module: 'orders' },
                { title: t('admin.nav.group_buys'), href: '/admin/group-buys', icon: UsersRound, permission: ['group_buying.view'], module: 'group_buying' },
            ],
        },
        {
            title: t('admin.nav.finance'),
            items: [
                { title: t('admin.nav.payments'), href: '/admin/payments', icon: CreditCard, permission: ['payments.view'] },
                { title: t('admin.nav.accounting'), href: '/admin/accounting', icon: Wallet, permission: ['accounting.view'] },
            ],
        },
        {
            title: t('admin.nav.supply_chain'),
            items: [
                { title: t('admin.nav.suppliers'), href: '/admin/suppliers', icon: Building2, permission: ['suppliers.view'], module: 'suppliers' },
                { title: t('admin.nav.procurement'), href: '/admin/procurement', icon: ClipboardList, permission: ['procurement.view'], module: 'procurement' },
                { title: t('admin.nav.shipments'), href: '/admin/shipments', icon: Ship, permission: ['shipments.view'], module: 'shipping' },
                { title: t('admin.nav.warehouses'), href: '/admin/warehouses', icon: Warehouse, permission: ['warehouses.view'], module: 'warehouses' },
                { title: t('admin.nav.inventory'), href: '/admin/inventory', icon: Boxes, permission: ['inventory.view'], module: 'inventory' },
            ],
        },
        {
            title: t('admin.nav.operations_group'),
            items: [
                { title: t('admin.nav.events'), href: '/admin/events', icon: CalendarDays, permission: ['events.view'], module: 'events' },
                { title: t('admin.nav.deliveries'), href: '/admin/deliveries', icon: PackageCheck, permission: ['deliveries.view'], module: 'deliveries' },
            ],
        },
        {
            title: t('admin.nav.services'),
            items: [
                { title: t('admin.nav.service_centers'), href: '/admin/service-centers', icon: Wrench, permission: ['service_centers.view'], module: 'service_centers' },
                { title: t('admin.nav.rfqs'), href: '/admin/maintenance/rfqs', icon: FileSearch, permission: ['maintenance.view'], module: 'maintenance' },
                { title: t('admin.nav.maintenance'), href: '/admin/maintenance', icon: Gauge, permission: ['maintenance.view'], module: 'maintenance' },
                { title: t('admin.nav.charging_stations'), href: '/admin/charging-stations', icon: PlugZap, permission: ['charging_stations.view'], module: 'charging_stations' },
                { title: t('admin.nav.home_charging'), href: '/admin/home-charging', icon: Home, permission: ['home_charging.view'], module: 'home_charging' },
                { title: t('admin.nav.partners'), href: '/admin/partners', icon: Handshake, permission: ['partners.view'], module: 'partners' },
                { title: t('admin.nav.offers'), href: '/admin/offers', icon: BadgePercent, permission: ['partners.view'], module: 'partners' },
                { title: t('admin.nav.warranty'), href: '/admin/warranty', icon: ShieldCheck, permission: ['warranty.view'], module: 'warranty' },
            ],
        },
        {
            title: t('admin.nav.content'),
            items: [
                { title: t('admin.nav.knowledge_base'), href: '/admin/knowledge-base', icon: BookOpen, permission: ['knowledge_base.manage'], module: 'knowledge_base' },
                { title: t('admin.nav.campaigns'), href: '/admin/campaigns', icon: Megaphone, permission: ['campaigns.manage'], module: 'campaigns' },
                { title: t('admin.nav.support'), href: '/admin/support', icon: LifeBuoy, permission: ['support.view'] },
                { title: t('admin.nav.notifications'), href: '/admin/notifications', icon: MessageSquare, permission: ['notifications.manage'] },
                { title: t('admin.nav.surveys'), href: '/admin/surveys', icon: ListChecks, permission: ['surveys.manage'], module: 'surveys' },
                { title: t('admin.nav.reports'), href: '/admin/reports', icon: BarChart3, permission: ['reports.view'] },
                { title: t('admin.nav.cms'), href: '/admin/cms', icon: BookOpen, permission: ['cms.manage'] },
            ],
        },
        {
            title: t('admin.nav.system'),
            items: [
                { title: t('admin.nav.users'), href: '/admin/users', icon: Users, permission: ['users.view'] },
                { title: t('admin.nav.roles'), href: '/admin/roles', icon: ShieldCheck, permission: ['roles.manage'] },
                { title: t('admin.nav.audit_logs'), href: '/admin/audit-logs', icon: FileSearch, permission: ['audit.view'] },
                { title: t('admin.nav.integrations'), href: '/admin/integrations', icon: Truck, permission: ['integrations.view'] },
                { title: t('admin.nav.settings'), href: '/admin/settings', icon: Settings, permission: ['settings.view'] },
                { title: t('admin.nav.modules'), href: '/admin/modules', icon: Puzzle, permission: ['modules.manage'] },
            ],
        },
    ];
}
