import { Head, Link } from '@inertiajs/react';
import { ArrowUpRight, CheckCircle2, Circle, PartyPopper } from 'lucide-react';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { ProgressBar } from '@/components/shared/progress-bar';
import { SectionCard } from '@/components/shared/section-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import type { SetupItem } from '@/features/system/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { setup } from '@/routes/admin';

type Props = {
    items: SetupItem[];
    done: number;
    total: number;
};

export default function SetupChecklist({ items, done, total }: Props) {
    const ordered = [
        ...items.filter((item) => !item.ok),
        ...items.filter((item) => item.ok),
    ];

    return (
        <>
            <Head title={t('system.setup.title')} />
            <div className="grid gap-6">
                <PageHeader
                    title={t('system.setup.title')}
                    description={t('system.setup.description')}
                />
                <SectionCard>
                    <ProgressBar
                        value={done}
                        max={Math.max(total, 1)}
                        label={t('system.setup.progress', {
                            done: formatNumber(done, 0),
                            total: formatNumber(total, 0),
                        })}
                        tone={done === total ? 'success' : 'brand'}
                    />
                </SectionCard>
                {done === total ? (
                    <InlineAlert tone="success" icon={PartyPopper}>
                        {t('system.setup.complete')}
                    </InlineAlert>
                ) : null}
                <ul className="grid gap-3">
                    {ordered.map((item) => (
                        <li
                            key={item.key}
                            className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-card sm:flex-row sm:items-center sm:justify-between"
                        >
                            <div className="flex min-w-0 items-start gap-3">
                                {item.ok ? (
                                    <CheckCircle2
                                        className="mt-0.5 size-5 shrink-0 text-success"
                                        aria-hidden="true"
                                    />
                                ) : (
                                    <Circle
                                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                                        aria-hidden="true"
                                    />
                                )}
                                <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-2 font-medium">
                                        {t(
                                            `system.setup.items.${item.key}.title`,
                                        )}
                                        <Badge
                                            variant={
                                                item.ok
                                                    ? 'secondary'
                                                    : 'outline'
                                            }
                                            className={
                                                item.ok
                                                    ? 'font-normal text-success'
                                                    : 'font-normal text-warning'
                                            }
                                        >
                                            {item.ok
                                                ? t('system.setup.done')
                                                : t('system.setup.todo')}
                                        </Badge>
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                        {t(
                                            `system.setup.items.${item.key}.description`,
                                        )}
                                    </p>
                                    {item.detail ? (
                                        <Code className="mt-1 text-[0.7rem]">
                                            {item.detail}
                                        </Code>
                                    ) : null}
                                </div>
                            </div>
                            {item.href ? (
                                <Button
                                    variant={item.ok ? 'ghost' : 'outline'}
                                    size="sm"
                                    asChild
                                    className="shrink-0"
                                >
                                    <Link href={item.href}>
                                        {t('system.setup.open')}
                                        <ArrowUpRight
                                            className="size-4 rtl:-scale-x-100"
                                            aria-hidden="true"
                                        />
                                    </Link>
                                </Button>
                            ) : (
                                <span className="text-xs text-muted-foreground">
                                    {t('system.setup.not_available')}
                                </span>
                            )}
                        </li>
                    ))}
                </ul>
            </div>
        </>
    );
}

SetupChecklist.layout = () => ({
    breadcrumbs: [{ title: t('system.setup.title'), href: setup().url }],
});
