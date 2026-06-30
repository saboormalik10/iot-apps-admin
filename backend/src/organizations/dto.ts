import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsNotEmpty,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import { UserRole } from '../models/User';

const ROLES: UserRole[] = ['admin', 'operator', 'viewer'];

export class UpdateOrgDto {
  @ApiPropertyOptional({ example: 'Observator Instruments AU' })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiPropertyOptional({ example: 'dana@observator.com' })
  @IsOptional()
  @IsEmail()
  contactEmail?: string;

  @ApiPropertyOptional({ example: 'AU' })
  @IsOptional()
  @IsString()
  country?: string;

  @ApiPropertyOptional({ example: 'Australia/Melbourne' })
  @IsOptional()
  @IsString()
  timezone?: string;
}

export class InviteUserDto {
  @ApiProperty({ example: 'new.user@observator.com', description: 'Email to invite' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ enum: ROLES, default: 'viewer', description: 'Role for the invited user' })
  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ example: 'New' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Hire' })
  @IsOptional()
  @IsString()
  lastName?: string;
}

export class UpdateUserDto {
  @ApiPropertyOptional({ enum: ROLES, description: 'New role' })
  @IsOptional()
  @IsIn(ROLES)
  role?: UserRole;

  @ApiPropertyOptional({ description: 'Activate (true) or deactivate (false) the user' })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class AcceptInviteDto {
  @ApiProperty({ description: 'Raw invite token from the invitation email link' })
  @IsString()
  @IsNotEmpty()
  token!: string;

  @ApiProperty({ minLength: 8, description: 'Password to set for the new account' })
  @IsString()
  @MinLength(8)
  password!: string;
}
