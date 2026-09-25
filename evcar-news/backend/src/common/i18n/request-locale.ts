import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { ApiHeader, ApiQuery } from '@nestjs/swagger';
import { applyDecorators } from '@nestjs/common';
import type { Request } from 'express';
import type { SupportedLanguage } from '../../config/app-config';

export interface RequestLocale {
  lang: SupportedLanguage;
  market: string;
}

export type LocalizedRequest = Request & { locale?: RequestLocale; id?: string };

function localeOf(ctx: ExecutionContext): RequestLocale {
  const req = ctx.switchToHttp().getRequest<LocalizedRequest>();
  if (!req.locale) {
    throw new Error('Request locale not resolved: RequestContextMiddleware did not run');
  }
  return req.locale;
}

/** Resolved content language ('ar' | 'en'). */
export const Lang = createParamDecorator((_: unknown, ctx: ExecutionContext) => localeOf(ctx).lang);

/** Resolved market code (e.g. 'EG'). */
export const Market = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => localeOf(ctx).market,
);

/** Both { lang, market }. */
export const ReqLocale = createParamDecorator((_: unknown, ctx: ExecutionContext) => localeOf(ctx));

/**
 * Documents ?lang / Accept-Language / ?market / X-Market in OpenAPI for an
 * endpoint or controller. Resolution itself happens globally.
 */
export function ApiLocale() {
  return applyDecorators(
    ApiQuery({
      name: 'lang',
      required: false,
      enum: ['ar', 'en'],
      description: 'Overrides Accept-Language. Default ar.',
    }),
    ApiQuery({
      name: 'market',
      required: false,
      description: 'Market code (e.g. EG). Overrides X-Market.',
    }),
    ApiHeader({ name: 'Accept-Language', required: false }),
    ApiHeader({ name: 'X-Market', required: false }),
  );
}
