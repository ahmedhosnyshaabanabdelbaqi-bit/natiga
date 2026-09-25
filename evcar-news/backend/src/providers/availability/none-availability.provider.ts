import type { ProviderStatus } from '../provider-status';
import type {
  AvailabilityProvider,
  AvailabilityReading,
  AvailabilityTarget,
} from './availability.types';

/**
 * Default: no live availability source is integrated, so every connector's
 * live status is `unknown` (never "available" by default).
 */
export class NoneAvailabilityProvider implements AvailabilityProvider {
  readonly name = 'none';
  readonly isLive = false;

  status(): ProviderStatus {
    return {
      type: 'availability',
      name: 'none',
      configured: false,
      reason:
        'No live availability provider (OCPI / operator feed) is integrated; live status is shown as unknown.',
    };
  }

  getAvailability(targets: AvailabilityTarget[]): Promise<AvailabilityReading[]> {
    return Promise.resolve(
      targets.map((target) => ({
        target,
        status: 'unknown' as const,
        observedAt: null,
        expiresAt: null,
        source: null,
      })),
    );
  }
}
