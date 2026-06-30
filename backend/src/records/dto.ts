/**
 * Swagger documentation DTOs for the MET Records endpoints (OpenAPI only —
 * controllers keep their existing typed bodies, behaviour unchanged).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateRecordDto {
  @ApiProperty({ description: 'Device ObjectId' })
  deviceId!: string;

  @ApiPropertyOptional()
  deviceName?: string;

  @ApiProperty({ example: '2026-06-23 09:00:00', description: 'Record start (local time string)' })
  dateStart!: string;

  @ApiPropertyOptional({ example: '2026-06-23 12:00:00' })
  dateEnd?: string | null;

  @ApiPropertyOptional()
  comment?: string;

  @ApiPropertyOptional({ description: 'URL of an attached map/screenshot' })
  urlMaps?: string | null;

  @ApiPropertyOptional({ description: "App-side local id for idempotent upload" })
  localRecordId?: number | null;

  @ApiPropertyOptional({ default: false })
  isDemoMode?: boolean;
}

export class UpdateRecordDto {
  @ApiPropertyOptional()
  comment?: string;
}

export class MeasureDto {
  @ApiProperty({ description: 'Raw NMEA 0183 sentence', example: '5.20,m/s,Wind speed,true,18.4,°C,Temperature' })
  dataSentence!: string;

  @ApiProperty({ example: '2026-06-23 09:00:10' })
  timeStamp!: string;
}

export class BulkMeasuresDto {
  @ApiProperty({ type: [MeasureDto], description: 'Batch of measures to append' })
  measures!: MeasureDto[];
}
