import { createInertiaApp, router } from '@inertiajs/react';
import { DirectionProvider } from '@radix-ui/react-direction';
import { Toaster } from '@/components/ui/sonner';
import { TooltipProvider } from '@/components/ui/tooltip';
import { initializeTheme } from '@/hooks/use-appearance';
import AdminLayout from '@/layouts/admin-layout';
import AuthLayout from '@/layouts/auth-layout';
import MemberLayout from '@/layouts/member-layout';
import PartnerLayout from '@/layouts/partner-layout';
import PublicLayout from '@/layouts/public-layout';
import SettingsLayout from '@/layouts/settings/layout';
import SpaceLayout from '@/layouts/space-layout';
import { boot } from '@/lib/i18n';

const appName = boot().locale === 'ar' ? 'مجتمع السيارات الكهربائية في مصر' : 'EV Community Egypt';

void createInertiaApp({
    title: (title) => (title ? `${title} - ${appName}` : appName),
    layout: (name) => {
        switch (true) {
            case name.startsWith('errors/'):
                return null;
            case name.startsWith('auth/'):
                return AuthLayout;
            case name.startsWith('settings/'):
                return [SpaceLayout, SettingsLayout];
            case name.startsWith('admin/'):
                return AdminLayout;
            case name.startsWith('partner/'):
                return PartnerLayout;
            case name.startsWith('member/'):
                return MemberLayout;
            case name.startsWith('public/'):
                return PublicLayout;
            default:
                return SpaceLayout;
        }
    },
    strictMode: true,
    withApp(app) {
        return (
            <DirectionProvider dir={boot().dir}>
                <TooltipProvider delayDuration={0}>
                    {app}
                    <Toaster position={boot().dir === 'rtl' ? 'top-left' : 'top-right'} richColors closeButton />
                </TooltipProvider>
            </DirectionProvider>
        );
    },
    progress: {
        color: '#0F766E',
    },
});

// Keep <html dir/lang> in sync when the server switches locale during an Inertia visit.
router.on('navigate', (event) => {
    const props = event.detail.page.props as { locale?: string; dir?: string };
    if (props.locale && document.documentElement.lang !== props.locale) {
        window.location.reload();
    }
});

initializeTheme();
