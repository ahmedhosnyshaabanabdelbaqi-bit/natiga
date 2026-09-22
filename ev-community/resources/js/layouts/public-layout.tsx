import { Link, usePage } from '@inertiajs/react';
import { Menu, Search, ShoppingCart, UserRound, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useState } from 'react';
import AppLogoIcon from '@/components/app-logo-icon';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { StatusBanners } from '@/components/shared/status-banners';
import { Button } from '@/components/ui/button';
import { useFlashToasts } from '@/layouts/portal-layout';
import { t, useLocale } from '@/lib/i18n';
import { cn } from '@/lib/utils';

type PublicNavItem = { title: string; href: string; module?: string };

export function publicNavigation(locale: string): PublicNavItem[] {
    return [
        { title: t('core.nav.store'), href: `/${locale}/store`, module: 'catalog' },
        { title: t('core.nav.group_buys'), href: `/${locale}/group-buys`, module: 'group_buying' },
        { title: t('core.nav.charging_stations'), href: `/${locale}/charging-stations`, module: 'charging_stations' },
        { title: t('core.nav.service_centers'), href: `/${locale}/service-centers`, module: 'service_centers' },
        { title: t('core.nav.offers'), href: `/${locale}/offers`, module: 'partners' },
        { title: t('core.nav.events'), href: `/${locale}/events`, module: 'events' },
        { title: t('core.nav.knowledge'), href: `/${locale}/knowledge`, module: 'knowledge_base' },
    ];
}

export default function PublicLayout({ children }: { children: ReactNode }) {
    const { auth, branding, modules, cartCount } = usePage().props as ReturnType<typeof usePage>['props'] & { cartCount?: number };
    const { locale } = useLocale();
    const [open, setOpen] = useState(false);
    useFlashToasts();
    const nav = publicNavigation(locale).filter((item) => !item.module || modules[item.module] !== false);
    const accountHref = auth.user ? (auth.user.is_member ? '/account' : auth.user.is_staff ? '/admin/dashboard' : '/partner/dashboard') : '/login';

    return (
        <div className="flex min-h-svh flex-col bg-background">
            <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-card focus:p-2">
                {t('core.nav.skip_to_content')}
            </a>
            <header className="sticky top-0 z-40 border-b border-border/60 bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70">
                <div className="mx-auto flex h-16 max-w-7xl items-center gap-3 px-4 sm:px-6">
                    <Link href={`/${locale}`} className="flex items-center gap-2 font-semibold" aria-label={branding.site_name}>
                        {branding.logo ? (
                            <img src={branding.logo} alt={branding.site_name} className="h-9 w-auto" />
                        ) : (
                            <span className="flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground">
                                <AppLogoIcon className="size-5 fill-current" />
                            </span>
                        )}
                        <span className="hidden text-base sm:inline">{branding.site_name}</span>
                    </Link>

                    <nav className="ms-4 hidden items-center gap-1 lg:flex" aria-label="Main">
                        {nav.map((item) => (
                            <Link key={item.href} href={item.href} className="rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-muted hover:text-foreground" prefetch>
                                {item.title}
                            </Link>
                        ))}
                    </nav>

                    <div className="ms-auto flex items-center gap-1">
                        {modules.catalog !== false ? (
                            <Button asChild variant="ghost" size="icon" aria-label={t('core.actions.search')}>
                                <Link href={`/${locale}/search`}>
                                    <Search className="size-5" />
                                </Link>
                            </Button>
                        ) : null}
                        <LanguageSwitcher />
                        {modules.cart !== false ? (
                            <Button asChild variant="ghost" size="icon" className="relative" aria-label={t('core.nav.cart')}>
                                <Link href={`/${locale}/cart`}>
                                    <ShoppingCart className="size-5" />
                                    {cartCount ? (
                                        <span className="absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">{cartCount}</span>
                                    ) : null}
                                </Link>
                            </Button>
                        ) : null}
                        <Button asChild variant={auth.user ? 'ghost' : 'default'} size="sm" className="hidden sm:inline-flex">
                            <Link href={accountHref}>
                                <UserRound className="size-4" />
                                {auth.user ? auth.user.name.split(' ')[0] : t('core.nav.login')}
                            </Link>
                        </Button>
                        <Button variant="ghost" size="icon" className="lg:hidden" aria-expanded={open} aria-label={t('core.nav.toggle_menu')} onClick={() => setOpen((v) => !v)}>
                            {open ? <X className="size-5" /> : <Menu className="size-5" />}
                        </Button>
                    </div>
                </div>
                <div className={cn('border-t border-border/60 lg:hidden', open ? 'block' : 'hidden')}>
                    <nav className="mx-auto flex max-w-7xl flex-col px-4 py-2 sm:px-6" aria-label="Mobile">
                        {nav.map((item) => (
                            <Link key={item.href} href={item.href} className="touch-target flex items-center rounded-md px-3 text-sm font-medium hover:bg-muted" onClick={() => setOpen(false)}>
                                {item.title}
                            </Link>
                        ))}
                        <Link href={accountHref} className="touch-target flex items-center rounded-md px-3 text-sm font-medium hover:bg-muted" onClick={() => setOpen(false)}>
                            {auth.user ? t('core.nav.my_account') : t('core.nav.login')}
                        </Link>
                    </nav>
                </div>
            </header>
            <StatusBanners />
            <main id="main-content" className="flex-1">
                {children}
            </main>
            <footer className="mt-16 border-t border-border/60 bg-primary text-primary-foreground">
                <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
                    <div className="md:col-span-2">
                        <div className="flex items-center gap-2 text-lg font-semibold">
                            <span className="flex size-9 items-center justify-center rounded-lg bg-brand text-brand-foreground">
                                <AppLogoIcon className="size-5 fill-current" />
                            </span>
                            {branding.site_name}
                        </div>
                        <p className="mt-4 max-w-md text-sm text-primary-foreground/70">{t('core.footer.about_text')}</p>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold tracking-wide uppercase text-primary-foreground/80">{t('core.footer.quick_links')}</h3>
                        <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
                            {nav.slice(0, 5).map((item) => (
                                <li key={item.href}>
                                    <Link href={item.href} className="hover:text-primary-foreground">{item.title}</Link>
                                </li>
                            ))}
                            <li><Link href={`/${locale}/pages/about`} className="hover:text-primary-foreground">{t('core.nav.about')}</Link></li>
                            <li><Link href={`/${locale}/pages/faq`} className="hover:text-primary-foreground">{t('core.nav.faq')}</Link></li>
                        </ul>
                    </div>
                    <div>
                        <h3 className="text-sm font-semibold tracking-wide uppercase text-primary-foreground/80">{t('core.footer.contact_us')}</h3>
                        <ul className="mt-4 space-y-2 text-sm text-primary-foreground/70">
                            {branding.contact.email ? <li><a className="code hover:text-primary-foreground" href={`mailto:${branding.contact.email}`}>{branding.contact.email}</a></li> : null}
                            {branding.contact.phone ? <li><a className="code hover:text-primary-foreground" href={`tel:${branding.contact.phone}`}>{branding.contact.phone}</a></li> : null}
                            {branding.contact.address ? <li>{branding.contact.address}</li> : null}
                            <li><Link href={`/${locale}/pages/contact`} className="hover:text-primary-foreground">{t('core.nav.contact')}</Link></li>
                            <li><Link href={`/${locale}/pages/privacy`} className="hover:text-primary-foreground">{t('core.nav.privacy')}</Link></li>
                            <li><Link href={`/${locale}/pages/terms`} className="hover:text-primary-foreground">{t('core.nav.terms')}</Link></li>
                        </ul>
                    </div>
                </div>
                <div className="border-t border-white/10">
                    <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-2 px-4 py-4 text-xs text-primary-foreground/60 sm:flex-row sm:px-6">
                        <span>© {new Date().getFullYear()} {branding.site_name}. {t('core.footer.rights')}.</span>
                        <LanguageSwitcher variant="ghost" className="text-primary-foreground/80 hover:text-primary-foreground" />
                    </div>
                </div>
            </footer>
        </div>
    );
}
