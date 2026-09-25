import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, Matches, MaxLength } from 'class-validator';
import { ImportJobDto, RowErrorDto } from '../../system/system.dto';
import { SLUG_RE } from '../common/catalog-constants';
import { QueryBool } from './validators';

export class ImportQueryDto {
  @ApiPropertyOptional({
    default: true,
    description:
      'true (default): validate + preview without writing (job ends "ready"); false: import now.',
  })
  @QueryBool()
  dryRun?: boolean;
}

export class ImportFileDto {
  @ApiProperty({
    type: 'string',
    format: 'binary',
    description: 'UTF-8 CSV, max 5 MB / 5000 rows.',
  })
  file!: unknown;
}

export class ExportQueryDto {
  @ApiPropertyOptional({ description: 'Brand slug.' })
  @IsOptional()
  @MaxLength(160)
  @Matches(SLUG_RE)
  brand?: string;

  @ApiPropertyOptional({ description: 'Model slug.' })
  @IsOptional()
  @MaxLength(160)
  @Matches(SLUG_RE)
  model?: string;

  @ApiPropertyOptional({
    description:
      'Market code: market rows of that market (+ rows valid for all markets for specs / ranges / consumption).',
  })
  @IsOptional()
  @Matches(/^[A-Z]{2,8}$/)
  marketCode?: string;

  @ApiPropertyOptional({ default: false, description: 'Include demo / test rows.' })
  @QueryBool()
  includeDemo?: boolean;
}

export class TemplateColumnDto {
  @ApiProperty() name!: string;
  @ApiProperty() required!: boolean;
  @ApiProperty() description!: string;
  @ApiPropertyOptional({ type: [String] }) allowed?: string[];
  @ApiPropertyOptional() example?: string;
}

export class ImportTemplateDto {
  @ApiProperty({ example: 'specs' }) type!: string;
  @ApiProperty() title!: string;
  @ApiProperty({ description: 'Natural key (duplicates, idempotent upserts).' }) key!: string;
  @ApiProperty({ type: [String], description: 'Permissions needed to import this template.' })
  permissions!: string[];
  @ApiProperty({ type: [TemplateColumnDto] }) columns!: TemplateColumnDto[];
  @ApiProperty({ description: 'CSV header line.' }) header!: string;
}

export class ImportSummaryDto {
  @ApiProperty() total!: number;
  @ApiProperty({ description: 'Rows that create a record (dry run: would create).' })
  create!: number;
  @ApiProperty() update!: number;
  @ApiProperty({ description: 'Identical to the stored data (idempotent re-import).' })
  unchanged!: number;
  @ApiProperty({ description: 'Same natural key as an earlier row of the file.' })
  duplicate!: number;
  @ApiProperty() invalid!: number;
  @ApiProperty() failed!: number;
}

export class ImportRowResultDto {
  @ApiProperty({ description: '1-based data row (the header is not counted).' }) rowNumber!: number;
  @ApiProperty({
    enum: ['valid', 'imported', 'updated', 'skipped', 'duplicate', 'invalid', 'failed'],
  })
  status!: string;
  @ApiProperty({ nullable: true, type: String, enum: ['create', 'update', 'unchanged'] })
  action!: string | null;
  @ApiProperty({ type: [RowErrorDto] }) errors!: RowErrorDto[];
  @ApiProperty({ nullable: true, type: String }) entityType!: string | null;
  @ApiProperty({ nullable: true, type: String }) entityId!: string | null;
}

export class ImportResultDto {
  @ApiProperty({ type: ImportJobDto }) job!: ImportJobDto;
  @ApiProperty({ type: ImportSummaryDto }) summary!: ImportSummaryDto;
  @ApiProperty({
    type: [ImportRowResultDto],
    description:
      'Rows with problems first, then the others (max 500; all rows: /admin/system/import-jobs/:id/rows).',
  })
  rows!: ImportRowResultDto[];
  @ApiProperty({
    nullable: true,
    type: String,
    format: 'uuid',
    description: 'Dry runs: the job that committed this preview, if any.',
  })
  committedJobId!: string | null;
}
