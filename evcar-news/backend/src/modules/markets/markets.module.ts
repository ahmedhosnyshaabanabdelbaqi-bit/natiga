import { Module } from '@nestjs/common';
import {
  AdminCurrenciesController,
  AdminMarketsController,
  MarketsController,
} from './markets.controller';
import { MarketsService } from './markets.service';

/**
 * Markets (countries) and currencies:
 *   GET /api/v1/markets[/:code]            public, enabled markets (ETag)
 *   /api/v1/admin/markets[/:code]           markets.write (read also settings.read)
 *   /api/v1/admin/currencies[/:code]        markets.write (read also settings.read)
 * Changes invalidate MarketResolverService and /app-config.
 */
@Module({
  controllers: [MarketsController, AdminMarketsController, AdminCurrenciesController],
  providers: [MarketsService],
  exports: [MarketsService],
})
export class MarketsModule {}
