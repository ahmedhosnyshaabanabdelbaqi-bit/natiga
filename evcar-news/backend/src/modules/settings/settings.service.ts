import { createHash } from 'node:crypto';
import { tr } from '../../common/validation/messages';
import { HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import sharp from 'sharp';
import { AppConfig } from '../../config/app-config';
import { RequestContext } from '../../common/context/request-context';
import { MarketResolverService } from '../../common/i18n/market-resolver.service';
import type { Prisma } from '../../generated/prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ProviderRegistry } from '../../providers/provider-registry';
import { STORAGE_PROVIDER } from '../../providers/provider-tokens';
import { storageKey } from '../../providers/storage/storage-keys';
import type { StorageProvider } from '../../providers/storage/storage.types';
import { AuditService } from '../audit';
import { I18nService } from '../i18n';
import type { SettingDto } from './settings.dto';
import {
  type BrandingSettings,
  SETTING_DEFAULTS,
  SETTING_KEYS,
  SETTING_META,
  type SettingKey,
  type SettingValues,
} from './settings.types';
import { settingWarnings, validateSetting } from './settings.validation';

/** Emitted after any change that affects GET /app-config (settings, markets, currencies). */
export const CONFIG_CHANGED_EVENT = 'platform.config.changed';

const CACHE_MS = 30_000;
export const LOGO_MAX_BYTES = 1024 * 1024;
export const LOGO_MIN_PX = 64;
const LOGO_MAX_PX = 1024;

interface StoredSetting {
  value: unknown;
  valid: boolean;
  updatedAt: Date;
  updatedById: string | null;
}

export interface UploadedFileLike {
  buffer: Buffer;
  size: number;
  mimetype?: string;
  originalname?: string;
}

/**
 * Typed access to app_settings. Reads are cached for 30 s (and invalidated
 * on every write on this instance); invalid stored JSON falls back to the
 * built-in default and is reported in the admin list.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger('Settings');
  private snapshot?: { at: number; values: Map<SettingKey, StoredSetting> };
  private loading?: Promise<Map<SettingKey, StoredSetting>>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: AppConfig,
    private readonly markets: MarketResolverService,
    private readonly audit: AuditService,
    private readonly i18n: I18nService,
    private readonly events: EventEmitter2,
    private readonly providers: ProviderRegistry,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
  ) {}

  private async load(): Promise<Map<SettingKey, StoredSetting>> {
    if (this.snapshot && Date.now() - this.snapshot.at < CACHE_MS) return this.snapshot.values;
    this.loading ??= (async () => {
      const rows = await this.prisma.appSetting.findMany({
        where: { key: { in: [...SETTING_KEYS] } },
      });
      const values = new Map<SettingKey, StoredSetting>();
      for (const row of rows) {
        const key = row.key as SettingKey;
        const check = validateSetting(key, row.value, { requireHttps: false });
        if (!check.ok) this.logger.warn(`Stored setting "${key}" is invalid; using the default`);
        values.set(key, {
          value: check.ok ? check.value : row.value,
          valid: check.ok,
          updatedAt: row.updatedAt,
          updatedById: row.updatedById,
        });
      }
      this.snapshot = { at: Date.now(), values };
      return values;
    })().finally(() => {
      this.loading = undefined;
    });
    return this.loading;
  }

  /** Current typed value (stored and valid, otherwise the default). */
  async get<K extends SettingKey>(key: K): Promise<SettingValues[K]> {
    const stored = (await this.load()).get(key);
    return (stored?.valid ? stored.value : SETTING_DEFAULTS[key]) as SettingValues[K];
  }

  private view(key: SettingKey, stored: StoredSetting | undefined): SettingDto {
    const value = stored?.valid ? stored.value : SETTING_DEFAULTS[key];
    const caps = this.providers.capabilities();
    const warnings = settingWarnings(key, value, {
      routingConfigured: caps.routing,
      assistantConfigured: caps.assistant,
      isProduction: this.config.isProduction,
    });
    if (stored && !stored.valid) warnings.unshift('stored_value_invalid_default_used');
    return {
      key,
      value,
      isPublic: SETTING_META[key].isPublic,
      description: SETTING_META[key].description,
      isDefault: !stored || !stored.valid,
      warnings,
      updatedAt: stored?.updatedAt.toISOString() ?? null,
      updatedById: stored?.updatedById ?? null,
    };
  }

  async list(): Promise<SettingDto[]> {
    const values = await this.load();
    return SETTING_KEYS.map((key) => this.view(key, values.get(key)));
  }

  async getOne(key: SettingKey): Promise<SettingDto> {
    return this.view(key, (await this.load()).get(key));
  }

  /** Validates, stores and audits a new value; invalidates /app-config. */
  async set<K extends SettingKey>(
    key: K,
    raw: unknown,
    opts: { requireHttps?: boolean } = {},
  ): Promise<SettingDto> {
    const current = await this.get(key);
    let input = raw;
    if (key === 'branding') {
      // Keep the uploaded logo reference while the URL still points at it.
      const cur = current as BrandingSettings;
      const next = raw as Partial<BrandingSettings>;
      if (
        cur.logoStorageKey &&
        next &&
        next.logoUrl === cur.logoUrl &&
        !('logoStorageKey' in next)
      ) {
        input = { ...next, logoStorageKey: cur.logoStorageKey };
      }
    }
    const check = validateSetting(key, input, {
      requireHttps: opts.requireHttps ?? this.config.isProduction,
      current,
    });
    if (!check.ok) {
      throw this.i18n.error(
        'SETTING_INVALID',
        HttpStatus.UNPROCESSABLE_ENTITY,
        { key },
        check.errors,
      );
    }
    if (key === 'defaults')
      await this.assertEnabledMarket((check.value as SettingValues['defaults']).defaultMarket);

    const saved = await this.prisma.appSetting.upsert({
      where: { key },
      create: {
        key,
        value: check.value as Prisma.InputJsonValue,
        isPublic: SETTING_META[key].isPublic,
        description: SETTING_META[key].description,
        updatedById: RequestContext.get()?.userId ?? null,
      },
      update: {
        value: check.value as Prisma.InputJsonValue,
        isPublic: SETTING_META[key].isPublic,
        updatedById: RequestContext.get()?.userId ?? null,
      },
    });
    this.audit.annotate({
      entityType: 'setting',
      entityId: key,
      before: current,
      after: check.value,
    });
    this.invalidate();

    if (key === 'branding') {
      const before = current as BrandingSettings;
      const after = check.value as BrandingSettings;
      if (before.logoStorageKey && before.logoStorageKey !== after.logoStorageKey) {
        await this.storage
          .delete(before.logoStorageKey)
          .catch((err: unknown) =>
            this.logger.warn(`Could not delete the previous logo: ${(err as Error).message}`),
          );
      }
    }
    return this.view(key, {
      value: check.value,
      valid: true,
      updatedAt: saved.updatedAt,
      updatedById: saved.updatedById,
    });
  }

  /** Restores the built-in default of a key. */
  reset(key: SettingKey): Promise<SettingDto> {
    if (key === 'defaults') {
      return this.set(
        key,
        { ...SETTING_DEFAULTS.defaults, defaultMarket: this.config.i18n.defaultMarket },
        { requireHttps: false },
      );
    }
    return this.set(key, SETTING_DEFAULTS[key], { requireHttps: false });
  }

  private async assertEnabledMarket(code: string): Promise<void> {
    const market = await this.prisma.market.findUnique({
      where: { code },
      select: { enabled: true },
    });
    if (!market?.enabled) {
      throw this.i18n.error('DEFAULT_MARKET_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, {}, [
        {
          field: 'defaultMarket',
          constraints: {
            enabledMarket: tr({
              ar: 'يجب أن يكون سوقًا مفعّلًا.',
              en: 'Must be an enabled market.',
            }),
          },
        },
      ]);
    }
  }

  /**
   * Validates an uploaded logo (PNG/JPEG/WebP decoded by sharp — SVG is
   * refused), re-encodes it to a metadata-free PNG (max 1024 px) and stores
   * it as a public object, then points branding.logoUrl at it.
   */
  async uploadLogo(file: UploadedFileLike | undefined): Promise<SettingDto> {
    if (!file?.buffer?.length) {
      throw this.i18n.error('LOGO_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, { min: LOGO_MIN_PX });
    }
    if (file.size > LOGO_MAX_BYTES || file.buffer.length > LOGO_MAX_BYTES) {
      throw this.i18n.error('LOGO_TOO_LARGE', HttpStatus.PAYLOAD_TOO_LARGE, {
        maxKb: LOGO_MAX_BYTES / 1024,
      });
    }
    let png: Buffer;
    try {
      const meta = await sharp(file.buffer, {
        failOn: 'error',
        limitInputPixels: 40_000_000,
      }).metadata();
      if (
        !meta.format ||
        !['png', 'jpeg', 'webp'].includes(meta.format) ||
        !meta.width ||
        !meta.height ||
        meta.width < LOGO_MIN_PX ||
        meta.height < LOGO_MIN_PX
      ) {
        throw new Error('unsupported');
      }
      png = await sharp(file.buffer, { failOn: 'error' })
        .rotate()
        .resize({
          width: LOGO_MAX_PX,
          height: LOGO_MAX_PX,
          fit: 'inside',
          withoutEnlargement: true,
        })
        .png({ compressionLevel: 9 })
        .toBuffer();
    } catch {
      throw this.i18n.error('LOGO_INVALID', HttpStatus.UNPROCESSABLE_ENTITY, { min: LOGO_MIN_PX });
    }
    const hash = createHash('sha256').update(png).digest('hex').slice(0, 20);
    const key = storageKey('public', 'branding', `logo-${hash}.png`);
    await this.storage.put(key, png, {
      contentType: 'image/png',
      cacheControl: 'public, max-age=31536000, immutable',
    });
    const branding = await this.get('branding');
    return this.set(
      'branding',
      { ...branding, logoUrl: this.storage.publicUrl(key), logoStorageKey: key },
      { requireHttps: false },
    );
  }

  async removeLogo(): Promise<SettingDto> {
    const branding = await this.get('branding');
    return this.set(
      'branding',
      { ...branding, logoUrl: null, logoStorageKey: null },
      { requireHttps: false },
    );
  }

  invalidate(): void {
    this.snapshot = undefined;
    this.markets.invalidate();
    this.events.emit(CONFIG_CHANGED_EVENT);
  }
}
