import { Link, usePage } from '@inertiajs/react';
import AppLogoIcon from '@/components/app-logo-icon';
import { LanguageSwitcher } from '@/components/shared/language-switcher';
import { useLocale } from '@/lib/i18n';
import type { AuthLayoutProps } from '@/types';

export default function AuthSimpleLayout({ children, title, description }: AuthLayoutProps) {
    const { branding } = usePage().props;
    const { locale } = useLocale();

    return (
        <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 bg-background p-6 md:p-10">
            <div className="absolute top-4 end-4">
                <LanguageSwitcher variant="outline" />
            </div>
            <div className="w-full max-w-sm">
                <div className="flex flex-col gap-8">
                    <div className="flex flex-col items-center gap-4">
                        <Link href={`/${locale}`} className="flex flex-col items-center gap-2 font-medium">
                            <div className="mb-1 flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground shadow-elevated">
                                {branding.logo ? <img src={branding.logo} alt="" className="size-8 object-contain" /> : <AppLogoIcon className="size-7 fill-current" />}
                            </div>
                            <span className="text-sm text-muted-foreground">{branding.site_name}</span>
                        </Link>
                        <div className="space-y-2 text-center">
                            <h1 className="text-xl font-semibold">{title}</h1>
                            <p className="text-center text-sm text-muted-foreground">{description}</p>
                        </div>
                    </div>
                    {children}
                </div>
            </div>
        </div>
    );
}
