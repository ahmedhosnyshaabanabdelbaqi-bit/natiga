import { Code } from '@/components/ui/code';
import { hasTranslation, t } from '@/lib/i18n';

/**
 * Integration category label. `integration_events.provider` may also hold a vendor-specific name
 * logged by another module (`IntegrationCall::run('paymob', ...)`): unknown names are shown as a code.
 */
export function ProviderName({ provider }: { provider: string }) {
    const key = `integrations.categories.${provider}`;
    return hasTranslation(key) ? <>{t(key)}</> : <Code>{provider}</Code>;
}
