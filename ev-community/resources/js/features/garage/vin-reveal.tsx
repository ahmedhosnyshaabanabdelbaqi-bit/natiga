import { useHttp } from '@inertiajs/react';
import { Eye, EyeOff } from 'lucide-react';
import { useState } from 'react';
import { CopyButton } from '@/components/shared/copy-button';
import { Button } from '@/components/ui/button';
import { Code } from '@/components/ui/code';
import { Spinner } from '@/components/ui/spinner';
import { t } from '@/lib/i18n';
import { reveal } from '@/routes/member/garage/vin';

type Props = { vehicleId: string; masked: string | null };

/**
 * Masked VIN (last 4 characters) with an owner-only "reveal" that fetches the decrypted VIN on demand.
 * Every reveal is audited server-side (`vehicles.vin_revealed`) and rate limited; the VIN is kept in
 * component state only (never stored in the browser).
 */
export function VinReveal({ vehicleId, masked }: Props) {
    const http = useHttp<
        Record<string, never>,
        { data: { vin: string | null } }
    >({});
    const [vin, setVin] = useState<string | null>(null);
    const [failed, setFailed] = useState(false);

    if (!masked) {
        return (
            <span className="text-sm text-muted-foreground">
                {t('garage.info.no_vin')}
            </span>
        );
    }

    const show = () => {
        setFailed(false);
        http.post(reveal(vehicleId).url, {
            onSuccess: (response) => setVin(response.data.vin),
            onHttpException: () => {
                setFailed(true);
                return false;
            },
            onNetworkError: () => {
                setFailed(true);
                return false;
            },
        }).catch(() => undefined);
    };

    return (
        <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
                <Code
                    aria-label={
                        vin
                            ? t('vehicles.fields.vin')
                            : t('garage.info.vin_hidden')
                    }
                >
                    {vin ?? masked}
                </Code>
                {vin ? (
                    <>
                        <CopyButton value={vin} />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => setVin(null)}
                        >
                            <EyeOff className="size-4" aria-hidden="true" />
                            {t('garage.info.hide_vin')}
                        </Button>
                    </>
                ) : (
                    <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={show}
                        disabled={http.processing}
                    >
                        {http.processing ? (
                            <Spinner />
                        ) : (
                            <Eye className="size-4" aria-hidden="true" />
                        )}
                        {t('garage.info.reveal_vin')}
                    </Button>
                )}
            </div>
            <p className="text-xs text-muted-foreground">
                {failed
                    ? t('garage.info.reveal_failed')
                    : t('garage.info.reveal_audited')}
            </p>
        </div>
    );
}
