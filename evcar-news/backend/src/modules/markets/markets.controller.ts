import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../config/app-config';
import { AppException } from '../../common/errors/app.exception';
import { ok, type DataResponse, listOf, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang } from '../../common/i18n/request-locale';
import {
  ApiDataResponse,
  ApiErrorResponses,
  ApiDataListResponse,
} from '../../common/swagger/api-responses';
import { Public } from '../auth';
import { RequireAnyPermission, RequirePermissions } from '../rbac';
import {
  AdminMarketDto,
  CreateCurrencyDto,
  CreateMarketDto,
  CURRENCY_CODE_RE,
  CurrencyDto,
  MARKET_CODE_RE,
  PublicMarketDto,
  UpdateCurrencyDto,
  UpdateMarketDto,
} from './markets.dto';
import { MarketsService } from './markets.service';

function marketCode(raw: string): string {
  const code = raw.toUpperCase();
  if (!MARKET_CODE_RE.test(code)) throw AppException.notFound();
  return code;
}

function currencyCode(raw: string): string {
  const code = raw.toUpperCase();
  if (!CURRENCY_CODE_RE.test(code)) throw AppException.notFound();
  return code;
}

@ApiTags('markets')
@Controller('markets')
export class MarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get()
  @Public()
  @ApiLocale()
  @ApiOperation({ summary: 'Enabled markets with their currency (names in the request language)' })
  @ApiDataListResponse(PublicMarketDto)
  async list(
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<PublicMarketDto>> {
    const { body, etag } = await this.markets.listPublic(lang);
    res.setHeader('ETag', etag);
    res.setHeader('Cache-Control', 'public, max-age=300, stale-while-revalidate=600');
    return listOf(body);
  }

  @Get(':code')
  @Public()
  @ApiLocale()
  @ApiDataResponse(PublicMarketDto)
  @ApiErrorResponses(404)
  async get(
    @Param('code') code: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<DataResponse<PublicMarketDto>> {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return ok(await this.markets.getPublic(marketCode(code), lang));
  }
}

@ApiTags('admin-markets')
@ApiErrorResponses(401, 403)
@Controller('admin/markets')
export class AdminMarketsController {
  constructor(private readonly markets: MarketsService) {}

  @Get()
  @RequireAnyPermission('markets.write', 'settings.read')
  @ApiOperation({ summary: 'All markets including disabled ones' })
  @ApiDataListResponse(AdminMarketDto)
  async list(
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<AdminMarketDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return listOf(await this.markets.listAdmin());
  }

  @Get(':code')
  @RequireAnyPermission('markets.write', 'settings.read')
  @ApiOperation({ summary: 'One market with its usage counts' })
  @ApiDataResponse(AdminMarketDto)
  @ApiErrorResponses(404)
  async get(@Param('code') code: string): Promise<DataResponse<AdminMarketDto>> {
    return ok(await this.markets.getAdmin(marketCode(code)));
  }

  @Post()
  @RequirePermissions('markets.write')
  @ApiOperation({ summary: 'Adds a country (starts disabled unless enabled=true)' })
  @ApiDataResponse(AdminMarketDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateMarketDto): Promise<DataResponse<AdminMarketDto>> {
    return ok(await this.markets.create(dto));
  }

  @Patch(':code')
  @RequirePermissions('markets.write')
  @ApiOperation({ summary: 'Edits / enables / disables a market (the default cannot be disabled)' })
  @ApiDataResponse(AdminMarketDto)
  @ApiErrorResponses(404, 409, 422)
  async update(
    @Param('code') code: string,
    @Body() dto: UpdateMarketDto,
  ): Promise<DataResponse<AdminMarketDto>> {
    return ok(await this.markets.update(marketCode(code), dto));
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('markets.write')
  @ApiOperation({ summary: 'Deletes an unused market (otherwise 409 MARKET_IN_USE: disable it)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('code') code: string): Promise<void> {
    await this.markets.remove(marketCode(code));
  }
}

@ApiTags('admin-markets')
@ApiErrorResponses(401, 403)
@Controller('admin/currencies')
export class AdminCurrenciesController {
  constructor(private readonly markets: MarketsService) {}

  @Get()
  @RequireAnyPermission('markets.write', 'settings.read')
  @ApiDataListResponse(CurrencyDto)
  async list(@Res({ passthrough: true }) res: Response): Promise<PaginatedResponse<CurrencyDto>> {
    res.setHeader('Cache-Control', 'no-store');
    return listOf(await this.markets.listCurrencies());
  }

  @Post()
  @RequirePermissions('markets.write')
  @ApiDataResponse(CurrencyDto)
  @ApiErrorResponses(409, 422)
  async create(@Body() dto: CreateCurrencyDto): Promise<DataResponse<CurrencyDto>> {
    return ok(await this.markets.createCurrency(dto));
  }

  @Patch(':code')
  @RequirePermissions('markets.write')
  @ApiDataResponse(CurrencyDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('code') code: string,
    @Body() dto: UpdateCurrencyDto,
  ): Promise<DataResponse<CurrencyDto>> {
    return ok(await this.markets.updateCurrency(currencyCode(code), dto));
  }

  @Delete(':code')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('markets.write')
  @ApiOperation({ summary: 'Deletes an unused currency (otherwise 409 CURRENCY_IN_USE)' })
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(@Param('code') code: string): Promise<void> {
    await this.markets.removeCurrency(currencyCode(code));
  }
}
