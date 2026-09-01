import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * NOTE: the global ValidationPipe runs with `whitelist: true`, so a property
 * with no class-validator decorator is silently STRIPPED.
 */
export class ClaimJobDto {
  @ApiProperty({ example: 'wxbox-1', description: 'Identifies the agent, for the lease and the audit trail.' })
  @IsString()
  @MaxLength(64)
  agentId!: string;
}

export class JobResultDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  ok!: boolean;

  @ApiPropertyOptional({
    example: { account: 'wx-acme-01', home: '/home/wx-acme-01' },
    description: 'Anything secret-shaped is stripped before storage.',
  })
  @IsOptional()
  @IsObject()
  result?: Record<string, unknown>;

  @ApiPropertyOptional({ example: 'useradd exited 9' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  error?: string;

  /**
   * The generated SFTP password, sent at the TOP LEVEL by the agent.
   *
   * It must be declared here or `whitelist: true` silently drops it before the
   * controller runs — which is exactly what happened: the agent sent the
   * password, validation discarded it, the service then looked for it inside
   * `result` (where it never was), and every provisioning and rotation
   * completed successfully with no recoverable credential (M24).
   *
   * It is parked as a one-read secret and scrubbed from the stored result.
   */
  @ApiPropertyOptional({ description: 'One-read secret. Never stored on the job.' })
  @IsOptional()
  @IsString()
  @MaxLength(256)
  password?: string;
}

export class ProvisionStationDto {
  @ApiProperty({ example: '664a1f2e3c4d5e6f7a8b9c0e' })
  @IsString()
  @MaxLength(64)
  organizationId!: string;

  @ApiProperty({ example: 'Demo Tower', description: 'Becomes the upload folder beneath the customer folder.' })
  @IsString()
  @MaxLength(64)
  towerName!: string;

  @ApiPropertyOptional({ example: 'wx-acme-01', description: 'Derived from the customer when omitted.' })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  account?: string;

  @ApiPropertyOptional({ example: 'Replaces the mast at berth 4.' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  notes?: string;
}

/** 1 MB — a sample is a file or two, not an archive. */
const MAX_SAMPLE_CHARS = 1_048_576;

export class PreviewStreamDto {
  @ApiProperty({ example: 'met-csv' })
  @IsString()
  @MaxLength(64)
  streamKey!: string;

  @ApiProperty({ description: 'Raw file content, verbatim.' })
  @IsString()
  @MaxLength(MAX_SAMPLE_CHARS)
  content!: string;

  @ApiPropertyOptional({ example: 'WindSonic_20260825_1119.csv' })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  filename?: string;
}

export class SetEnabledDto {
  @ApiProperty({ example: true })
  @IsBoolean()
  isEnabled!: boolean;
}
