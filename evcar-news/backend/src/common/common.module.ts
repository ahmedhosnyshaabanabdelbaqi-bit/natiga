import { Global, Module } from '@nestjs/common';
import { MarketResolverService } from './i18n/market-resolver.service';
import { RequestContextMiddleware } from './middleware/request-context.middleware';
import { SafeFetchService } from './security/safe-fetch.service';

/** Global cross-cutting services available to every module. */
@Global()
@Module({
  providers: [MarketResolverService, SafeFetchService, RequestContextMiddleware],
  exports: [MarketResolverService, SafeFetchService, RequestContextMiddleware],
})
export class CommonModule {}
