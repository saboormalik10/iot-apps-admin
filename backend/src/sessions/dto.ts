/**
 * Swagger documentation DTOs for the NEP Sessions endpoints (OpenAPI only —
 * controllers keep their existing typed bodies, behaviour unchanged).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SampleDto {
  @ApiProperty({ description: 'Unix ms timestamp', example: 1750669200000 })
  timestamp!: number;

  @ApiPropertyOptional({ example: 4.2 })
  turbidityValue?: number | null;

  @ApiPropertyOptional({ example: 18.3 })
  temperatureValue?: number | null;

  @ApiPropertyOptional({ enum: ['R1', 'R2', 'R3'] })
  probeRange?: string | null;

  @ApiPropertyOptional({ example: -27.4698 })
  locationLat?: number | null;

  @ApiPropertyOptional({ example: 153.0251 })
  locationLng?: number | null;

  @ApiPropertyOptional({ example: 95 })
  batteryLevel?: number | null;

  @ApiPropertyOptional()
  batteryRawVoltage?: number | null;

  @ApiPropertyOptional()
  batteryCharging?: boolean | null;

  @ApiPropertyOptional({ default: false })
  demoModeEnabled?: boolean | null;
}

export class CreateSessionDto {
  @ApiProperty({ description: 'Client-generated session UUID v4' })
  id!: string;

  @ApiProperty({ description: 'Device ObjectId' })
  deviceId!: string;

  @ApiProperty()
  deviceName!: string;

  @ApiProperty({ description: 'Unix ms', example: 1750669200000 })
  startTimestamp!: number;

  @ApiPropertyOptional({ description: 'Unix ms' })
  endTimestamp?: number | null;

  @ApiProperty({ example: 'Australia/Brisbane' })
  timezoneName!: string;

  @ApiProperty({ example: 10 })
  timezoneOffset!: number;

  @ApiPropertyOptional({ default: true })
  turbidityEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  temperatureEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  locationEnabled?: boolean;

  @ApiPropertyOptional()
  comment?: string;

  @ApiPropertyOptional({ default: false })
  isDemoMode?: boolean;

  @ApiPropertyOptional({ type: [SampleDto], description: 'Optional samples to insert with the session' })
  samples?: SampleDto[];
}

export class UpdateSessionDto {
  @ApiPropertyOptional()
  comment?: string;
}

export class BulkSamplesDto {
  @ApiProperty({ type: [SampleDto], description: 'Batch of samples to append' })
  samples!: SampleDto[];
}
