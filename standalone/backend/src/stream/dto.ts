import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min, ValidateIf } from 'class-validator';

/** How this PC reaches the sensor's converter — the portal's Sensor connection form. */
export class UpdateStreamConnectionDto {
  @ApiProperty({ enum: ['listen', 'connect'], description: '`listen`: the converter connects to this PC. `connect`: this PC dials the converter.' })
  @IsIn(['listen', 'connect'])
  mode!: 'listen' | 'connect';

  @ApiPropertyOptional({ nullable: true, description: "The converter's IP address or host name (`connect`)." })
  @IsOptional()
  @ValidateIf((_o, v) => v !== null)
  @IsString()
  @MaxLength(253)
  remoteHost?: string | null;

  @ApiPropertyOptional({ description: "The converter's TCP port (`connect`), 1–65535." })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(65_535)
  remotePort?: number;
}
