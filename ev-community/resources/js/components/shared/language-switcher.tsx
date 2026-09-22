import { router, usePage } from '@inertiajs/react';
import { Languages } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { t, useLocale } from '@/lib/i18n';

export function LanguageSwitcher({
    variant = 'ghost',
    className,
}: {
    variant?: 'ghost' | 'outline' | 'secondary';
    className?: string;
}) {
    const { locale, locales } = useLocale();
    const { csrf } = usePage().props;

    const switchTo = (code: string) => {
        if (code === locale) {
            return;
        }
        // Full page navigation on locale switch (translations are loaded once per page load);
        // the server preserves the current path/query and rewrites the /ar|/en prefix.
        router.post(
            '/locale',
            { locale: code, redirect: window.location.href, _token: csrf },
            { preserveScroll: true, onSuccess: () => window.location.reload() },
        );
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button
                    variant={variant}
                    size="sm"
                    className={className}
                    aria-label={t('core.labels.language')}
                >
                    <Languages className="size-4" aria-hidden="true" />
                    <span className="hidden sm:inline">
                        {locales.find((l) => l.code === locale)?.name}
                    </span>
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                {locales.map((item) => (
                    <DropdownMenuItem
                        key={item.code}
                        onSelect={() => switchTo(item.code)}
                        className={item.code === locale ? 'font-semibold' : ''}
                        lang={item.code}
                        dir={item.dir}
                    >
                        {item.name}
                    </DropdownMenuItem>
                ))}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}
