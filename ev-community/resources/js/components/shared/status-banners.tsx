import { usePage } from '@inertiajs/react';
import { AlertTriangle, Info, OctagonAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export function StatusBanners() {
    const { banners } = usePage().props;
    if (!banners || banners.length === 0) {
        return null;
    }
    return (
        <div className="flex flex-col">
            {banners.map((banner) => {
                const Icon = banner.level === 'major' ? OctagonAlert : banner.level === 'warning' ? AlertTriangle : Info;
                return (
                    <div
                        key={banner.id}
                        role="status"
                        className={cn(
                            'flex items-center gap-2 px-4 py-2 text-sm md:px-6',
                            banner.level === 'major' && 'bg-danger-soft text-danger',
                            banner.level === 'warning' && 'bg-warning-soft text-warning',
                            banner.level === 'information' && 'bg-info-soft text-info',
                        )}
                    >
                        <Icon className="size-4 shrink-0" />
                        <span>{banner.message}</span>
                    </div>
                );
            })}
        </div>
    );
}
