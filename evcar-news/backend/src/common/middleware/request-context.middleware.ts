import { Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Response } from 'express';
import { RequestContext } from '../context/request-context';
import { resolveLanguage } from '../i18n/language';
import { MarketResolverService } from '../i18n/market-resolver.service';
import type { LocalizedRequest } from '../i18n/request-locale';

function firstString(value: unknown): string | undefined {
  if (typeof value === 'string') return value;
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0];
  return undefined;
}

/**
 * Resolves language + market for every request, exposes them on `req.locale`
 * (see @Lang / @Market decorators) and runs the rest of the request inside
 * RequestContext (AsyncLocalStorage) so services and audit logging can read
 * requestId / ip / userAgent / user.
 */
@Injectable()
export class RequestContextMiddleware implements NestMiddleware {
  constructor(private readonly markets: MarketResolverService) {}

  async use(req: LocalizedRequest, res: Response, next: NextFunction): Promise<void> {
    const requestedMarket = firstString(req.query?.market) ?? firstString(req.headers['x-market']);
    const market = await this.markets.resolve(requestedMarket);
    const lang = resolveLanguage(
      firstString(req.query?.lang),
      req.headers['accept-language'],
      // The admin-chosen default (settings "defaults") — same value /app-config announces.
      await this.markets.defaultLanguage(),
    );
    req.locale = { lang, market };

    res.setHeader('Content-Language', lang);
    res.setHeader('X-Market', market);
    res.append('Vary', 'Accept-Language, X-Market');

    const ua = req.headers['user-agent'];
    RequestContext.run(
      {
        requestId: req.id ?? 'unknown',
        ip: req.ip,
        userAgent: typeof ua === 'string' ? ua.slice(0, 512) : undefined,
        lang,
        market,
      },
      () => next(),
    );
  }
}
