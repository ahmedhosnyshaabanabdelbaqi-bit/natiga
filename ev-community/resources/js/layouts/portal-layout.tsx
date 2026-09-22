import { Link, usePage } from '@inertiajs/react';
import { Bell, ChevronsUpDown, LogOut, Settings } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect } from 'react';
import { toast } from 'sonner';
import AppLogoIcon from '@/components/app-logo-icon';
import { Breadcrumbs } from '@/components/breadcrumbs';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { StatusBanners } from '@/components/shared/status-banners';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Sidebar,
    SidebarContent,
    SidebarFooter,
    SidebarGroup,
    SidebarGroupLabel,
    SidebarHeader,
    SidebarInset,
    SidebarMenu,
    SidebarMenuButton,
    SidebarMenuItem,
    SidebarMenuSub,
    SidebarMenuSubButton,
    SidebarMenuSubItem,
    SidebarProvider,
    SidebarTrigger,
    useSidebar,
} from '@/components/ui/sidebar';
import { UserInfo } from '@/components/user-info';
import { useCurrentUrl } from '@/hooks/use-current-url';
import { useIsMobile } from '@/hooks/use-mobile';
import { can } from '@/lib/auth';
import { t, useLocale } from '@/lib/i18n';
import { logout } from '@/routes';
import type { BreadcrumbItem, NavGroup, NavItem } from '@/types';

type Props = {
    children: ReactNode;
    breadcrumbs?: BreadcrumbItem[];
    groups: NavGroup[];
    homeHref: string;
    portalLabel: string;
    headerActions?: ReactNode;
    settingsHref?: string;
    notificationsHref?: string;
    unreadCount?: number;
};

function useVisibleItems(items: NavItem[]): NavItem[] {
    const { auth, modules } = usePage().props;
    return items
        .filter((item) => (item.module ? modules[item.module] !== false : true))
        .filter((item) => (item.permission ? can(item.permission, auth) : true))
        .map((item) => (item.children ? { ...item, children: item.children.filter((c) => (c.permission ? can(c.permission, auth) : true)) } : item));
}

function NavGroupBlock({ group }: { group: NavGroup }) {
    const items = useVisibleItems(group.items);
    const { isCurrentUrl } = useCurrentUrl();
    if (items.length === 0) {
        return null;
    }
    return (
        <SidebarGroup className="px-2 py-0">
            <SidebarGroupLabel>{group.title}</SidebarGroupLabel>
            <SidebarMenu>
                {items.map((item) => {
                    const active = isCurrentUrl(item.href) || (item.children?.some((c) => isCurrentUrl(c.href)) ?? false);
                    return (
                        <SidebarMenuItem key={item.title}>
                            <SidebarMenuButton asChild isActive={active} tooltip={{ children: item.title }}>
                                <Link href={item.href} prefetch>
                                    {item.icon && <item.icon />}
                                    <span>{item.title}</span>
                                    {item.badge ? (
                                        <span className="ms-auto rounded-full bg-sidebar-primary px-1.5 text-[10px] font-semibold text-sidebar-primary-foreground">
                                            {item.badge}
                                        </span>
                                    ) : null}
                                </Link>
                            </SidebarMenuButton>
                            {item.children && item.children.length > 0 && active ? (
                                <SidebarMenuSub>
                                    {item.children.map((child) => (
                                        <SidebarMenuSubItem key={child.title}>
                                            <SidebarMenuSubButton asChild isActive={isCurrentUrl(child.href)}>
                                                <Link href={child.href} prefetch>
                                                    <span>{child.title}</span>
                                                </Link>
                                            </SidebarMenuSubButton>
                                        </SidebarMenuSubItem>
                                    ))}
                                </SidebarMenuSub>
                            ) : null}
                        </SidebarMenuItem>
                    );
                })}
            </SidebarMenu>
        </SidebarGroup>
    );
}

function PortalUserMenu({ settingsHref }: { settingsHref: string }) {
    const { auth } = usePage().props;
    const { state } = useSidebar();
    const isMobile = useIsMobile();
    const { isRtl } = useLocale();
    if (!auth.user) {
        return null;
    }
    return (
        <SidebarMenu>
            <SidebarMenuItem>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <SidebarMenuButton size="lg" className="group text-sidebar-accent-foreground data-[state=open]:bg-sidebar-accent">
                            <UserInfo user={auth.user} />
                            <ChevronsUpDown className="ms-auto size-4" />
                        </SidebarMenuButton>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent
                        className="w-(--radix-dropdown-menu-trigger-width) min-w-56 rounded-lg"
                        align="end"
                        side={isMobile ? 'bottom' : state === 'collapsed' ? (isRtl ? 'left' : 'right') : 'bottom'}
                    >
                        <DropdownMenuLabel className="p-0 font-normal">
                            <div className="flex items-center gap-2 px-1 py-1.5 text-start text-sm">
                                <UserInfo user={auth.user} showEmail />
                            </div>
                        </DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link className="block w-full cursor-pointer" href={settingsHref} prefetch>
                                <Settings className="me-2" />
                                {t('core.nav.settings')}
                            </Link>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem asChild>
                            <Link className="block w-full cursor-pointer" href={logout()} as="button" data-test="logout-button">
                                <LogOut className="me-2" />
                                {t('core.nav.logout')}
                            </Link>
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
            </SidebarMenuItem>
        </SidebarMenu>
    );
}

export function useFlashToasts(): void {
    const { flash } = usePage().props;
    useEffect(() => {
        if (flash?.success) {
            toast.success(flash.success);
        }
        if (flash?.error) {
            toast.error(flash.error);
        }
        if (flash?.warning) {
            toast.warning(flash.warning);
        }
        if (flash?.status) {
            toast.info(flash.status);
        }
    }, [flash?.success, flash?.error, flash?.warning, flash?.status]);
}

export default function PortalLayout({
    children,
    breadcrumbs = [],
    groups,
    homeHref,
    portalLabel,
    headerActions,
    settingsHref = '/settings/profile',
    notificationsHref,
    unreadCount = 0,
}: Props) {
    const { sidebarOpen, branding } = usePage().props;
    const { isRtl } = useLocale();
    useFlashToasts();

    return (
        <SidebarProvider defaultOpen={sidebarOpen}>
            <Sidebar collapsible="icon" variant="inset" side={isRtl ? 'right' : 'left'}>
                <SidebarHeader>
                    <SidebarMenu>
                        <SidebarMenuItem>
                            <SidebarMenuButton size="lg" asChild>
                                <Link href={homeHref} prefetch>
                                    <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                                        {branding.logo ? (
                                            <img src={branding.logo} alt="" className="size-6 object-contain" />
                                        ) : (
                                            <AppLogoIcon className="size-5 fill-current" />
                                        )}
                                    </div>
                                    <div className="ms-1 grid flex-1 text-start text-sm">
                                        <span className="mb-0.5 truncate leading-tight font-semibold">{branding.site_name}</span>
                                        <span className="truncate text-xs text-sidebar-foreground/70">{portalLabel}</span>
                                    </div>
                                </Link>
                            </SidebarMenuButton>
                        </SidebarMenuItem>
                    </SidebarMenu>
                </SidebarHeader>
                <SidebarContent className="gap-4 py-2">
                    {groups.map((group) => (
                        <NavGroupBlock key={group.title} group={group} />
                    ))}
                </SidebarContent>
                <SidebarFooter>
                    <PortalUserMenu settingsHref={settingsHref} />
                </SidebarFooter>
            </Sidebar>
            <SidebarInset className="min-w-0 overflow-x-clip">
                <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-card focus:p-2">
                    {t('core.nav.skip_to_content')}
                </a>
                <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border/60 bg-card/60 px-4 backdrop-blur md:h-16 md:px-6">
                    <div className="flex min-w-0 items-center gap-2">
                        <SidebarTrigger className="-ms-1" />
                        <Breadcrumbs breadcrumbs={breadcrumbs} />
                    </div>
                    <div className="flex items-center gap-1">
                        {headerActions}
                        {notificationsHref ? (
                            <Button asChild variant="ghost" size="icon" className="relative" aria-label={t('core.nav.notifications')}>
                                <Link href={notificationsHref} prefetch>
                                    <Bell className="size-5" />
                                    {unreadCount > 0 ? (
                                        <span className="absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-brand px-1 text-[10px] font-semibold text-brand-foreground">
                                            {unreadCount > 99 ? '99+' : unreadCount}
                                        </span>
                                    ) : null}
                                </Link>
                            </Button>
                        ) : null}
                        <LanguageSwitcher />
                    </div>
                </header>
                <StatusBanners />
                <main id="main-content" className="flex flex-1 flex-col gap-4 p-4 md:p-6">
                    {children}
                </main>
            </SidebarInset>
        </SidebarProvider>
    );
}
