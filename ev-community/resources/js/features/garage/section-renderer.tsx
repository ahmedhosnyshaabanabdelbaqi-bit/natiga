import { LayoutGrid } from 'lucide-react';
import type { ComponentType, LazyExoticComponent } from 'react';
import { lazy, Suspense } from 'react';
import { EmptyState } from '@/components/shared/empty-state';
import { ErrorState } from '@/components/shared/error-state';
import { SkeletonCards } from '@/components/shared/skeletons';
import type {
    GarageSectionProps,
    GarageVehicleDetail,
} from '@/features/garage/types';
import { t } from '@/lib/i18n';

type SectionComponent = ComponentType<GarageSectionProps>;

/**
 * Section components are discovered by file name: `sections/<key>.tsx` (default export) renders the
 * section registered server-side with `GarageSections::register('<key>', ...)`. Each file is its own
 * chunk, loaded only when its tab is opened. Keys without a component get the generic fallback.
 */
const loaders = import.meta.glob<{ default: SectionComponent }>(
    './sections/*.tsx',
);
const components = new Map<string, LazyExoticComponent<SectionComponent>>();

function componentFor(
    key: string,
): LazyExoticComponent<SectionComponent> | null {
    const loader = loaders[`./sections/${key}.tsx`];
    if (!loader) {
        return null;
    }
    let component = components.get(key);
    if (!component) {
        component = lazy(loader);
        components.set(key, component);
    }
    return component;
}

export function hasSectionComponent(key: string): boolean {
    return loaders[`./sections/${key}.tsx`] !== undefined;
}

export function SectionSkeleton() {
    return <SkeletonCards count={2} className="lg:grid-cols-2" />;
}

type Props = {
    sectionKey: string;
    label: string;
    /** undefined = still loading; null = nothing for this vehicle; `{ error }` = resolver failed. */
    data: Record<string, unknown> | null | undefined;
    vehicle: GarageVehicleDetail;
    canUpdate: boolean;
    onRetry: () => void;
};

export function GarageSectionRenderer({
    sectionKey,
    label,
    data,
    vehicle,
    canUpdate,
    onRetry,
}: Props) {
    if (data === undefined) {
        return <SectionSkeleton />;
    }
    if (data !== null && typeof data.error === 'string') {
        return (
            <ErrorState
                title={t('garage.section.error')}
                description={data.error}
                onRetry={onRetry}
            />
        );
    }
    if (data === null) {
        return (
            <EmptyState
                icon={LayoutGrid}
                title={label}
                description={t('garage.section.empty')}
            />
        );
    }
    const Component = componentFor(sectionKey);
    if (!Component) {
        return <SectionFallback label={label} />;
    }
    return (
        <Suspense fallback={<SectionSkeleton />}>
            <Component data={data} vehicle={vehicle} canUpdate={canUpdate} />
        </Suspense>
    );
}

/** Generic fallback for a registered section whose module has not shipped its React component yet. */
export function SectionFallback({ label }: { label: string }) {
    return (
        <EmptyState
            icon={LayoutGrid}
            title={label}
            description={t('garage.section.placeholder')}
        />
    );
}
