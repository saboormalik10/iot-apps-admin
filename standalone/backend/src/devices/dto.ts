/**
 * The station update body — validated. It used to be documentation only while the
 * controller typed its body inline, so the validation pipe had no class to check:
 * any type reached Mongoose (an object as a name answered 500) and nothing was
 * range-checked here.
 */
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { NO_CONTROL_CHARS, noControlChars } from '../common/text';

export class UpdateDeviceDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(NO_CONTROL_CHARS, noControlChars)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(NO_CONTROL_CHARS, noControlChars)
  customName?: string;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(NO_CONTROL_CHARS, noControlChars)
  serialNo?: string | null;

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  @Matches(NO_CONTROL_CHARS, noControlChars)
  firmwareVersion?: string | null;

  /**
   * Keep the raw per-second samples as well as the minute record.
   *
   * The "special circumstance" switch: off by default, because the station logs
   * at 1 Hz and almost nothing reads a single second. Turn it on to commission a
   * site or chase a suspected sensor fault. Raw samples expire on their own
   * short TTL, so leaving it on cannot quietly fill the database for good.
   */
  @ApiPropertyOptional({ description: 'Keep raw per-second samples (default false)' })
  @IsOptional()
  @IsBoolean()
  storeRawSamples?: boolean;

  @ApiPropertyOptional({ description: 'Local hour the rain day starts, 0–23 (0 = midnight; 9 = BOM 9am-to-9am)', example: 9 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(23)
  rainDayStartHour?: number;

  @ApiPropertyOptional({
    description:
      'Degrees added to the sensor\'s bearing to give TRUE north: the sensor\'s alignment on the mast, or, ' +
      'when it reports a compass-corrected (magnetic) direction, the local magnetic declination. ' +
      '0 = not surveyed. Applies to readings from now on.',
    example: 11.5,
  })
  @IsOptional()
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(-360)
  @Max(360)
  headingOffsetDeg?: number;
}
