import { Link, usePage } from '@inertiajs/react';
import {
    LockKeyhole,
    Monitor,
    Palette,
    ShieldCheck,
    UserRound,
} from 'lucide-react';
import type { PropsWithChildren } from 'react';
import Heading from '@/components/heading';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { t } from '@/lib/i18n';
import { cn, toUrl } from '@/lib/utils';
import { edit as editAppearance } from '@/routes/appearance';
import { index as privacyIndex } from '@/routes/member/privacy';
import { edit } from '@/routes/profile';
import { edit as editSecurity } from '@/routes/security';
import { index as sessionsIndex } from '@/routes/shared/settings/sessions';
import type { NavItem } from '@/types';

/** Personal settings navigation. "Privacy" (member data & consents) is shown to members only. */
function settingsNavItems(isMember: boolean): NavItem[] {
    const items: NavItem[] = [
        { title: t('settings.nav.profile'), href: edit(), icon: UserRound },
        {
            title: t('settings.nav.security'),
            href: editSecurity(),
            icon: ShieldCheck,
        },
        {
            title: t('settings.nav.sessions'),
            href: sessionsIndex(),
            icon: Monitor,
        },
        {
            title: t('settings.nav.appearance'),
            href: editAppearance(),
            icon: Palette,
        },
    ];

    if (isMember) {
        items.push({
            title: t('settings.nav.privacy'),
            href: privacyIndex(),
            icon: LockKeyhole,
        });
    }

    return items;
}

export default function SettingsLayout({ children }: PropsWithChildren) {
    const { isCurrentOrParentUrl } = useCurrentUrl();
    const { auth } = usePage().props;
    const items = settingsNavItems(auth.user?.is_member === true);

    return (
        <div className="px-4 py-6">
            <Heading
                title={t('settings.title')}
                description={t('settings.description')}
            />

            <div className="flex flex-col gap-y-6 lg:flex-row lg:gap-x-12">
                <aside className="w-full max-w-xl lg:w-48">
                    <nav
                        className="flex flex-col gap-1"
                        aria-label={t('settings.nav.label')}
                    >
                        {items.map((item) => {
                            const active = isCurrentOrParentUrl(item.href);
                            return (
                                <Button
                                    key={toUrl(item.href)}
                                    size="sm"
                                    variant="ghost"
                                    asChild
                                    className={cn('w-full justify-start', {
                                        'bg-muted': active,
                                    })}
                                >
                                    <Link
                                        href={item.href}
                                        aria-current={
                                            active ? 'page' : undefined
                                        }
                                        prefetch
                                    >
                                        {item.icon && (
                                            <item.icon
                                                className="h-4 w-4"
                                                aria-hidden="true"
                                            />
                                        )}
                                        {item.title}
                                    </Link>
                                </Button>
                            );
                        })}
                    </nav>
                </aside>

                <Separator className="lg:hidden" />

                <div className="min-w-0 flex-1 md:max-w-2xl">
                    <section className="max-w-xl space-y-12">
                        {children}
                    </section>
                </div>
            </div>
        </div>
    );
}
