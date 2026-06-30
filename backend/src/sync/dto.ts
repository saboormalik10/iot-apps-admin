/**
 * Swagger documentation DTOs for the Sync endpoints (OpenAPI only —
 * controllers keep their existing typed bodies, behaviour unchanged).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SampleDto } from '../sessions/dto';
import { MeasureDto } from '../records/dto';

export class DeviceStatusDto {
  @ApiProperty({ description: 'Device ObjectId' })
  deviceId!: string;

  @ApiPropertyOptional({ example: 82 })
  batteryPct?: number;

  @ApiPropertyOptional({ example: 12.1 })
  batteryVoltage?: number;

  @ApiPropertyOptional({ default: false })
  batteryCharging?: boolean;

  @ApiPropertyOptional({ example: '2.1.4' })
  firmwareVersion?: string;

  @ApiPropertyOptional({ enum: ['MET-LINK', 'NEP-LINK'] })
  appType?: string;
}

/** One-shot upsert of a full NEP session or MET record (mobile sync). */
export class SyncUploadDto {
  @ApiProperty({ enum: ['nep_session', 'met_record'] })
  type!: 'nep_session' | 'met_record';

  // ── NEP session fields ──
  @ApiPropertyOptional({ description: 'NEP session UUID' })
  sessionId?: string;

  @ApiPropertyOptional({ description: 'Device ObjectId' })
  deviceId?: string;

  @ApiPropertyOptional()
  deviceName?: string;

  @ApiPropertyOptional({ description: 'Unix ms' })
  startTimestamp?: number;

  @ApiPropertyOptional({ description: 'Unix ms' })
  endTimestamp?: number | null;

  @ApiPropertyOptional()
  timezoneName?: string;

  @ApiPropertyOptional()
  timezoneOffset?: number;

  @ApiPropertyOptional()
  turbidityEnabled?: boolean;

  @ApiPropertyOptional()
  temperatureEnabled?: boolean;

  @ApiPropertyOptional()
  locationEnabled?: boolean;

  @ApiPropertyOptional()
  comment?: string;

  @ApiPropertyOptional({ default: false })
  isDemoMode?: boolean;

  @ApiPropertyOptional({ type: [SampleDto], description: 'NEP samples (when type=nep_session)' })
  samples?: SampleDto[];

  // ── MET record fields ──
  @ApiPropertyOptional({ description: 'MET record ObjectId / local id' })
  recordId?: string;

  @ApiPropertyOptional({ example: '2026-06-23 09:00:00' })
  dateStart?: string;

  @ApiPropertyOptional({ example: '2026-06-23 12:00:00' })
  dateEnd?: string | null;

  @ApiPropertyOptional()
  urlMaps?: string | null;

  @ApiPropertyOptional()
  localRecordId?: number | null;

  @ApiPropertyOptional({ type: [MeasureDto], description: 'MET measures (when type=met_record)' })
  measures?: MeasureDto[];
}
