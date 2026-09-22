import { Link } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';
import { Activity, ArrowRightLeft, Webhook } from 'lucide-react';
import { useCan } from '@/lib/auth';
import { t } from '@/lib/i18n';
import { cn } from '@/lib/utils';
import { index as integrationsIndex } from '@/routes/admin/integrations';
import { index as exchangeRatesIndex } from '@/routes/admin/integrations/exchange-rates';
import { index as webhookEventsIndex } from '@/routes/admin/integrations/webhook-events';

export type IntegrationsTab = 'status' | 'webhooks' | 'exchange_rates';

type TabDefinition = {
    key: IntegrationsTab;
    href: string;
    icon: LucideIcon;
    permission: string;
};

/**
 * Section navigation shared by the three Integrations pages. Tabs are links (each page is its own
 * server-rendered route); a tab is hidden when the user lacks its permission (the server enforces it).
 */
export function IntegrationsTabs({
    current,
    className,
}: {
    current: IntegrationsTab;
    className?: string;
}) {
    const can = useCan();
    const tabs: TabDefinition[] = [
        {
            key: 'status',
            href: integrationsIndex.url(),
            icon: Activity,
            permission: 'integrations.view',
        },
        {
            key: 'webhooks',
            href: webhookEventsIndex.url(),
            icon: Webhook,
            permission: 'integrations.view',
        },
        {
            key: 'exchange_rates',
            href: exchangeRatesIndex.url(),
            icon: ArrowRightLeft,
            permission: 'exchange_rates.view',
        },
    ];
    const visible = tabs.filter(
        (tab) => tab.key === current || can(tab.permission),
    );
    if (visible.length < 2) {
        return null;
    }

    return (
        <nav
            aria-label={t('integrations.title')}
            className={cn(
                '-mx-4 scrollbar-thin overflow-x-auto px-4 md:mx-0 md:px-0',
                className,
            )}
        >
            <ul className="inline-flex min-w-max items-center gap-1 rounded-lg bg-muted p-1">
                {visible.map((tab) => {
                    const active = tab.key === current;
                    const Icon = tab.icon;
                    return (
                        <li key={tab.key}>
                            <Link
                                href={tab.href}
                                prefetch
                                aria-current={active ? 'page' : undefined}
                                className={cn(
                                    'inline-flex h-8 items-center gap-2 rounded-md px-3 text-sm font-medium whitespace-nowrap transition outline-none focus-visible:ring-2 focus-visible:ring-ring/60',
                                    active
                                        ? 'bg-background text-foreground shadow-xs'
                                        : 'text-muted-foreground hover:text-foreground',
                                )}
                            >
                                <Icon className="size-4" aria-hidden="true" />
                                {t(`integrations.tabs.${tab.key}`)}
                            </Link>
                        </li>
                    );
                })}
            </ul>
        </nav>
    );
}
