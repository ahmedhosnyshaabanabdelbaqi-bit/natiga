import { Link } from '@inertiajs/react';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { index as makesIndex } from '@/routes/admin/vehicles';
import { index as connectorsIndex } from '@/routes/admin/vehicles/connectors';
import { index as membersIndex } from '@/routes/admin/vehicles/members';
import { index as modelsIndex } from '@/routes/admin/vehicles/models';
import { index as variantsIndex } from '@/routes/admin/vehicles/variants';

export type VehiclesAdminTab =
    | 'makes'
    | 'models'
    | 'variants'
    | 'connectors'
    | 'members';

/** Secondary navigation shared by the /admin/vehicles pages. */
export function VehiclesAdminNav({ current }: { current: VehiclesAdminTab }) {
    const can = useCan();
    const tabs: { key: VehiclesAdminTab; href: string; visible: boolean }[] = [
        { key: 'makes', href: makesIndex().url, visible: true },
        { key: 'models', href: modelsIndex().url, visible: true },
        { key: 'variants', href: variantsIndex().url, visible: true },
        { key: 'connectors', href: connectorsIndex().url, visible: true },
        {
            key: 'members',
            href: membersIndex().url,
            visible: can('vehicles.view'),
        },
    ];

    return (
        <nav
            aria-label={t('vehicles.admin.title')}
            className="-mx-1 overflow-x-auto"
        >
            <ul className="flex min-w-max gap-1 border-b px-1">
                {tabs
                    .filter((tab) => tab.visible)
                    .map((tab) => (
                        <li key={tab.key}>
                            <Link
                                href={tab.href}
                                prefetch
                                aria-current={
                                    tab.key === current ? 'page' : undefined
                                }
                                className={cn(
                                    '-mb-px inline-flex items-center border-b-2 px-3 py-2 text-sm font-medium transition',
                                    tab.key === current
                                        ? 'border-brand text-foreground'
                                        : 'border-transparent text-muted-foreground hover:text-foreground',
                                )}
                            >
                                {t(`vehicles.admin.tabs.${tab.key}`)}
                            </Link>
                        </li>
                    ))}
            </ul>
        </nav>
    );
}
