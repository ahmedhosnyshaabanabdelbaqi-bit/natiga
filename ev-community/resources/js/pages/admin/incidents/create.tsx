import { Head, Link, useForm } from '@inertiajs/react';
import { Siren } from 'lucide-react';
import { FormActions } from '@/components/shared/form-field';
import { InlineAlert } from '@/components/shared/inline-alert';
import { PageHeader } from '@/components/shared/page-header';
import { SectionCard } from '@/components/shared/section-card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import type { IncidentFormData } from '@/features/operations/incident-fields';
import { IncidentFields } from '@/features/operations/incident-fields';
import type { ModuleOption, PersonRef, Severity } from '@/features/operations/types';
import { toCairoInput } from '@/features/system/i18n';
import { t } from '@/lib/i18n';
import { create, index as incidentsIndex, store } from '@/routes/admin/incidents';

type Props = {
    owners: PersonRef[];
    modules: ModuleOption[];
    severities: Severity[];
};

export default function IncidentsCreate({ owners, modules, severities }: Props) {
    const now = toCairoInput(new Date().toISOString());
    const form = useForm<IncidentFormData>({ title: '', severity: 'p2', affected_module: '', impact: '', started_at: now, detected_at: now, owner: '' });
    const errors = form.errors as Record<string, string | undefined>;

    return (
        <>
            <Head title={t('operations.incidents.create.title')} />
            <form
                className="grid gap-6"
                onSubmit={(event) => {
                    event.preventDefault();
                    form.submit(store());
                }}
                noValidate
            >
                <PageHeader title={t('operations.incidents.create.title')} description={t('operations.incidents.create.description')} />
                {errors.domain ? <InlineAlert tone="danger">{errors.domain}</InlineAlert> : null}
                <SectionCard>
                    <IncidentFields data={form.data} errors={form.errors} onChange={(key, value) => form.setData(key, value)} owners={owners} modules={modules} severities={severities} creating />
                </SectionCard>
                <FormActions>
                    <Button type="button" variant="ghost" asChild>
                        <Link href={incidentsIndex().url}>{t('core.actions.cancel')}</Link>
                    </Button>
                    <Button type="submit" disabled={form.processing}>
                        {form.processing ? <Spinner /> : <Siren className="size-4" aria-hidden="true" />}
                        {t('operations.incidents.create.submit')}
                    </Button>
                </FormActions>
            </form>
        </>
    );
}

IncidentsCreate.layout = () => ({
    breadcrumbs: [
        { title: t('operations.incidents.title'), href: incidentsIndex().url },
        { title: t('operations.incidents.create.title'), href: create().url },
    ],
});
