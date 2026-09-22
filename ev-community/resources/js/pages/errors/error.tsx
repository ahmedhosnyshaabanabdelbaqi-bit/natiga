import { Head, Link } from '@inertiajs/react';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { t, useLocale } from '@/lib/i18n';

export default function ErrorPage({ status, message, requestId }: { status: number; message: string; requestId?: string | null }) {
    const { locale } = useLocale();
    return (
        <div className="flex min-h-svh flex-col items-center justify-center bg-background p-6 text-center">
            <Head title={String(status)} />
            <p className="text-6xl font-bold text-brand tabular">{status}</p>
            <h1 className="mt-4 text-xl font-semibold">{message}</h1>
            {requestId && status >= 500 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                    {t('core.errors.request_reference')}: <Code>{requestId}</Code>
                </p>
            ) : null}
            <div className="mt-8 flex gap-3">
                <Button asChild>
                    <Link href={`/${locale}`}>{t('core.errors.go_home')}</Link>
                </Button>
                <Button variant="outline" onClick={() => window.history.back()}>{t('core.actions.back')}</Button>
            </div>
        </div>
    );
}
