import { Link, usePage } from '@inertiajs/react';
import { Inbox, LayoutList, Mail, Send } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { can } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { inbox, index } from '@/routes/admin/notifications';
import { index as deliveriesIndex } from '@/routes/admin/notifications/deliveries';
import { index as templatesIndex } from '@/routes/admin/notifications/templates';

type Section = 'campaigns' | 'deliveries' | 'templates' | 'inbox';

const VIEW = ['notifications.view', 'notifications.manage'];

/** Section tabs of the admin notifications area (UI hint only; every route is authorized on the server). */
export function AdminNotificationsNav({ current }: { current: Section }) {
    const { auth } = usePage().props;
    const items: {
        key: Section;
        href: string;
        label: string;
        icon: LucideIcon;
        visible: boolean;
    }[] = [
        {
            key: 'campaigns',
            href: index.url(),
            label: t('notifications.admin.campaigns'),
            icon: Send,
            visible: can(VIEW, auth),
        },
        {
            key: 'deliveries',
            href: deliveriesIndex.url(),
            label: t('notifications.admin.deliveries'),
            icon: LayoutList,
            visible: can(VIEW, auth),
        },
        {
            key: 'templates',
            href: templatesIndex.url(),
            label: t('notifications.admin.templates'),
            icon: Mail,
            visible: can(VIEW, auth),
        },
        {
            key: 'inbox',
            href: inbox.url(),
            label: t('notifications.admin.inbox'),
            icon: Inbox,
            visible: true,
        },
    ];
    const visible = items.filter((item) => item.visible);
    if (visible.length <= 1) {
        return null;
    }
    return (
        <nav
            aria-label={t('notifications.title')}
            className="-mx-1 overflow-x-auto"
        >
            <ul className="flex min-w-max items-center gap-1 border-b px-1">
                {visible.map((item) => (
                    <li key={item.key}>
                        <Link
                            href={item.href}
                            prefetch
                            aria-current={
                                item.key === current ? 'page' : undefined
                            }
                            className={cn(
                                '-mb-px inline-flex items-center gap-2 border-b-2 px-3 py-2 text-sm font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                                item.key === current
                                    ? 'border-brand text-foreground'
                                    : 'border-transparent text-muted-foreground hover:text-foreground',
                            )}
                        >
                            <item.icon className="size-4" aria-hidden="true" />
                            {item.label}
                        </Link>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
