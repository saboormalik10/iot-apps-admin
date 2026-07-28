/**
 * Request DTOs for the NEP Sessions endpoints.
 *
 * These are BOTH the OpenAPI schema and the runtime contract — the controllers
 * bind their @Body() to these classes, so the global ValidationPipe enforces
 * them. The pipe runs with `whitelist: true`, which means **a property with no
 * class-validator decorator is silently stripped from the request body**. If you
 * add a field here, give it a decorator or it will never reach the service.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsMongoId,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  ValidateNested,
} from 'class-validator';

export class SampleDto {
  @ApiProperty({ description: 'Unix ms timestamp', example: 1750669200000 })
  @IsInt()
  timestamp!: number;

  @ApiPropertyOptional({ example: 4.2 })
  @IsOptional()
  @IsNumber()
  turbidityValue?: number | null;

  @ApiPropertyOptional({ example: 18.3 })
  @IsOptional()
  @IsNumber()
  temperatureValue?: number | null;

  @ApiPropertyOptional({ enum: ['R1', 'R2', 'R3'] })
  @IsOptional()
  @IsIn(['R1', 'R2', 'R3'])
  probeRange?: string | null;

  @ApiPropertyOptional({ example: -27.4698 })
  @IsOptional()
  @IsNumber()
  locationLat?: number | null;

  @ApiPropertyOptional({ example: 153.0251 })
  @IsOptional()
  @IsNumber()
  locationLng?: number | null;

  @ApiPropertyOptional({ example: 95 })
  @IsOptional()
  @IsNumber()
  batteryLevel?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  batteryRawVoltage?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  batteryCharging?: boolean | null;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  demoModeEnabled?: boolean | null;
}

export class CreateSessionDto {
  @ApiProperty({ description: 'Client-generated session UUID v4' })
  @IsUUID('4')
  id!: string;

  @ApiProperty({ description: 'Device ObjectId' })
  @IsMongoId()
  deviceId!: string;

  @ApiProperty()
  @IsString()
  deviceName!: string;

  @ApiProperty({ description: 'Unix ms', example: 1750669200000 })
  @IsInt()
  startTimestamp!: number;

  @ApiPropertyOptional({ description: 'Unix ms' })
  @IsOptional()
  @IsInt()
  endTimestamp?: number | null;

  @ApiProperty({ example: 'Australia/Brisbane' })
  @IsString()
  timezoneName!: string;

  @ApiProperty({ example: 10, description: 'Offset in HOURS (e.g. 10, -3.5) — not "+10:00"' })
  @IsNumber()
  timezoneOffset!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  turbidityEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  temperatureEnabled?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  locationEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  isDemoMode?: boolean;

  @ApiPropertyOptional({ type: [SampleDto], description: 'Optional samples to insert with the session' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleDto)
  samples?: SampleDto[];
}

export class UpdateSessionDto {
  @ApiPropertyOptional({ description: 'Free-text note on the session' })
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ description: 'Display name of the device that logged the session' })
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ description: 'Unix ms — when logging ended (null while still open)' })
  @IsOptional()
  @IsInt()
  endTimestamp?: number | null;

  @ApiPropertyOptional({ example: 'Australia/Brisbane' })
  @IsOptional()
  @IsString()
  timezoneName?: string;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  timezoneOffset?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  turbidityEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  temperatureEnabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  locationEnabled?: boolean;

  @ApiPropertyOptional({ description: 'Marks the session as demo data' })
  @IsOptional()
  @IsBoolean()
  isDemoMode?: boolean;
}

export class BulkSamplesDto {
  /**
   * Deliberately NOT @ArrayMaxSize(7200): the service raises a specific
   * TOO_MANY_SAMPLES error code that clients can act on ("split the batch"),
   * whereas a pipe rejection would flatten it to a generic VALIDATION_ERROR.
   */
  @ApiProperty({ type: [SampleDto], description: 'Batch of samples to append (max 7200 — enforced in the service)' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleDto)
  samples!: SampleDto[];
}
