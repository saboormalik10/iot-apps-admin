/**
 * Request DTOs for the MET Records endpoints.
 *
 * `CreateRecordDto` was OpenAPI-only until M24 W1 — the controller bound the
 * `CreateRecordInput` INTERFACE, which erases at runtime, so `ValidationPipe`
 * had nothing to check and every field arrived unvalidated.
 */
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ArrayMinSize, IsArray, IsInt, IsMongoId, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateRecordDto {
  @ApiProperty({ description: 'Device ObjectId' })
  @IsMongoId()
  deviceId!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(200)
  deviceName?: string;

  @ApiProperty({
    example: '2026-06-23 09:00:00',
    description:
      'Record start, `"YYYY-MM-DD HH:mm:ss"`. Parsed with no timezone, so it is read in the ' +
      '**server\'s** timezone (UTC in production) — append an offset (e.g. `+05:00`) if you are ' +
      'sending phone-local time. An unparseable value silently falls back to the time of upload.',
  })
  @IsString()
  @MaxLength(64)
  dateStart!: string;

  @ApiPropertyOptional({
    example: '2026-06-23 12:00:00',
    description: 'Record end, same format and timezone rules as `dateStart`. Omit while still logging.',
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  dateEnd?: string | null;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;

  @ApiPropertyOptional({ description: 'URL of an attached map/screenshot' })
  @IsOptional()
  @IsString()
  @MaxLength(2048)
  urlMaps?: string | null;

  @ApiPropertyOptional({
    description:
      'Your app\'s own record id from its local database — the duplicate-guard that makes retrying ' +
      'safe.\n\n' +
      '⚠️ **Uniqueness is per ORGANISATION, not per device.** If two MET-LINK phones in the same ' +
      'organisation both number their local records from 1, phone B\'s record 42 is treated as a ' +
      'duplicate of phone A\'s and the server returns **phone A\'s existing record** instead of ' +
      'creating a new one — silently, with a 201. Use a value that is unique across the whole ' +
      'organisation (e.g. derive it from the device id), or omit the field to disable the guard.',
    example: 42,
  })
  @IsOptional()
  @IsInt()
  localRecordId?: number | null;
}

export class UpdateRecordDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
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

  @ApiProperty({
    description:
      'Timestamp of the row: `"YYYY-MM-DD HH:mm:ss"`. **Parsed with no timezone, so it is read in ' +
      'the SERVER\'s timezone (UTC in production)** — append an offset (e.g. `2026-05-01 14:32:01+05:00`) ' +
      'if your rows are in local time, or the readings land on the wrong instant. ' +
      '⚠️ An unparseable value does NOT error: it silently falls back to the time of upload, which ' +
      'corrupts the row\'s position on every chart. Validate the format before sending.',
    example: '2026-05-01 14:32:01',
  })
  @IsString()
  timeStamp!: string;
}

export class BulkMeasuresDto {
  // Nested validation is explicit: without @ValidateNested + @Type the elements
  // are plain objects and MeasureDto's own rules never run.
  @ApiProperty({ type: [MeasureDto], description: 'Batch of measures to append' })
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MeasureDto)
  measures!: MeasureDto[];
}
