import type { InertiaLinkProps } from '@inertiajs/react';
import type { LucideIcon } from 'lucide-react';

export type BreadcrumbItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
};

export type NavItem = {
    title: string;
    href: NonNullable<InertiaLinkProps['href']>;
    icon?: LucideIcon | null;
    isActive?: boolean;
    /** Any of these permissions shows the item (UI hint only). */
    permission?: string | string[];
    /** Module key that must be enabled. */
    module?: string;
    badge?: string | number | null;
    children?: NavItem[];
};

export type NavGroup = {
    title: string;
    items: NavItem[];
};
