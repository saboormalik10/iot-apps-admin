import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsIn, IsMongoId, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { IsTimeZone } from '../common/validators/is-time-zone.validator';
import { UserRole } from '../models/User';
import { NO_CONTROL_CHARS, noControlChars } from '../common/text';

const ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

export class UpdateOrgDto {
  @ApiPropertyOptional({ example: 'Observator Instruments AU' })
  @IsOptional()
  @IsString()
  @Matches(NO_CONTROL_CHARS, noControlChars)
  name?: string;

  @ApiPropertyOptional({ example: 'dana@observator.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  /**
   * The two-letter country code the installer wrote (STANDALONE_COUNTRY, 'AU' by
   * default). Nothing else reads it, and the field accepted any string — QA found
   * a site whose country was "ab" after a stray edit (24 Sep 2026).
   */
  @ApiPropertyOptional({ example: 'AU', description: 'Two-letter country code' })
  @IsOptional()
  @IsString()
  @Matches(/^[A-Za-z]{2}$/, { message: 'country must be a two-letter code, such as AU' })
  country?: string;

  @ApiPropertyOptional({ example: 'Australia/Melbourne' })
  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ROLES, description: 'New role' })
  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @ApiPropertyOptional({
    description:
      'Assign a role by id — the only way to grant a CUSTOM role. Takes precedence over `role`, ' +
      'and the legacy key is mirrored from the role\'s `baseRole`. Must be a system role or one ' +
      'this organisation owns; anything else is 404.',
  })
  @IsOptional()
  @IsMongoId()
  roleId?: string;

  @ApiPropertyOptional({ description: 'Activate (true) or deactivate (false) the user' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

/**
 * Branding. Every field optional, and an EMPTY STRING clears it back to the
 * platform default — that is how a customer removes a logo or accent without a
 * separate reset endpoint.
 *
 * NOTE: the global ValidationPipe runs with `whitelist: true`, so a property
 * with no class-validator decorator is silently STRIPPED.
 */
export class UpdateBrandingDto {
  @ApiPropertyOptional({ example: 'Acme Marine', description: 'Shown in the app shell instead of the organisation name.' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  displayName?: string;

  @ApiPropertyOptional({ example: '', description: 'Set by the logo upload (M20 W2).' })
  @IsOptional()
  @IsString()
  @MaxLength(512)
  logoUrl?: string;

  @ApiPropertyOptional({ example: '#1f6feb', description: 'Hex only, `#rrggbb`.' })
  @IsOptional()
  @IsString()
  @MaxLength(7)
  accentColor?: string;

  @ApiPropertyOptional({ example: 'support@acme.example' })
  @IsOptional()
  @IsString()
  @MaxLength(160)
  supportEmail?: string;
}

/**
 * Display units for this organisation's readings.
 *
 * `@IsIn` is what makes this endpoint safe: the whole point of the field is that
 * the web client looks the value up in a conversion table, so an unrecognised
 * string would render every affected number as a blank or a NaN. The allow-lists
 * mirror the conversion families in `analytics.util.ts` — keep them in step.
 *
 * NOTE: the global ValidationPipe runs with `whitelist: true`, so an undecorated
 * property is silently STRIPPED.
 */
export const WIND_SPEED_UNITS = ['m/s', 'km/h', 'knots', 'mph', 'bft'] as const;
export const PRESSURE_UNITS = ['hPa', 'mbar', 'inHg', 'mmHg'] as const;
export const TEMPERATURE_UNITS = ['°C', '°F'] as const;
export const ALTITUDE_UNITS = ['m', 'ft'] as const;

export class UpdateDisplayUnitsDto {
  @ApiPropertyOptional({ enum: WIND_SPEED_UNITS, example: 'knots' })
  @IsOptional()
  @IsIn(WIND_SPEED_UNITS as unknown as string[])
  windSpeed?: string;

  @ApiPropertyOptional({ enum: PRESSURE_UNITS, example: 'hPa' })
  @IsOptional()
  @IsIn(PRESSURE_UNITS as unknown as string[])
  pressure?: string;

  @ApiPropertyOptional({ enum: TEMPERATURE_UNITS, example: '°C' })
  @IsOptional()
  @IsIn(TEMPERATURE_UNITS as unknown as string[])
  temperature?: string;

  @ApiPropertyOptional({ enum: ALTITUDE_UNITS, example: 'm' })
  @IsOptional()
  @IsIn(ALTITUDE_UNITS as unknown as string[])
  altitude?: string;
}

/**
 * Create a user directly, with a password rather than an invitation.
 *
 * There is no invite email in this deployment (M15 W3), so the operator sets the
 * password and passes it on. Mirrors the M19 W4 customer-admin flow.
 */
export class CreateOrgUserDto {
  @ApiProperty({ example: 'new.user@observator.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Str0ngPassphrase', minLength: 8, description: 'Shown to the operator once; never stored in the clear' })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;

  @ApiPropertyOptional({ example: 'New' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(NO_CONTROL_CHARS, noControlChars)
  firstName?: string;

  @ApiPropertyOptional({ example: 'Hire' })
  @IsOptional()
  @IsString()
  @MaxLength(80)
  @Matches(NO_CONTROL_CHARS, noControlChars)
  lastName?: string;

  @ApiPropertyOptional({ enum: ROLES, default: 'viewer' })
  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Assign a custom or system role by id. Takes precedence over `role`.' })
  @IsOptional()
  @IsMongoId()
  roleId?: string;
}

/** An administrator sets a user's password — there is no reset email on a site PC. */
export class ResetUserPasswordDto {
  @ApiProperty({
    example: 'Temp0rary-Pass',
    minLength: 8,
    description: 'The new password. Pass it to the user; they are asked to choose their own when they next sign in.',
  })
  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password!: string;
}
