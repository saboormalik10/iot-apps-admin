/**
 * Request DTOs for the Sync endpoints (used by BOTH mobile apps).
 *
 * These are BOTH the OpenAPI schema and the runtime contract — the controllers
 * bind their @Body() to these classes, so the global ValidationPipe enforces
 * them. The pipe runs with `whitelist: true`, which means **a property with no
 * class-validator decorator is silently stripped from the request body**.
 *
 * `SyncUploadDto` is a union-in-one-shape: NEP-LINK sends the session fields,
 * MET-LINK sends the record fields, and `type` says which. Every field is
 * therefore optional at the pipe level; the per-type required-field checks live
 * in SyncService (`_upsertNepSession` / `_upsertMetRecord`) where the branch is
 * known. If you add a field here, give it a decorator or it will never arrive.
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
import { SampleDto } from '../sessions/dto';
import { MeasureDto } from '../records/dto';

export class DeviceStatusDto {
  @ApiProperty({ description: 'Device ObjectId' })
  @IsMongoId()
  deviceId!: string;

  @ApiPropertyOptional({ example: 82 })
  @IsOptional()
  @IsNumber()
  batteryPct?: number;

  @ApiPropertyOptional({ example: 12.1 })
  @IsOptional()
  @IsNumber()
  batteryVoltage?: number;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  batteryCharging?: boolean;

  @ApiPropertyOptional({ example: '2.1.4' })
  @IsOptional()
  @IsString()
  firmwareVersion?: string;

  @ApiPropertyOptional({ enum: ['MET-LINK', 'NEP-LINK'] })
  @IsOptional()
  @IsIn(['MET-LINK', 'NEP-LINK'])
  appType?: string;
}

/** One-shot upsert of a full NEP session or MET record (mobile sync). */
export class SyncUploadDto {
  @ApiProperty({ enum: ['nep_session', 'met_record'] })
  @IsIn(['nep_session', 'met_record'])
  type!: 'nep_session' | 'met_record';

  // ── NEP session fields ──
  @ApiPropertyOptional({ description: 'NEP session UUID' })
  @IsOptional()
  @IsUUID('4')
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Device ObjectId' })
  @IsOptional()
  @IsMongoId()
  deviceId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  deviceName?: string;

  @ApiPropertyOptional({ description: 'Unix ms' })
  @IsOptional()
  @IsInt()
  startTimestamp?: number;

  @ApiPropertyOptional({ description: 'Unix ms' })
  @IsOptional()
  @IsInt()
  endTimestamp?: number | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  timezoneName?: string;

  @ApiPropertyOptional({ description: 'Offset in HOURS (e.g. 10, -3.5) — not "+10:00"' })
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

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  comment?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()

  @ApiPropertyOptional({ type: [SampleDto], description: 'NEP samples (when type=nep_session)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SampleDto)
  samples?: SampleDto[];

  // ── MET record fields ──
  @ApiPropertyOptional({ description: 'MET record ObjectId / local id' })
  @IsOptional()
  @IsString()
  recordId?: string;

  @ApiPropertyOptional({ example: '2026-06-23 09:00:00' })
  @IsOptional()
  @IsString()
  dateStart?: string;

  @ApiPropertyOptional({ example: '2026-06-23 12:00:00' })
  @IsOptional()
  @IsString()
  dateEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  urlMaps?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  localRecordId?: number | null;

  @ApiPropertyOptional({ type: [MeasureDto], description: 'MET measures (when type=met_record)' })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => MeasureDto)
  measures?: MeasureDto[];
}
