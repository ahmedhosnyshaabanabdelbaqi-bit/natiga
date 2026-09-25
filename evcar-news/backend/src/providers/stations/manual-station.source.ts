import { AppException } from '../../common/errors/app.exception';
import type { ProviderCheckResult } from '../provider-check';
import type { ProviderStatus } from '../provider-status';
import type { SourceLicence, StationSource, StationSourcePage } from './station-source.types';
import { serverMessage } from '../../modules/i18n/server-messages';

/**
 * Stations entered and verified by admins (and reviewed user suggestions)
 * in the stations module. Always available; it has nothing to synchronise,
 * so fetchPage() is refused explicitly instead of returning an empty page.
 */
export class ManualStationSource implements StationSource {
  readonly key = 'manual' as const;
  readonly displayName = 'Manual (admin-verified)';
  readonly supportsSync = false;
  readonly licence: SourceLicence = {
    providerName: 'EV Car News',
    providerUrl: null,
    licence: null,
    isOpenData: null,
    attribution: 'EV Car News editorial data',
  };

  status(): ProviderStatus {
    return {
      type: 'stations',
      name: 'manual',
      configured: true,
      notes: ['Admins add and verify stations in the stations module; no external sync.'],
    };
  }

  fetchPage(): Promise<StationSourcePage> {
    return Promise.reject(
      AppException.badRequest(
        serverMessage('errors.SOURCE_NOT_SYNCABLE'),
        { source: 'manual' },
        'SOURCE_NOT_SYNCABLE',
      ),
    );
  }

  check(): Promise<ProviderCheckResult> {
    return Promise.resolve({ ok: true, latencyMs: 0 });
  }
}
