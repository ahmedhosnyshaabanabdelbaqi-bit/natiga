import { Head, Link } from '@inertiajs/react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { t } from '@/lib/i18n';

export default function MfaRequired() {
    return (
        <>
            <Head title={t('auth.two_factor.required_title')} />
            <Card className="mx-auto mt-8 max-w-lg shadow-card">
                <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
                        <ShieldAlert className="size-7" />
                    </div>
                    <h1 className="text-xl font-semibold">{t('auth.two_factor.required_title')}</h1>
                    <p className="text-sm text-muted-foreground">{t('auth.two_factor.required_description')}</p>
                    <Button asChild className="mt-2">
                        <Link href="/settings/security">{t('auth.two_factor.setup')}</Link>
                    </Button>
                </CardContent>
            </Card>
        </>
    );
}
