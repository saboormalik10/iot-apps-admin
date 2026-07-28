/**
 * Swagger documentation DTOs for the MET Records endpoints (OpenAPI only —
 * controllers keep their existing typed bodies, behaviour unchanged).
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsString } from 'class-validator';

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
  @ApiProperty({
    description:
      'CSV triplets from the MET-LINK SQLite `measure.dataSentence`: Value,Unit,Description,Value,Unit,Description,… The **first row is the header row** whose triplets carry the literal "Unit,Description" placeholders; the backend parses each data row into named fields (windSpeedMs, tempC, pressureHpa, …).',
    example: '12.5,m/s,relative,23.4,°C,TEMP,63.5,%,RH,1.025,B,PRESS,-37.8136,144.9631',
  })
  // Decorated because MeasureDto is nested inside SyncUploadDto, which IS bound to
  // the ValidationPipe — under `whitelist: true` an undecorated property is stripped,
  // which would silently empty every MET-LINK measure upload.
  @IsString()
  dataSentence!: string;

  @ApiProperty({ description: 'Human-readable timestamp: "YYYY-MM-DD HH:mm:ss"', example: '2026-05-01 14:32:01' })
  @IsString()
  timeStamp!: string;
}

export class BulkMeasuresDto {
  @ApiProperty({ type: [MeasureDto], description: 'Batch of measures to append' })
  measures!: MeasureDto[];
}
