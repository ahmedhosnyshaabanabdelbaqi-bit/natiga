import {
  HttpStatus,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import type { SupportedLanguage } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import type { LocalizedText } from '../../common/i18n/localized-text';
import { PrismaService } from '../../prisma/prisma.service';
import {
  type MessageParams,
  SERVER_NAMESPACES,
  serverMessage,
  serverMessageText,
  setOverrideLookup,
} from './server-messages';

const REFRESH_MS = 60_000;

export interface LocalizedNotification {
  title: string;
  body: string;
}

/**
 * Server-side messages in ar/en with admin overrides (translations table,
 * namespaces errors / notifications / labels):
 *
 *   throw this.i18n.error('MARKET_IN_USE', 409, { code: 'EG' });
 *   const { title, body } = this.i18n.notification('price_changed', user.locale, {...});
 *   this.i18n.t('labels.not_available', 'ar');
 *
 * Overrides are cached in memory, refreshed every minute and immediately
 * after admin edits on this instance.
 */
@Injectable()
export class I18nService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('I18n');
  private overrides = new Map<string, string>();
  private loadedAt = 0;
  private loading?: Promise<void>;

  constructor(private readonly prisma: PrismaService) {}

  onModuleInit(): void {
    setOverrideLookup((lang, fullKey) => {
      if (Date.now() - this.loadedAt > REFRESH_MS) void this.refresh();
      return this.overrides.get(`${lang}\u0000${fullKey}`);
    });
    void this.refresh();
  }

  onModuleDestroy(): void {
    setOverrideLookup(() => undefined);
  }

  /** Reloads overrides of the server namespaces (never throws). */
  refresh(): Promise<void> {
    this.loading ??= this.load().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  private async load(): Promise<void> {
    try {
      const rows = await this.prisma.translation.findMany({
        where: { namespace: { in: [...SERVER_NAMESPACES] } },
        select: { namespace: true, key: true, locale: true, value: true },
      });
      const next = new Map<string, string>();
      for (const r of rows) next.set(`${r.locale}\u0000${r.namespace}.${r.key}`, r.value);
      this.overrides = next;
      this.loadedAt = Date.now();
    } catch (err) {
      // Keep serving the catalogs; retry in ~10 s.
      this.loadedAt = Date.now() - REFRESH_MS + 10_000;
      this.logger.warn(`Could not load translation overrides: ${(err as Error).message}`);
    }
  }

  /** Text of "<namespace>.<key>" in `lang` (falls back to English, then the key). */
  t(fullKey: string, lang: string, params?: MessageParams): string {
    const l: SupportedLanguage = lang?.toLowerCase().startsWith('en') ? 'en' : 'ar';
    return serverMessageText(fullKey, l, params) ?? fullKey;
  }

  /** Both languages (for AppException messages). */
  text(fullKey: string, params?: MessageParams): LocalizedText {
    return serverMessage(fullKey, params);
  }

  /** AppException whose message comes from `errors.<code>` (overrides applied). */
  error(
    code: string,
    status: HttpStatus | number,
    params?: MessageParams,
    details?: unknown,
    headers?: Record<string, string>,
  ): AppException {
    return new AppException({
      status,
      code,
      message: serverMessage(`errors.${code}`, params),
      details,
      headers,
    });
  }

  /** Title/body of `notifications.<template>.title|body` in the recipient's language. */
  notification(template: string, lang: string, params?: MessageParams): LocalizedNotification {
    return {
      title: this.t(`notifications.${template}.title`, lang, params),
      body: this.t(`notifications.${template}.body`, lang, params),
    };
  }
}
