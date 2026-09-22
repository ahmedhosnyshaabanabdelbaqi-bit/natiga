import { Head, router } from '@inertiajs/react';
import { CheckCircle2, FlaskConical, Lock, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';
import { EmptyState } from '@/components/shared/empty-state';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { StatusBadge } from '@/components/shared/status-badge';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Code } from '@/components/ui/code';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { pick } from '@/features/system/i18n';
import { PageErrors } from '@/features/system/page-errors';
import type { ModuleItem } from '@/features/system/types';
import { formatNumber } from '@/lib/format';
import { t } from '@/lib/i18n';
import { index as modulesIndex, review, update } from '@/routes/admin/modules';

type Props = {
    modules: ModuleItem[];
    reviewed: boolean;
};

type StateFilter = 'all' | 'enabled' | 'disabled' | 'core' | 'optional';

export default function ModulesIndex({ modules, reviewed }: Props) {
    const [query, setQuery] = useState('');
    const [state, setState] = useState<StateFilter>('all');
    const [pending, setPending] = useState<{ module: ModuleItem; enabled: boolean } | null>(null);
    const [confirmReview, setConfirmReview] = useState(false);

    const enabledCount = modules.filter((module) => module.enabled).length;
    const visible = useMemo(() => {
        const needle = query.trim().toLowerCase();
        return modules.filter((module) => {
            if (state === 'enabled' && !module.enabled) return false;
            if (state === 'disabled' && module.enabled) return false;
            if (state === 'core' && !module.core) return false;
            if (state === 'optional' && module.core) return false;
            if (needle === '') return true;
            return [module.key, module.name.ar, module.name.en].some((value) => value.toLowerCase().includes(needle));
        });
    }, [modules, query, state]);

    const toggle = (reason?: string) =>
        new Promise<void>((resolve) => {
            if (!pending) {
                resolve();
                return;
            }
            router.put(
                update(pending.module.key).url,
                { enabled: pending.enabled, reason: reason ?? '' },
                {
                    preserveScroll: true,
                    onFinish: () => {
                        resolve();
                        setPending(null);
                    },
                },
            );
        });

    const pendingName = pending ? pick(pending.module.name) : '';

    return (
        <>
            <Head title={t('system.modules.title')} />
            <div className="grid gap-6">
                <PageHeader title={t('system.modules.title')} description={t('system.modules.description')}>
                    <p className="mt-2 text-sm text-muted-foreground tabular">{t('system.modules.labels.count', { enabled: formatNumber(enabledCount, 0), total: formatNumber(modules.length, 0) })}</p>
                </PageHeader>

                <PageErrors />

                {reviewed ? (
                    <InlineAlert tone="success" icon={CheckCircle2} title={t('system.modules.review.done')} />
                ) : (
                    <InlineAlert
                        tone="info"
                        title={t('system.modules.review.title')}
                        action={
                            <Button size="sm" onClick={() => setConfirmReview(true)}>
                                {t('system.modules.review.action')}
                            </Button>
                        }
                    >
                        {t('system.modules.review.description')}
                    </InlineAlert>
                )}

                <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                    <div className="relative sm:w-72">
                        <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
                        <Input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('system.modules.labels.search')} aria-label={t('system.modules.labels.search')} className="ps-9" />
                    </div>
                    <Select value={state} onValueChange={(value) => setState(value as StateFilter)}>
                        <SelectTrigger className="sm:w-44" aria-label={t('system.modules.filters.state')}>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">{t('ui.filters.all')}</SelectItem>
                            <SelectItem value="enabled">{t('system.modules.filters.enabled')}</SelectItem>
                            <SelectItem value="disabled">{t('system.modules.filters.disabled')}</SelectItem>
                            <SelectItem value="core">{t('system.modules.filters.core')}</SelectItem>
                            <SelectItem value="optional">{t('system.modules.filters.optional')}</SelectItem>
                        </SelectContent>
                    </Select>
                </div>

                {visible.length === 0 ? (
                    <EmptyState title={t('system.modules.empty')} />
                ) : (
                    <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {visible.map((module) => {
                            const name = pick(module.name);
                            const switchControl = (
                                <Switch
                                    checked={module.enabled}
                                    disabled={module.core}
                                    onCheckedChange={(checked) => setPending({ module, enabled: checked })}
                                    aria-label={t('system.modules.labels.toggle', { module: name })}
                                />
                            );
                            return (
                                <li key={module.key}>
                                    <Card className="h-full shadow-card">
                                        <CardContent className="flex items-start justify-between gap-3 p-4">
                                            <div className="min-w-0 space-y-2">
                                                <p className="font-medium break-words">{name}</p>
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    <Code className="text-[0.7rem]">{module.key}</Code>
                                                    <StatusBadge status={module.enabled ? 'active' : 'disabled'} label={module.enabled ? t('system.modules.labels.enabled') : t('system.modules.labels.disabled')} />
                                                    {module.core ? (
                                                        <Badge variant="secondary" className="gap-1 font-normal">
                                                            <Lock className="size-3" aria-hidden="true" />
                                                            {t('system.modules.labels.core')}
                                                        </Badge>
                                                    ) : null}
                                                    {module.experimental ? (
                                                        <Badge variant="outline" className="gap-1 border-warning/40 font-normal text-warning">
                                                            <FlaskConical className="size-3" aria-hidden="true" />
                                                            {t('system.modules.labels.experimental')}
                                                        </Badge>
                                                    ) : null}
                                                </div>
                                            </div>
                                            {module.core ? (
                                                <Tooltip>
                                                    <TooltipTrigger asChild>
                                                        <span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:outline-none">
                                                            {switchControl}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent>{t('system.modules.labels.locked')}</TooltipContent>
                                                </Tooltip>
                                            ) : (
                                                switchControl
                                            )}
                                        </CardContent>
                                    </Card>
                                </li>
                            );
                        })}
                    </ul>
                )}
            </div>

            <ConfirmDialog
                open={pending !== null}
                onOpenChange={(open) => (!open ? setPending(null) : undefined)}
                title={pending?.enabled ? t('system.modules.confirm.enable_title', { module: pendingName }) : t('system.modules.confirm.disable_title', { module: pendingName })}
                description={pending?.enabled ? t('system.modules.confirm.enable_description') : t('system.modules.confirm.disable_description')}
                confirmLabel={pending?.enabled ? t('core.actions.enable') : t('core.actions.disable')}
                destructive={pending?.enabled === false}
                requireReason
                onConfirm={toggle}
            >
                {pending?.enabled && pending.module.experimental ? <InlineAlert tone="warning">{t('system.modules.confirm.experimental_warning')}</InlineAlert> : null}
            </ConfirmDialog>

            <ConfirmDialog
                open={confirmReview}
                onOpenChange={setConfirmReview}
                title={t('system.modules.review.title')}
                description={t('system.modules.review.description')}
                confirmLabel={t('system.modules.review.action')}
                onConfirm={() =>
                    new Promise<void>((resolve) => {
                        router.post(
                            review().url,
                            {},
                            {
                                preserveScroll: true,
                                onFinish: () => {
                                    resolve();
                                    setConfirmReview(false);
                                },
                            },
                        );
                    })
                }
            />
        </>
    );
}

ModulesIndex.layout = () => ({
    breadcrumbs: [
        { title: t('admin.nav.system'), href: modulesIndex().url },
        { title: t('system.modules.title'), href: modulesIndex().url },
    ],
});
