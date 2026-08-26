import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * Ingest payload contract, shared with `ingest-agent`.
 *
 * NOTE ON VALIDATION: the global ValidationPipe runs with `whitelist: true`, so a
 * property with no class-validator decorator is silently STRIPPED from the body
 * (see the comment in records/dto.ts). Every field here that is actually read
 * must therefore carry a decorator — an undecorated `content` would arrive empty
 * and every file would be rejected as EMPTY_FILE with no obvious cause.
 */

/** 1 MB. A normal one-minute file is ~2.4 KB, so anything larger is anomalous. */
const MAX_FILE_CHARS = 1_048_576;

export class IngestFileDto {
  @ApiProperty({ example: 'WindSonic_20260820_0409.csv' })
  @IsString()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ description: 'Raw file content, verbatim. CRLF preserved.' })
  @IsString()
  @MaxLength(MAX_FILE_CHARS)
  content!: string;

  @ApiPropertyOptional({ description: 'sha256 of `content`. Recomputed server-side and compared.' })
  @IsOptional()
  @IsString()
  sha256?: string;
}

export class IngestBatchDto {
  @ApiProperty({ description: 'SFTP account the files were uploaded to.', example: 'wxstation' })
  @IsString()
  @MaxLength(64)
  account!: string;

  /**
   * Upload folder relative to the account root, e.g. `Observator/Demo Tower`.
   *
   * Batch-level, not per-file: the backend emits ONE `MET_MEASURES` event per
   * request and a batch therefore belongs to exactly one device. The agent groups
   * what it finds by folder and sends one request per folder.
   *
   * Omitted or empty means the legacy flat layout — files in the upload root.
   */
  @ApiPropertyOptional({ example: 'Observator/Demo Tower' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  folder?: string;

  @ApiPropertyOptional({ example: '1.0.0' })
  @IsOptional()
  @IsString()
  agentVersion?: string;

  @ApiProperty({ type: [IngestFileDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => IngestFileDto)
  files!: IngestFileDto[];
}

export interface IngestFileInput {
  name: string;
  content: string;
  sha256?: string;
}

/**
 * Per-file outcome.
 *  ingested  — rows written
 *  duplicate — this exact content was already ingested; the agent should archive
 *  rejected  — permanently unusable; the agent should quarantine, never retry
 *  retry     — another request holds it; the agent should try again later
 */
export type IngestFileStatus = 'ingested' | 'duplicate' | 'rejected' | 'retry';

export interface IngestFileResult {
  name: string;
  status: IngestFileStatus;
  rows?: number;
  skipped?: number;
  reason?: string;
  dayKeys?: string[];
  truncated?: boolean;
  warnings?: number;
  sensorsSeen?: string[];
  /** Unit code the sensor reported for wind speed in this file, e.g. `K`. */
  speedUnitCode?: string | null;
}

export interface IngestResponse {
  account: string;
  organizationId: string;
  deviceId: string | null;
  results: IngestFileResult[];
}
