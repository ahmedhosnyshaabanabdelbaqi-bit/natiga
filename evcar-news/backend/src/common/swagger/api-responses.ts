import { applyDecorators, type Type } from '@nestjs/common';
import {
  ApiExtraModels,
  ApiOkResponse,
  ApiProperty,
  ApiPropertyOptional,
  ApiResponse,
  getSchemaPath,
} from '@nestjs/swagger';

export class PageMetaDto {
  @ApiProperty({ example: 1 }) page!: number;
  @ApiProperty({ example: 20 }) pageSize!: number;
  @ApiProperty({ example: 57 }) total!: number;
  @ApiProperty({ example: 3 }) totalPages!: number;
}

export class ErrorBodyDto {
  @ApiProperty({ example: 'VALIDATION_FAILED' }) code!: string;
  @ApiProperty({ example: 'بعض الحقول غير صالحة. راجع التفاصيل.' }) message!: string;
  @ApiPropertyOptional({
    description: 'Code-specific details (e.g. field errors for VALIDATION_FAILED).',
  })
  details?: unknown;
  @ApiProperty({ example: '0b8f6c1e-5a1c-4c0e-9d6b-2f3b9b4d1a77' }) requestId!: string;
}

export class ErrorEnvelopeDto {
  @ApiProperty({ type: ErrorBodyDto }) error!: ErrorBodyDto;
}

/** 200 { data: Model } */
export function ApiDataResponse<T extends Type<unknown>>(model: T, description?: string) {
  return applyDecorators(
    ApiExtraModels(model),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data'],
        properties: { data: { $ref: getSchemaPath(model) } },
      },
    }),
  );
}

/** 200 { data: Model[], meta: PageMeta } */
export function ApiPaginatedResponse<T extends Type<unknown>>(model: T, description?: string) {
  return applyDecorators(
    ApiExtraModels(model, PageMetaDto),
    ApiOkResponse({
      description,
      schema: {
        type: 'object',
        required: ['data', 'meta'],
        properties: {
          data: { type: 'array', items: { $ref: getSchemaPath(model) } },
          meta: { $ref: getSchemaPath(PageMetaDto) },
        },
      },
    }),
  );
}

/** 200 { data: Model[], meta: PageMeta } for a complete list returned as page 1 of 1. */
export function ApiDataListResponse<T extends Type<unknown>>(model: T, description?: string) {
  return ApiPaginatedResponse(
    model,
    description ?? 'Complete list (not paginated): meta is page 1 of 1 with pageSize = total.',
  );
}

/** Documents error responses using the shared error envelope. */
export function ApiErrorResponses(...statuses: number[]) {
  return applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ...statuses.map((status) =>
      ApiResponse({
        status,
        description: 'Error envelope',
        schema: { $ref: getSchemaPath(ErrorEnvelopeDto) },
      }),
    ),
  );
}
