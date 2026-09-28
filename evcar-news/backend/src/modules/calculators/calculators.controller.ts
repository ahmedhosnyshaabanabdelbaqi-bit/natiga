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
  Query,
  Res,
} from '@nestjs/common';
import { ApiNoContentResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import type { SupportedLanguage } from '../../config/app-config';
import { listOf, ok, type DataResponse, type PaginatedResponse } from '../../common/http/responses';
import { ApiLocale, Lang, Market } from '../../common/i18n/request-locale';
import {
  ApiDataListResponse,
  ApiDataResponse,
  ApiErrorResponses,
  ApiPaginatedResponse,
} from '../../common/swagger/api-responses';
import { RateLimit } from '../../common/throttle/rate-limit.decorator';
import { CurrentUser, Public, type AuthUser } from '../auth';
import { RequireAnyPermission, RequirePermissions } from '../rbac';
import { UuidParamPipe } from '../system/uuid-param.pipe';
import { type CalculatorResponse, CalculatorsService } from './calculators.service';
import {
  CalcOutputDto,
  ChargeCostDto,
  ChargeTimeDto,
  CostPer100kmDto,
  MonthlyCostDto,
  ReferencePriceDto,
  TcoDto,
  VsFuelDto,
} from './dto/calculators.dto';
import {
  AdminEnergyPriceQueryDto,
  CreateEnergyPriceDto,
  UpdateEnergyPriceDto,
} from './dto/energy-prices.dto';
import { EnergyPricesService } from './energy-prices.service';

const DESCRIPTION =
  'Pure calculation from the values in the body (no stored data). Optional `variantId` / `userVehicleId` fill missing car values from the catalog; `referencePriceIds` use admin reference prices (with date + source). There are no default prices. Output: result + formula + steps + assumptions (origin user|default|catalog|reference_price) + warnings + confidence + units. Invalid / missing / zero / negative input → 422 VALIDATION_FAILED with field details.';

/** Public calculators (REQUIREMENTS §13). Guests can use them. */
@ApiTags('calculators')
@Controller('calculators')
@Public()
@ApiLocale()
@RateLimit('search')
export class CalculatorsController {
  constructor(
    private readonly calc: CalculatorsService,
    private readonly prices: EnergyPricesService,
  ) {}

  private ctx(market: string, lang: SupportedLanguage, user?: AuthUser) {
    return { market, lang, userId: user?.id };
  }

  @Get('reference-prices')
  @ApiOperation({
    summary:
      'Admin reference electricity / fuel prices of the market (each with effective date + source)',
    description:
      'Empty when none were entered. Never present these as "current": show `effectiveFrom`, the source, and `possiblyOutdated`.',
  })
  @ApiDataListResponse(ReferencePriceDto)
  async referencePrices(
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @Res({ passthrough: true }) res: Response,
  ): Promise<PaginatedResponse<unknown>> {
    res.setHeader('Cache-Control', 'public, max-age=300');
    return listOf(await this.prices.listReference(market, lang));
  }

  @Post('charge-cost')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Charging session cost (home / public)', description: DESCRIPTION })
  @ApiDataResponse(CalcOutputDto)
  @ApiErrorResponses(422)
  async chargeCost(
    @Body() dto: ChargeCostDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<CalculatorResponse>> {
    return ok(await this.calc.chargeCost(dto, this.ctx(market, lang, user)));
  }

  @Post('charge-time')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Charging duration (AC limits / DC curve or low-confidence range)',
    description: DESCRIPTION,
  })
  @ApiDataResponse(CalcOutputDto)
  @ApiErrorResponses(422)
  async chargeTime(
    @Body() dto: ChargeTimeDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<CalculatorResponse>> {
    return ok(await this.calc.chargeTime(dto, this.ctx(market, lang, user)));
  }

  @Post('cost-per-100km')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Energy cost per 100 km', description: DESCRIPTION })
  @ApiDataResponse(CalcOutputDto)
  @ApiErrorResponses(422)
  async costPer100km(
    @Body() dto: CostPer100kmDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<CalculatorResponse>> {
    return ok(await this.calc.costPer100km(dto, this.ctx(market, lang, user)));
  }

  @Post('monthly-cost')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Monthly energy cost', description: DESCRIPTION })
  @ApiDataResponse(CalcOutputDto)
  @ApiErrorResponses(422)
  async monthlyCost(
    @Body() dto: MonthlyCostDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<CalculatorResponse>> {
    return ok(await this.calc.monthlyCost(dto, this.ctx(market, lang, user)));
  }

  @Post('vs-fuel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Electric vs fuel energy cost', description: DESCRIPTION })
  @ApiDataResponse(CalcOutputDto)
  @ApiErrorResponses(422)
  async vsFuel(
    @Body() dto: VsFuelDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<CalculatorResponse>> {
    return ok(await this.calc.vsFuel(dto, this.ctx(market, lang, user)));
  }

  @Post('tco')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Total cost of ownership (energy shown separately)',
    description: DESCRIPTION,
  })
  @ApiDataResponse(CalcOutputDto)
  @ApiErrorResponses(422)
  async tco(
    @Body() dto: TcoDto,
    @Market() market: string,
    @Lang() lang: SupportedLanguage,
    @CurrentUser() user?: AuthUser,
  ): Promise<DataResponse<CalculatorResponse>> {
    return ok(await this.calc.tco(dto, this.ctx(market, lang, user)));
  }
}

/** Admin: reference electricity / fuel prices (energy_prices). */
@ApiTags('admin: energy prices')
@Controller('admin/energy-prices')
export class AdminEnergyPricesController {
  constructor(private readonly prices: EnergyPricesService) {}

  @Get()
  @RequireAnyPermission('prices.write', 'settings.read')
  @ApiOperation({ summary: 'List reference prices (all dates)' })
  @ApiPaginatedResponse(ReferencePriceDto)
  list(@Query() q: AdminEnergyPriceQueryDto, @Lang() lang: SupportedLanguage) {
    return this.prices.adminList(q, lang);
  }

  @Post()
  @RequirePermissions('prices.write')
  @ApiOperation({
    summary: 'Add a reference price (market, type, price, currency, effective date, source)',
  })
  @ApiDataResponse(ReferencePriceDto)
  @ApiErrorResponses(422)
  async create(
    @Body() dto: CreateEnergyPriceDto,
    @CurrentUser() user: AuthUser,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.prices.create(dto, user.id, lang));
  }

  @Patch(':id')
  @RequirePermissions('prices.write')
  @ApiDataResponse(ReferencePriceDto)
  @ApiErrorResponses(404, 422)
  async update(
    @Param('id', UuidParamPipe) id: string,
    @Body() dto: UpdateEnergyPriceDto,
    @Lang() lang: SupportedLanguage,
  ) {
    return ok(await this.prices.update(id, dto, lang));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions('prices.write')
  @ApiNoContentResponse()
  @ApiErrorResponses(404, 409)
  async remove(
    @Param('id', UuidParamPipe) id: string,
    @Lang() lang: SupportedLanguage,
  ): Promise<void> {
    await this.prices.remove(id, lang);
  }
}
