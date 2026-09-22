import type { Auth } from '@/types/auth';

declare module 'react' {
    interface InputHTMLAttributes<T> {
        passwordrules?: string;
    }
}

export type Branding = {
    site_name: string;
    tagline: string | null;
    logo: string | null;
    logo_dark: string | null;
    primary_color: string;
    accent_color: string;
    background_color: string;
    contact: {
        email: string | null;
        phone: string | null;
        whatsapp: string | null;
        address: string | null;
        social: Record<string, string>;
    };
};

export type StatusBannerData = {
    id: number;
    level: 'information' | 'warning' | 'major';
    message: string;
};

export type Flash = {
    success?: string | null;
    error?: string | null;
    status?: string | null;
    warning?: string | null;
};

declare module '@inertiajs/core' {
    export interface InertiaConfig {
        sharedPageProps: {
            name: string;
            locale: 'ar' | 'en';
            dir: 'rtl' | 'ltr';
            space: 'public' | 'member' | 'admin' | 'partner';
            auth: Auth;
            branding: Branding;
            modules: Record<string, boolean>;
            banners: StatusBannerData[];
            flash: Flash;
            sidebarOpen: boolean;
            csrf: string;
            [key: string]: unknown;
        };
    }
}
