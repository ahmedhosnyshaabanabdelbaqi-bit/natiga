/**
 * Response shapes shared by the public and admin catalog APIs.
 * Missing values are `null` (clients show "غير متوفر / Not available"), never 0.
 */
import { ApiProperty } from '@nestjs/swagger';
import {
  PRICE_TYPES,
  RELIABILITIES,
  SOURCE_TYPES,
  CURRENT_TYPES,
  RANGE_CYCLES,
  RANGE_TYPES,
  CONSUMPTION_KINDS,
  CONSUMPTION_MODES,
} from '../common/catalog-constants';

export class ImageSizeDto {
  @ApiProperty({ example: '1024', description: 'Rendition label (usually the width).' })
  label!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ example: 'https://cdn.evcar.news/media/…' }) url!: string;
}

/** A licensed, ready image (unlicensed or unprocessed files are never returned). */
export class ImageDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() url!: string;
  @ApiProperty({ nullable: true, type: Number }) width!: number | null;
  @ApiProperty({ nullable: true, type: Number }) height!: number | null;
  @ApiProperty({ nullable: true, type: String, description: 'Alt text in the request language.' })
  alt!: string | null;
  @ApiProperty({ nullable: true, type: String }) caption!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Credit line to show with the image (licence attribution).',
  })
  credit!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'press_kit' }) licenseType!: string | null;
  @ApiProperty({ type: [ImageSizeDto] }) sizes!: ImageSizeDto[];
  @ApiProperty() isDemo!: boolean;
}

export class SourceSummaryDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: SOURCE_TYPES }) type!: string;
  @ApiProperty({ example: 'Official specification sheet' }) title!: string;
  @ApiProperty({ nullable: true, type: String }) publisher!: string | null;
  @ApiProperty({ nullable: true, type: String }) url!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) documentDate!: string | null;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) accessedAt!: string | null;
  @ApiProperty({ nullable: true, type: String }) marketCode!: string | null;
}

/** Provenance of one value (contract §3). */
export class DataMetaDto {
  @ApiProperty({ enum: RELIABILITIES }) reliability!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date-time' }) verifiedAt!: string | null;
  @ApiProperty({ nullable: true, type: SourceSummaryDto }) source!: SourceSummaryDto | null;
}

/** One spec value in its canonical unit with the value as published. */
export class DataPointDto extends DataMetaDto {
  @ApiProperty({
    oneOf: [{ type: 'number' }, { type: 'string' }, { type: 'boolean' }],
    description: 'Canonical value (number in `unit`, text or boolean).',
  })
  value!: number | string | boolean;
  @ApiProperty({ nullable: true, type: String, example: 'kWh' }) unit!: string | null;
  @ApiProperty({ nullable: true, type: String, example: '400' }) originalValue!: string | null;
  @ApiProperty({ nullable: true, type: String, example: 'mi' }) originalUnit!: string | null;
  @ApiProperty({
    nullable: true,
    type: String,
    description: 'Market of a market-specific value; null = applies to every market.',
  })
  marketCode!: string | null;
  @ApiProperty({
    description:
      'True when derived by a unit conversion of another stored value (e.g. hp from kW); same source and reliability.',
  })
  derived!: boolean;
}

export class MoneyDto {
  @ApiProperty({ example: '1850000.00', description: 'Decimal string.' }) amount!: string;
  @ApiProperty({ example: 'EGP' }) currency!: string;
}

/** A price point. Prices are never converted between currencies. */
export class PriceDto extends DataMetaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ example: 'EG' }) marketCode!: string;
  @ApiProperty({ type: MoneyDto }) amount!: MoneyDto;
  @ApiProperty({ enum: PRICE_TYPES }) priceType!: string;
  @ApiProperty({ description: 'Label of the price type in the request language.' })
  priceTypeLabel!: string;
  @ApiProperty({ format: 'date' }) effectiveFrom!: string;
  @ApiProperty({ nullable: true, type: String, format: 'date' }) effectiveTo!: string | null;
  @ApiProperty({ description: 'Valid today (in the market time zone).' }) isCurrent!: boolean;
  @ApiProperty({
    description:
      'False for a market estimate quoted in another currency — never shown as an official local price.',
  })
  inMarketCurrency!: boolean;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
}

export class RangeDto extends DataMetaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: RANGE_CYCLES }) cycle!: string;
  @ApiProperty({ nullable: true, type: String, description: 'Name of the cycle when OTHER.' })
  cycleNote!: string | null;
  @ApiProperty({ enum: RANGE_TYPES, description: 'electric range vs total range (hybrids).' })
  rangeType!: string;
  @ApiProperty({ example: 520 }) valueKm!: number;
  @ApiProperty({ nullable: true, type: String }) originalValue!: string | null;
  @ApiProperty({ nullable: true, type: String }) originalUnit!: string | null;
  @ApiProperty({ nullable: true, type: Number }) wheelSizeInch!: number | null;
  @ApiProperty({ nullable: true, type: String }) conditions!: string | null;
  @ApiProperty({ nullable: true, type: String }) marketCode!: string | null;
}

export class ConsumptionDto extends DataMetaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: RANGE_CYCLES }) cycle!: string;
  @ApiProperty({ nullable: true, type: String }) cycleNote!: string | null;
  @ApiProperty({ enum: CONSUMPTION_KINDS }) kind!: string;
  @ApiProperty({ enum: CONSUMPTION_MODES, nullable: true, type: String }) mode!: string | null;
  @ApiProperty({ example: 165, description: 'Wh/km (electricity) or L/100km (fuel).' })
  value!: number;
  @ApiProperty({ example: 'Wh/km' }) unit!: string;
  @ApiProperty({ nullable: true, type: String }) originalValue!: string | null;
  @ApiProperty({ nullable: true, type: String }) originalUnit!: string | null;
  @ApiProperty({ nullable: true, type: String }) conditions!: string | null;
  @ApiProperty({ nullable: true, type: String }) marketCode!: string | null;
}

export class ConnectorTypeRefDto {
  @ApiProperty({ example: 'ccs2' }) code!: string;
  @ApiProperty({ example: 'CCS2 (Combo 2)' }) name!: string;
}

export class InletDto extends DataMetaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ type: ConnectorTypeRefDto }) connectorType!: ConnectorTypeRefDto;
  @ApiProperty({ enum: CURRENT_TYPES }) currentType!: string;
  @ApiProperty({
    nullable: true,
    type: Number,
    description: 'AC: on-board charger limit; DC: peak power (not average).',
  })
  maxPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: String }) notes!: string | null;
}

export class ChargingTimeDto extends DataMetaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CURRENT_TYPES }) currentType!: string;
  @ApiProperty({ example: 10 }) fromSoc!: number;
  @ApiProperty({ example: 80 }) toSoc!: number;
  @ApiProperty({ example: '10–80%' }) socWindow!: string;
  @ApiProperty({ example: 28 }) durationMinutes!: number;
  @ApiProperty({ nullable: true, type: Number, description: 'Rated power of the charger used.' })
  chargerPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) peakPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) averagePowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) onboardChargerLimitKw!: number | null;
  @ApiProperty({ nullable: true, type: String }) conditions!: string | null;
}

export class CurvePointDto {
  @ApiProperty({ example: 10 }) socPercent!: number;
  @ApiProperty({ example: 150 }) powerKw!: number;
}

export class ChargingCurveDto extends DataMetaDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty({ enum: CURRENT_TYPES }) currentType!: string;
  @ApiProperty({ nullable: true, type: String }) label!: string | null;
  @ApiProperty({ nullable: true, type: Number }) chargerMaxPowerKw!: number | null;
  @ApiProperty({ nullable: true, type: Number }) batteryTempC!: number | null;
  @ApiProperty({ nullable: true, type: Boolean }) preconditioned!: boolean | null;
  @ApiProperty({ nullable: true, type: String }) conditions!: string | null;
  @ApiProperty({ type: [CurvePointDto], description: 'Sorted by SoC.' }) points!: CurvePointDto[];
  @ApiProperty({ nullable: true, type: Number, description: 'Highest point of the curve.' })
  peakPowerKw!: number | null;
}

export class NamedRefDto {
  @ApiProperty({ format: 'uuid' }) id!: string;
  @ApiProperty() slug!: string;
  @ApiProperty() name!: string;
}
