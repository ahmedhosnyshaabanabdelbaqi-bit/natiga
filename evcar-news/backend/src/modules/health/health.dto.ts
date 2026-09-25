import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class DependencyCheckDto {
  @ApiProperty({ enum: ['up', 'down'] }) status!: 'up' | 'down';
  @ApiPropertyOptional({ description: 'Round-trip latency in ms when up.' }) latencyMs?: number;
  @ApiPropertyOptional({ description: 'Short reason when down (no secrets).' }) error?: string;
}

export class HealthChecksDto {
  @ApiProperty({ type: DependencyCheckDto }) database!: DependencyCheckDto;
  @ApiProperty({ type: DependencyCheckDto }) redis!: DependencyCheckDto;
  @ApiProperty({
    type: DependencyCheckDto,
    description: 'Media storage (local disk write/read probe, or S3 HeadBucket).',
  })
  storage!: DependencyCheckDto;
}

export class HealthDto {
  @ApiProperty({
    enum: ['ok', 'degraded', 'error'],
    description:
      'ok = all up; degraded = Redis or storage down (API still serves; jobs/uploads affected); error = database down (HTTP 503).',
  })
  status!: 'ok' | 'degraded' | 'error';
  @ApiProperty({ type: HealthChecksDto }) checks!: HealthChecksDto;
  @ApiProperty({ example: '0.1.0' }) version!: string;
  @ApiProperty({ example: 'production' }) environment!: string;
  @ApiProperty({ example: 123 }) uptimeSeconds!: number;
  @ApiProperty({ example: '2026-09-25T12:00:00.000Z' }) timestamp!: string;
}

export class LivenessDto {
  @ApiProperty({ enum: ['ok'] }) status!: 'ok';
}
