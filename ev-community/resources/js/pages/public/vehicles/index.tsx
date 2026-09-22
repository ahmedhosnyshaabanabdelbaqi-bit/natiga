import { Head } from '@inertiajs/react';
import { Car, Search } from 'lucide-react';
import { useDeferredValue, useMemo, useState } from 'react';
import { EmptyState, NoResults } from '@/components/shared/empty-state';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { yearRange } from '@/features/vehicles/catalog';
import { VehicleSelector } from '@/features/vehicles/vehicle-selector';
import { t } from '@/lib/i18n';

type PublicModel = {
    id: number;
    slug: string;
    name: string;
    body_type: string | null;
    variants_count: number;
    years: { from: number | null; to: number | null };
};
type PublicMake = {
    id: number;
    slug: string;
    name: string;
    logo: string | null;
    models: PublicModel[];
};

type Props = { makes: PublicMake[]; generatedAt: string };

function normalize(value: string): string {
    return value
        .toLocaleLowerCase()
        .normalize('NFKD')
        .replace(/[ً-ٟ]/g, '');
}

/** /{locale}/vehicles — supported makes & models (public, indexable). */
export default function SupportedVehicles({ makes }: Props) {
    const [term, setTerm] = useState('');
    const deferred = useDeferredValue(term);

    const filtered = useMemo(() => {
        const needle = normalize(deferred.trim());
        if (needle === '') {
            return makes;
        }
        return makes
            .map((make) =>
                normalize(make.name).includes(needle)
                    ? make
                    : {
                          ...make,
                          models: make.models.filter((model) =>
                              normalize(model.name).includes(needle),
                          ),
                      },
            )
            .filter(
                (make) =>
                    make.models.length > 0 ||
                    normalize(make.name).includes(needle),
            );
    }, [makes, deferred]);

    const modelCount = makes.reduce((sum, make) => sum + make.models.length, 0);

    return (
        <>
            <Head title={t('vehicles.public.title')}>
                <meta
                    name="description"
                    content={t('vehicles.public.description')}
                />
            </Head>
            <div className="mx-auto max-w-7xl space-y-8 px-4 py-10 sm:px-6">
                <header className="space-y-3">
                    <h1 className="text-2xl font-semibold tracking-tight text-balance md:text-3xl">
                        {t('vehicles.public.title')}
                    </h1>
                    <p className="max-w-3xl text-muted-foreground">
                        {t('vehicles.public.description')}
                    </p>
                    {makes.length > 0 ? (
                        <p className="text-sm text-muted-foreground">
                            {t('vehicles.public.summary', {
                                makes: makes.length,
                                models: modelCount,
                            })}
                        </p>
                    ) : null}
                </header>

                <VehicleSelector />

                {makes.length === 0 ? (
                    <EmptyState
                        icon={Car}
                        title={t('vehicles.public.title')}
                        description={t('vehicles.public.empty')}
                    />
                ) : (
                    <section
                        aria-labelledby="supported-makes"
                        className="space-y-4"
                    >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <h2
                                id="supported-makes"
                                className="text-lg font-semibold"
                            >
                                {t('vehicles.public.makes_heading')}
                            </h2>
                            <div className="relative w-full sm:w-72">
                                <Search
                                    className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                                    aria-hidden="true"
                                />
                                <Input
                                    type="search"
                                    value={term}
                                    onChange={(event) =>
                                        setTerm(event.target.value)
                                    }
                                    placeholder={t('vehicles.public.search')}
                                    aria-label={t('vehicles.public.search')}
                                    className="ps-9"
                                />
                            </div>
                        </div>
                        {filtered.length === 0 ? (
                            <NoResults onReset={() => setTerm('')} />
                        ) : (
                            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {filtered.map((make) => (
                                    <li key={make.id}>
                                        <Card className="h-full gap-0 py-0 shadow-card">
                                            <CardHeader className="flex flex-row items-center gap-3 border-b px-4 py-3">
                                                <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border bg-white">
                                                    {make.logo ? (
                                                        <img
                                                            src={make.logo}
                                                            alt=""
                                                            className="max-h-8 max-w-8 object-contain"
                                                        />
                                                    ) : (
                                                        <Car
                                                            className="size-5 text-muted-foreground"
                                                            aria-hidden="true"
                                                        />
                                                    )}
                                                </span>
                                                <div className="min-w-0">
                                                    <CardTitle className="truncate text-base">
                                                        {make.name}
                                                    </CardTitle>
                                                    <p className="text-xs text-muted-foreground">
                                                        {t(
                                                            'vehicles.public.models_count',
                                                            {
                                                                count: make
                                                                    .models
                                                                    .length,
                                                            },
                                                        )}
                                                    </p>
                                                </div>
                                            </CardHeader>
                                            <CardContent className="px-4 py-3">
                                                <ul className="divide-y">
                                                    {make.models.map(
                                                        (model) => (
                                                            <li
                                                                key={model.id}
                                                                className="flex items-center justify-between gap-3 py-2 text-sm"
                                                            >
                                                                <span className="min-w-0">
                                                                    <span className="block truncate font-medium">
                                                                        {
                                                                            model.name
                                                                        }
                                                                    </span>
                                                                    {model.body_type ? (
                                                                        <span className="text-xs text-muted-foreground">
                                                                            {t(
                                                                                `vehicles.body_type.${model.body_type}`,
                                                                            )}
                                                                        </span>
                                                                    ) : null}
                                                                </span>
                                                                <span className="flex shrink-0 items-center gap-2">
                                                                    {model.years
                                                                        .from ? (
                                                                        <span
                                                                            className="tabular text-xs text-muted-foreground"
                                                                            dir="ltr"
                                                                        >
                                                                            {yearRange(
                                                                                model
                                                                                    .years
                                                                                    .from,
                                                                                model
                                                                                    .years
                                                                                    .to,
                                                                            )}
                                                                        </span>
                                                                    ) : null}
                                                                    <Badge variant="secondary">
                                                                        {t(
                                                                            'vehicles.public.variants_count',
                                                                            {
                                                                                count: model.variants_count,
                                                                            },
                                                                        )}
                                                                    </Badge>
                                                                </span>
                                                            </li>
                                                        ),
                                                    )}
                                                </ul>
                                            </CardContent>
                                        </Card>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </section>
                )}
                <p className="text-xs text-muted-foreground">
                    {t('vehicles.hints.spec_approximate')}
                </p>
            </div>
        </>
    );
}
