import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProfileDto {
  @ApiPropertyOptional({ example: 'Jane', description: 'New first name' })
  @IsOptional()
  @IsString()
  firstName?: string;

  @ApiPropertyOptional({ example: 'Doe', description: 'New last name' })
  @IsOptional()
  @IsString()
  lastName?: string;

  @ApiPropertyOptional({ description: 'Current password — required when changing password' })
  @IsOptional()
  @IsString()
  currentPassword?: string;

  @ApiPropertyOptional({ minLength: 8, description: 'New password (min 8 chars) — requires currentPassword' })
  @IsOptional()
  @IsString()
  @MinLength(8)
  newPassword?: string;
}
