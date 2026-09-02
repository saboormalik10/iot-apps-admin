import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * NOTE: the global ValidationPipe runs with `whitelist: true`, so a property with
 * no class-validator decorator is silently STRIPPED. Every field here that is
 * actually read must carry one — an undecorated `permissions` would arrive empty
 * and every role would be rejected as granting nothing.
 */
export class RoleInputDto {
  @ApiProperty({ example: 'Site Supervisor' })
  @IsString()
  @MaxLength(60)
  name!: string;

  @ApiPropertyOptional({ example: 'Can manage stations and alerts but not people.' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiProperty({ type: [String], example: ['data:read', 'alert:write'] })
  @IsArray()
  @IsString({ each: true })
  permissions!: string[];

  @ApiPropertyOptional({
    enum: ['admin', 'operator', 'viewer'],
    default: 'viewer',
    description:
      'Which legacy role key a holder is mirrored onto. `User.role` still drives RolesGuard and the ' +
      'frontend Role union, so a custom role needs one. Defaults to `viewer` — if the two layers ' +
      'disagree, the legacy one should grant the least.',
  })
  @IsOptional()
  @IsIn(['admin', 'operator', 'viewer'])
  baseRole?: 'admin' | 'operator' | 'viewer';
}

/**
 * PATCH body — every field optional.
 *
 * Deliberately NOT `PartialType(RoleInputDto)`: the service already distinguishes
 * "absent" from "present" per field (`input.name !== undefined`), and reusing the
 * create DTO here made a permissions-only update fail on a missing `name` — a
 * request the service handles perfectly well.
 */
export class RoleUpdateDto {
  @ApiPropertyOptional({ example: 'Site Supervisor' })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  name?: string;

  @ApiPropertyOptional({ example: 'Can manage stations and alerts but not people.' })
  @IsOptional()
  @IsString()
  @MaxLength(280)
  description?: string;

  @ApiPropertyOptional({ type: [String], example: ['data:read', 'alert:write'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  permissions?: string[];

  @ApiPropertyOptional({
    enum: ['admin', 'operator', 'viewer'],
    default: 'viewer',
    description:
      'Which legacy role key a holder is mirrored onto. `User.role` still drives RolesGuard and the ' +
      'frontend Role union, so a custom role needs one. Defaults to `viewer` — if the two layers ' +
      'disagree, the legacy one should grant the least.',
  })
  @IsOptional()
  @IsIn(['admin', 'operator', 'viewer'])
  baseRole?: 'admin' | 'operator' | 'viewer';
}
