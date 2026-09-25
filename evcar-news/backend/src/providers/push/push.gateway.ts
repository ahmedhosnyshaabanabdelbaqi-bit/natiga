import type { ProviderStatus } from '../provider-status';
import type { ApnsPushChannel } from './apns-push.channel';
import type { FcmPushChannel } from './fcm-push.channel';
import type {
  PushChannel,
  PushMessage,
  PushProviderName,
  PushSendOutcome,
  PushTarget,
} from './push.types';

/**
 * Entry point for the notifications module (inject PUSH_GATEWAY). Routes
 * each device token to its provider; tokens of unconfigured providers come
 * back as `not_configured` (store the delivery as "skipped"), never as sent.
 * The in-app notification center does not depend on push and always works.
 */
export class PushGateway {
  private readonly channels: Record<PushProviderName, PushChannel>;

  constructor(fcm: FcmPushChannel, apns: ApnsPushChannel) {
    this.channels = { fcm, apns };
  }

  channel(name: PushProviderName): PushChannel {
    return this.channels[name];
  }

  /** true when at least one push provider can deliver. */
  get anyConfigured(): boolean {
    return Object.values(this.channels).some((c) => c.configured);
  }

  async send(targets: PushTarget[], message: PushMessage): Promise<PushSendOutcome[]> {
    const byProvider = new Map<PushProviderName, string[]>();
    for (const t of targets) {
      const list = byProvider.get(t.provider) ?? [];
      list.push(t.token);
      byProvider.set(t.provider, list);
    }
    const results = await Promise.all(
      [...byProvider.entries()].map(([provider, tokens]) =>
        this.channels[provider].send(tokens, message),
      ),
    );
    return results.flat();
  }

  statuses(): ProviderStatus[] {
    return [
      this.channels.fcm.status() as ProviderStatus,
      this.channels.apns.status() as ProviderStatus,
      {
        type: 'push',
        name: 'in_app',
        configured: true,
        notes: ['The in-app notification center works without any push provider.'],
      },
    ];
  }
}
