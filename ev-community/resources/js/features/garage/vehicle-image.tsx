import { Car } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Vehicle photo (authorized download URL) or a neutral placeholder with the make logo when available. */
export function VehicleImage({
    src,
    logo,
    alt,
    className,
}: {
    src: string | null;
    logo?: string | null;
    alt: string;
    className?: string;
}) {
    if (src) {
        return (
            <img
                src={src}
                alt={alt}
                loading="lazy"
                className={cn('size-full object-cover', className)}
            />
        );
    }
    return (
        <div
            className={cn(
                'flex size-full items-center justify-center bg-muted text-muted-foreground',
                className,
            )}
            aria-hidden="true"
        >
            {logo ? (
                <img
                    src={logo}
                    alt=""
                    className="max-h-12 max-w-24 object-contain opacity-80"
                />
            ) : (
                <Car className="size-10" />
            )}
        </div>
    );
}
