import { Head, usePage } from '@inertiajs/react';
import { Clock, ShieldOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { t } from '@/lib/i18n';

export default function MembershipStatus() {
    const { auth } = usePage().props;
    const status = auth.user?.membership?.status ?? 'pending';
    const title = t(`auth.status.${status}_title`);
    const text = status === 'pending' ? t('auth.status.pending_text') : status === 'suspended' ? t('auth.status.suspended_text') : '';
    return (
        <>
            <Head title={title} />
            <Card className="mx-auto mt-8 max-w-lg shadow-card">
                <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
                    <div className="flex size-14 items-center justify-center rounded-full bg-warning-soft text-warning">
                        {status === 'pending' ? <Clock className="size-7" /> : <ShieldOff className="size-7" />}
                    </div>
                    <h1 className="text-xl font-semibold">{title}</h1>
                    {text ? <p className="text-sm text-muted-foreground">{text}</p> : null}
                    {auth.user?.membership ? (
                        <p className="text-sm text-muted-foreground">
                            {t('core.labels.member')}: <Code>{auth.user.membership.member_number}</Code>
                        </p>
                    ) : null}
                </CardContent>
            </Card>
        </>
    );
}
